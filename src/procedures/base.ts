import type { ProcedureId, ProcedureResult, Settings, Trial } from '../core/types'
import { isTherapyPaused, onTherapyPauseChange } from '../core/sessionState'
import { PausableClock } from '../core/safety'

/**
 * Integration contract for every procedure.
 *
 * A procedure owns its own canvas rendering and input handling. It never touches
 * routing, persistence, or the session clock — the runner drives those. Procedures
 * report trials as they happen so the runner can react within the session (forced
 * breaks on fatigue, adaptive demand) rather than only at the end.
 */
export interface ProcedureContext {
  /** The container the procedure renders into. Cleared for you before start(). */
  root: HTMLElement
  settings: Settings
  /** Report a completed stimulus-response pair. Call once per rep. */
  onTrial(trial: Trial): void
  /** Ask the runner to interrupt for a rest. Used when fatigue signals fire. */
  requestBreak(reason: string): Promise<void>
  /** Resolves when the procedure's allotted time is up or the user quits. */
  signal: AbortSignal
}

export interface Procedure {
  id: ProcedureId
  label: string
  /** Runs until the context signal aborts. Must clean up its own listeners. */
  run(ctx: ProcedureContext): Promise<void>
}

/** Rolling fatigue detector shared by all procedures. */
export class FatigueMonitor {
  private recent: Trial[] = []

  constructor(
    private readonly windowSize = 12,
    private readonly accuracyFloor = 0.5,
  ) {}

  push(trial: Trial): void {
    this.recent.push(trial)
    if (this.recent.length > this.windowSize) this.recent.shift()
  }

  /**
   * Within-session decline is the signal a therapist would catch by watching.
   * Two independent triggers: accuracy collapsing, or latency inflating well
   * beyond this run's own baseline.
   */
  shouldBreak(): string | null {
    if (this.recent.length < this.windowSize) return null

    const accuracy = this.recent.filter((t) => t.correct).length / this.recent.length
    if (accuracy < this.accuracyFloor) return 'Accuracy is dropping — take a short break.'

    const half = Math.floor(this.windowSize / 2)
    const early = this.recent.slice(0, half)
    const late = this.recent.slice(-half)
    const mean = (ts: Trial[]) => ts.reduce((a, t) => a + t.latencyMs, 0) / ts.length
    if (mean(late) > mean(early) * 1.6) return 'You are slowing down — take a short break.'

    return null
  }

  reset(): void {
    this.recent = []
  }
}

/**
 * A response deadline that does not count time while the tab is hidden.
 *
 * A plain `setTimeout` keeps running when you switch tabs, but `requestAnimationFrame`
 * does not — so tabbing away mid-rep produces a rep that times out while the stimulus
 * was never actually on screen, and logs a "can't see it" the user never gave. That is
 * fabricated data in the one channel the integrity layer depends on being honest.
 *
 * Returns a cancel function; call it wherever you would have cleared the timeout.
 */
export function visibleTimeout(fn: () => void, ms: number): () => void {
  let remaining = ms
  let armedAt = 0
  let timer = 0
  let running = false

  // A rep is only "on screen" when the tab is visible AND the user has not paused.
  const shouldRun = (): boolean => !document.hidden && !isTherapyPaused()

  const arm = (): void => {
    if (running) return
    running = true
    armedAt = performance.now()
    timer = window.setTimeout(fn, remaining)
  }
  const disarm = (): void => {
    if (!running) return
    running = false
    window.clearTimeout(timer)
    remaining = Math.max(0, remaining - (performance.now() - armedAt))
  }
  const sync = (): void => {
    if (shouldRun()) arm()
    else disarm()
  }

  document.addEventListener('visibilitychange', sync)
  const unsubscribe = onTherapyPauseChange(sync)
  sync()

  return () => {
    window.clearTimeout(timer)
    document.removeEventListener('visibilitychange', sync)
    unsubscribe()
  }
}

/**
 * A procedure's own elapsed-time counter, under the same rule as everything else
 * here: time accrues only while the tab is visible and therapy is not paused.
 *
 * Each procedure used to derive its HUD clock from a raw `performance.now()` baseline,
 * which kept counting behind a pause overlay or a hidden tab. The session countdown in
 * `runner.ts` already stops for both, so the two clocks drifted apart on screen and the
 * procedure's own figure was the dishonest one — it claimed minutes of therapy that
 * nobody did. `PausableClock` is the same implementation the session clock uses, so the
 * two now stop and start together by construction rather than by coincidence.
 */
export interface ElapsedClock {
  /** Milliseconds of therapy actually done. */
  ms(): number
  seconds(): number
  /** `mm:ss`, for the HUD. */
  format(): string
  /** Detach the visibility and pause listeners. Call from the procedure's `finally`. */
  dispose(): void
}

export function createElapsedClock(): ElapsedClock {
  const clock = new PausableClock()
  return {
    ms: () => clock.elapsed(),
    seconds: () => clock.elapsed() / 1000,
    format: () => {
      const total = Math.floor(clock.elapsed() / 1000)
      const mm = String(Math.floor(total / 60)).padStart(2, '0')
      const ss = String(total % 60).padStart(2, '0')
      return `${mm}:${ss}`
    },
    dispose: () => clock.dispose(),
  }
}

export function emptyResult(procedure: ProcedureId): ProcedureResult {
  return { procedure, startedAt: Date.now(), durationMs: 0, trials: [] }
}
