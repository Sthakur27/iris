import type { Procedure, ProcedureContext } from '../procedures/base'
import type { ProcedureId, ProcedureResult, SessionRecord, Settings, Trial } from './types'
import { saveSession } from './settings'
import { PausableClock } from './safety'
import { isTherapyPaused, resetTherapyPause, setTherapyPaused } from './sessionState'

export interface PlanStep {
  id: ProcedureId
  label: string
  seconds: number
}

/**
 * What the user can do to the session while it is running.
 *
 * These controls are intentionally limited to pausing and ending. The session runs
 * its selected procedures continuously; users who need a break can pause whenever
 * they want without being routed through a separate rest screen.
 */
export interface SessionControls {
  pause(): void
  resume(): void
  togglePause(): void
  isPaused(): boolean
  /** Finish now. Whatever was completed is kept and saved. */
  end(): void
  hasEnded(): boolean
}

export interface RunnerHooks {
  onStepStart(step: PlanStep, index: number, total: number, controls: SessionControls): void
  onTick(remainingMs: number, paused: boolean): void
  /** Called after a rep is recorded, for session-level feedback and UI only. */
  onTrial?(trial: Trial): void
  onStepEnd(result: ProcedureResult): void
}

/**
 * Drives one therapy session end to end.
 *
 * Procedures are sequenced here so persistence and the session clock remain shared.
 */
export async function runSession(
  root: HTMLElement,
  settings: Settings,
  plan: PlanStep[],
  registry: Map<ProcedureId, Procedure>,
  hooks: RunnerHooks,
): Promise<SessionRecord> {
  const record: SessionRecord = {
    id: `${Date.now()}`,
    startedAt: Date.now(),
    results: [],
    endedEarly: false,
  }

  let ended = false
  let stepController: AbortController | null = null

  const controls: SessionControls = {
    pause: () => setTherapyPaused(true),
    resume: () => setTherapyPaused(false),
    togglePause: () => setTherapyPaused(!isTherapyPaused()),
    isPaused: () => isTherapyPaused(),
    hasEnded: () => ended,
    end: () => {
      if (ended) return
      ended = true
      record.endedEarly = true
      // A pause must not survive the session, or the next one starts frozen.
      resetTherapyPause()
      stepController?.abort()
    },
  }

  for (let i = 0; i < plan.length; i++) {
    if (ended) break
    const step = plan[i]
    if (!step) continue
    const procedure = registry.get(step.id)
    if (!procedure) continue

    hooks.onStepStart(step, i, plan.length, controls)

    const controller = new AbortController()
    stepController = controller
    const startedAt = Date.now()
    const trials: Trial[] = []

    // Clock stops while the tab is hidden or the user has paused, so neither
    // produces a "completed" block that never actually happened.
    const clock = new PausableClock()
    const durationMs = step.seconds * 1000

    const ticker = window.setInterval(() => {
      const remaining = durationMs - clock.elapsed()
      hooks.onTick(Math.max(0, remaining), isTherapyPaused())
      if (remaining <= 0) controller.abort()
    }, 200)

    const ctx: ProcedureContext = {
      root,
      settings,
      onTrial: (t) => {
        trials.push(t)
        hooks.onTrial?.(t)
      },
      // Procedures still report fatigue so they can reset their rolling detector,
      // but the session no longer interrupts with a mandatory rest screen.
      requestBreak: async () => {},
      signal: controller.signal,
    }

    try {
      root.replaceChildren()
      await procedure.run(ctx)
    } finally {
      window.clearInterval(ticker)
      controller.abort()
      clock.dispose()
      stepController = null
    }

    const result: ProcedureResult = {
      procedure: step.id,
      startedAt,
      durationMs: Date.now() - startedAt,
      trials,
    }
    record.results.push(result)
    hooks.onStepEnd(result)
    saveSession(record)

  }

  resetTherapyPause()
  saveSession(record)
  return record

}
