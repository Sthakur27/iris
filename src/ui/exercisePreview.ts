/**
 * Pre-session preview: what the next exercise actually looks like, drawn live.
 *
 * The session opens on a full-bleed black stage with an unexplained shimmering dot
 * field, which is a genuinely alarming first impression for someone who has never
 * done vision therapy. Everything here exists to remove that surprise, so it is
 * deliberately built from the same renderers the procedures use rather than from a
 * static illustration: a hand-drawn mock would drift away from the real stimulus the
 * moment either changes, and the whole value of this screen is that it is truthful.
 *
 * It is an illustration and never a rehearsal — nothing here is timed, scored, or
 * recorded, and the demand drawn is a gentle fixed one rather than the level the
 * exercise will actually start at. Where that matters the caption says so.
 */

import { el } from './router'
import { drawLandoltC, renderRds } from '../core/anaglyph'
import { rasterizeLetterMask, renderMaskedRds } from '../core/rdsMask'
import { planStereoField, prismDioptresToPx } from '../core/geometry'
import type { Calibration, ProcedureId, Settings } from '../core/types'
import {
  DEPTH_CINEMA_MAX_CONVERGENCE_PD,
  DEPTH_CINEMA_MIN_PEAK_PD,
  depthCinemaDivergenceLimit,
} from '../core/depthCinemaSafety'

/** Canvas colours, mirroring the procedures' own constants (the `--anaglyph-*` tokens). */
const RED = '#ff2b2b'
const BLUE = '#2b6bff'
const NEUTRAL = '#dfe7ef'
const HALO = '#5c6b7d'
const FAINT = '#2f3841'

/** Room the preview stage gives the picture. Small on purpose: this is a thumbnail. */
const PREVIEW_WIDTH_PX = 420
const PREVIEW_HEIGHT_PX = 150

/** Dot size and density are copied from the vergence engine so the speckle looks right. */
const DOT_PX = 3
const DOT_DENSITY = 0.5

/**
 * The demand the sample stereogram is drawn at, in prism dioptres.
 *
 * Far below where any ladder starts. A preview drawn at the real starting demand
 * would be a rep — the user would try to fuse it, fail or succeed, and draw a
 * conclusion from a picture that measures nothing.
 */
const PREVIEW_DEMAND_PD = 2

const PROCEDURE_IDS: readonly ProcedureId[] = [
  'pursuits',
  'saccades',
  'divergence',
  'convergence',
  'accommodativeRock',
  'jumpDuctions',
  'cyclopeanLetters',
  'depthCinema',
  'depthSpiral',
  'depthHelix',
]

/** `SessionRequest.procedureId` is a bare string, so it has to be re-checked here. */
export function toProcedureId(id: string): ProcedureId | null {
  return PROCEDURE_IDS.includes(id as ProcedureId) ? (id as ProcedureId) : null
}

interface KeyLine {
  key: string
  means: string
}

interface Copy {
  /** What is on the screen, in plain language. */
  stimulus: string
  /** What the user physically does with it. */
  task: string
  keys: KeyLine[]
}

/**
 * Written from each procedure's own header comment rather than from the name, because
 * "Divergence" tells a non-optometrist nothing. Every clinical term is glossed on
 * first use in the sentence that needs it.
 */
