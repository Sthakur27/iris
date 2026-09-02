import type { EyeSide } from './types'

/**
 * Red/blue anaglyph random-dot stereogram renderer.
 *
 * The dot field is defined by a hash function rather than a stored array, so a
 * shifted region stays perfectly correlated between the two eyes wherever the
 * shifts agree and decorrelates everywhere else. That is exactly the Julesz
 * construction: the target is invisible to either eye alone and only resolves
 * once the two images fuse, which is what makes it a true stereo target rather
 * than a monocular shape you can cheat by closing one eye.
 */

export interface RdsTarget {
  /** Centre of the target square, in field-space pixels from the field's top-left. */
  cx: number
  cy: number
  sizePx: number
  /**
   * Drawn width, when it should differ from `sizePx`.
   *
   * A depth edge costs an occlusion strip of `popPx / 2` on each side — the band
   * where one eye can see round the edge and the other cannot. That is real, and it
   * is how a genuine edge in depth behaves, but it means the part that actually
   * fuses is `width - popPx` wide against the full height. Drawing `popPx` wider
   * than tall makes the fused square come out square.
   */
  widthPx?: number
  /** Extra disparity applied to the target only, making it float in front of the field. */
  popPx: number
}

export interface RdsParams {
  fieldW: number
  fieldH: number
  dotPx: number
  density: number
  /** Total horizontal disparity across the whole field. Positive = crossed = convergence. */
  baseDisparityPx: number
  target: RdsTarget | null
  redEye: EyeSide
  seed: number
}

function hashDot(x: number, y: number, seed: number): number {
  let h = (x * 0x1f1f1f1f) ^ (y * 0x3b9aca07) ^ (seed * 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 0x100000000
}

/**
 * Renders both eye views into one canvas. Left-eye content goes in one colour
 * channel, right-eye content in the other, decided by which eye the red filter
 * covers. Overlapping dots read as magenta, which is why HTS screens look pink.
 */
export function renderRds(canvas: HTMLCanvasElement, p: RdsParams): void {
  const halfBase = p.baseDisparityPx / 2
  const halfPop = p.target ? p.target.popPx / 2 : 0

  // Union of the two shifted views, plus room for the target's extra excursion.
  const margin = Math.ceil(Math.abs(halfBase) + Math.abs(halfPop)) + p.dotPx
  const w = p.fieldW + margin * 2
  const h = p.fieldH

  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const img = ctx.createImageData(w, h)
  const data = img.data

  // Left eye shifts one way, right eye the other. Crossed disparity means each
  // eye's image moves toward the other eye's side, forcing the eyes inward.
  const eyeShift: Record<EyeSide, number> = { left: +halfBase, right: -halfBase }
  const popShift: Record<EyeSide, number> = { left: +halfPop, right: -halfPop }

  const t = p.target
  const halfSize = t ? t.sizePx / 2 : 0
  const halfWidth = t ? (t.widthPx ?? t.sizePx) / 2 : 0

  for (const eye of ['left', 'right'] as const) {
    // Red filter passes red light, so the eye behind it sees the red channel.
    const channel = eye === p.redEye ? 0 : 2

    /*
     * Forward map: walk the cyclopean field and place each dot where this eye sees it.
     *
     * The renderer used to walk screen pixels and sample backwards, deciding target
     * membership from the screen position. That is subtly wrong, because a pixel's
     * membership has to be decided in the *shared* coordinate system both eyes are
     * warped from — decide it on screen and each eye tests a different part of the
     * field, so the two target regions never describe the same square. What came out
     * was a wide band of disturbance with a narrow fused column down the middle and
     * uncorrelated dots either side, or, when it failed to fuse, two squares side by
     * side.
     *
     * Walking the field instead makes it unambiguous: one source dot, drawn once per
     * eye, displaced by that eye's shift for the region it belongs to. Inside the
     * square both eyes therefore carry the *same* dots at `base + pop` apart, which
     * is exactly what fuses into a square floating in front of the field. The one
     * strip of width `pop` at the border where the two eyes disagree is the occlusion
     * zone a real edge in depth produces, and the visual system reads it as such.
     */
    for (let y = 0; y < h; y++) {
      const inTargetRow = t !== null && y >= t.cy - halfSize && y < t.cy + halfSize

      for (let sourceX = 0; sourceX < p.fieldW; sourceX++) {
        const inTarget =
          inTargetRow && t !== null && sourceX >= t.cx - halfWidth && sourceX < t.cx + halfWidth

        const shift = eyeShift[eye] + (inTarget ? popShift[eye] : 0)
        const x = Math.round(sourceX + shift) + margin
        if (x < 0 || x >= w) continue

        const cellX = Math.floor(sourceX / p.dotPx)
        const cellY = Math.floor(y / p.dotPx)
        if (hashDot(cellX, cellY, p.seed) >= p.density) continue

        const i = (y * w + x) * 4
        data[i + channel] = 255
        data[i + 3] = 255
      }
    }
  }

  ctx.putImageData(img, 0, 0)
}

/**
 * Flat-fusion fallback for when a random-dot stereogram will not fuse.
 * Mirrors HTS's second-degree targets: one image per eye, no stereo content, so
 * fusion is driven by superimposition rather than disparity.
 */
export function renderFlatFusion(
  ctx: CanvasRenderingContext2D,
  opts: {
    width: number
    height: number
    baseDisparityPx: number
    redEye: EyeSide
    /** Which of the four positions holds the odd target out. */
    oddPosition: 0 | 1 | 2 | 3
  },
): void {
  const { width, height, baseDisparityPx, redEye, oddPosition } = opts
  ctx.clearRect(0, 0, width, height)

  const cx = width / 2
  const cy = height / 2
  const r = Math.min(width, height) * 0.3
  const positions = [
    { x: cx, y: cy - r },
    { x: cx, y: cy + r },
    { x: cx - r, y: cy },
    { x: cx + r, y: cy },
  ]

  const half = baseDisparityPx / 2
  const shift: Record<EyeSide, number> = { left: +half, right: -half }

  for (const eye of ['left', 'right'] as const) {
    ctx.save()
    ctx.translate(shift[eye], 0)
    ctx.strokeStyle = eye === redEye ? '#ff0000' : '#0000ff'
    ctx.lineWidth = 3
    ctx.globalCompositeOperation = 'lighter'

    // Central fusion lock, seen by both eyes.
    ctx.beginPath()
    ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 2)
    ctx.stroke()

    positions.forEach((pos, i) => {
      ctx.beginPath()
      if (i === oddPosition) {
        // The odd one out is a bare line rather than a cross.
        ctx.moveTo(pos.x, pos.y - 14)
        ctx.lineTo(pos.x, pos.y + 14)
      } else {
        ctx.moveTo(pos.x - 14, pos.y)
        ctx.lineTo(pos.x + 14, pos.y)
        ctx.moveTo(pos.x, pos.y - 14)
        ctx.lineTo(pos.x, pos.y + 14)
      }
      ctx.stroke()
    })
    ctx.restore()
  }
}

/** Landolt C, drawn in a single anaglyph channel so only one eye receives it. */
export function drawLandoltC(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  direction: 'up' | 'down' | 'left' | 'right',
  color: string,
): void {
  const gapAngle = Math.PI / 4
  const rotation = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[direction]

  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = size / 5
  ctx.beginPath()
  ctx.arc(x, y, size / 2, rotation + gapAngle / 2, rotation - gapAngle / 2 + Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}
