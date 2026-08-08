import type { Procedure, ProcedureContext } from '../procedures/base'
import type { ProcedureId, ProcedureResult, SessionRecord, Settings, Trial } from './types'
import { saveSession } from './settings'
import { PausableClock } from './safety'

export interface PlanStep {
  id: ProcedureId
  label: string
  seconds: number
}

export interface RunnerHooks {
  /** Called when a procedure starts, so the shell can show a header and clock. */
  onStepStart(step: PlanStep, index: number, total: number): void
  onTick(remainingMs: number): void
  /** Shown between procedures, and whenever a procedure requests a fatigue break. */
  showRest(message: string, seconds: number): Promise<void>
  onStepEnd(result: ProcedureResult): void
}

const REST_BETWEEN_PROCEDURES_SECONDS = 30

/**
 * Drives one therapy session end to end.
 *
 * Interleaving and rest are enforced here rather than left to the procedures,
 * because they are session-level properties: the whole point of rotating
 * procedures and resting between them is that no single procedure can see it.
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
  }

  for (let i = 0; i < plan.length; i++) {
    const step = plan[i]
    if (!step) continue
    const procedure = registry.get(step.id)
    if (!procedure) continue

    hooks.onStepStart(step, i, plan.length)

    const controller = new AbortController()
    const startedAt = Date.now()
    const trials: Trial[] = []

    // Clock stops while the tab is hidden. Otherwise tabbing away mid-procedure
    // produces a fully "completed" session that never actually happened.
    const clock = new PausableClock()
    const durationMs = step.seconds * 1000

    const ticker = window.setInterval(() => {
      const remaining = durationMs - clock.elapsed()
      hooks.onTick(Math.max(0, remaining))
      if (remaining <= 0) controller.abort()
    }, 200)

    const ctx: ProcedureContext = {
      root,
      settings,
      onTrial: (t) => trials.push(t),
      requestBreak: async (reason) => {
        await hooks.showRest(reason, 20)
      },
      signal: controller.signal,
    }

    try {
      root.replaceChildren()
      await procedure.run(ctx)
    } finally {
      window.clearInterval(ticker)
      controller.abort()
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

    if (i < plan.length - 1) {
      await hooks.showRest(
        'Look at something at least 6 metres away until the timer runs out.',
        REST_BETWEEN_PROCEDURES_SECONDS,
      )
    }
  }

  saveSession(record)
  return record
}