function copyFor(id: ProcedureId): Copy {
  const arrowMeans = 'Point at the gap in the ring.'
  // Space is the single most important thing to tell a new user, so it is worded the
  // same way everywhere: an honest option with no cost, not an admission of failure.
  const spaceRest =
    'Always a legitimate answer — it tells the app to ease off rather than marking you wrong, ' +
    'so it never counts against you.'
  const spaceMeans = `I can’t see it. ${spaceRest}`

  switch (id) {
    case 'pursuits':
      return {
        stimulus:
          'One target drifts slowly around a black screen on a wandering path that never repeats, so it ' +
          'cannot be second-guessed. Inside it is a ring with a gap in one side.',
        task:
          'Follow the target with your eyes and say which way the gap faces. The gap is too small to read ' +
          'out of the corner of your eye, so the only way to answer is to actually be looking at it — that ' +
          'is the exercise.',
        keys: [
          { key: '← ↑ → ↓', means: arrowMeans },
          { key: 'Space', means: spaceMeans },
        ],
      }

    case 'saccades':
      return {
        stimulus:
          'One ring with a gap appears somewhere on a black screen. Answer it and it vanishes; the next ' +
          'appears somewhere else, at a distance you cannot predict.',
        task:
          'Flick your eyes straight to each new ring and say which way its gap faces. The ring is small ' +
          'enough that your eye has to land on it before the gap can be read.',
        keys: [
          { key: '← ↑ → ↓', means: arrowMeans },
          { key: 'Space', means: spaceMeans },
        ],
      }

    case 'accommodativeRock':
      return {
        stimulus:
          'A row of four rings, each with a gap, in red — then the same row in blue. Through the red/blue ' +
          'glasses each colour reaches one eye only, so the row you can see tells you which eye is working.',
        task:
          'Read the row left to right, saying which way each gap faces. When the colour changes the screen ' +
          'says FLIP: turn the flipper over — the handheld pair of lenses — so the other lens is in front ' +
          'of your eyes, then carry on. Changing focus quickly through those lenses is the exercise; the ' +
          'flipper level and which power is over which eye stay on screen throughout.',
        keys: [
          { key: '← ↑ → ↓', means: arrowMeans },
          { key: 'Space', means: `Too blurred to read. ${spaceRest}` },
          { key: 'Your hand', means: 'Flip the lens every time the colour changes.' },
        ],
      }

    case 'convergence':
      return {
        stimulus:
          'A field of red and blue speckle. Through the glasses each eye sees its own half of it, and a ' +
          'square floats out in front of the noise, above, below, left or right of centre. Without the ' +
          'glasses on it is just speckle — the square only exists once the two eyes combine the two views.',
        task:
          'Let the square settle, then say where it is floating. The two views are pulled apart so your ' +
          'eyes have to turn inward — toward each other — to hold it together, which is the part being ' +
          'trained. It should feel like effort, never like pain.',
        keys: [
          { key: '← ↑ → ↓', means: 'Point at where the square floats.' },
          { key: 'Space', means: spaceMeans },
        ],
      }

    case 'divergence':
      return {
        stimulus:
          'A field of red and blue speckle. Through the glasses each eye sees its own half of it, and a ' +
          'square floats out of the noise, above, below, left or right of centre. Without the glasses on ' +
          'it is just speckle — the square only exists once the two eyes combine the two views.',
        task:
          'Let the square settle, then say where it is floating. Here the views are shifted the other way, ' +
          'so your eyes have to turn outward — as if looking past the screen. Eyes turn outward over a much ' +
          'smaller range than inward, so the numbers in this exercise stay far lower than in Convergence.',
        keys: [
          { key: '← ↑ → ↓', means: 'Point at where the square floats.' },
          { key: 'Space', means: spaceMeans },
        ],
      }

    case 'jumpDuctions':
      return {
        stimulus:
          'The same speckled field and floating square as Convergence and Divergence, but the demand jumps ' +
          'between the two on alternate turns instead of easing up and down. Between turns the screen ' +
          'blanks to a single dot to look at.',
        task:
          'Let your eyes settle on the dot, then say where the square floats when the field returns. Each ' +
          'turn is a sudden change rather than a slow one, which is the point: it trains how fast your eyes ' +
          'grab a new distance, not how long they can hold one.',
        keys: [
          { key: '← ↑ → ↓', means: 'Point at where the square floats.' },
          { key: 'Space', means: spaceMeans },
        ],
      }

    case 'cyclopeanLetters':
      return {
        stimulus:
          'A field of red and blue speckle that constantly churns, with one large letter floating out of it ' +
          '— but the letter exists only in the depth between the two eyes’ views. Neither eye alone is shown ' +
          'any letter shape at all: close one eye and there is genuinely nothing there but noise.',
        task:
          'Let the field settle, wait for the letter to float clear of the noise, and type it. The two views ' +
          'are pulled apart so your eyes have to turn inward to hold the letter together, exactly as in ' +
          'Convergence. Seeing only noise is a real and useful answer, not a failure — it is what suppression ' +
          'looks like from the inside.',
        keys: [
          { key: 'A–Z', means: 'Type the letter you see floating in the noise.' },
          { key: 'Space', means: `I see only noise. ${spaceRest}` },
        ],
      }

    case 'depthCinema':
      return {
        stimulus:
          'A tiny red-and-blue space scene loops on the black field: stars drift, depth rings approach, ' +
          'and a little ship moves through them. Through the glasses the layers assemble at different depths.',
        task:
          'Watch the ship and let the scene become one stable 3D picture. Its prism demand rises smoothly ' +
          'toward the separate Depth Cinema setting, then eases back before the next loop. Settings can also ' +
          'reverse the movie so the scene moves closer. There are no answers to enter.',
        keys: [{ key: 'Just watch', means: 'Keep the ship single and comfortable; pause if it doubles.' }],
      }
    case 'depthSpiral':
      return {
        stimulus:
          'A fixed square spiral made of lettered nodes, drawn once in red and once in blue. Through the glasses the two copies become one lettered path at the depth you choose.',
        task:
          'Keep the path and its letters single. Nothing moves automatically: change the scale only when you want a larger or smaller fixed target, and use the depth control only when ready.',
        keys: [{ key: '− / +', means: 'Lower or raise the fixed depth.' }],
      }
    case 'depthHelix':
      return {
        stimulus:
          'A red-and-blue DNA-like double helix sits diagonally in space, with two twisting rails joined by a ladder of fixed rungs. Through the glasses the nearer parts come forward and the far parts recede.',
        task:
          'Follow the moving glow along one rail, keeping only the marked segment single and clear as its depth changes. Other parts may naturally double. Pause, reverse, or slow the trace at any time; you can also rotate, zoom, stretch, or hide the cross-lines.',
        keys: [
          { key: 'Trace controls', means: 'Change its speed, pause or resume it, and reverse its direction.' },
          { key: '▶ X / Y / Z', means: 'Start or pause automatic rotation independently; axis speed is adjustable from 0.25–2°/s.' },
          { key: 'Drag', means: 'Rotate freely around the X and Y axes.' },
          { key: 'X / Y / Z', means: 'Set every rotation axis precisely with its slider.' },
          { key: 'Wheel / pinch', means: 'Zoom the helix in or out.' },
          { key: 'Stretch', means: 'Lengthen or compress the helix without changing its overall zoom.' },
          { key: 'Cross-lines', means: 'Show or hide the connecting lines between the two rails.' },
          { key: '− / +', means: 'Lower or raise the fixed depth.' },
        ],
      }
  }
}

