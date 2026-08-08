/**
 * The control that proves the anaglyph glasses are on, and on the right way round.
 *
 * Every other way of establishing this is an instruction the user has to reason
 * about and can silently get wrong, which matters more here than anywhere else in
 * the app: with the lenses swapped, every convergence exercise trains divergence
 * and nothing on screen looks wrong. So this asks for a demonstration instead.
 *
 * Four random-dot stereograms, each hiding a square. Three of the squares sit
 * behind the speckle and one stands in front of it; the user clicks the one in
 * front. The dots are defined by a hash rather than a picture, so neither eye alone
 * receives a square at all — there is nothing to recognise without both filters, no
 * partial credit, and no way to answer by squinting at the screen. That is what
 * makes the click itself the evidence.
 *
 * The four disparities are deliberately equal in size and differ only in sign. Any
 * anaglyph stereogram betrays its target slightly to the naked eye, because inside
 * the target the two colour channels stop agreeing and the square shows up as a
 * patch of red/blue fringe. Equal magnitudes make that fringe identical across all
 * four tiles, so it says "there is a square here" — which is true of every tile —
 * and nothing whatsoever about which one is in front. Sign is the whole question,
 * and sign is exactly what the filters, and only the filters, reveal.
 *
 *
 * SIGN CONVENTION — which way the near square is drawn, and why.
 *
 * `renderRds` shifts the left eye's copy of the target by +popPx/2 and the right
 * eye's copy by -popPx/2, then writes each eye's copy into the colour channel that
 * eye's filter passes (red is given to whichever eye `redEye` names — 'right'
 * throughout Iris). A POSITIVE popPx therefore puts the left eye's image of the
 * square to the RIGHT of the right eye's image: each image displaced toward the
 * other eye's side, which is crossed disparity — the eyes have to converge to fuse
 * it, and a converged fixation point lies nearer than the screen. Positive pop
 * floats toward the viewer. (The same convention as the exercises, where positive
 * disparity is the convergence direction; see the geometry note in
 * `src/core/anaglyph.ts`.)
 *
 * Wear the glasses reversed and each eye receives the copy drawn for the other one,
 * which negates every disparity: the one square that should stand in front sinks
 * behind, and the three that should sink come forward. That inversion is the entire
 * test. A reversed wearer following the instruction faithfully — click the one that
 * floats towards you — has three tiles to choose from and every one of them is
 * wrong, so they cannot pass by being careful, only by turning the glasses over.
 * It is also visible to them as a state, which is why the copy names it: three
 * floating and one sunk means the glasses are the wrong way round.
 */

import { el } from './router'
import { renderRds } from '../core/anaglyph'
import { prismDioptresToPx } from '../core/geometry'
import type { Calibration } from '../core/types'
import './screens.css'

/** Dot size and density copied from the vergence engine, so the speckle matches. */
const DOT_PX = 3
const DOT_DENSITY = 0.5

const FIELD_W = 128
const FIELD_H = 116
const TARGET_PX = 48

/**
 * Depth of the squares, in prism dioptres of disparity.
 *
 * Deliberately far below anything the ladder ever asks for. This is not an exercise
 * and must not become one: at a demand that takes effort to fuse, failing the check
 * would mean "your vergence is poor today", not "your glasses are the wrong way
 * round", and the wizard would be blocking the wrong people.
 */
const POP_PD = 0.5

/** Clamps for odd calibrations, so the pop stays fusable and still visible. */
const MIN_POP_PX = 8
const MAX_POP_PX = 22

/**
 * Signs of the four squares' disparities, before shuffling: one in front, three
 * behind. Odd-one-out among four is the same judgement every exercise in the app
 * asks for, and a far easier one for a beginner than ranking depths against each
 * other or deciding in the abstract whether a single square is in front or behind.
 */
const DEPTH_SIGNS = [1, -1, -1, -1] as const

/**
 * Correct picks required in a row.
 *
 * One round is a 1-in-4 guess, which is too easy to fall into by accident for
 * something this consequential. Two rounds with a fresh shuffle is 1 in 16, and
 * costs a person who can actually see the squares one extra click.
 */
