import type { DepthCinemaSettings } from './types'

/**
 * Depth Cinema is unscored and cannot detect blur, suppression, or loss of fusion.
 * Keep its unsupervised range well below the application's clinician-entered
 * vergence goals. These are product guardrails, not individual clinical targets.
 */
export const DEPTH_CINEMA_MIN_PEAK_PD = 0.5
export const DEPTH_CINEMA_MAX_CONVERGENCE_PD = 12
export const DEPTH_CINEMA_MAX_DIVERGENCE_PD = 6

// The app does not measure IPD. Using 50 mm (rather than the 63 mm display
// estimate) gives the infinity guard a conservative small-IPD assumption.
const CONSERVATIVE_IPD_CM = 5
const INFINITY_RESERVE_PD = 0.5

/**
 * Largest offered divergence demand at this viewing distance.
 *
 * Divergence subtracts from the vergence already required to look at the screen.
 * Keeping 0.5Δ of vergence in reserve prevents optical-infinity-or-beyond
 * alignment under the conservative 50 mm IPD assumption. Round down to the UI's
 * 0.5Δ step so the displayed maximum is attainable.
 */
export function depthCinemaDivergenceLimit(viewingDistanceCm: number): number {
  const distance = Number.isFinite(viewingDistanceCm) && viewingDistanceCm > 0 ? viewingDistanceCm : 40
  const beforeInfinityPd = (100 * CONSERVATIVE_IPD_CM) / distance - INFINITY_RESERVE_PD
  const capped = Math.min(DEPTH_CINEMA_MAX_DIVERGENCE_PD, beforeInfinityPd)
  return Math.max(DEPTH_CINEMA_MIN_PEAK_PD, Math.floor(capped * 2) / 2)
}

export function clampDepthCinemaSettings(
  settings: DepthCinemaSettings,
  viewingDistanceCm: number,
): DepthCinemaSettings {
  const divergenceLimit = depthCinemaDivergenceLimit(viewingDistanceCm)
  return {
    ...settings,
    convergencePeakPd: clampFinite(
      settings.convergencePeakPd,
      DEPTH_CINEMA_MIN_PEAK_PD,
      DEPTH_CINEMA_MAX_CONVERGENCE_PD,
      8,
    ),
    divergencePeakPd: clampFinite(
      settings.divergencePeakPd,
      DEPTH_CINEMA_MIN_PEAK_PD,
      divergenceLimit,
      Math.min(4, divergenceLimit),
    ),
    // Avoid abrupt unscored ramps even if older local storage contains 5 seconds.
    rampSeconds: clampFinite(settings.rampSeconds, 10, 120, 90),
    movingArrowCount: Math.round(clampFinite(settings.movingArrowCount, 0, 4, 2)),
  }
}

function clampFinite(value: number, min: number, max: number, fallback: number): number {
  const finite = Number.isFinite(value) ? value : fallback
  return Math.min(max, Math.max(min, finite))
}