/* ----------------------------------------------------------------- drawing */

interface Drawn {
  canvas: HTMLCanvasElement
  /** How this picture differs from the exercise, where it does. Empty when it does not. */
  caveat: string
}

function draw(id: ProcedureId, cal: Calibration): Drawn {
  const canvas = el('canvas', { class: 'preview-canvas' })
  switch (id) {
    case 'convergence':
    case 'divergence':
    case 'jumpDuctions': {
      const shownPd = paintStereogram(canvas, id === 'divergence' ? -1 : 1, cal)
      return {
        canvas,
        caveat:
          `Drawn at about ${shownPd.toFixed(1)}Δ — prism dioptres, the unit for how far the eyes are being ` +
          'asked to turn. That is a much gentler demand than the exercise starts at, and the exercise then ' +
          'follows you up and down from there. It is an illustration, not a measurement of anything.',
      }
    }
    case 'pursuits':
      paintPursuits(canvas)
      return {
        canvas,
        caveat:
          'The faint line is the path the target has already wandered; on screen it moves, and its speed ' +
          'follows how you are doing. Nothing is being measured here.',
      }
    case 'saccades':
      paintSaccades(canvas)
      return {
        canvas,
        caveat:
          'Only one ring is on screen at a time — the faint ones show where the next might land. Ring size ' +
          'follows how you are doing. Nothing is being measured here.',
      }
    case 'accommodativeRock':
      paintRock(canvas)
      return {
        canvas,
        caveat:
          'Both rows are shown together here so the colour change is visible. In the exercise they come one ' +
          'after the other, at the size the exercise picks. Nothing is being measured here.',
      }
    case 'cyclopeanLetters': {
      const shownPd = paintCyclopeanLetter(canvas, cal)
      return {
        canvas,
        caveat:
          `Drawn at about ${shownPd.toFixed(1)}Δ, far gentler than the exercise starts at, and frozen — in ` +
          'the exercise the speckle churns continuously, which is what keeps the letter invisible to either ' +
          'eye alone. Without the glasses this is just noise; there is no letter printed anywhere in it.',
      }
    }
    case 'depthCinema':
      paintCinemaPreview(canvas, cal)
      return {
        canvas,
        caveat:
          'A frozen frame at a gentle 2Δ. The exercise animates continuously and uses its own direction, peak, and ramp time from Settings.',
      }
    case 'depthSpiral':
      paintSpiralPreview(canvas, cal)
      return {
        canvas,
        caveat: 'Illustration only. The exercise itself is a fixed, lettered square spiral; it changes only when you adjust its scale or depth.',
      }
    case 'depthHelix':
      paintHelixPreview(canvas, cal)
      return {
        canvas,
        caveat: 'A frozen frame at a gentle 2Δ. In the exercise, a binocular glow travels along one rail for you to follow.',
      }
  }
}

