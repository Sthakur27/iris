/**
 * The session shell.
 *
 * Builds the plan, hands it to `runSession`, and renders the chrome a therapy
 * session is allowed: a thin HUD and controls that let you pause or leave.
 */

import { el } from '../router'
import type { Screen } from '../router'
import {
  CYCLOPEAN_LETTERS,
  DAILY_PROTOCOL,
  DEPTH_CINEMA,
  DEPTH_HELIX,
  DEPTH_SPIRAL,
  JUMP_DUCTIONS,
  jumpDuctionsUnlocked,
  loadSettings,
} from '../../core/settings'
import { runSession } from '../../core/runner'
import type { PlanStep, RunnerHooks, SessionControls } from '../../core/runner'
import { PROCEDURE_REGISTRY } from '../../procedures/registry'
import { getPendingSession } from '../../core/sessionState'
import type { SessionRequest } from '../../core/sessionState'
import { stampSessionCalibration } from './results'
import { HitFeedback } from '../hitFeedback'
import '../screens.css'

export const sessionScreen: Screen = (root, nav) => {
  const settings = loadSettings()

  /*
   * What to run comes from the URL first, the pending request second.
   *
   * `#/session/divergence` names the exercise, so a reload mid-session restarts the
   * same one instead of whatever was last chosen, and the address bar says what is
   * on screen. `plan` means the full protocol. The pending request stays the
   * fallback for the length, which the segment does not carry.
   */
  const pending = getPendingSession()
  const segment = nav.detail()
  const request: SessionRequest =
    segment === null || segment === 'plan'
      ? segment === 'plan'
        ? { mode: 'plan' }
        : pending
      : {
          mode: 'single',
          procedureId: segment,
          minutes:
            pending.mode === 'single' && pending.procedureId === segment ? pending.minutes : 5,
        }

  const plan: PlanStep[] = []
  if (request.mode === 'single') {
    const known = [
      ...DAILY_PROTOCOL,
      JUMP_DUCTIONS,
      CYCLOPEAN_LETTERS,
      DEPTH_CINEMA,
      DEPTH_SPIRAL,
      DEPTH_HELIX,
    ].find(
      (s) => s.id === request.procedureId,
    )
    if (known) {
      plan.push({ id: known.id, label: known.label, seconds: Math.round(request.minutes * 60) })
    }
  } else {
    for (const step of DAILY_PROTOCOL) {
      plan.push({ id: step.id, label: step.label, seconds: step.seconds })
    }
    if (jumpDuctionsUnlocked()) {
      plan.push({
        id: JUMP_DUCTIONS.id,
        label: JUMP_DUCTIONS.label,
        seconds: JUMP_DUCTIONS.seconds,
      })
    }
  }

  let disposed = false
  let controls: SessionControls | null = null

  /* The procedures own `stage`; the HUD sits outside it so the runner's
     replaceChildren() between steps cannot wipe it. */
  const stage = el('div', { class: 'stage' })
  const hitFeedback = new HitFeedback(stage)
  const hud = el('div', { class: 'stage-hud' })
  const hudProcedure = el('span', {}, 'Starting…')
  const hudStep = el('span', {})
  const hudClock = el('span', {})
  hud.append(hudProcedure, hudStep, hudClock)

  const pauseButton = el('button', { class: 'ghost' }, 'Pause')
  const effectsButton = el(
    'button',
    { class: 'ghost effects-toggle', title: 'Toggle the extra chime and hit-circle effects' },
    'Hit FX on',
  )
  const homeButton = el('button', { class: 'ghost' }, 'End session')
  const bar = el('div', { class: 'session-controls' }, effectsButton, pauseButton, homeButton)

  pauseButton.addEventListener('click', () => controls?.togglePause())
  let effectsEnabled = true
  effectsButton.setAttribute('aria-pressed', 'true')
  effectsButton.addEventListener('click', () => {
    effectsEnabled = !effectsEnabled
    hitFeedback.setEnabled(effectsEnabled)
    effectsButton.setAttribute('aria-pressed', String(effectsEnabled))
    effectsButton.textContent = effectsEnabled ? 'Hit FX on' : 'Hit FX off'
  })
  homeButton.addEventListener('click', () => endAndLeave())

  root.append(stage, hud, bar)

  /** Overlay shown while paused. Covers the stage so no rep runs behind it. */
  let pausePanel: HTMLElement | null = null

  function renderPaused(paused: boolean): void {
    pauseButton.textContent = paused ? 'Resume' : 'Pause'
    if (paused && !pausePanel) {
      const resume = el('button', { class: 'primary' }, 'Resume')
      resume.addEventListener('click', () => controls?.resume())
      const home = el('button', {}, 'End session and go home')
      home.addEventListener('click', () => endAndLeave())
      pausePanel = el(
        'div',
        { class: 'pause-overlay' },
        el('h2', {}, 'Paused'),
        el(
          'p',
          {},
          'The clock is stopped and nothing is being recorded. Take as long as you need — ' +
            'resting your eyes mid-session costs you nothing here.',
        ),
        el('div', { class: 'actions' }, resume, home),
      )
      root.append(pausePanel)
    } else if (!paused && pausePanel) {
      pausePanel.remove()
      pausePanel = null
    }
  }

  function endAndLeave(): void {
    controls?.end()
    // The runner resolves on its own once the current step aborts; if it has not
    // started yet there is nothing to wait for.
    if (!controls) nav.go('home')
  }

  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    controls?.togglePause()
  }
  window.addEventListener('keydown', onKey)

  const hooks: RunnerHooks = {
    onStepStart(step, index, total, c) {
      controls = c
      hudProcedure.textContent = step.label
      hudStep.textContent =
        total > 1
          ? `step ${index + 1} of ${total} · sit at ${settings.calibration.viewingDistanceCm} cm`
          : `sit at ${settings.calibration.viewingDistanceCm} cm`
      hudClock.textContent = formatClock(step.seconds * 1000)
    },
    onTick(remainingMs, paused) {
      hudClock.textContent = paused ? 'paused' : formatClock(remainingMs)
      renderPaused(paused)
    },
    onTrial(trial) {
      if (trial.correct) hitFeedback.hit(trial.hitPoint)
      else hitFeedback.miss(trial.hitPoint)
    },
    onStepEnd() {
      // The next procedure begins immediately.
    },
  }

  function showFailure(text: string): void {
    if (disposed) return
    stage.remove()
    hud.remove()
    bar.remove()
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

  if (plan.length === 0) {
    showFailure('That exercise is not available.')
  } else {
    runSession(stage, settings, plan, PROCEDURE_REGISTRY, hooks)
      .then((record) => {
        if (disposed) return
        // Stamp the calibration this session actually ran under, so the results
        // screen never charts two calibrations on one axis.
        stampSessionCalibration(record.id, settings.calibration)
        nav.go(record.results.length > 0 ? 'results' : 'home')
      })
      .catch((error: unknown) => {
        showFailure(error instanceof Error ? error.message : String(error))
      })
  }

  return () => {
    disposed = true
    hitFeedback.dispose()
    controls?.end()
    window.removeEventListener('keydown', onKey)
  }
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')} left`
}
