/**
 * The session shell.
 *
 * Builds the plan, hands it to `runSession`, and renders the only two pieces of
 * chrome a therapy session is allowed: a thin HUD, and the rest screen.
 *
 * The rest screen has no skip control and swallows key presses until its timer
 * expires. That is deliberate (docs/FAILURE-MODES.md 2.7): distributed practice
 * is one of the few well-supported effects here, and a skip button would be used.
 */

import { el } from '../router'
import type { Screen } from '../router'
import {
  DAILY_PROTOCOL,
  JUMP_DUCTIONS,
  jumpDuctionsUnlocked,
  loadSettings,
} from '../../core/settings'
import { runSession } from '../../core/runner'
import type { PlanStep, RunnerHooks } from '../../core/runner'
import { PROCEDURE_REGISTRY } from '../../procedures/registry'
import { stampSessionCalibration } from './results'
import '../screens.css'

export const sessionScreen: Screen = (root, nav) => {
  const settings = loadSettings()

  const plan: PlanStep[] = DAILY_PROTOCOL.map((step) => ({
    id: step.id,
    label: step.label,
    seconds: step.seconds,
  }))
  if (jumpDuctionsUnlocked()) {
    plan.push({ id: JUMP_DUCTIONS.id, label: JUMP_DUCTIONS.label, seconds: JUMP_DUCTIONS.seconds })
  }

  let disposed = false
  const intervals = new Set<number>()

  /* The procedures own `stage`; the HUD sits outside it so the runner's
     replaceChildren() between steps cannot wipe it. */
  const stage = el('div', { class: 'stage' })
  const hud = el('div', { class: 'stage-hud' })
  const hudProcedure = el('span', {}, 'Starting…')
  const hudStep = el('span', {})
  const hudClock = el('span', {})
  hud.append(hudProcedure, hudStep, hudClock)
  root.append(stage, hud)

  /** Rest screens are modal: nothing reaches the page until the timer expires. */
  const swallow = (event: Event): void => {
    event.stopPropagation()
  }

  function showRest(message: string, seconds: number): Promise<void> {
    return new Promise<void>((resolve) => {
      if (disposed) {
        resolve()
        return
      }

      const panel = el('div', { class: 'rest' })
      const timer = el('div', { class: 'rest-timer' }, String(seconds))
      panel.append(
        el('h2', {}, 'Rest'),
        el('p', {}, message),
        timer,
        el(
          'p',
          { class: 'muted' },
          'There is no skip. Spacing the blocks out is part of the treatment rather than padding between ' +
            'the useful bits — a session run back-to-back trains noticeably less than the same minutes rested.',
        ),
      )
      root.append(panel)

      const endsAt = Date.now() + seconds * 1000

      const finish = (): void => {
        window.clearInterval(id)
        intervals.delete(id)
        window.removeEventListener('keydown', swallow, true)
        window.removeEventListener('keyup', swallow, true)
        panel.remove()
        resolve()
      }

      const tick = (): void => {
        if (disposed) {
          finish()
          return
        }
        const remaining = Math.max(0, endsAt - Date.now())
        timer.textContent = String(Math.ceil(remaining / 1000))
        if (remaining <= 0) finish()
      }

      const id = window.setInterval(tick, 200)
      intervals.add(id)
      window.addEventListener('keydown', swallow, true)
      window.addEventListener('keyup', swallow, true)
      tick()
    })
  }

  const hooks: RunnerHooks = {
    onStepStart(step, index, total) {
      hudProcedure.textContent = step.label
      hudStep.textContent = `step ${index + 1} of ${total} · sit at ${settings.calibration.viewingDistanceCm} cm`
      hudClock.textContent = formatClock(step.seconds * 1000)
    },
    onTick(remainingMs) {
      hudClock.textContent = formatClock(remainingMs)
    },
    showRest(message, seconds) {
      return showRest(message, seconds)
    },
    onStepEnd() {
      // Nothing visible between procedures: the rest screen is the transition.
    },
  }

  function showFailure(text: string): void {
    if (disposed) return
    stage.remove()
    hud.remove()
    const home = el('button', { class: 'primary' }, 'Back to home')
    home.addEventListener('click', () => nav.go('home'))
    const results = el('button', {}, 'See what was recorded')
    results.addEventListener('click', () => nav.go('results'))
    root.append(
      el(
        'div',
        { class: 'screen' },
        el(
          'div',
          { class: 'card' },
          el('h2', {}, 'The session stopped early'),
          el('p', {}, text),
          el(
            'p',
            { class: 'muted' },
            'Whatever finished before this point was saved. A part-session is still worth recording, but ' +
              'read it as a part-session rather than a bad day.',
          ),
          el('div', { class: 'actions' }, home, results),
        ),
      ),
    )
  }

  runSession(stage, settings, plan, PROCEDURE_REGISTRY, hooks)
    .then((record) => {
      if (disposed) return
      // Stamp the calibration this session actually ran under, so the results
      // screen never charts two calibrations on one axis.
      stampSessionCalibration(record.id, settings.calibration)
      nav.go('results')
    })
    .catch((error: unknown) => {
      showFailure(error instanceof Error ? error.message : String(error))
    })

  return () => {
    disposed = true
    for (const id of intervals) window.clearInterval(id)
    intervals.clear()
    window.removeEventListener('keydown', swallow, true)
    window.removeEventListener('keyup', swallow, true)
  }
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')} left`
}