function paintHelixPreview(canvas: HTMLCanvasElement, cal: Calibration): void {
  const g = blankCanvas(canvas)
  if (!g) return
  const disparity = prismDioptresToPx(2, cal)
  const samples = 54
  const point = (u: number, strand: number): { x: number; y: number; d: number } => {
    const along = (u - 0.5) * 290
    const theta = u * Math.PI * 6.5 + 0.45 + strand * Math.PI
    const radial = Math.cos(theta) * 31
    const z = Math.sin(theta) * 31 + along * 0.18
    return {
      x: PREVIEW_WIDTH_PX / 2 + along * 0.94 + radial * 0.31,
      y: PREVIEW_HEIGHT_PX / 2 - along * 0.25 + radial * 0.95,
      d: Math.max(0.1, Math.min(1, 0.5 + z / 150)),
    }
  }
  for (const eye of ['left', 'right'] as const) {
    const colour = eye === cal.redEye ? RED : BLUE
    const sign = eye === 'left' ? 1 : -1
    g.strokeStyle = colour
    g.fillStyle = colour
    for (let rung = 0; rung <= 12; rung++) {
      const u = 0.04 + rung / 12 * 0.92
      const a = point(u, 0); const b = point(u, 1)
      g.globalAlpha = 0.38
      g.lineWidth = 1.2
      g.beginPath(); g.moveTo(a.x + sign * disparity * a.d * 0.5, a.y); g.lineTo(b.x + sign * disparity * b.d * 0.5, b.y); g.stroke()
    }
    for (let strand = 0; strand < 2; strand++) {
      g.globalAlpha = 0.82
      g.lineWidth = 3
      g.beginPath()
      for (let i = 0; i <= samples; i++) {
        const p = point(i / samples, strand)
        const x = p.x + sign * disparity * p.d * 0.5
        if (i === 0) g.moveTo(x, p.y); else g.lineTo(x, p.y)
      }
      g.stroke()
    }
  }
  g.globalAlpha = 1
}

