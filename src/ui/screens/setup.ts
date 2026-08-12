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
import { createDepthCheck } from '../anaglyphDepthCheck'
import { CREDIT_CARD_WIDTH_CM } from '../../core/geometry'
import {
  describeDistance,
  fromDisplayLength,
  loadSettings,
  measuringTip,
  saveSettings,
  toDisplayLength,
} from '../../core/settings'
import type { EyeSide, LengthUnit, Settings } from '../../core/types'
import '../screens.css'

/** Outside this range the slider was almost certainly matched to the wrong edge. */
const MIN_PX_PER_CM = 20
const MAX_PX_PER_CM = 120

/** ISO/IEC 7810 ID-1: 85.60 mm x 53.98 mm. Every bank card in the world. */
const CARD_ASPECT = 85.6 / 53.98

/** Fixed by design: the app assumes red over the right eye everywhere. */
const RED_EYE: EyeSide = 'right'

/**
 * How the orientation came to be recorded, kept separately from the orientation.
 *
 * `Settings.redEye` says which eye the red filter is over. It cannot say whether
 * anybody ever checked, and those are very different claims — one is a measurement,
 * the other is a hope. Anyone later trying to explain a run whose convergence and
 * divergence results look swapped needs to know which of the two they are holding,
 * so the provenance is stamped rather than dropped. Kept in this screen's own key,
 * as the results screen keeps its stamps, because it is wizard bookkeeping and not
 * a setting the user edits.
 */
const ORIENTATION_PROOF_KEY = 'iris.orientationProof.v1'

interface OrientationProof {
  redEye: EyeSide
  /** True only when the user demonstrated it on the stereo check, not merely agreed to it. */
  verified: boolean
  at: number
}

const MIN_DISTANCE_CM = 20
const MAX_DISTANCE_CM = 150

