export type EyeSide = 'left' | 'right'

export type ProcedureId =
  | 'pursuits'
  | 'saccades'
  | 'divergence'
  | 'convergence'
  | 'accommodativeRock'
  | 'jumpDuctions'
  | 'cyclopeanLetters'
  | 'depthCinema'
  | 'depthSpiral'
  | 'depthHelix'

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

/** Which units to show lengths in. Stored so it is asked once, not every time. */
export type LengthUnit = 'cm' | 'in'

export interface DepthCinemaSettings {
  direction: 'convergence' | 'divergence'
  /** Reverse the scene's travel so gates approach rather than recede. */
  reversePlayback: boolean
  convergencePeakPd: number
  divergencePeakPd: number
  /** Seconds spent easing from relaxed fusion to the configured peak. */
  rampSeconds: number
  /** Independently moving anaglyph arrows to layer into the scene. */
  movingArrowCount: number
}

export interface Settings {
  calibration: Calibration
  /** The user's preferred units for distances and screen sizes. */
  preferredUnit: LengthUnit
  /**
   * Advanced mode: manual control over things the programme normally decides.
   *
   * Unlocks every exercise regardless of progression gates, and exposes direct
   * demand controls instead of leaving the adaptive staircase to find your level.
   * Both are useful for testing and both undermine the data — a hand-set demand is
   * not evidence of an adaptively-found threshold — so this is never turned on for
   * you, and trials recorded under it are marked.
   */
  advancedMode: boolean
  prescription: Prescription
  /** Insert an explicit look-away reset between reps (Iris addition, not in HTS). */
  restBetweenRepsMs: number
  /** Whether an unanswered Jump Ductions rep advances and lowers its direction after 12 seconds. */
  jumpDuctionsReduceOnTimeout: boolean
  /** Independent settings for the experimental animated vergence exercise. */
  depthCinema: DepthCinemaSettings
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

  /*
   * Everything below is optional and procedure-specific. It is declared here rather
   * than smuggled through `onTrial` as undeclared extras, because the results screen
   * already reads several of these — an undeclared channel typechecks right up until
   * someone renames a field and the analysis silently starts reporting nothing.
   */

  /** True when this trial deliberately had no resolvable target. */
  isCatch?: boolean
  /** How the user answered: a direction, or an honest "I can't see it". */
  kind?: 'answer' | 'cannotSee'

  /**
   * Current-viewport position of the stimulus that was answered. This is only used
   * while the session is live to place decorative hit feedback; results do not read
   * it and older recorded trials simply omit it.
   */
  hitPoint?: { x: number; y: number }

  /**
   * Accommodative Rock. The first target after each colour change is the one that
   * measures accommodative clearing time — how long that eye took to refocus through
   * the new lens. Later targets in the same row are just reading speed.
   */
  isClearing?: boolean
  rowIndex?: number
  /** Dioptric power in front of the stimulated eye for this trial. */
  flipperD?: number

  /** Saccades: how far the target jumped from the previous one. */
  jumpPx?: number
  jumpDeg?: number
  /** How far from centre the target sat, in degrees of visual angle. */
  eccentricityDeg?: number

  /**
   * The demand was set by hand in advanced mode rather than found by the staircase.
   * Such trials must never count toward "highest demand sustained" — the whole point
   * of that metric is that the level was earned, not chosen.
   */
  manualDemand?: boolean
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
  /** The user ended the session before the plan finished. */
  endedEarly?: boolean
  /** How many rests the user cut short. Recorded, not judged. */
  restsSkipped?: number
}
