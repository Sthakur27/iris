import type { Trial } from './types'

/**
 * Response-integrity monitoring.
 *
 * Every procedure here is four-alternative forced choice, so pure guessing scores
 * 25%. A user chasing a high score can therefore "succeed" without ever fusing the
 * target, and worse, fast guessing inflates cycles-per-minute at the same time.
 * HTS's only guard is an 80% accuracy goal, which a motivated guesser will simply
 * grind at a demand level they cannot actually fuse.
 *
 * The fix is borrowed from psychophysics rather than from fitness apps:
 *  - give the user an honest "I can't see it" response and make it cost nothing
 *  - salt the run with catch trials that contain no target at all
 *  - test accuracy against chance rather than against a fixed pass mark
 *  - reject responses that arrive faster than a real fusion response can occur
 *
 * The output is a trust verdict, not a punishment. If the data says the user is
 * guessing, the right response is to lower the demand, not to scold them.
 */

/** Below this, a response cannot reflect an actual fused percept — it is anticipation. */
export const MIN_PLAUSIBLE_LATENCY_MS = 250

/** Fraction of trials presented with no target, to measure false-alarm rate. */
export const CATCH_TRIAL_RATE = 0.12

export type ResponseKind = 'answer' | 'cannotSee'

export interface IntegrityTrial extends Trial {
  /** True when this trial deliberately contained no fusible target. */
  isCatch: boolean
  kind: ResponseKind
}

export interface IntegrityVerdict {
  trustworthy: boolean
  /** Accuracy is not statistically above chance — the demand is too high. */
  atChance: boolean
  /** User answered a direction on trials that had no target. */
  falseAlarmRate: number
  /** Share of answers too fast to be real. */
  anticipationRate: number
  notes: string[]
}

export class IntegrityMonitor {
  private trials: IntegrityTrial[] = []

  constructor(private readonly alternatives = 4) {}

  push(trial: IntegrityTrial): void {
    this.trials.push(trial)
  }

  reset(): void {
    this.trials = []
  }

  /** Real trials only — catch trials have no correct direction to score. */
  private scored(): IntegrityTrial[] {
    return this.trials.filter((t) => !t.isCatch && t.kind === 'answer')
  }

  /**
   * One-sided test of accuracy against chance. Below ~1.64 z we cannot say the
   * user is doing better than guessing, whatever the raw percentage looks like.
   */
  private zAgainstChance(): number | null {
    const scored = this.scored()
    const n = scored.length
    if (n < 12) return null

    const p = 1 / this.alternatives
    const observed = scored.filter((t) => t.correct).length / n
    const se = Math.sqrt((p * (1 - p)) / n)
    return (observed - p) / se
  }

  falseAlarmRate(): number {
    const catches = this.trials.filter((t) => t.isCatch)
    if (catches.length === 0) return 0
    // On a catch trial the honest response is "I can't see it".
    return catches.filter((t) => t.kind === 'answer').length / catches.length
  }

  anticipationRate(): number {
    const answers = this.trials.filter((t) => t.kind === 'answer')
    if (answers.length === 0) return 0
    return answers.filter((t) => t.latencyMs < MIN_PLAUSIBLE_LATENCY_MS).length / answers.length
  }

  verdict(): IntegrityVerdict {
    const z = this.zAgainstChance()
    const atChance = z !== null && z < 1.64
    const falseAlarmRate = this.falseAlarmRate()
    const anticipationRate = this.anticipationRate()
    const notes: string[] = []

    if (atChance) {
      notes.push('Your answers are not beating chance. This demand is above what you can fuse.')
    }
    if (falseAlarmRate > 0.3) {
      notes.push('You are answering on trials that had no target — slow down and only answer what you actually see.')
    }
    if (anticipationRate > 0.2) {
      notes.push('Many answers arrive too fast to be real. Wait until the shape resolves.')
    }

    return {
      trustworthy: !atChance && falseAlarmRate <= 0.3 && anticipationRate <= 0.2,
      atChance,
      falseAlarmRate,
      anticipationRate,
      notes,
    }
  }

  /**
   * Demand control. Accuracy alone is the wrong signal because guessing floors it
   * at chance; we only step up when the responses are also trustworthy.
   */
  recommendation(): 'increase' | 'hold' | 'decrease' {
    const v = this.verdict()
    if (v.atChance || v.falseAlarmRate > 0.3) return 'decrease'

    const scored = this.scored().slice(-16)
    if (scored.length < 12) return 'hold'
    const accuracy = scored.filter((t) => t.correct).length / scored.length

    if (!v.trustworthy) return 'hold'
    if (accuracy >= 0.85) return 'increase'
    if (accuracy < 0.65) return 'decrease'
    return 'hold'
  }

  /** Honest count for reporting: trials the user actually engaged with. */
  summary(): { valid: number; correct: number; cannotSee: number; catches: number } {
    return {
      valid: this.scored().length,
      correct: this.scored().filter((t) => t.correct).length,
      cannotSee: this.trials.filter((t) => t.kind === 'cannotSee').length,
      catches: this.trials.filter((t) => t.isCatch).length,
    }
  }
}