type Phase = 'scale' | 'distance' | 'orientation'
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
  let error: string | null = null

  // Two ways to establish screen scale. Card matching works anywhere and needs no
  // knowledge of your hardware; entering the panel's physical size is faster and more
  // precise if you happen to know it, which many people with a desktop monitor do.
  let scaleMode: ScaleMode = 'card'
  let specAxis: SpecAxis = 'diagonal'
  let specUnit: SpecUnit = 'in'
  let specValue = 24
  let preferredUnit: LengthUnit = settings.preferredUnit

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

    const input = el('input', { type: 'number', min: '5', max: '200', step: '0.5' })
    const unitSelect = el('select')
    unitSelect.append(el('option', { value: 'cm' }, 'cm'), el('option', { value: 'in' }, 'inches'))
    unitSelect.value = preferredUnit

    const both = el('div', { class: 'readout' })
    const anchor = el('p', { class: 'gloss' })
    const tip = el('p', { class: 'gloss' })

    const paint = (): void => {
      input.value = String(Math.round(toDisplayLength(distanceCm, preferredUnit) * 10) / 10)
      const cm = Math.round(distanceCm)
      const inches = Math.round(toDisplayLength(distanceCm, 'in'))
      both.textContent = `${cm} cm — about ${inches} inches`
      anchor.textContent = describeDistance(distanceCm)
      tip.textContent = measuringTip(distanceCm)
    }

    input.addEventListener('input', () => {
      const typed = Number(input.value)
      if (!Number.isFinite(typed)) return
      distanceCm = fromDisplayLength(typed, preferredUnit)
      error = null
      // Repaint everything except the field being typed into, or the cursor jumps.
      const cm = Math.round(distanceCm)
      both.textContent = `${cm} cm — about ${Math.round(toDisplayLength(distanceCm, 'in'))} inches`
      anchor.textContent = describeDistance(distanceCm)
      tip.textContent = measuringTip(distanceCm)
    })

    unitSelect.addEventListener('change', () => {
      preferredUnit = unitSelect.value as LengthUnit
      paint()
    })

    card.append(
      el('h2', {}, 'Viewing distance'),
      el(
        'p',
        {},
        'How far your eyes sit from the screen when you are working normally. Sit the way you actually sit, ' +
          'then measure — do not measure the posture you wish you had.',
      ),
      el(
        'p',
        {},
        'Difficulty here is measured in prism dioptres (Δ) — how far your two eyes have to turn relative to ' +
          'each other to fuse the two images into one. For a fixed image separation on screen, that demand is ' +
          'inversely proportional to your distance from it.',
      ),
      el(
        'p',
        {},
        'Which is why your distance changes the exercise without telling you. Demand is the image separation ' +
          'divided by your distance, so sitting back from 40 cm to 50 cm cuts it by a fifth while the screen ' +
          'still reports the old number — that is the direction that flatters you. Leaning in does the reverse ' +
          'and makes each rep harder than the figure claims. Either way the number stops meaning what it says, ' +
          'so pick a distance you can actually hold and keep to it rather than adjusting this to match a drift.',
      ),
      el(
        'div',
        { class: 'row' },
        el('div', { class: 'field' }, el('label', {}, 'Viewing distance'), input),
        el('div', { class: 'field' }, el('label', {}, 'Units'), unitSelect),
      ),
      both,
      anchor,
      tip,
    )

    const back = el('button', {}, 'Back')
    back.addEventListener('click', () => {
      error = null
      phase = 'scale'
      render()
    })

    const next = el('button', { class: 'primary' }, 'Next: how to wear the glasses')
    next.addEventListener('click', () => {
      if (!Number.isFinite(distanceCm) || distanceCm < MIN_DISTANCE_CM || distanceCm > MAX_DISTANCE_CM) {
        error = `Enter a viewing distance between ${MIN_DISTANCE_CM} and ${MAX_DISTANCE_CM} cm (${Math.round(
          MIN_DISTANCE_CM / 2.54,
        )}–${Math.round(MAX_DISTANCE_CM / 2.54)} inches).`
        render()
        return
      }
      error = null
      phase = 'orientation'
      render()
    })

    paint()
    card.append(el('div', { class: 'actions' }, back, next))
    return card
  }

  /* ------------------------------------------------------------- step 3 */

  /**
   * Orientation is fixed and taught, then demonstrated.
   *
   * This used to be a two-step interactive check ("close your left eye, click the
   * square that vanishes"), and it was the most confusing screen in the app —
   * reasoning about which lens you are looking through is genuinely hard. Replacing
   * it with a plain instruction fixed the confusion and lost the verification: an
   * instruction can be misread, and a misread one inverts every exercise silently.
   *
   * So the two jobs are split. The ✓/✗ diagram teaches how to wear them; the depth
   * check below it confirms that you did, by asking for something only a person
   * wearing them the stated way round can do. Passing it is not a claim the user
   * makes, it is a thing the user does — which is the only kind of evidence this
   * screen can actually collect.
   */
  function orientationStep(): HTMLElement {
    const card = el('div', { class: 'card' })
    card.append(
      // A decorative red/blue fringe, purely as a nod to what the glasses are for.
      // It is legible without them, and nothing on this screen except the depth
      // check itself requires wearing them to read.
      el('h2', { class: 'anaglyph-3d' }, 'Put the glasses on'),
      el(
        'p',
        {},
        'The red lens goes over your RIGHT eye. Iris assumes that everywhere, so it is the one thing ' +
          'you have to get right by hand — but once they are on, the app can check you got it right.',
      ),
      el(
        'p',
        { class: 'warn' },
        'Worn the other way round, every convergence exercise trains divergence and every divergence ' +
          'exercise trains convergence — the exact opposite of what was prescribed — and nothing on ' +
          'screen would look wrong. If your glasses are the other way round, turn them over.',
      ),
      el('div', { class: 'orientation-pair' }, glassesDiagram(true), glassesDiagram(false)),
      el(
        'p',
        { class: 'gloss' },
        'These are drawn as if you are wearing them and looking out, so the lens on the right of each ' +
          'picture is the one over your right eye.',
      ),
      el(
        'div',
        { class: 'stat-grid' },
        stat('Screen scale', `${pxPerCm.toFixed(1)} px/cm`),
        stat('Viewing distance', `${distanceCm} cm`),
        stat('Red lens', 'right eye'),
      ),
      depthCheckBlock(),
      el(
        'p',
        { class: 'gloss' },
        'You can redo any of this at any time from Settings → Recalibrate. Redo it whenever you change ' +
          'screen, resolution, chair, or desk — the numbers stop being comparable at that point.',
      ),
    )

    const back = el('button', {}, 'Back')
    back.addEventListener('click', () => {
      error = null
      phase = 'distance'
      render()
    })

    card.append(el('div', { class: 'actions' }, back))
    return card
  }

  /**
   * The confirm control, drawn in stereo.
   *
   * There is deliberately no ordinary "Save calibration" button on this step. The
   * whole point is that finishing the wizard should require the thing the wizard
   * cannot otherwise establish, so the act of finishing *is* the proof: clicking the
   * square that stands out of the screen is the only path through, apart from the
   * clearly-labelled escape below it.
   */
  function depthCheckBlock(): HTMLElement {
    const block = el('div', { class: 'card depth-block' })

    const escape = el('button', {}, 'I cannot see any depth — save without checking')
    escape.addEventListener('click', () => finish(false))

    block.append(
      el('h3', {}, 'Now show the glasses are on the right way round'),
      el(
        'p',
        {},
        'Four patches of red and blue speckle, each hiding a square. With the glasses on, three of the ' +
          'squares sit behind the speckle and one floats out in front of it, towards your face. Click ' +
          'the one in front. Two correct picks in a row saves your calibration and finishes setup.',
      ),
      el(
        'p',
        { class: 'warn' },
        'If three of them look like they are floating towards you and only one sinks away, your ' +
          'glasses are on the wrong way round. Turn them over — that alone is worth the check.',
      ),
      el(
        'p',
        { class: 'gloss' },
        'Without the glasses these are just noise. The squares are not drawn into the picture at all; ' +
          'they exist only in the difference between what each eye is sent — a random-dot stereogram, ' +
          'a picture whose content lives in that difference and nowhere else. So this is not something ' +
          'you can reason your way through, only see: passing it is the proof, and it is proof of both ' +
          'facts at once, that the glasses are on and that they are on the right way round.',
      ),
      createDepthCheck({
        cal: { pxPerCm, viewingDistanceCm: distanceCm, redEye: RED_EYE },
        onVerified: () => finish(true),
      }),
      el('div', { class: 'depth-escape' }, escape),
      el(
        'p',
        { class: 'gloss' },
        'Some people cannot fuse a stereo target at all, and that must not lock you out of your own ' +
          'setup. Taking the escape records the red lens as being over your right eye because you were ' +
          'told to put it there, not because you showed that it is — it is stored as unverified. If it ' +
          'is in fact the other way round, every vergence exercise will train the opposite of what it ' +
          'says it is training, so check the diagram once more before using it.',
      ),
    )
    return block
  }

  /**
   * Writes the calibration and leaves. `verified` is the difference between a
   * demonstrated orientation and a stated one, and is recorded as such.
   */
  function finish(verified: boolean): void {
    saveSettings({
      ...settings,
      preferredUnit,
      calibration: {
        pxPerCm: Math.round(pxPerCm * 10) / 10,
        viewingDistanceCm: distanceCm,
        redEye: RED_EYE,
      },
    })
    const proof: OrientationProof = { redEye: RED_EYE, verified, at: Date.now() }
    localStorage.setItem(ORIENTATION_PROOF_KEY, JSON.stringify(proof))
    nav.go('home')
  }

  /** Left lens in the picture = your left eye, because you are looking outwards. */
  function glassesDiagram(correct: boolean): HTMLElement {
    const leftColour = correct ? 'blue' : 'red'
    const rightColour = correct ? 'red' : 'blue'
    return el(
      'div',
      { class: `glasses${correct ? ' is-correct' : ' is-wrong'}` },
      el('div', { class: 'glasses-mark' }, correct ? '✓' : '✗'),
      el(
        'div',
        { class: 'glasses-lenses' },
        el('div', { class: `lens lens-${leftColour}` }, el('span', {}, 'your\nleft eye')),
        el('div', { class: 'glasses-bridge' }),
        el('div', { class: `lens lens-${rightColour}` }, el('span', {}, 'your\nright eye')),
      ),
      el('div', { class: 'glasses-caption' }, correct ? 'Correct' : 'Turn them over'),
    )
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
      el('h1', {}, 'Calibrate Iris'),
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