function paintSpiralPreview(canvas: HTMLCanvasElement, cal: Calibration): void {
  const g = blankCanvas(canvas)
  if (!g) return
  const points: Array<[number, number]> = [
    [-.45, -.43], [.45, -.43], [.45, .43], [-.45, .43], [-.45, -.25],
    [.27, -.25], [.27, .25], [-.27, .25], [-.27, -.09], [.09, -.09], [.09, .09], [-.09, .09], [-.09, 0], [0, 0],
  ]
  const letters = 'BJUMHIDPVAZFSOCWG NQKYE'.replaceAll(' ', '')
  const disparity = prismDioptresToPx(2, cal)
  for (const eye of ['left', 'right'] as const) {
    const shift = (eye === 'left' ? 1 : -1) * disparity * 0.5
    g.save()
    g.translate(PREVIEW_WIDTH_PX / 2 + shift, PREVIEW_HEIGHT_PX / 2)
    g.strokeStyle = eye === cal.redEye ? RED : BLUE
    g.fillStyle = g.strokeStyle
    g.globalAlpha = .86
    g.lineWidth = 3
    g.beginPath()
    points.forEach(([x, y], i) => i ? g.lineTo(x * 130, y * 130) : g.moveTo(x * 130, y * 130))
    g.stroke()
    points.forEach(([x, y], i) => {
      const px = x * 130; const py = y * 130
      g.globalAlpha = .95; g.beginPath(); g.arc(px, py, 8, 0, Math.PI * 2); g.stroke()
      g.font = '600 9px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(letters[i] ?? '•', px, py)
    })
    g.restore()
  }
  g.globalAlpha = 1
}

function paintCinemaPreview(canvas: HTMLCanvasElement, cal: Calibration): void {
  const g = blankCanvas(canvas)
  if (!g) return
  const disparity = prismDioptresToPx(2, cal)
  g.globalCompositeOperation = 'lighter'
  for (const eye of ['left', 'right'] as const) {
    const colour = eye === cal.redEye ? RED : BLUE
    const sign = eye === 'left' ? 1 : -1
    g.strokeStyle = colour
    g.fillStyle = colour
    g.globalAlpha = 0.82
    for (let i = 0; i < 3; i++) {
      const depth = 0.35 + i * 0.24
      const shift = sign * disparity * depth * 0.5
      g.beginPath()
      g.arc(PREVIEW_WIDTH_PX / 2 + shift, PREVIEW_HEIGHT_PX / 2, 18 + i * 22, 0, Math.PI * 2)
      g.stroke()
    }
    const shift = sign * disparity * 0.5
    g.beginPath()
    g.moveTo(PREVIEW_WIDTH_PX / 2 - 25 + shift, PREVIEW_HEIGHT_PX / 2)
    g.lineTo(PREVIEW_WIDTH_PX / 2 + 20 + shift, PREVIEW_HEIGHT_PX / 2 - 12)
    g.lineTo(PREVIEW_WIDTH_PX / 2 + 11 + shift, PREVIEW_HEIGHT_PX / 2 + 12)
    g.closePath()
    g.fill()
  }
  g.globalCompositeOperation = 'source-over'
  g.globalAlpha = 1
}

/**
 * A real random-dot stereogram at a token demand, sized by the same planner the
 * procedures use so the two eye views still overlap properly at thumbnail scale.
 * Returns the demand actually drawn, which the planner may have had to reduce.
 */
function paintStereogram(canvas: HTMLCanvasElement, sign: 1 | -1, cal: Calibration): number {
  const popPx = Math.max(6, Math.min(20, Math.round(prismDioptresToPx(0.5, cal))))
  const plan = planStereoField({
    usableWidthPx: PREVIEW_WIDTH_PX,
    // A stereo field is much wider than it is tall, exactly like a physical
    // vectogram, so the thumbnail keeps that shape rather than reading as a square.
    minFieldWidthPx: Math.round(PREVIEW_HEIGHT_PX * 1.8),
    extraPx: popPx + 2 * DOT_PX + 2,
    goalPd: PREVIEW_DEMAND_PD,
    cal,
  })
  const shownPd = Math.min(PREVIEW_DEMAND_PD, plan.ceilingPd)

  const fieldH = PREVIEW_HEIGHT_PX
  const sizePx = Math.max(24, Math.round(fieldH * 0.18))
  renderRds(canvas, {
    fieldW: plan.fieldWidthPx,
    fieldH,
    dotPx: DOT_PX,
    density: DOT_DENSITY,
    baseDisparityPx: prismDioptresToPx(sign * shownPd, cal),
    // Fixed position and seed: a preview that reshuffled on every re-render would
    // read as motion the exercise does not have.
    target: {
      cx: plan.fieldWidthPx / 2,
      cy: fieldH / 2 - fieldH * 0.26,
      sizePx,
      popPx,
    },
    redEye: cal.redEye,
    seed: 20_240_611,
  })
  return shownPd
}

