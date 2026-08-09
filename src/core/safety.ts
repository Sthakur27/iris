import { loadCalibrationEnv, loadSessions } from './settings'
import { isTherapyPaused, onTherapyPauseChange } from './sessionState'

/**
 * Cross-cutting guards against the silent failure modes in docs/FAILURE-MODES.md.
 * These exist because the user has no way to notice any of them unaided.
 */

/** Where the daily-session advisory kicks in. Advice, not a limit — see `sessionAdvisory`. */
export const MAX_SESSIONS_PER_DAY = 2

/**
 * Has the rendering environment changed since the screen was calibrated?
 *
 * Zoom invalidates the calibration because `pxPerCm` was measured against a real
 * credit card, so a rescale changes every prism dioptre we display without changing
 * a number on screen. But the absolute zoom level is irrelevant — calibrating at
 * 110% and staying there is perfectly valid. Only a *change* since calibration
 * matters, and that is something we can measure reliably by comparing against the
 * environment recorded at calibration time.
 *
 * The earlier version of this compared `outerWidth` to `innerWidth`, which conflates
 * zoom with window chrome, scrollbars, and embedded browser contexts, and produced
 * false positives that blocked sessions outright.
 */
export function calibrationDrift(): { changed: boolean; detail: string } {
  const env = loadCalibrationEnv()
  if (!env) return { changed: false, detail: '' }

  const dprRatio = window.devicePixelRatio / env.devicePixelRatio
  if (Number.isFinite(dprRatio) && Math.abs(dprRatio - 1) > 0.02) {
    return {
      changed: true,
      detail: `Display scaling has changed since you calibrated (${env.devicePixelRatio}× then, ${window.devicePixelRatio}× now).`,
    }
  }
  return { changed: false, detail: '' }
}

export function isZoomAcceptable(): boolean {
  return !calibrationDrift().changed
}

export function sessionsToday(): number {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  return loadSessions().filter((s) => s.startedAt >= startOfDay.getTime()).length
}

export function canStartSession(): { allowed: boolean; reason?: string } {
  const drift = calibrationDrift()
  if (drift.changed) {
    return {
      allowed: false,
      reason: `${drift.detail} Every demand would be wrong until you recalibrate. Reset your zoom to what it was, or recalibrate in Settings.`,
    }
  }
  return { allowed: true }
}

/**
 * Advice the user is free to ignore, as distinct from `canStartSession`'s refusals.
 *
 * The daily cap used to be a hard block, and hard-blocking it was wrong twice over.
 * It is a judgement about fatigue, not a correctness constraint — unlike a broken
 * calibration, a third session produces perfectly valid data, just from a tired
 * person. And a locked door on your own therapy app invites you to work around it
 * rather than to think about it. Saying the thing and letting the user decide
 * respects that they know whether they are tired better than a counter does.
 */
export function sessionAdvisory(): string | null {
  const today = sessionsToday()
  if (today < MAX_SESSIONS_PER_DAY) return null
  return (
    `You have already done ${today} ${today === 1 ? 'session' : 'sessions'} today. ` +
    'Beyond about two, fatigue starts costing you more than the extra practice gains — ' +
    'the reps still happen, they just teach your eyes less. Worth stopping unless you have a reason.'
  )
}

/**
 * Wall-clock timer that stops while the tab is hidden.
 *
 * Without this, tabbing away mid-procedure produces a fully "completed" session
 * that never happened — the most self-deceiving bug this app could ship.
 */
export class PausableClock {
  private elapsedMs = 0
  private lastResume: number | null = null
  private readonly onVisibility: () => void
  private readonly unsubscribePause: () => void

  constructor() {
    // Runs only when the tab is visible and the user has not paused. Both stop the
    // clock for the same reason: no therapy is happening.
    const shouldRun = (): boolean => !document.hidden && !isTherapyPaused()

    this.lastResume = shouldRun() ? Date.now() : null
    this.onVisibility = () => {
      if (shouldRun()) this.resume()
      else this.pause()
    }
    document.addEventListener('visibilitychange', this.onVisibility)
    this.unsubscribePause = onTherapyPauseChange(this.onVisibility)
  }

  private pause(): void {
    if (this.lastResume !== null) {
      this.elapsedMs += Date.now() - this.lastResume
      this.lastResume = null
    }
  }

  private resume(): void {
    if (this.lastResume === null) this.lastResume = Date.now()
  }

  elapsed(): number {
    const live = this.lastResume === null ? 0 : Date.now() - this.lastResume
    return this.elapsedMs + live
  }

  isPaused(): boolean {
    return this.lastResume === null
  }

  dispose(): void {
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.unsubscribePause()
  }
}

/**
 * Post-session symptom check. These are the signals that mean "stop and get an
 * eye exam", not "lower the level and push on".
 */
export const RED_FLAG_SYMPTOMS = [
  { id: 'diplopiaAfter', label: 'Double vision that continued after I stopped' },
  { id: 'headache', label: 'Headache during or after the session' },
  { id: 'nausea', label: 'Nausea or dizziness' },
  { id: 'painOnEyeMovement', label: 'Pain when moving my eyes' },
] as const

export type RedFlagId = (typeof RED_FLAG_SYMPTOMS)[number]['id']

export function redFlagAdvice(reported: RedFlagId[]): string | null {
  if (reported.length === 0) return null
  return (
    'Stop doing sessions and book an eye exam before continuing. ' +
    'These symptoms are not the normal effort of vision therapy, and this app cannot tell you why they are happening.'
  )
}
