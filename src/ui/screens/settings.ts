/**
 * Settings: the prescribed parameters, the rest-between-reps control, and the
 * door back into calibration.
 *
 * Everything on this screen is doctor-assigned in a real programme. The defaults
 * are HTS's published values, which are a starting point for their software and
 * not a prescription for you — the copy says so where the values are edited
 * (docs/FAILURE-MODES.md section 4).
 */

import { el } from '../router'
import type { Screen } from '../router'
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../../core/settings'
import type { FlipperLevel, Settings } from '../../core/types'
import '../screens.css'

export const settingsScreen: Screen = (root, nav) => {
  let settings: Settings = loadSettings()
  let message: { kind: 'good' | 'bad'; text: string } | null = null

  const screen = el('div', { class: 'screen' })
  root.append(screen)

  function numberField(
    label: string,
    value: number,
    attrs: { min?: number; max?: number; step?: number },
  ): { field: HTMLElement; input: HTMLInputElement } {
    const input = el('input', { type: 'number', value: String(value) })
    if (attrs.min !== undefined) input.min = String(attrs.min)
    if (attrs.max !== undefined) input.max = String(attrs.max)
    input.step = String(attrs.step ?? 1)
    return {
      field: el('div', { class: 'field' }, el('label', {}, label), input),
      input,
    }
  }

  function render(): void {
    const children: HTMLElement[] = []

    const back = el('button', {}, 'Back to home')
    back.addEventListener('click', () => nav.go('home'))
    children.push(
      el('div', { class: 'head' }, el('h1', {}, 'Settings'), el('div', { class: 'actions' }, back)),
    )

    children.push(
      el(
        'div',
        { class: 'notice is-warn' },
        el(
          'p',
          {},
          'In a real programme every value on this screen is assigned by your optometrist for your ' +
            'diagnosis. The defaults shown are HTS’s published values — a vendor default, not a ' +
            'prescription. If you were given different numbers, put those in and leave them alone.',
        ),
      ),
    )

    if (message) {
      children.push(
        el(
          'div',
          { class: `notice ${message.kind === 'good' ? 'is-good' : 'is-bad'}` },
          el('p', {}, message.text),
        ),
      )
    }

    /* ------------------------------------------------------- vergence goals */

    const vergence = el('div', { class: 'card' })
    const conv = numberField(
      'Convergence goal (Δ, prism dioptres)',
      settings.prescription.convergenceGoalPd,
      { min: 1, max: 60, step: 1 },
    )
    const div = numberField('Divergence goal (Δ, prism dioptres)', settings.prescription.divergenceGoalPd, {
      min: 1,
      max: 40,
      step: 1,
    })
    vergence.append(
      el('h2', {}, 'Vergence goals'),
      el(
        'p',
        {},
        'Vergence is the two eyes turning in opposite directions to hold one image: inward is ' +
          'convergence, outward is divergence. A prism dioptre (Δ) is the unit of that turn — 1 Δ shifts ' +
          'the image 1 cm at 100 cm. These are the demands you are working towards, not what you can do today.',
      ),
      el('div', { class: 'grid-2' }, conv.field, div.field),
      el(
        'p',
        { class: 'gloss' },
        `HTS defaults: ${DEFAULT_SETTINGS.prescription.convergenceGoalPd} Δ convergence (base-out) and ` +
          `${DEFAULT_SETTINGS.prescription.divergenceGoalPd} Δ divergence (base-in). Convergence goals are ` +
          'much larger than divergence goals because the eyes converge far more readily than they diverge.',
      ),
    )
    children.push(vergence)

    /* ------------------------------------------------------- depth cinema */

    const cinema = el('div', { class: 'card' })
    const cinemaDirection = el('select')
    const convergenceOption = el('option', { value: 'convergence' }, 'Convergence — eyes turn inward')
    const divergenceOption = el('option', { value: 'divergence' }, 'Divergence — eyes turn outward')
    cinemaDirection.append(convergenceOption, divergenceOption)
    cinemaDirection.value = settings.depthCinema.direction
    const cinemaReverse = el('input', {
      type: 'checkbox',
      checked: settings.depthCinema.reversePlayback,
    })
    const cinemaConvergence = numberField(
      'Convergence peak (Δ)',
      settings.depthCinema.convergencePeakPd,
      { min: 0.5, max: 40, step: 0.5 },
    )
    const cinemaDivergence = numberField(
      'Divergence peak (Δ)',
      settings.depthCinema.divergencePeakPd,
      { min: 0.5, max: 20, step: 0.5 },
    )
    const cinemaRamp = numberField(
      'Time to reach peak (seconds)',
      settings.depthCinema.rampSeconds,
      { min: 5, max: 120, step: 1 },
    )
    const cinemaArrows = numberField(
      'Moving arrows (1–3)',
      settings.depthCinema.movingArrowCount,
      { min: 1, max: 3, step: 1 },
    )
    cinema.append(
      el('h2', {}, 'Depth Cinema — experimental'),
      el(
        'p',
        {},
        'A separate, passive 3D animation that smoothly raises vergence demand, then eases home and loops. ' +
          'It does not replace or alter the scored Convergence and Divergence exercises.',
      ),
      el('div', { class: 'field' }, el('label', {}, 'Movie direction'), cinemaDirection),
      el(
        'label',
        { class: 'toggle-row' },
        cinemaReverse,
        el('span', {}, 'Play in reverse — the scene moves closer instead of deeper'),
      ),
      el('div', { class: 'grid-2' }, cinemaConvergence.field, cinemaDivergence.field),
      el('div', { class: 'grid-2' }, cinemaRamp.field, cinemaArrows.field),
      el(
        'p',
        { class: 'gloss' },
        'Only the peak for the selected direction is used. The app will lower it at runtime if the calibrated ' +
          'screen cannot display that disparity safely. Stop or pause if the scene doubles, strains, or feels uncomfortable.',
      ),
    )
    children.push(cinema)

    /* --------------------------------------------------------- flipper ladder */

    const flippers = el('div', { class: 'card' })
    flippers.append(
      el('h2', {}, 'Accommodative Rock flipper ladder'),
      el(
        'p',
        {},
        'Accommodative facility is how quickly each eye can change focus. You train it by flipping a pair ' +
          'of lenses in front of one eye and clearing the target again as fast as you can. Each level below ' +
          'is one physical flipper: the power in front of the right eye and the power in front of the left, ' +
          'in dioptres (D). Plus means the lens relaxes focus, minus means it demands more.',
      ),
    )

    const flipperInputs: { level: number; right: HTMLInputElement; left: HTMLInputElement }[] = []
    for (const level of settings.prescription.flipperLevels) {
      const right = numberField('Right eye (D)', level.rightEyeD, { step: 0.25 })
      const left = numberField('Left eye (D)', level.leftEyeD, { step: 0.25 })
      flipperInputs.push({ level: level.level, right: right.input, left: left.input })
      flippers.append(
        el(
          'div',
          { class: 'flipper-row' },
          el('div', { class: 'lvl' }, `Level ${level.level}`),
          right.field,
          left.field,
        ),
      )
    }
    flippers.append(
      el(
        'p',
        { class: 'gloss' },
        'These must match the physical flippers you actually own. If they do not, the app will name a level ' +
          'you cannot hold in your hand, and the whole procedure trains a different power than it reports.',
      ),
    )
    children.push(flippers)

    /* ------------------------------------------------------------ rock goals */

    const rock = el('div', { class: 'card' })
    const accuracy = numberField(
      'Accuracy goal (% correct per eye)',
      Math.round(settings.prescription.rockAccuracyGoal * 100),
      { min: 25, max: 100, step: 1 },
    )
    const cpm = numberField('Speed goal (clears per minute)', settings.prescription.rockCpmGoal, {
      min: 1,
      max: 40,
      step: 1,
    })
    rock.append(
      el('h2', {}, 'Accommodative Rock goals'),
      el('div', { class: 'grid-2' }, accuracy.field, cpm.field),
      el(
        'p',
        { class: 'gloss' },
        `HTS defaults: ${Math.round(DEFAULT_SETTINGS.prescription.rockAccuracyGoal * 100)}% correct and ` +
          `${DEFAULT_SETTINGS.prescription.rockCpmGoal} clears per minute. Both are only meaningful together: ` +
          'the exercise is four-alternative, so pure guessing already scores 25% and can be done arbitrarily ' +
          'fast. Speed is only ever reported when the response pattern passes the integrity checks.',
      ),
    )
    children.push(rock)

    /* ------------------------------------------------------- rest between reps */

    const pacing = el('div', { class: 'card' })
    const rest = numberField(
      'Rest between reps (seconds)',
      Math.round(settings.restBetweenRepsMs / 100) / 10,
      { min: 0, max: 10, step: 0.5 },
    )
    pacing.append(
      el('h2', {}, 'Pacing'),
      rest.field,
      el(
        'p',
        { class: 'gloss' },
        'A short look-away between reps forces each rep to be a genuine step from relaxed to fused, rather ' +
          'than letting your eyes drift slowly from one target to the next and calling that a repetition. ' +
          'Zero is the HTS behaviour; 1–2 seconds makes each rep harder and more honest.',
      ),
    )
    children.push(pacing)

    /* ----------------------------------------------------------- testing */

    const testing = el('div', { class: 'card' })
    const unlockBox = el('input', { type: 'checkbox', checked: settings.advancedMode })
    unlockBox.addEventListener('change', () => {
      settings = { ...settings, advancedMode: unlockBox.checked }
      saveSettings(settings)
      render()
    })
    testing.append(
      el('h2', {}, 'Advanced'),
      el(
        'label',
        { class: 'toggle-row' },
        unlockBox,
        el('span', {}, 'Advanced mode — manual control, and every exercise unlocked'),
      ),
      el(
        'p',
        { class: 'gloss' },
        'Two things at once. It unlocks every exercise regardless of progression — Jump Ductions normally ' +
          'waits until you have completed Convergence and Divergence at least once each, because it alternates ' +
          'a converging and a diverging demand on successive reps and only makes sense once you can hold each ' +
          'direction alone. It also exposes direct demand controls instead of letting the adaptive staircase ' +
          'find your level. Both are useful for testing and both weaken the data: a difficulty you chose by ' +
          'hand is not evidence you reached it, so trials recorded this way are marked and kept out of your ' +
          'headline number.',
      ),
    )
    children.push(testing)

    /* -------------------------------------------------------- calibration */

    const cal = el('div', { class: 'card' })
    const recalibrate = el('button', {}, 'Recalibrate')
    recalibrate.addEventListener('click', () => nav.go('setup'))
    cal.append(
      el('h2', {}, 'Calibration'),
      el(
        'div',
        { class: 'stat-grid' },
        statBox('Screen scale', `${settings.calibration.pxPerCm.toFixed(1)} px/cm`),
        statBox('Viewing distance', `${settings.calibration.viewingDistanceCm} cm`),
        statBox('Red lens', `${settings.calibration.redEye} eye`),
      ),
      el(
        'p',
        { class: 'gloss' },
        'Recalibrate whenever you change screen, resolution, or seating position. Sessions recorded under ' +
          'different calibration are not comparable with each other, and the results screen will say so ' +
          'rather than drawing them on the same axis.',
      ),
      el('div', { class: 'actions' }, recalibrate),
    )
    children.push(cal)

    /* --------------------------------------------------------------- save */

    const save = el('button', { class: 'primary' }, 'Save settings')
    save.addEventListener('click', () => {
      const convValue = Number(conv.input.value)
      const divValue = Number(div.input.value)
      const accuracyValue = Number(accuracy.input.value)
      const cpmValue = Number(cpm.input.value)
      const restValue = Number(rest.input.value)
      const cinemaConvergenceValue = Number(cinemaConvergence.input.value)
      const cinemaDivergenceValue = Number(cinemaDivergence.input.value)
      const cinemaRampValue = Number(cinemaRamp.input.value)
      const cinemaArrowsValue = Number(cinemaArrows.input.value)

      const levels: FlipperLevel[] = []
      for (const row of flipperInputs) {
        const rightValue = Number(row.right.value)
        const leftValue = Number(row.left.value)
        if (!Number.isFinite(rightValue) || !Number.isFinite(leftValue)) {
          message = { kind: 'bad', text: `Flipper level ${row.level} has a value that is not a number.` }
          render()
          return
        }
        levels.push({ level: row.level, rightEyeD: rightValue, leftEyeD: leftValue })
      }

      if (
        ![
          convValue,
          divValue,
          accuracyValue,
          cpmValue,
          restValue,
          cinemaConvergenceValue,
          cinemaDivergenceValue,
          cinemaRampValue,
          cinemaArrowsValue,
        ].every(Number.isFinite)
      ) {
        message = { kind: 'bad', text: 'Every field has to be a number. Nothing was saved.' }
        render()
        return
      }
      if (convValue <= 0 || divValue <= 0 || cpmValue <= 0) {
        message = {
          kind: 'bad',
          text: 'Vergence goals and the speed goal have to be greater than zero. Nothing was saved.',
        }
        render()
        return
      }
      if (accuracyValue < 25 || accuracyValue > 100) {
        message = {
          kind: 'bad',
          text: 'The accuracy goal has to be between 25% (pure guessing on a four-choice task) and 100%. Nothing was saved.',
        }
        render()
        return
      }
      if (restValue < 0 || restValue > 10) {
        message = { kind: 'bad', text: 'Rest between reps has to be between 0 and 10 seconds. Nothing was saved.' }
        render()
        return
      }
      if (
        cinemaConvergenceValue < 0.5 ||
        cinemaConvergenceValue > 40 ||
        cinemaDivergenceValue < 0.5 ||
        cinemaDivergenceValue > 20 ||
        cinemaRampValue < 5 ||
        cinemaRampValue > 120 ||
        !Number.isInteger(cinemaArrowsValue) ||
        cinemaArrowsValue < 1 ||
        cinemaArrowsValue > 3
      ) {
        message = {
          kind: 'bad',
          text: 'Depth Cinema needs a 0.5–40Δ convergence peak, a 0.5–20Δ divergence peak, a 5–120 second ramp, and 1–3 moving arrows.',
        }
        render()
        return
      }

      settings = {
        ...settings,
        prescription: {
          convergenceGoalPd: convValue,
          divergenceGoalPd: divValue,
          flipperLevels: levels,
          rockAccuracyGoal: accuracyValue / 100,
          rockCpmGoal: cpmValue,
        },
        restBetweenRepsMs: Math.round(restValue * 1000),
        depthCinema: {
          direction: cinemaDirection.value === 'divergence' ? 'divergence' : 'convergence',
          reversePlayback: cinemaReverse.checked,
          convergencePeakPd: cinemaConvergenceValue,
          divergencePeakPd: cinemaDivergenceValue,
          rampSeconds: cinemaRampValue,
          movingArrowCount: cinemaArrowsValue,
        },
        advancedMode: settings.advancedMode,
      }
      saveSettings(settings)
      message = { kind: 'good', text: 'Saved. New values apply from your next session onward.' }
      render()
    })

    const reset = el('button', {}, 'Reset to HTS defaults')
    reset.addEventListener('click', () => {
      settings = {
        ...settings,
        prescription: structuredClone(DEFAULT_SETTINGS.prescription),
        restBetweenRepsMs: DEFAULT_SETTINGS.restBetweenRepsMs,
        advancedMode: settings.advancedMode,
      }
      saveSettings(settings)
      message = {
        kind: 'good',
        text: 'Prescription values reset to the HTS defaults. Calibration was left alone.',
      }
      render()
    })

    children.push(el('div', { class: 'actions' }, save, reset))
    screen.replaceChildren(...children)
  }

  render()
}

function statBox(label: string, value: string): HTMLElement {
  return el(
    'div',
    { class: 'stat' },
    el('div', { class: 'stat-value' }, value),
    el('div', { class: 'stat-label' }, label),
  )
}
