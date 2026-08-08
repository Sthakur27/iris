/**
 * Calibration wizard.
 *
 * Three numbers come out of this screen, and every clinical value in the app is
 * derived from them: pixels per centimetre, viewing distance, and which eye sits
 * behind the red lens. Each one fails silently if it is wrong — the app keeps
 * printing plausible numbers — so each step is written to be hard to get wrong
 * rather than quick to click through. See docs/FAILURE-MODES.md 1.1, 1.2, 1.4, 1.5.
 */

import { el } from '../router'
import type { Screen } from '../router'
import { CREDIT_CARD_WIDTH_CM } from '../../core/geometry'
import { loadSettings, saveSettings } from '../../core/settings'
import type { EyeSide, Settings } from '../../core/types'
import '../screens.css'

/** Outside this range the slider was almost certainly matched to the wrong edge. */
const MIN_PX_PER_CM = 20
const MAX_PX_PER_CM = 120

/** ISO/IEC 7810 ID-1: 85.60 mm x 53.98 mm. Every bank card in the world. */
const CARD_ASPECT = 85.6 / 53.98

const MIN_DISTANCE_CM = 20
const MAX_DISTANCE_CM = 150

type Phase = 'scale' | 'distance' | 'orientation'
type EyeCheck = 'ask' | 'confirm' | 'mismatch' | 'done'
type ScaleMode = 'card' | 'spec'
type SpecAxis = 'diagonal' | 'width'
type SpecUnit = 'in' | 'cm'

const CM_PER_INCH = 2.54

/**
 * Pixels per centimetre derived from the panel's physical size.
 *
 * `screen.width`/`screen.height` are CSS pixels, which is exactly the unit everything
 * in this app draws in — so on a scaled display (Retina, or Windows at 150%) this still
 * comes out right without touching devicePixelRatio. Monitors are almost always sold by
 * diagonal, so that is the default axis; the width is recovered from the screen's own
 * aspect ratio.
 */
function pxPerCmFromPanelSize(value: number, unit: SpecUnit, axis: SpecAxis): number | null {
  const sizeCm = unit === 'in' ? value * CM_PER_INCH : value
  const w = window.screen.width
  const h = window.screen.height
  if (!(sizeCm > 0) || !(w > 0) || !(h > 0)) return null

  const widthCm = axis === 'width' ? sizeCm : (sizeCm * w) / Math.hypot(w, h)
  if (!(widthCm > 0)) return null
  return w / widthCm
}

