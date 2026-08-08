import type { LengthUnit, ProcedureId, SessionRecord, Settings } from './types'

/**
 * HTS's published defaults, used as starting values only.
 *
 * The flipper ladder is HTS's suggested monocular sequence (3 flippers, 2 levels
 * each) from the Accommodative Rock manual. The vergence goals are HTS's defaults.
 * All of it is doctor-assigned in a real programme — edit these in Settings to
 * whatever you were actually prescribed.
 */
export const DEFAULT_SETTINGS: Settings = {
  calibration: {
    pxPerCm: 50,
    viewingDistanceCm: 40,
    redEye: 'right',
  },
  prescription: {
    convergenceGoalPd: 35,
    divergenceGoalPd: 13,
    flipperLevels: [
      { level: 1, rightEyeD: +0.75, leftEyeD: -1.5 },
      { level: 2, rightEyeD: -2.5, leftEyeD: +1.25 },
      { level: 3, rightEyeD: +1.75, leftEyeD: -3.5 },
      { level: 4, rightEyeD: -4.0, leftEyeD: +2.0 },
      { level: 5, rightEyeD: +2.25, leftEyeD: -4.5 },
      { level: 6, rightEyeD: -5.0, leftEyeD: +2.5 },
    ],
    rockAccuracyGoal: 0.8,
    rockCpmGoal: 13,
  },
  restBetweenRepsMs: 0,
  preferredUnit: 'cm',
  advancedMode: false,
}

const CM_PER_INCH = 2.54

export function toDisplayLength(cm: number, unit: LengthUnit): number {
  return unit === 'in' ? cm / CM_PER_INCH : cm
}

export function fromDisplayLength(value: number, unit: LengthUnit): number {
  return unit === 'in' ? value * CM_PER_INCH : value
}

/**
 * A plain-language anchor for a viewing distance.
 *
 * "Sit at 40 cm" is a number almost nobody can act on — most people have no
 * calibrated sense of it, and guessing wrong silently changes every demand in the
 * programme, because demand in prism dioptres is inversely proportional to distance.
 * Leaning from 40 cm to 30 cm quietly cuts the demand by a quarter.
 */
export function describeDistance(cm: number): string {
  if (cm < 30) return 'Closer than most people sit — closer than a paperback held to read.'
  if (cm < 45) return 'Typical laptop distance: elbow on the desk, screen about a forearm away.'
  if (cm < 60) return 'A relaxed desktop-monitor distance — a forearm plus a hand.'
  if (cm < 80) return 'About arm’s length: sit back, reach out, and your fingertips graze the screen.'
  return 'Further than arm’s length — a large monitor or a TV across the room.'
}

/** Something in every house that is a known length, for checking the guess. */
export function measuringTip(cm: number): string {
  const sheets = cm / 29.7 // A4 long edge; US Letter is 27.9 cm, close enough to say "about"
  return `A sheet of printer paper is about 30 cm on its long edge — you are aiming for roughly ${sheets.toFixed(1)} of those, end to end, from your eyes to the screen.`
}

/** HTS's default Daily Therapy Protocol, in order, with its published durations. */
export const DAILY_PROTOCOL: { id: ProcedureId; label: string; seconds: number }[] = [
  { id: 'pursuits', label: 'Pursuits', seconds: 180 },
  { id: 'saccades', label: 'Saccades', seconds: 180 },
  { id: 'divergence', label: 'Divergence', seconds: 420 },
  { id: 'convergence', label: 'Convergence', seconds: 420 },
  { id: 'accommodativeRock', label: 'Accommodative Rock', seconds: 300 },
]

/** Jump Ductions is gated behind Convergence and Divergence, exactly as HTS gates it. */
export const JUMP_DUCTIONS = { id: 'jumpDuctions' as const, label: 'Jump Ductions', seconds: 420 }

const SETTINGS_KEY = 'iris.settings.v1'
const SESSIONS_KEY = 'iris.sessions.v1'

export function loadSettings(): Settings {
  const raw = localStorage.getItem(SETTINGS_KEY)
  if (!raw) return structuredClone(DEFAULT_SETTINGS)
  try {
    const parsed = JSON.parse(raw) as Partial<Settings>
    return {
      ...structuredClone(DEFAULT_SETTINGS),
      ...parsed,
      calibration: { ...DEFAULT_SETTINGS.calibration, ...parsed.calibration },
      prescription: { ...DEFAULT_SETTINGS.prescription, ...parsed.prescription },
    }
  } catch {
    return structuredClone(DEFAULT_SETTINGS)
  }
}

const CALIBRATION_ENV_KEY = 'iris.calibrationEnv.v1'

/**
 * The rendering environment in force when the screen was calibrated.
 *
 * What actually invalidates a calibration is not the absolute zoom level — if you
 * measured the card at 110% and stay at 110%, your pixels-per-centimetre is still
 * correct. It is zoom *changing after* you calibrated. So we record the environment
 * at calibration time and compare against it, rather than trying to detect zoom in
 * the abstract, which no browser API reports portably.
 */
export interface CalibrationEnv {
  devicePixelRatio: number
  innerWidth: number
}

export function saveSettings(s: Settings): void {
  const previous = localStorage.getItem(SETTINGS_KEY)
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))

  // Only re-stamp the environment when the calibration itself changed. Stamping on
  // every save would silently re-baseline drift detection: edit a prescription at a
  // different zoom and the guard would adopt the new zoom as correct, which is
  // exactly the failure it exists to catch.
  if (!calibrationChanged(previous, s)) return

  const env: CalibrationEnv = {
    devicePixelRatio: window.devicePixelRatio,
    innerWidth: window.innerWidth,
  }
  localStorage.setItem(CALIBRATION_ENV_KEY, JSON.stringify(env))
}

function calibrationChanged(previousRaw: string | null, next: Settings): boolean {
  if (localStorage.getItem(CALIBRATION_ENV_KEY) === null) return true
  if (!previousRaw) return true
  try {
    const previous = JSON.parse(previousRaw) as Partial<Settings>
    const a = previous.calibration
    const b = next.calibration
    if (!a) return true
    return (
      a.pxPerCm !== b.pxPerCm ||
      a.viewingDistanceCm !== b.viewingDistanceCm ||
      a.redEye !== b.redEye
    )
  } catch {
    return true
  }
}

export function loadCalibrationEnv(): CalibrationEnv | null {
  const raw = localStorage.getItem(CALIBRATION_ENV_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as CalibrationEnv
  } catch {
    return null
  }
}

export function isCalibrated(): boolean {
  return localStorage.getItem(SETTINGS_KEY) !== null
}

export function loadSessions(): SessionRecord[] {
  const raw = localStorage.getItem(SESSIONS_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as SessionRecord[]
  } catch {
    return []
  }
}

export function saveSession(record: SessionRecord): void {
  const all = loadSessions()
  const existing = all.findIndex((s) => s.id === record.id)
  if (existing >= 0) all[existing] = record
  else all.push(record)
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(all))
}

/** True once Convergence and Divergence have each been run to completion at least once. */
export function jumpDuctionsUnlocked(): boolean {
  if (loadSettings().advancedMode) return true
  const done = new Set<ProcedureId>()
  for (const session of loadSessions()) {
    for (const r of session.results) done.add(r.procedure)
  }
  return done.has('convergence') && done.has('divergence')
}
