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
 * An earlier version had none of this: rests could not be skipped and there was no
 * way out of a procedure short of closing the tab. That is a worse problem than a
 * skipped rest — being trapped in an exercise is exactly how people come to dread
 * and then abandon a home programme. So every escape hatch exists, and every use of
 * one is recorded on the session instead of being silently forgiven.
 */
export interface SessionControls {
  pause(): void
  resume(): void
  togglePause(): void
  isPaused(): boolean
  /** Finish now. Whatever was completed is kept and saved. */
  end(): void
  hasEnded(): boolean
  /** Cut the rest that is currently on screen. No effect otherwise. */
  skipRest(): void
}

export interface RunnerHooks {
  onStepStart(step: PlanStep, index: number, total: number, controls: SessionControls): void
  onTick(remainingMs: number, paused: boolean): void
  /** Resolves when the rest is over, whether it ran out or the user skipped it. */
  showRest(message: string, seconds: number, controls: SessionControls): Promise<void>
  onStepEnd(result: ProcedureResult): void
}

const REST_BETWEEN_PROCEDURES_SECONDS = 30

/**
 * Drives one therapy session end to end.
 *
 * Interleaving and rest live here rather than in the procedures, because they are
 * session-level properties: the whole point of rotating procedures and resting
 * between them is that no single procedure can see it.
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
    restsSkipped: 0,
  }

  let ended = false
  let skipCurrentRest: (() => void) | null = null
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
      skipCurrentRest?.()
      stepController?.abort()
    },
    skipRest: () => {
      if (!skipCurrentRest) return
      record.restsSkipped = (record.restsSkipped ?? 0) + 1
      skipCurrentRest()
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
      onTrial: (t) => trials.push(t),
      requestBreak: async (reason) => {
        await runRest(reason, 20)
      },
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

    if (!ended && i < plan.length - 1) {
      await runRest(
        'Look at something at least 6 metres away until the timer runs out.',
        REST_BETWEEN_PROCEDURES_SECONDS,
      )
    }
  }

  resetTherapyPause()
  saveSession(record)
  return record

  /** Wraps a rest so `controls.skipRest()` and `controls.end()` can cut it short. */
  async function runRest(message: string, seconds: number): Promise<void> {
    if (ended) return
    let resolveSkip: (() => void) | null = null
    const skipped = new Promise<void>((resolve) => {
      resolveSkip = resolve
    })
    skipCurrentRest = () => resolveSkip?.()
    try {
      await Promise.race([hooks.showRest(message, seconds, controls), skipped])
    } finally {
      skipCurrentRest = null
    }
  }
}
