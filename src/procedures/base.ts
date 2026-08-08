import type { ProcedureId, ProcedureResult, Settings, Trial } from '../core/types'

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

  const arm = (): void => {
    armedAt = performance.now()
    timer = window.setTimeout(fn, remaining)
  }
  const disarm = (): void => {
    window.clearTimeout(timer)
    remaining = Math.max(0, remaining - (performance.now() - armedAt))
  }
  const onVisibility = (): void => {
    if (document.hidden) disarm()
    else arm()
  }

  document.addEventListener('visibilitychange', onVisibility)
  if (!document.hidden) arm()

  return () => {
    window.clearTimeout(timer)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}

export function emptyResult(procedure: ProcedureId): ProcedureResult {
  return { procedure, startedAt: Date.now(), durationMs: 0, trials: [] }
}
