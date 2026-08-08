/**
 * Deterministic post-session analysis.
 *
 * This is the layer that decides what a session *meant*. It is plain rules over
 * the trial data — no model call — so that the same data always produces the same
 * reading, and so a language model can later narrate these findings instead of
 * inventing its own.
 *
 * Two principles run through all of it:
 *
 *  1. The headline metric is the highest demand held with *trustworthy* responses.
 *     Raw accuracy and raw speed can both be inflated by guessing, so neither is
 *     ever reported as an achievement on its own.
 *  2. When the integrity signals fire, the conclusion is "that was too hard, back
 *     off", never "you cheated". The user is the patient, not the defendant.
 */

import { IntegrityMonitor, MIN_PLAUSIBLE_LATENCY_MS } from '../core/integrity'
import type { IntegrityTrial, IntegrityVerdict, ResponseKind } from '../core/integrity'
import { loadSessions } from '../core/settings'
import type {
  EyeSide,
  ProcedureId,
  ProcedureResult,
  SessionRecord,
  Settings,
  Trial,
} from '../core/types'

/* ------------------------------------------------------------------ labels */

export const PROCEDURE_LABELS: Record<ProcedureId, string> = {
  pursuits: 'Pursuits',
  saccades: 'Saccades',
  divergence: 'Divergence',
  convergence: 'Convergence',
  accommodativeRock: 'Accommodative Rock',
  jumpDuctions: 'Jump Ductions',
}

export type DemandUnit = 'pd' | 'level' | 'none'

/** Vergence procedures are scored in prism dioptres; rock is scored in flipper levels. */
export function demandUnit(id: ProcedureId): DemandUnit {
  switch (id) {
    case 'convergence':
    case 'divergence':
    case 'jumpDuctions':
      return 'pd'
    case 'accommodativeRock':
      return 'level'
    case 'pursuits':
    case 'saccades':
      return 'none'
  }
}

export function formatDemand(value: number | null, unit: DemandUnit): string {
  if (value === null) return '—'
  if (unit === 'pd') return `${round1(value)} Δ`
  if (unit === 'level') return `level ${round1(value)}`
  return round1(value).toString()
}

/* ------------------------------------------------------- tuning constants */

/** Every procedure here is four-alternative forced choice. */
const CHANCE = 0.25

/** A demand level needs this many real attempts before we will call it "sustained". */
const MIN_TRIALS_PER_DEMAND = 4

/** ...and this accuracy, which is comfortably clear of the 25% guessing floor. */
const MIN_ACCURACY_PER_DEMAND = 0.65

/** Latency has to worsen by this much within a session before we call it fatigue. */
const FATIGUE_RATIO = 1.25
const FATIGUE_MIN_MS = 120

/** Eye-to-eye accuracy gap on Accommodative Rock that is worth mentioning. */
const ASYMMETRY_ACCURACY = 0.2
const ASYMMETRY_LATENCY_MS = 250
const ASYMMETRY_MIN_TRIALS = 8

/** "Can't see it" on this share of trials means the exercise was above the user. */
const CANNOT_SEE_HIGH = 0.6

/* ------------------------------------------------------------ trial access */

/**
 * `Trial` is the persisted shape, but procedures push `IntegrityTrial`s through
 * `onTrial`, so the catch/response-kind fields survive into storage. We read them
 * defensively: a trial without them is treated as an ordinary answered trial.
 */
type RecordedTrial = Trial & { isCatch?: boolean; kind?: ResponseKind }

function asIntegrityTrial(t: RecordedTrial): IntegrityTrial {
  return { ...t, isCatch: t.isCatch ?? false, kind: t.kind ?? 'answer' }
}

function trialsOf(result: ProcedureResult): IntegrityTrial[] {
  return (result.trials as RecordedTrial[]).map(asIntegrityTrial)
}

/** Trials the user genuinely attempted: a real target, and a real answer. */
function attemptedOf(trials: IntegrityTrial[]): IntegrityTrial[] {
  return trials.filter((t) => !t.isCatch && t.kind === 'answer')
}

