export type EyeSide = 'left' | 'right'

export type ProcedureId =
  | 'pursuits'
  | 'saccades'
  | 'divergence'
  | 'convergence'
  | 'accommodativeRock'
  | 'jumpDuctions'

/** Screen + posture calibration. Everything that converts pixels to clinical units. */
export interface Calibration {
  /** CSS pixels per centimetre, measured by matching an on-screen card to a real one. */
  pxPerCm: number
  /** Eye-to-screen distance in centimetres. */
  viewingDistanceCm: number
  /** Which eye the RED filter of the anaglyph glasses sits over. */
  redEye: EyeSide
}

/**
 * Prescribed parameters. HTS hardcodes its own defaults; these are yours to set,
 * because flipper powers and vergence goals are assigned per diagnosis.
 */
export interface Prescription {
  /** Goal fusional demand in prism dioptres. HTS defaults: 35 BO convergence, 13 BI divergence. */
  convergenceGoalPd: number
  divergenceGoalPd: number
  /** Accommodative Rock flipper ladder. HTS ships 6 levels of monocular flippers. */
  flipperLevels: FlipperLevel[]
  /** Accommodative Rock goals. HTS defaults: 80% correct per eye, 13 cycles/min. */
  rockAccuracyGoal: number
  rockCpmGoal: number
}

export interface FlipperLevel {
  level: number
  /** Dioptric power in front of the right eye for this level. */
  rightEyeD: number
  /** Dioptric power in front of the left eye for this level. */
  leftEyeD: number
}

export interface Settings {
  calibration: Calibration
  prescription: Prescription
  /** Insert an explicit look-away reset between reps (SidVision addition, not in HTS). */
  restBetweenRepsMs: number
}

/** One stimulus-response pair. Latency is recorded from the first session onward. */
export interface Trial {
  index: number
  /** Demand at the moment of presentation: prism dioptres, or flipper level for rock. */
  demand: number
  /** Which eye was being stimulated, where the procedure is monocular. */
  eye?: EyeSide
  correct: boolean
  /** Milliseconds from stimulus onset to the keypress that resolved it. */
  latencyMs: number
}

export interface ProcedureResult {
  procedure: ProcedureId
  startedAt: number
  durationMs: number
  trials: Trial[]
}

export interface SessionRecord {
  id: string
  startedAt: number
  results: ProcedureResult[]
}