/**
 * A real cyclopean letter at a token demand: the same masked renderer the procedure
 * uses, one glyph from its alphabet, frozen at a fixed seed for the reason the other
 * stereogram preview is. Returns the demand actually drawn.
 */
function paintCyclopeanLetter(canvas: HTMLCanvasElement, cal: Calibration): number {
  const popPx = Math.max(6, Math.min(20, Math.round(prismDioptresToPx(0.5, cal))))
  const plan = planStereoField({
    usableWidthPx: PREVIEW_WIDTH_PX,
    minFieldWidthPx: Math.round(PREVIEW_HEIGHT_PX * 1.8),
    extraPx: popPx + 2 * DOT_PX + 2,
    goalPd: PREVIEW_DEMAND_PD,
    cal,
  })
  const shownPd = Math.min(PREVIEW_DEMAND_PD, plan.ceilingPd)

  renderMaskedRds(canvas, {
    fieldW: plan.fieldWidthPx,
    fieldH: PREVIEW_HEIGHT_PX,
    dotPx: DOT_PX,
    density: DOT_DENSITY,
    baseDisparityPx: prismDioptresToPx(shownPd, cal),
    popPx,
    mask: rasterizeLetterMask('E', plan.fieldWidthPx, PREVIEW_HEIGHT_PX, {
      heightFraction: 0.62,
      dilatePx: popPx / 2,
    }),
    redEye: cal.redEye,
    seed: 20_240_611,
  })
  return shownPd
}

function blankCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  canvas.width = PREVIEW_WIDTH_PX
  canvas.height = PREVIEW_HEIGHT_PX
  const g = canvas.getContext('2d')
  if (!g) return null
  g.clearRect(0, 0, PREVIEW_WIDTH_PX, PREVIEW_HEIGHT_PX)
  return g
}

/**
 * The wandering path, frozen mid-run.
 *
 * The frequency ratios are irrational for the same reason the procedure's are: a
 * rational ratio closes into a repeating loop, and a loop drawn here would suggest a
 * predictable path the exercise deliberately does not have. These are this file's own
 * numbers, not the procedure's — the picture only has to have the right character.
 */
function paintPursuits(canvas: HTMLCanvasElement): void {
  const g = blankCanvas(canvas)
  if (!g) return

  const cx = PREVIEW_WIDTH_PX / 2
  const cy = PREVIEW_HEIGHT_PX / 2
  const ax = PREVIEW_WIDTH_PX * 0.36
  const ay = PREVIEW_HEIGHT_PX * 0.3
  const at = (t: number): { x: number; y: number } => ({
    x: cx + ax * (0.6 * Math.sin(0.42 * t) + 0.4 * Math.sin(0.42 * Math.SQRT2 * t + 1.7)),
    y: cy + ay * (0.6 * Math.sin(0.31 * t + 0.6) + 0.4 * Math.sin(0.31 * Math.PI * t + 2.9)),
  })

  const END_T = 26
  g.save()
  g.strokeStyle = FAINT
  g.lineWidth = 1.5
  g.beginPath()
  for (let t = 0; t <= END_T; t += 0.05) {
    const p = at(t)
    if (t === 0) g.moveTo(p.x, p.y)
    else g.lineTo(p.x, p.y)
  }
  g.stroke()
  g.restore()

  const head = at(END_T)
  const size = 26

  // The halo: findable in peripheral vision, while the gap inside it is not. That
  // split is what makes the exercise pursuit rather than search, so it is drawn here.
  g.save()
  g.globalAlpha = 0.5
  g.strokeStyle = HALO
  g.lineWidth = 2
  g.beginPath()
  g.arc(head.x, head.y, size * 1.55, 0, Math.PI * 2)
  g.stroke()
  g.restore()

  drawLandoltC(g, head.x, head.y, size, 'right', NEUTRAL)
}

