import type { Calibration } from './types'

/**
 * Vergence demand conversion.
 *
 * A prism dioptre (Δ) is 1 cm of deviation at 100 cm. A horizontal disparity of
 * `d` cm between the two eyes' images, viewed at `D` cm, therefore imposes a
 * fusional demand of 100 * d / D prism dioptres. Positive = crossed = convergence.
 */
export function pxToPrismDioptres(disparityPx: number, cal: Calibration): number {
  const disparityCm = disparityPx / cal.pxPerCm
  return (100 * disparityCm) / cal.viewingDistanceCm
}

export function prismDioptresToPx(pd: number, cal: Calibration): number {
  const disparityCm = (pd * cal.viewingDistanceCm) / 100
  return disparityCm * cal.pxPerCm
}

/**
 * The ceiling this screen can actually reach.
 *
 * Each eye sees the whole dot field shifted by ±disparity/2, so the union of the
 * two views spans fieldWidth + disparity. Once that exceeds the viewport, part of
 * one eye's field is cut off and fusion breaks for the wrong reason. HTS never
 * surfaces this; we do, because a 35Δ goal is unreachable on a small screen at a
 * long working distance and you would otherwise just fail forever.
 */
export function maxDemandPd(
  viewportWidthPx: number,
  fieldWidthPx: number,
  cal: Calibration,
): number {
  const maxDisparityPx = Math.max(0, viewportWidthPx - fieldWidthPx)
  return pxToPrismDioptres(maxDisparityPx, cal)
}

/** Physical width of a real credit card, used as the calibration reference. */
export const CREDIT_CARD_WIDTH_CM = 8.56
