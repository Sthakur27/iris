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
 * The ceiling imposed by the viewport alone.
 *
 * Each eye sees the whole dot field shifted by ±disparity/2, so the union of the
 * two views spans fieldWidth + disparity. Once that exceeds the viewport, part of
 * one eye's field is cut off and fusion breaks for the wrong reason. HTS never
 * surfaces this; we do, because a 35Δ goal is unreachable on a small screen at a
 * long working distance and you would otherwise just fail forever.
 *
 * This is only half the story: fitting on screen is necessary but not sufficient,
 * because the two views also have to *overlap*. See `planStereoField`.
 */
export function maxDemandPd(
  viewportWidthPx: number,
  fieldWidthPx: number,
  cal: Calibration,
): number {
  const maxDisparityPx = Math.max(0, viewportWidthPx - fieldWidthPx)
  return pxToPrismDioptres(maxDisparityPx, cal)
}

/**
 * How many times wider than the peak disparity the dot field has to be.
 *
 * The whole field is drawn twice, shifted by ±disparity/2, so the two eye images
 * only cover the same screen pixels across `fieldWidth - disparity`. Everything
 * outside that band is seen by one eye alone. A large monocular region is not a
 * fusion target at all — it is a rivalry stimulus, and rivalry/suppression is the
 * exact failure this app works elsewhere to detect. At a ratio of 4 the binocular
 * core is 75% of the field at the very top of the ladder, and wider than that
 * everywhere below it.
 */
export const FIELD_TO_DISPARITY_RATIO = 4

export interface StereoFieldPlan {
  /** Width of the dot field, in px. Height is a layout concern and set elsewhere. */
  fieldWidthPx: number
  /** Highest demand this planned field can present, in Δ. */
  ceilingPd: number
}

/**
 * Picks a dot field width for a whole run, and reports what it can actually show.
 *
 * Two constraints bound the disparity: the viewport has to hold `field + disparity`
 * (plus the renderer's own margins), and the field has to stay
 * `FIELD_TO_DISPARITY_RATIO` times the disparity so the eye images keep a dominant
 * common region. Setting `field = ratio * disparity` makes both bind at once, which
 * is the widest demand a given screen can present honestly.
 *
 * The field is sized once from the goal rather than per rep: a field that grew and
 * shrank with the ladder would change the stimulus every trial for reasons that have
 * nothing to do with vergence.
 *
 * Nothing here rescales clinical units — px still map to Δ exactly as
 * `prismDioptresToPx` defines. What changes is how much of the goal fits on screen,
 * which is what `ceilingPd` is for.
 */
export function planStereoField(opts: {
  /** Screen width the field may use, after page gutters. */
  usableWidthPx: number
  /** Never draw a field narrower than this, however shallow the goal. */
  minFieldWidthPx: number
  /** Everything the renderer adds to the canvas beyond `field + disparity`. */
  extraPx: number
  /** Peak demand the ladder would like to reach, in Δ. Sign is ignored. */
  goalPd: number
  cal: Calibration
}): StereoFieldPlan {
  const budgetPx = Math.max(0, opts.usableWidthPx - opts.extraPx)

  const goalDisparityPx = Math.abs(prismDioptresToPx(opts.goalPd, opts.cal))
  const screenDisparityPx = budgetPx / (FIELD_TO_DISPARITY_RATIO + 1)
  const disparityPx = Math.min(goalDisparityPx, screenDisparityPx)

  // A shallow goal would otherwise get a comically small field, so there is a floor.
  // Where the floor bites it costs disparity headroom, which the ceiling below reflects.
  const fieldWidthPx = Math.floor(
    Math.min(budgetPx, Math.max(opts.minFieldWidthPx, FIELD_TO_DISPARITY_RATIO * disparityPx)),
  )

  // Whichever of the two constraints binds for the field we settled on.
  const overlapCeilingPd = pxToPrismDioptres(
    fieldWidthPx / FIELD_TO_DISPARITY_RATIO,
    opts.cal,
  )
  const viewportCeilingPd = maxDemandPd(
    opts.usableWidthPx,
    fieldWidthPx + opts.extraPx,
    opts.cal,
  )

  return {
    fieldWidthPx,
    ceilingPd: Math.max(0, Math.min(overlapCeilingPd, viewportCeilingPd)),
  }
}

/** Physical width of a real credit card, used as the calibration reference. */
export const CREDIT_CARD_WIDTH_CM = 8.56
