/**
 * The control that proves the anaglyph glasses are on, and on the right way round.
 *
 * Every other way of establishing this is an instruction the user has to reason
 * about and can silently get wrong, which matters more here than anywhere else in
 * the app: with the lenses swapped, every convergence exercise trains divergence
 * and nothing on screen looks wrong. So this asks for a demonstration instead.
 *
 * Four random-dot stereograms, each hiding a square at a different depth. The dots
 * are defined by a hash rather than a picture, so neither eye alone receives a
 * square at all — there is nothing to recognise without both filters, no partial
 * credit, and no way to answer by squinting at the screen. That is what makes the
 * click itself the evidence.
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
 * which negates every disparity: the square drawn nearest becomes the one that
 * looks furthest, and the whole depth ordering flips end to end. That inversion is
 * the entire test. Picking the truly-furthest square is not a near miss — it is the
 * signature of reversed glasses, and is reported as exactly that.
 *
 * One honest limitation: without glasses the high-disparity patches do show a faint
 * red/blue fringe where the two channels disagree, so a determined cheat could tell
 * the two extreme tiles from the two middle ones. What they cannot tell is which of
 * the extremes is near and which is far — the sign is the thing being tested, and
 * the sign is invisible without the filters.
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
 * Depth of the nearest square, in prism dioptres of disparity.
 *
 * Deliberately far below anything the ladder ever asks for. This is not an exercise
 * and must not become one: at a demand that takes effort to fuse, failing the check
 * would mean "your vergence is poor today", not "your glasses are the wrong way
 * round", and the wizard would be blocking the wrong people.
 */
const NEAR_POP_PD = 0.5

/** Clamps for odd calibrations, so the pop stays fusable and still visible. */
const MIN_POP_PX = 8
const MAX_POP_PX = 22

/**
 * Relative depths of the four squares, nearest first before shuffling.
 *
 * Two extremes and two shallow middles. A ranking judgement ("which is nearest")
 * is much easier for someone who has never done this than an absolute one ("is it
 * in front of the screen or behind it?"), and it inverts just as cleanly when the
 * glasses are reversed.
 */
const DEPTH_STEPS = [1, 0.34, -0.34, -1] as const

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
  /** Fired once the nearest square has been picked `ROUNDS_TO_PASS` times running. */
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
    Math.min(MAX_POP_PX, Math.round(prismDioptresToPx(NEAR_POP_PD, opts.cal))),
  )

  let passes = 0
  let seed = Math.floor(Math.random() * 1_000_000)

  const stage = el('div', { class: 'depth-stage' })
  const progress = el('p', { class: 'gloss depth-progress' })
  const feedback = el('p', { class: 'gloss' })

  function paintRound(): void {
    const depths = shuffle(DEPTH_STEPS.slice())
    const near = Math.max(...depths)
    const far = Math.min(...depths)

    stage.replaceChildren(
      ...depths.map((depth, i) => {
        seed += 1
        return tile(depth, i, () => pick(depth, near, far))
      }),
    )
    progress.textContent =
      passes === 0
        ? `Two correct picks in a row confirms it. This is pick 1 of ${ROUNDS_TO_PASS}.`
        : `One to go — pick ${passes + 1} of ${ROUNDS_TO_PASS}, reshuffled.`
  }

  function pick(depth: number, near: number, far: number): void {
    if (depth === near) {
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

    // The one drawn furthest away is precisely what the nearest square looks like
    // through reversed lenses, so this answer is diagnostic rather than merely wrong.
    passes = 0
    paintRound()
    if (depth === far) {
      feedback.className = 'gloss warn'
      feedback.textContent =
        'That square is the furthest away of the four — which is exactly how the nearest one ' +
        'looks if the glasses are on the wrong way round. Take them off, turn them over so the ' +
        'RED lens sits over your right eye, and try again.'
      return
    }
    feedback.className = 'gloss'
    feedback.textContent =
      'That one sits in the middle of the four. Look for the square that seems to hover above ' +
      'the speckle, closest to your face. Everything has been reshuffled — try again.'
  }

  function tile(depth: number, index: number, onPick: () => void): HTMLElement {
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
        popPx: depth * popPx,
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