const ROUNDS_TO_PASS = 2

export interface DepthCheckOptions {
  cal: Calibration
  /** Fired once the square in front has been picked `ROUNDS_TO_PASS` times running. */
  onVerified: () => void
}

/**
 * Builds the check. The returned element owns its own state; the caller supplies the
 * meaning of passing and, separately, whatever escape it wants to offer people who
 * cannot fuse a stereo target at all.
 */
export function createDepthCheck(opts: DepthCheckOptions): HTMLElement {
  const popPx = Math.max(
    MIN_POP_PX,
    Math.min(MAX_POP_PX, Math.round(prismDioptresToPx(POP_PD, opts.cal))),
  )

  let passes = 0
  let seed = Math.floor(Math.random() * 1_000_000)

  const stage = el('div', { class: 'depth-stage' })
  const progress = el('p', { class: 'gloss depth-progress' })
  const feedback = el('p', { class: 'gloss' })

  function paintRound(): void {
    const signs = shuffle(DEPTH_SIGNS.slice())

    stage.replaceChildren(
      ...signs.map((sign, i) => {
        seed += 1
        return tile(sign, i, () => pick(sign > 0))
      }),
    )
    progress.textContent =
      passes === 0
        ? `Two correct picks in a row confirms it. This is pick 1 of ${ROUNDS_TO_PASS}.`
        : `One to go — pick ${passes + 1} of ${ROUNDS_TO_PASS}, reshuffled.`
  }

  function pick(wasInFront: boolean): void {
    if (wasInFront) {
      passes += 1
      if (passes >= ROUNDS_TO_PASS) {
        stage.replaceChildren()
        progress.textContent = ''
        feedback.className = 'gloss good'
        feedback.textContent = 'Confirmed — the red lens is over your right eye.'
        opts.onVerified()
        return
      }
      paintRound()
      feedback.className = 'gloss good'
      feedback.textContent = 'That was the one in front. Once more with them reshuffled.'
      return
    }

    // Every wrong tile is one of the three drawn behind the field, which is also the
    // set a reversed wearer sees floating — so the reversal is named on every miss
    // rather than inferred, and the user is told which percept to check it against.
    passes = 0
    paintRound()
    feedback.className = 'gloss warn'
    feedback.textContent =
      'That square sits behind the speckle. Exactly one of the four floats out towards you — if ' +
      'instead three of them float and only one sinks away, the glasses are on the wrong way ' +
      'round: turn them over so the RED lens is over your right eye. Everything has been ' +
      'reshuffled; try again.'
  }

  function tile(sign: number, index: number, onPick: () => void): HTMLElement {
    const canvas = el('canvas', { class: 'depth-canvas' })
    renderRds(canvas, {
      fieldW: FIELD_W,
      fieldH: FIELD_H,
      dotPx: DOT_PX,
      density: DOT_DENSITY,
      // No whole-field disparity: the field itself sits at the screen plane, so the
      // only thing the eyes have to do is register the square's depth. Adding vergence
      // demand here would turn a yes/no check into a graded one.
      baseDisparityPx: 0,
      target: {
        cx: FIELD_W / 2,
        cy: FIELD_H / 2,
        sizePx: TARGET_PX,
        popPx: sign * popPx,
      },
      // Fixed by the app, not by the user: this check exists to confirm reality
      // matches it, so it must be drawn for the orientation Iris assumes.
      redEye: opts.cal.redEye,
      seed,
    })

    const button = el(
      'button',
      { class: 'depth-tile', type: 'button', ariaLabel: `Speckle patch ${index + 1} of 4` },
      canvas,
    )
    button.addEventListener('click', onPick)
    return button
  }

  paintRound()
  return el('div', { class: 'depth-check' }, stage, progress, feedback)
}

function shuffle(items: number[]): number[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const a = items[i]
    const b = items[j]
    if (a === undefined || b === undefined) continue
    items[i] = b
    items[j] = a
  }
  return items
}