/* -------------------------------------------------------------- primitives */

function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  if (s.length % 2 === 1) return s[mid] ?? null
  const lo = s[mid - 1]
  const hi = s[mid]
  if (lo === undefined || hi === undefined) return null
  return (lo + hi) / 2
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export function formatPercent(fraction: number | null): string {
  if (fraction === null) return '—'
  return `${Math.round(fraction * 100)}%`
}

export function formatMs(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

/* ---------------------------------------------------------- per-procedure */

export interface DemandBucket {
  demand: number
  attempted: number
  correct: number
  accuracy: number
  anticipationRate: number
  /** Enough attempts, well clear of chance, and not answered impossibly fast. */
  trusted: boolean
}

export interface EyeBreakdown {
  eye: EyeSide
  attempted: number
  correct: number
  accuracy: number | null
  medianLatencyMs: number | null
}

export interface ProcedureAnalysis {
  procedure: ProcedureId
  label: string
  unit: DemandUnit
  durationMs: number
  totalTrials: number
  /** Real target, real answer. This is the denominator for accuracy. */
  attempted: number
  correct: number
  accuracy: number | null
  medianLatencyMs: number | null
  firstHalfLatencyMs: number | null
  secondHalfLatencyMs: number | null
  cannotSee: number
  cannotSeeRate: number
  catches: number
  falseAlarmRate: number
  anticipationRate: number
  verdict: IntegrityVerdict
  buckets: DemandBucket[]
  /** THE headline number: hardest level held with responses we can believe. */
  highestTrustedDemand: number | null
  /** What the procedure pushed you to, believable or not. Context, not an achievement. */
  highestAttemptedDemand: number | null
  firstDemand: number | null
  lastDemand: number | null
  perEye: EyeBreakdown[]
  /** Only reported when the responses were trustworthy — speed is easy to fake. */
  clearsPerMinute: number | null
}

export function analyseProcedure(result: ProcedureResult): ProcedureAnalysis {
  const trials = trialsOf(result)
  const attempted = attemptedOf(trials)

  const monitor = new IntegrityMonitor(4)
  for (const t of trials) monitor.push(t)
  const verdict = monitor.verdict()

  const latencies = attempted.map((t) => t.latencyMs)
  const half = Math.floor(attempted.length / 2)

  // Advanced mode lets the user set the demand by hand, and those reps are marked.
  // They are real responses and count everywhere else, but they cannot build a demand
  // bucket: "highest demand sustained" is a claim that the staircase *found* the level,
  // and a level someone dialled in is not evidence of anything.
  const buckets = buildBuckets(attempted.filter((t) => t.manualDemand !== true))
  const trustedBuckets = buckets.filter((b) => b.trusted)

  const perEye = buildPerEye(attempted)

  const minutes = result.durationMs / 60000
  const clearsPerMinute =
    verdict.trustworthy && minutes > 0.25 ? round1(attempted.length / minutes) : null

  const firstTrial = attempted[0]
  const lastTrial = attempted[attempted.length - 1]

  return {
    procedure: result.procedure,
    label: PROCEDURE_LABELS[result.procedure],
    unit: demandUnit(result.procedure),
    durationMs: result.durationMs,
    totalTrials: trials.length,
    attempted: attempted.length,
    correct: attempted.filter((t) => t.correct).length,
    accuracy:
      attempted.length > 0 ? attempted.filter((t) => t.correct).length / attempted.length : null,
    medianLatencyMs: median(latencies),
    firstHalfLatencyMs: median(latencies.slice(0, half)),
    secondHalfLatencyMs: median(latencies.slice(half)),
    cannotSee: trials.filter((t) => t.kind === 'cannotSee').length,
    cannotSeeRate:
      trials.length > 0 ? trials.filter((t) => t.kind === 'cannotSee').length / trials.length : 0,
    catches: trials.filter((t) => t.isCatch).length,
    falseAlarmRate: verdict.falseAlarmRate,
    anticipationRate: verdict.anticipationRate,
    verdict,
    buckets,
    highestTrustedDemand:
      trustedBuckets.length > 0 ? Math.max(...trustedBuckets.map((b) => b.demand)) : null,
    highestAttemptedDemand:
      attempted.length > 0 ? Math.max(...attempted.map((t) => t.demand)) : null,
    firstDemand: firstTrial ? firstTrial.demand : null,
    lastDemand: lastTrial ? lastTrial.demand : null,
    perEye,
    clearsPerMinute,
  }
}

function buildBuckets(attempted: IntegrityTrial[]): DemandBucket[] {
  const byDemand = new Map<number, IntegrityTrial[]>()
  for (const t of attempted) {
    const key = round1(t.demand)
    const list = byDemand.get(key)
    if (list) list.push(t)
    else byDemand.set(key, [t])
  }

  const buckets: DemandBucket[] = []
  for (const [demand, list] of byDemand) {
    const correct = list.filter((t) => t.correct).length
    const accuracy = correct / list.length
    const anticipationRate =
      list.filter((t) => t.latencyMs < MIN_PLAUSIBLE_LATENCY_MS).length / list.length
    buckets.push({
      demand,
      attempted: list.length,
      correct,
      accuracy,
      anticipationRate,
      trusted:
        list.length >= MIN_TRIALS_PER_DEMAND &&
        accuracy >= MIN_ACCURACY_PER_DEMAND &&
        anticipationRate <= 0.2,
    })
  }
  return buckets.sort((a, b) => a.demand - b.demand)
}

function buildPerEye(attempted: IntegrityTrial[]): EyeBreakdown[] {
  const out: EyeBreakdown[] = []
  for (const eye of ['left', 'right'] as const) {
    const list = attempted.filter((t) => t.eye === eye)
    if (list.length === 0) continue
    const correct = list.filter((t) => t.correct).length
    out.push({
      eye,
      attempted: list.length,
      correct,
      accuracy: correct / list.length,
      medianLatencyMs: median(list.map((t) => t.latencyMs)),
    })
  }
  return out
}

/* -------------------------------------------------------------- history */

export interface SessionAnalysis {
  id: string
  startedAt: number
  byProcedure: Map<ProcedureId, ProcedureAnalysis>
}

export function analyseSessionRecord(record: SessionRecord): SessionAnalysis {
  const byProcedure = new Map<ProcedureId, ProcedureAnalysis>()
  for (const result of record.results) byProcedure.set(result.procedure, analyseProcedure(result))
  return { id: record.id, startedAt: record.startedAt, byProcedure }
}

/** Oldest first, so charts read left to right in time order. */
export function analyseHistory(sessions: SessionRecord[]): SessionAnalysis[] {
  return [...sessions].sort((a, b) => a.startedAt - b.startedAt).map(analyseSessionRecord)
}

/* --------------------------------------------------------- session report */

export interface SessionFindings {
  headline: string
  observations: string[]
  cautions: string[]
  nextSession: string[]
}

/**
 * Read one session and say, in plain English, what happened and what to do next.
 *
 * `settings` supplies the prescribed goals, so every number can be stated against
 * what good looks like rather than floating on its own.
 */
export function analyseSession(record: SessionRecord, settings: Settings): SessionFindings {
  const analyses = record.results.map(analyseProcedure)
  const observations: string[] = []
  const cautions: string[] = []
  const nextSession: string[] = []

  if (analyses.length === 0) {
    return {
      headline: 'No procedures completed in this session.',
      observations: [],
      cautions: [],
      nextSession: ['Run a full session when you have about 25 uninterrupted minutes.'],
    }
  }

  const history = previousSessions(record)
  const goalFor = (id: ProcedureId): number | null => {
    if (id === 'convergence' || id === 'jumpDuctions') return settings.prescription.convergenceGoalPd
    if (id === 'divergence') return settings.prescription.divergenceGoalPd
    return null
  }

  /* ---- headline: hardest thing held with responses we can believe ---- */

  const headline = buildHeadline(analyses, settings)

  /* ---- did the demand actually move? ---- */

  for (const a of analyses) {
    if (a.unit === 'none' || a.attempted === 0) continue

    const goal = goalFor(a.procedure)
    const goalText = goal === null ? '' : ` Your prescribed goal is ${formatDemand(goal, a.unit)}.`

    if (a.highestTrustedDemand === null) {
      observations.push(
        `${a.label}: no difficulty level produced enough believable answers to count. ` +
          `That is a signal the starting level is above you today, not a failure.`,
      )
      nextSession.push(
        `Start ${a.label} below ${formatDemand(a.highestAttemptedDemand, a.unit)} and only step up once you are steady.`,
      )
      continue
    }

    const first = a.firstDemand
    const progressed = first !== null && a.highestTrustedDemand > first

    if (progressed) {
      observations.push(
        `${a.label}: demand climbed from ${formatDemand(first, a.unit)} to a believable ` +
          `${formatDemand(a.highestTrustedDemand, a.unit)}.${goalText}`,
      )
    } else {
      observations.push(
        `${a.label}: you held ${formatDemand(a.highestTrustedDemand, a.unit)} but did not move past ` +
          `where you started. Plateaus are normal; several in a row are the thing to watch.${goalText}`,
      )
    }

    if (goal !== null && a.highestTrustedDemand >= goal) {
      observations.push(
        `${a.label} met the prescribed goal of ${formatDemand(goal, a.unit)} with trustworthy answers.`,
      )
    }
  }

  /* ---- latency within the session (fatigue) ---- */

  for (const a of analyses) {
    const early = a.firstHalfLatencyMs
    const late = a.secondHalfLatencyMs
    if (early === null || late === null || a.attempted < 12) continue

    if (late > early * FATIGUE_RATIO && late - early > FATIGUE_MIN_MS) {
      observations.push(
        `${a.label}: keyboard response time slowed from ${formatMs(early)} to ${formatMs(late)} across the block. ` +
          `Slowing late in a block is the usual signature of fatigue.`,
      )
      nextSession.push(
        `Take the full rest before ${a.label} rather than pushing straight through; fatigue showed up in the second half.`,
      )
    } else if (late < early * 0.85 && early - late > FATIGUE_MIN_MS) {
      observations.push(
        `${a.label}: keyboard response time fell through the block (${formatMs(early)} → ${formatMs(late)}), ` +
          `which usually means warm-up rather than a real change in ability.`,
      )
    }
  }

  /* ---- latency across sessions (learning) ---- */

  for (const a of analyses) {
    const now = a.medianLatencyMs
    if (now === null || a.attempted < 10) continue
    const past = recentMedianLatencies(history, a.procedure, 3)
    if (past.length < 2) continue
    const baseline = past.reduce((s, x) => s + x, 0) / past.length

    if (now < baseline * 0.85) {
      observations.push(
        `${a.label}: median keyboard response time is ${formatMs(now)}, down from about ${formatMs(baseline)} ` +
          `over your recent sessions. Answering correctly and sooner at the same demand is a fair sign of progress — ` +
          `bearing in mind this times your fingers, not your eyes.`,
      )
    } else if (now > baseline * 1.2) {
      observations.push(
        `${a.label}: median keyboard response time is ${formatMs(now)}, up from about ${formatMs(baseline)} recently. ` +
          `One tired day is nothing; a run of them is worth noting.`,
      )
    }
  }

  /* ---- integrity flags, phrased as difficulty feedback ---- */

  for (const a of analyses) {
    if (a.attempted === 0 && a.totalTrials === 0) continue

    if (a.verdict.atChance) {
      cautions.push(
        `${a.label}: your answers were not statistically better than guessing ` +
          `(${formatPercent(a.accuracy)} correct, and pure guessing scores ${formatPercent(CHANCE)}). ` +
          `The exercise was harder than what you can currently fuse — the fix is to lower the demand, not to try harder.`,
      )
      nextSession.push(`Drop ${a.label} to an easier level and build back up from there.`)
    }

    if (a.catches > 0 && a.falseAlarmRate > 0.3) {
      cautions.push(
        `${a.label}: on ${formatPercent(a.falseAlarmRate)} of the trials that deliberately contained no target, ` +
          `an answer still came in. That is the normal reflex when the real targets are too faint to see — ` +
          `use "I can't see it" freely; it costs you nothing and it keeps this report honest.`,
      )
    }

    if (a.anticipationRate > 0.2) {
      cautions.push(
        `${a.label}: ${formatPercent(a.anticipationRate)} of answers arrived faster than ` +
          `${MIN_PLAUSIBLE_LATENCY_MS} ms, which is quicker than the eyes can actually fuse a new target. ` +
          `Those trials cannot be scored. Wait for the shape to resolve before answering.`,
      )
      nextSession.push(
        `On ${a.label}, wait until the target actually resolves before pressing — a fast wrong answer trains nothing.`,
      )
    }
  }

  /* ---- eye asymmetry on Accommodative Rock ---- */

  const rock = analyses.find((a) => a.procedure === 'accommodativeRock')
  if (rock) {
    const left = rock.perEye.find((e) => e.eye === 'left')
    const right = rock.perEye.find((e) => e.eye === 'right')
    if (
      left &&
      right &&
      left.attempted >= ASYMMETRY_MIN_TRIALS &&
      right.attempted >= ASYMMETRY_MIN_TRIALS
    ) {
      const la = left.accuracy
      const ra = right.accuracy
      if (la !== null && ra !== null && Math.abs(la - ra) >= ASYMMETRY_ACCURACY) {
        const weaker = la < ra ? 'left' : 'right'
        observations.push(
          `Accommodative Rock is lopsided: ${formatPercent(la)} correct with the left eye versus ` +
            `${formatPercent(ra)} with the right. The ${weaker} eye is doing the harder job of ` +
            `refocusing, and it is the one setting your ceiling.`,
        )
        nextSession.push(
          `Give the ${weaker} eye the easier flipper level on Accommodative Rock until the two sides converge.`,
        )
      }

      const ll = left.medianLatencyMs
      const rl = right.medianLatencyMs
      if (ll !== null && rl !== null && Math.abs(ll - rl) >= ASYMMETRY_LATENCY_MS) {
        const slower = ll > rl ? 'left' : 'right'
        observations.push(
          `The ${slower} eye clears the lens about ${formatMs(Math.abs(ll - rl))} slower than the other ` +
            `(${formatMs(ll)} left vs ${formatMs(rl)} right). A persistent gap here is worth mentioning to your optometrist.`,
        )
      }
    }

    if (rock.verdict.trustworthy && rock.clearsPerMinute !== null) {
      const cpmGoal = settings.prescription.rockCpmGoal
      observations.push(
        `Accommodative Rock ran at ${rock.clearsPerMinute} clears per minute against a goal of ${cpmGoal}. ` +
          `This only counts because the answers passed the integrity checks — speed on its own is meaningless here.`,
      )
    }
  }

  /* ---- red flags ---- */

  addRedFlags(record, analyses, history, cautions, nextSession)

  /* ---- fallbacks so the panel is never empty ---- */

  if (nextSession.length === 0) {
    nextSession.push('Keep the same levels. Nothing in this session says to change anything.')
  }
  nextSession.push(
    'Same time tomorrow beats a longer session on the weekend — this adapts to frequency, not to volume.',
  )

  return {
    headline,
    observations,
    cautions,
    nextSession: dedupe(nextSession),
  }
}

function buildHeadline(analyses: ProcedureAnalysis[], settings: Settings): string {
  const conv = analyses.find((a) => a.procedure === 'convergence')
  const div = analyses.find((a) => a.procedure === 'divergence')

  const parts: string[] = []
  if (conv?.highestTrustedDemand != null) {
    parts.push(
      `${formatDemand(conv.highestTrustedDemand, 'pd')} of convergence ` +
        `(goal ${formatDemand(settings.prescription.convergenceGoalPd, 'pd')})`,
    )
  }
  if (div?.highestTrustedDemand != null) {
    parts.push(
      `${formatDemand(div.highestTrustedDemand, 'pd')} of divergence ` +
        `(goal ${formatDemand(settings.prescription.divergenceGoalPd, 'pd')})`,
    )
  }

  if (parts.length > 0) {
    return `You sustained ${parts.join(' and ')} with responses that passed the honesty checks.`
  }

  const anyTrusted = analyses.some((a) => a.highestTrustedDemand !== null)
  if (anyTrusted) {
    const best = analyses.find((a) => a.highestTrustedDemand !== null)
    if (best) {
      return `${best.label} held at ${formatDemand(best.highestTrustedDemand, best.unit)} with trustworthy responses.`
    }
  }

  return (
    'Nothing in this session produced enough believable responses to score. ' +
    'That means the difficulty was set above where you are today — it is a calibration result, not a bad session.'
  )
}

function addRedFlags(
  record: SessionRecord,
  analyses: ProcedureAnalysis[],
  history: SessionRecord[],
  cautions: string[],
  nextSession: string[],
): void {
  // 1. "Can't see it" on the large majority of trials.
  const totalTrials = analyses.reduce((s, a) => s + a.totalTrials, 0)
  const totalCannotSee = analyses.reduce((s, a) => s + a.cannotSee, 0)
  if (totalTrials >= 10 && totalCannotSee / totalTrials >= CANNOT_SEE_HIGH) {
    cautions.push(
      `You reported "I can't see it" on ${formatPercent(totalCannotSee / totalTrials)} of trials. ` +
        `Answering honestly is exactly right, but at this rate the programme is not delivering any useful practice. ` +
        `Check the room is dim and the glasses are the right way round, and if the next session looks the same, ` +
        `book time with your optometrist rather than grinding at it.`,
    )
    nextSession.push('Re-run calibration before the next session, then start at the lowest demand.')
  }

  // 2. Going backwards over several sessions.
  const recent = [...history, record].sort((a, b) => a.startedAt - b.startedAt).slice(-4)
  if (recent.length >= 3) {
    for (const id of ['convergence', 'divergence'] as const) {
      const series: number[] = []
      for (const s of recent) {
        const result = s.results.find((r) => r.procedure === id)
        if (!result) continue
        const value = analyseProcedure(result).highestTrustedDemand
        if (value === null) continue
        series.push(value)
      }
      if (series.length < 3) continue

      const firstValue = series[0]
      const lastValue = series[series.length - 1]
      if (firstValue === undefined || lastValue === undefined || firstValue <= 0) continue

      const declining = series.every((v, i) => i === 0 || v <= (series[i - 1] ?? v))
      const drop = (firstValue - lastValue) / firstValue
      if (declining && drop >= 0.15) {
        cautions.push(
          `${PROCEDURE_LABELS[id]} has gone backwards across your last ${series.length} sessions ` +
            `(${formatDemand(firstValue, 'pd')} → ${formatDemand(lastValue, 'pd')}). ` +
            `Sustained regression is not something more practice fixes — see your optometrist ` +
            `before continuing to push this procedure.`,
        )
      }
    }
  }
}

function previousSessions(record: SessionRecord): SessionRecord[] {
  return loadSessions()
    .filter((s) => s.id !== record.id && s.startedAt < record.startedAt)
    .sort((a, b) => a.startedAt - b.startedAt)
}

function recentMedianLatencies(
  history: SessionRecord[],
  id: ProcedureId,
  count: number,
): number[] {
  const out: number[] = []
  for (const s of history.slice(-count)) {
    const result = s.results.find((r) => r.procedure === id)
    if (!result) continue
    const value = analyseProcedure(result).medianLatencyMs
    if (value !== null) out.push(value)
  }
  return out
}

function dedupe(xs: string[]): string[] {
  return [...new Set(xs)]
}