export const setupScreen: Screen = (root, nav) => {
  const settings: Settings = loadSettings()

  let phase: Phase = 'scale'
  let pxPerCm = settings.calibration.pxPerCm
  let distanceCm = settings.calibration.viewingDistanceCm
  let redEye: EyeSide | null = null
  let eyeCheck: EyeCheck = 'ask'
  let error: string | null = null

  // Two ways to establish screen scale. Card matching works anywhere and needs no
  // knowledge of your hardware; entering the panel's physical size is faster and more
  // precise if you happen to know it, which many people with a desktop monitor do.
  let scaleMode: ScaleMode = 'card'
  let specAxis: SpecAxis = 'diagonal'
  let specUnit: SpecUnit = 'in'
  let specValue = 24

  const screen = el('div', { class: 'screen' })
  root.append(screen)

  function stepPills(): HTMLElement {
    const pills = el('div', { class: 'steps' })
    const labels: [Phase, string][] = [
      ['scale', '1 · screen scale'],
      ['distance', '2 · viewing distance'],
      ['orientation', '3 · red/blue orientation'],
    ]
    for (const [id, label] of labels) {
      pills.append(el('span', { class: id === phase ? 'is-current' : '' }, label))
    }
    return pills
  }

  function zoomNotice(): HTMLElement | null {
    // Whatever zoom you are at right now is fine — it gets baked into the
    // measurement and stays correct as long as it does not change. Only a change
    // after this point invalidates the calibration, which the home screen checks.
    return el(
      'div',
      { class: 'notice' },
      el(
        'p',
        {},
        'Whatever browser zoom you are at right now gets baked into this measurement. ' +
          'That is fine — just do not change it afterwards. If you do, come back and recalibrate.',
      ),
    )
  }

  function errorNotice(): HTMLElement | null {
    if (!error) return null
    return el('div', { class: 'notice is-warn' }, el('p', {}, error))
  }

  /* ------------------------------------------------------------- step 1 */

  function scaleStep(): HTMLElement {
    const card = el('div', { class: 'card' })
    card.append(
      el('h2', {}, 'Screen scale'),
      el(
        'p',
        {},
        'This is how the app learns how big a centimetre is on your display. Get it wrong by 20% and ' +
          'every difficulty level in the programme is wrong by 20%, with nothing on screen looking odd.',
      ),
    )

    const modes = el('div', { class: 'steps' })
    const modeButtons: [ScaleMode, string][] = [
      ['card', 'Match a bank card'],
      ['spec', 'Enter my screen size'],
    ]
    for (const [id, label] of modeButtons) {
      const b = el('button', { class: scaleMode === id ? 'primary' : '' }, label)
      b.addEventListener('click', () => {
        scaleMode = id
        error = null
        render()
      })
      modes.append(b)
    }
    card.append(modes)

    card.append(scaleMode === 'card' ? cardMatcher() : panelSpec())

    const next = el('button', { class: 'primary' }, 'Next: viewing distance')
    next.addEventListener('click', () => {
      if (!inRange()) {
        error =
          `Screen scale is still outside the plausible ${MIN_PX_PER_CM}–${MAX_PX_PER_CM} pixels per ` +
          'centimetre range, so the rest of the programme would be meaningless. Fix it before continuing.'
        render()
        return
      }
      error = null
      phase = 'distance'
      render()
    })
    card.append(el('div', { class: 'field' }), next)
    return card
  }

  /** Entering the panel's physical dimensions — exact, if you know them. */
  function panelSpec(): HTMLElement {
    const wrap = el('div', {})
    wrap.append(
      el(
        'p',
        {},
        'If you know your monitor’s physical size, enter it here — it is more precise than matching a ' +
          'card by eye. Most monitors are sold by diagonal ("a 30-inch monitor"); if you have measured the ' +
          'visible panel width instead, switch to Width.',
      ),
    )

    const value = el('input', { type: 'number', min: '5', max: '120', step: '0.1', value: String(specValue) })
    const unit = el('select')
    unit.append(el('option', { value: 'in' }, 'inches'), el('option', { value: 'cm' }, 'cm'))
    unit.value = specUnit
    const axis = el('select')
    axis.append(el('option', { value: 'diagonal' }, 'Diagonal'), el('option', { value: 'width' }, 'Width'))
    axis.value = specAxis

    const readout = el('div', { class: 'readout' })
    const note = el('p', { class: 'gloss' })

    const recompute = (): void => {
      const derived = pxPerCmFromPanelSize(specValue, specUnit, specAxis)
      if (derived === null) {
        readout.textContent = 'Could not read your screen dimensions.'
        note.textContent = 'Use the bank-card method instead.'
        note.className = 'gloss warn'
        return
      }
      pxPerCm = derived
      readout.textContent = `1 cm = ${pxPerCm.toFixed(1)} screen pixels`
      const ok = inRange()
      note.className = ok ? 'gloss' : 'gloss warn'
      note.textContent = ok
        ? `Your display reports ${window.screen.width} × ${window.screen.height} logical pixels, which at ` +
          `that physical size gives ${pxPerCm.toFixed(1)} pixels per centimetre. If the browser is on a ` +
          'different monitor than the one you measured, this will be wrong — use the bank-card method instead.'
        : `That gives ${pxPerCm.toFixed(1)} pixels per centimetre, outside the plausible ` +
          `${MIN_PX_PER_CM}–${MAX_PX_PER_CM} range. Check whether you entered the diagonal or the width, and the units.`
    }

    value.addEventListener('input', () => {
      specValue = Number(value.value)
      error = null
      recompute()
    })
    unit.addEventListener('change', () => {
      specUnit = unit.value as SpecUnit
      recompute()
    })
    axis.addEventListener('change', () => {
      specAxis = axis.value as SpecAxis
      recompute()
    })

    wrap.append(
      el('div', { class: 'row' }, el('div', { class: 'field' }, el('label', {}, 'Measurement'), axis), el('div', { class: 'field' }, el('label', {}, 'Size'), value), el('div', { class: 'field' }, el('label', {}, 'Units'), unit)),
      readout,
      note,
    )
    recompute()
    return wrap
  }

  /** The original bank-card matcher — works on any display, needs no hardware knowledge. */
  function cardMatcher(): HTMLElement {
    const wrap = el('div', {})
    wrap.append(
      el(
        'p',
        {},
        'Hold a real bank card flat against the screen — any credit or debit card, they are all ' +
          `exactly ${CREDIT_CARD_WIDTH_CM} cm wide. Drag the slider until the white rectangle matches the card ` +
          'exactly, edge to edge. Do not eyeball it from memory; hold the card there while you drag.',
      ),
    )

    const stage = el('div', { class: 'card-stage' })
    const outline = el('div', { class: 'card-outline' })
    stage.append(outline)

    const readout = el('div', { class: 'readout' })
    const warn = el('p', { class: 'gloss' })

    const slider = el('input', {
      type: 'range',
      min: String(Math.round(MIN_PX_PER_CM * CREDIT_CARD_WIDTH_CM) - 40),
      max: String(Math.round(MAX_PX_PER_CM * CREDIT_CARD_WIDTH_CM) + 40),
      step: '1',
      value: String(Math.round(pxPerCm * CREDIT_CARD_WIDTH_CM)),
    })

    const paint = (): void => {
      const widthPx = pxPerCm * CREDIT_CARD_WIDTH_CM
      outline.style.width = `${widthPx}px`
      outline.style.height = `${widthPx / CARD_ASPECT}px`
      readout.textContent = `1 cm = ${pxPerCm.toFixed(1)} screen pixels`
      warn.textContent = inRange()
        ? 'Typical laptop and desktop displays land between 35 and 75 pixels per centimetre.'
        : `That works out at ${pxPerCm.toFixed(1)} pixels per centimetre, which is outside the plausible ` +
          `${MIN_PX_PER_CM}–${MAX_PX_PER_CM} range for a real display. You are probably matching the card's ` +
          'short edge, or a different object. Try again with the card held against the screen.'
      warn.className = inRange() ? 'gloss' : 'gloss warn'
    }

    slider.addEventListener('input', () => {
      pxPerCm = Number(slider.value) / CREDIT_CARD_WIDTH_CM
      error = null
      paint()
    })

    wrap.append(stage, slider, readout, warn)
    paint()
    return wrap
  }

  function inRange(): boolean {
    return pxPerCm >= MIN_PX_PER_CM && pxPerCm <= MAX_PX_PER_CM
  }

  /* ------------------------------------------------------------- step 2 */

  function distanceStep(): HTMLElement {
    const card = el('div', { class: 'card' })
    const input = el('input', {
      type: 'number',
      min: String(MIN_DISTANCE_CM),
      max: String(MAX_DISTANCE_CM),
      step: '1',
      value: String(distanceCm),
    })

    card.append(
      el('h2', {}, 'Viewing distance'),
      el(
        'p',
        {},
        'How far your eyes sit from the screen, in centimetres. Measure it once with a tape measure in ' +
          'your normal working posture — 40 cm is a typical laptop distance and is the default.',
      ),
      el(
        'p',
        {},
        'Difficulty here is measured in prism dioptres (Δ) — the amount your two eyes have to turn ' +
          'relative to each other to fuse the two images into one. For a fixed image separation on screen, ' +
          'that demand is inversely proportional to your distance from it.',
      ),
      el(
        'p',
        {},
        'So leaning in makes the exercise easier without telling you. Lean from 40 cm to 30 cm and you have ' +
          'quietly cut the demand by a quarter while the screen still reports the old number — this is the most ' +
          'common way home vision therapy fools itself. If you catch yourself leaning in on the hard reps, ' +
          'sit back; do not lower this number to match the lean.',
      ),
      el('div', { class: 'field' }, el('label', {}, 'Viewing distance (cm)'), input),
    )

    const back = el('button', {}, 'Back')
    back.addEventListener('click', () => {
      error = null
      phase = 'scale'
      render()
    })

    const next = el('button', { class: 'primary' }, 'Next: red/blue orientation')
    next.addEventListener('click', () => {
      const value = Number(input.value)
      if (!Number.isFinite(value) || value < MIN_DISTANCE_CM || value > MAX_DISTANCE_CM) {
        error = `Enter a viewing distance between ${MIN_DISTANCE_CM} and ${MAX_DISTANCE_CM} cm.`
        render()
        return
      }
      distanceCm = value
      error = null
      phase = 'orientation'
      render()
    })

    card.append(el('div', { class: 'actions' }, back, next))
    return card
  }

  /* ------------------------------------------------------------- step 3 */

  function swatch(colour: 'red' | 'blue', onPick: () => void): HTMLElement {
    const button = el('button', { class: `swatch swatch-${colour}` })
    button.setAttribute('aria-label', `${colour} square`)
    button.addEventListener('click', onPick)
    return el(
      'div',
      { class: 'swatch-wrap' },
      button,
      el('div', { class: 'muted' }, colour.toUpperCase()),
    )
  }

  function orientationStep(): HTMLElement {
    const card = el('div', { class: 'card' })
    card.append(
      el('h2', {}, 'Which eye is behind the red lens'),
      el(
        'p',
        {},
        'Anaglyph glasses give each eye a different image: the red lens passes red light and blocks blue, ' +
          'and the blue lens does the opposite. The app has to know which way round yours are.',
      ),
      el(
        'p',
        { class: 'warn' },
        'If this is recorded backwards, every convergence exercise trains divergence and every divergence ' +
          'exercise trains convergence — the exact opposite of what was prescribed — and nothing on screen ' +
          'would look wrong. So this step is checked twice.',
      ),
      el('p', {}, 'Put the glasses on now, in a dimly lit room, before answering.'),
    )

    if (eyeCheck === 'ask') {
      card.append(
        el(
          'p',
          {},
          'Close your LEFT eye and look at these two squares with your right eye only. One of them will ' +
            'go almost black. Click that one.',
        ),
        el(
          'div',
          { class: 'swatch-stage' },
          swatch('red', () => pick('left')),
          swatch('blue', () => pick('right')),
        ),
      )
    }

    if (eyeCheck === 'confirm' && redEye) {
      const vanishedFirst = redEye === 'right' ? 'blue' : 'red'
      const shouldVanishNow = vanishedFirst === 'blue' ? 'red' : 'blue'
      card.append(
        el(
          'p',
          {},
          `You said the ${vanishedFirst} square vanished for your right eye, which means the red lens is over ` +
            `your ${redEye.toUpperCase()} eye. Now the reverse check.`,
        ),
        el(
          'p',
          {},
          `Close your RIGHT eye instead and open the left. The ${shouldVanishNow.toUpperCase()} square should ` +
            'now be the one that goes black.',
        ),
        el(
          'div',
          { class: 'swatch-stage' },
          swatch('red', () => confirmPick('red', shouldVanishNow)),
          swatch('blue', () => confirmPick('blue', shouldVanishNow)),
        ),
      )
    }

    if (eyeCheck === 'mismatch') {
      card.append(
        el(
          'div',
          { class: 'notice is-bad' },
          el(
            'p',
            {},
            'The two checks disagree. Either the glasses are on upside down, or the lenses are leaking so ' +
              'badly that neither eye is properly separated — a scratched, dusty, or red/cyan-instead-of-red/blue ' +
              'pair does this. Clean them, dim the room, make sure they are the right way up, and try again.',
          ),
        ),
      )
      const retry = el('button', { class: 'primary' }, 'Try the check again')
      retry.addEventListener('click', () => {
        redEye = null
        eyeCheck = 'ask'
        render()
      })
      card.append(retry)
    }

    if (eyeCheck === 'done' && redEye) {
      card.append(
        el(
          'div',
          { class: 'notice is-good' },
          el('p', {}, `Both checks agree: the red lens is over your ${redEye.toUpperCase()} eye.`),
        ),
        el(
          'div',
          { class: 'stat-grid' },
          stat('Screen scale', `${pxPerCm.toFixed(1)} px/cm`),
          stat('Viewing distance', `${distanceCm} cm`),
          stat('Red lens', `${redEye} eye`),
        ),
        el(
          'p',
          { class: 'gloss' },
          'You can redo any of this at any time from Settings → Recalibrate. Redo it whenever you change ' +
            'screen, resolution, chair, or desk — the numbers stop being comparable at that point.',
        ),
      )

      const finish = el('button', { class: 'primary big-start' }, 'Save calibration')
      finish.addEventListener('click', () => {
        if (!redEye) return
        saveSettings({
          ...settings,
          calibration: {
            pxPerCm: Math.round(pxPerCm * 10) / 10,
            viewingDistanceCm: distanceCm,
            redEye,
          },
        })
        nav.go('home')
      })
      card.append(el('div', { class: 'actions' }, finish))
    }

    if (eyeCheck === 'ask') {
      const back = el('button', {}, 'Back')
      back.addEventListener('click', () => {
        error = null
        phase = 'distance'
        render()
      })
      card.append(el('div', { class: 'actions' }, back))
    }

    return card
  }

  /**
   * Closing the LEFT eye means you are looking through the RIGHT lens. The lens
   * you are looking through passes its own colour and blocks the other, so the
   * square that vanishes is the *opposite* colour to that lens.
   */
  function pick(eyeOfVanishingColour: EyeSide): void {
    // Clicking red (red vanished) ⇒ the right lens is blue ⇒ red lens is on the left.
    redEye = eyeOfVanishingColour
    eyeCheck = 'confirm'
    render()
  }

  function confirmPick(clicked: 'red' | 'blue', expected: 'red' | 'blue'): void {
    eyeCheck = clicked === expected ? 'done' : 'mismatch'
    render()
  }

  function stat(label: string, value: string): HTMLElement {
    return el(
      'div',
      { class: 'stat' },
      el('div', { class: 'stat-value' }, value),
      el('div', { class: 'stat-label' }, label),
    )
  }

  function render(): void {
    const children: (HTMLElement | string)[] = [
      el('h1', {}, 'Calibrate SidVision'),
      el(
        'p',
        {},
        'Three measurements, once per screen and chair. Everything the app later tells you about your ' +
          'eyes is computed from them, so it is worth five careful minutes. This is practice software, ' +
          'not a diagnostic instrument.',
      ),
      stepPills(),
    ]

    const zoom = zoomNotice()
    if (zoom) children.push(zoom)
    const err = errorNotice()
    if (err) children.push(err)

    if (phase === 'scale') children.push(scaleStep())
    if (phase === 'distance') children.push(distanceStep())
    if (phase === 'orientation') children.push(orientationStep())

    screen.replaceChildren(...children)
  }

  render()
}