function paintSaccades(canvas: HTMLCanvasElement): void {
  const g = blankCanvas(canvas)
  if (!g) return

  const cx = PREVIEW_WIDTH_PX / 2
  const cy = PREVIEW_HEIGHT_PX / 2
  const size = 24

  // The centre mark the exercise returns to between targets.
  g.save()
  g.fillStyle = FAINT
  g.beginPath()
  g.arc(cx, cy, 3, 0, Math.PI * 2)
  g.fill()
  g.restore()

  // Ghosts of where a target could land next, at deliberately unequal distances —
  // varying the jump size is the point of the exercise, not incidental.
  const ghosts = [
    { x: cx - 118, y: cy - 34 },
    { x: cx + 96, y: cy + 40 },
    { x: cx + 34, y: cy - 46 },
  ]
  g.save()
  g.globalAlpha = 0.28
  for (const ghost of ghosts) {
    g.strokeStyle = FAINT
    g.lineWidth = 2
    g.beginPath()
    g.arc(ghost.x, ghost.y, size / 2, 0, Math.PI * 2)
    g.stroke()
  }
  g.restore()

  drawLandoltC(g, cx - 62, cy + 30, size, 'up', NEUTRAL)
}

function paintRock(canvas: HTMLCanvasElement): void {
  const g = blankCanvas(canvas)
  if (!g) return

  const size = 30
  const step = Math.round(size * 1.95)
  const startX = PREVIEW_WIDTH_PX / 2 - (step * 3) / 2

  const rows: { colour: string; y: number; gaps: ('up' | 'down' | 'left' | 'right')[] }[] = [
    { colour: RED, y: 44, gaps: ['right', 'down', 'left', 'up'] },
    { colour: BLUE, y: 108, gaps: ['down', 'left', 'up', 'right'] },
  ]

  for (const row of rows) {
    for (let i = 0; i < row.gaps.length; i++) {
      const gap = row.gaps[i]
      if (!gap) continue
      drawLandoltC(g, startX + i * step, row.y, size, gap, row.colour)
    }
  }
}

/* ------------------------------------------------------------------ public */

