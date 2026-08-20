import type { EyeSide } from './types'

/**
 * Random-dot stereogram with an arbitrary-shaped target region.
 *
 * `renderRds` in anaglyph.ts only knows how to float a rectangle. This is the same
 * Julesz forward-map construction with the rectangle test replaced by a per-pixel
 * mask, so the region that pops can be any shape at all — here, a letter glyph. The
 * two renderers are deliberately siblings rather than one function with a mode flag:
 * the rectangle path is load-bearing for three shipping procedures and its geometry
 * (`widthPx` compensation and all) is subtle enough that threading a mask through it
 * would risk exactly the misalignment bugs its header comment documents.
 *
 * The clinical point of a masked target is that it makes the answer unguessable in a
 * way a 4-position square cannot: with the target shape drawn from a whole alphabet,
 * chance falls from 25% to ~6%, and a user who is suppressing one eye sees literally
 * nothing to answer — which is itself the finding.
 */

export interface MaskedRdsParams {
  fieldW: number
  fieldH: number
  dotPx: number
  density: number
  /** Total horizontal disparity across the whole field. Positive = crossed = convergence. */
  baseDisparityPx: number
  /** Extra disparity applied to masked pixels only, floating them in front of the field. */
  popPx: number
  /**
   * `fieldW * fieldH` bytes in row-major field coordinates; non-zero marks the target
   * region. `null` renders a plain field with no target in it at all.
   */
  mask: Uint8Array | null
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
 * Renders both eye views into one canvas, exactly as `renderRds` does: left-eye
 * content in one colour channel, right-eye content in the other, membership in the
 * target decided in the shared cyclopean coordinate system so both eyes carry the
 * same dots at `base + pop` apart wherever the mask says "target".
 *
 * Every depth edge of the mask produces an occlusion strip of `popPx / 2` on each
 * side where the two eyes disagree — that is what a real edge in depth does. Callers
 * who care that the *fused* shape keeps its drawn stroke width should hand in a mask
 * pre-dilated by `popPx / 2` per side (see `rasterizeLetterMask`), which is the
 * shaped equivalent of `RdsTarget.widthPx`.
 */
export function renderMaskedRds(canvas: HTMLCanvasElement, p: MaskedRdsParams): void {
  const halfBase = p.baseDisparityPx / 2
  const halfPop = p.mask ? p.popPx / 2 : 0

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

  for (const eye of ['left', 'right'] as const) {
    // Red filter passes red light, so the eye behind it sees the red channel.
    const channel = eye === p.redEye ? 0 : 2
    const baseShift = eyeShift[eye]
    const extraShift = popShift[eye]

    for (let y = 0; y < h; y++) {
      const row = y * p.fieldW

      for (let sourceX = 0; sourceX < p.fieldW; sourceX++) {
        const inTarget = p.mask !== null && p.mask[row + sourceX] !== 0

        const shift = baseShift + (inTarget ? extraShift : 0)
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

export interface LetterMaskOptions {
  /** Glyph height as a fraction of the field height. Cyclopean acuity is coarse, so big. */
  heightFraction?: number
  /**
   * Horizontal dilation applied to the rasterised glyph, in px per side. Pass
   * `popPx / 2`: each depth edge loses an occlusion strip that wide, so pre-widening
   * every stroke by the same amount means the shape that actually fuses keeps the
   * stroke weight the font drew.
   */
  dilatePx?: number
}

/**
 * Rasterises one letter into a field-sized target mask.
 *
 * The glyph is drawn huge and maximally bold on an offscreen canvas, filled and then
 * stroked at a tenth of its own height to fatten every stem — disparity-defined form
 * is resolved at far coarser acuity than luminance-defined form (this is why the
 * clinical Random Dot E is one enormous letter), so a bookish stroke weight would
 * make every trial an acuity test instead of a fusion test. The alpha channel is then
 * thresholded into a boolean mask and dilated horizontally per `dilatePx`.
 *
 * Returns `null` where a 2D context is unavailable, which callers treat as "no
 * target this trial" rather than an error worth crashing a therapy session over.
 */
export function rasterizeLetterMask(
  letter: string,
  fieldW: number,
  fieldH: number,
  opts: LetterMaskOptions = {},
): Uint8Array | null {
  const heightFraction = opts.heightFraction ?? 0.58
  const dilatePx = Math.max(0, Math.round(opts.dilatePx ?? 0))

  const raster = document.createElement('canvas')
  raster.width = fieldW
  raster.height = fieldH
  const g = raster.getContext('2d', { willReadFrequently: true })
  if (!g) return null

  let px = Math.round(fieldH * heightFraction)
  const font = (size: number): string => `900 ${size}px system-ui, Arial, sans-serif`

  // The dilation is going to widen the glyph further, so it must fit with room spare.
  g.font = font(px)
  const measured = g.measureText(letter).width
  const maxW = fieldW * 0.7 - 2 * dilatePx
  if (measured > maxW && measured > 0) px = Math.max(24, Math.floor((px * maxW) / measured))

  g.clearRect(0, 0, fieldW, fieldH)
  g.font = font(px)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = '#fff'
  g.strokeStyle = '#fff'
  g.lineWidth = Math.max(2, px * 0.1)
  g.lineJoin = 'round'
  g.fillText(letter, fieldW / 2, fieldH / 2)
  g.strokeText(letter, fieldW / 2, fieldH / 2)

  const alpha = g.getImageData(0, 0, fieldW, fieldH).data
  const mask = new Uint8Array(fieldW * fieldH)
  for (let i = 0; i < mask.length; i++) {
    if ((alpha[i * 4 + 3] ?? 0) > 127) mask[i] = 1
  }

  if (dilatePx === 0) return mask

  // Horizontal dilation only: the occlusion cost being compensated is purely
  // horizontal, because disparity is. Vertical strokes keep their fused width and
  // horizontal strokes merely grow slightly longer, which nothing can misread.
  const dilated = new Uint8Array(fieldW * fieldH)
  for (let y = 0; y < fieldH; y++) {
    const row = y * fieldW
    for (let x = 0; x < fieldW; x++) {
      if (mask[row + x] === 0) continue
      const lo = Math.max(0, x - dilatePx)
      const hi = Math.min(fieldW - 1, x + dilatePx)
      dilated.fill(1, row + lo, row + hi + 1)
    }
  }
  return dilated
}
