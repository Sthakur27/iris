/**
 * Whether therapy is currently paused by the user.
 *
 * This is a module-level flag rather than something threaded through every call
 * because it has to be respected in two very different places: the session clock in
 * `safety.ts`, and the per-rep response deadlines inside each procedure. A pause that
 * stopped only the visible countdown would still let a rep time out behind the pause
 * overlay and record a "can't see it" the user never gave — the same class of
 * fabricated data that hidden tabs used to cause.
 *
 * Deliberately no imports: both `safety.ts` and `procedures/base.ts` depend on it.
 */

let paused = false
const listeners = new Set<(paused: boolean) => void>()

export function isTherapyPaused(): boolean {
  return paused
}

export function setTherapyPaused(next: boolean): void {
  if (next === paused) return
  paused = next
  for (const listener of listeners) listener(paused)
}

/** Subscribe to pause transitions. Returns an unsubscribe function. */
export function onTherapyPauseChange(listener: (paused: boolean) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Called when a session tears down, so a pause never leaks into the next one. */
export function resetTherapyPause(): void {
  setTherapyPaused(false)
}

/**
 * What the user asked for when they left the home screen.
 *
 * `plan` runs the full structured protocol in order. `single` runs one exercise for
 * as long as the user wants — the point being that a 27-minute commitment is the
 * thing people skip entirely, and five minutes of one exercise beats nothing.
 */
export type SessionRequest =
  | { mode: 'plan' }
  | { mode: 'single'; procedureId: string; minutes: number }

let pending: SessionRequest = { mode: 'plan' }

export function setPendingSession(request: SessionRequest): void {
  pending = request
}

export function getPendingSession(): SessionRequest {
  return pending
}