function depthCinemaSettingsPreview(
  settings: Settings,
  onSettingsChange: (settings: Settings) => void,
): HTMLElement {
  const cinema = settings.depthCinema
  const divergenceLimit = depthCinemaDivergenceLimit(settings.calibration.viewingDistanceCm)
  const direction = el('select')
  direction.append(
    el('option', { value: 'convergence' }, 'Convergence — inward'),
    el('option', { value: 'divergence' }, 'Divergence — outward'),
  )
  direction.value = cinema.direction
  const reverse = el('input', { type: 'checkbox', checked: cinema.reversePlayback })
  const convergencePeak = previewNumberInput(
    cinema.convergencePeakPd,
    DEPTH_CINEMA_MIN_PEAK_PD,
    DEPTH_CINEMA_MAX_CONVERGENCE_PD,
    0.5,
  )
  const divergencePeak = previewNumberInput(
    cinema.divergencePeakPd,
    DEPTH_CINEMA_MIN_PEAK_PD,
    divergenceLimit,
    0.5,
  )
  const ramp = previewNumberInput(cinema.rampSeconds, 10, 120, 1)
  const arrows = previewNumberInput(cinema.movingArrowCount, 0, 4, 1)
  const commit = (): void => {
    const next = {
      ...settings,
      depthCinema: {
        direction: direction.value === 'divergence' ? ('divergence' as const) : ('convergence' as const),
        reversePlayback: reverse.checked,
        convergencePeakPd: clampPreviewValue(
          Number(convergencePeak.value),
          DEPTH_CINEMA_MIN_PEAK_PD,
          DEPTH_CINEMA_MAX_CONVERGENCE_PD,
          cinema.convergencePeakPd,
        ),
        divergencePeakPd: clampPreviewValue(
          Number(divergencePeak.value),
          DEPTH_CINEMA_MIN_PEAK_PD,
          divergenceLimit,
          cinema.divergencePeakPd,
        ),
        rampSeconds: clampPreviewValue(Number(ramp.value), 10, 120, cinema.rampSeconds),
        movingArrowCount: Math.round(clampPreviewValue(Number(arrows.value), 0, 4, cinema.movingArrowCount)),
      },
    }
    onSettingsChange(next)
  }
  direction.addEventListener('change', commit)
  reverse.addEventListener('change', commit)
  for (const input of [convergencePeak, divergencePeak, ramp, arrows]) {
    input.addEventListener('change', commit)
  }
  return el(
    'section',
    { class: 'preview-settings' },
    el('h3', { class: 'preview-heading' }, 'Depth Cinema settings for this session'),
    previewSettingField('Direction', direction),
    el('label', { class: 'toggle-row' }, reverse, el('span', {}, 'Play in reverse — moving closer')),
    el(
      'div',
      { class: 'grid-2' },
      previewSettingField('Convergence peak (Δ)', convergencePeak),
      previewSettingField('Divergence peak (Δ)', divergencePeak),
    ),
    el(
      'div',
      { class: 'grid-2' },
      previewSettingField('Time to peak (seconds)', ramp),
      previewSettingField('Moving arrows (0–4)', arrows),
    ),
    el(
      'p',
      { class: 'gloss' },
      `Cinema safety caps apply here: up to ${DEPTH_CINEMA_MAX_CONVERGENCE_PD}Δ convergence and ${divergenceLimit}Δ divergence at your viewing distance. Stop for doubling or discomfort; persistent double vision needs an eye exam before continuing. Changes save immediately.`,
    ),
  )
}

function previewNumberInput(value: number, min: number, max: number, step: number): HTMLInputElement {
  return el('input', { type: 'number', value: String(value), min: String(min), max: String(max), step: String(step) })
}

function previewSettingField(label: string, input: HTMLElement): HTMLElement {
  return el('label', { class: 'field' }, el('span', {}, label), input)
}

function clampPreviewValue(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

/**
 * The whole preview block, ready to append. `planNote` is the "and then the rest of
 * the plan" line, which only a plan session has.
 */
export function exercisePreviewCard(opts: {
  procedureId: ProcedureId
  label: string
  settings: Settings
  planNote: string | null
  onSettingsChange: (settings: Settings) => void
}): HTMLElement {
  const copy = copyFor(opts.procedureId)
  const drawn = draw(opts.procedureId, opts.settings.calibration)

  const card = el('div', { class: 'card' })
  card.append(el('h2', {}, `What ${opts.label} looks like`))
  if (opts.planNote) card.append(el('p', {}, opts.planNote))

  card.append(
    el('div', { class: 'preview-stage' }, drawn.canvas),
    el('p', { class: 'gloss' }, drawn.caveat),
    el('h3', { class: 'preview-heading' }, 'What you do'),
    el('p', {}, copy.stimulus),
    el('p', {}, copy.task),
  )

  if (opts.procedureId === 'depthCinema') {
    card.append(depthCinemaSettingsPreview(opts.settings, opts.onSettingsChange))
  }

  const keys = el('ul', { class: 'preview-keys' })
  for (const line of copy.keys) {
    keys.append(
      el('li', {}, el('span', { class: 'key-cap' }, line.key), el('span', {}, line.means)),
    )
  }
  card.append(keys)

  return card
}
