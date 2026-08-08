/**
 * Results: what the last session meant, and what several sessions mean together.
 *
 * All of the reading is done by src/ui/analysis.ts — this screen only lays it out.
 * The rules it has to hold on to (docs/FAILURE-MODES.md section 3):
 *
 *  - the headline is *highest demand sustained with trustworthy responses*, which
 *    is the one number fast guessing cannot inflate. No score, no personal best,
 *    no leaderboard;
 *  - latency is called keyboard response time, because a browser cannot see eyes;
 *  - one session is never a trend;
 *  - sessions recorded under different calibration are not plotted together;
 *  - red-flag symptoms mean stop and book an eye exam, never "lower the level".
 */

import { el } from '../router'
import type { Screen } from '../router'
import { loadSessions, loadSettings } from '../../core/settings'
import { RED_FLAG_SYMPTOMS, redFlagAdvice } from '../../core/safety'
import type { RedFlagId } from '../../core/safety'
import {
  PROCEDURE_LABELS,
  analyseHistory,
  analyseSession,
  analyseSessionRecord,
  formatDemand,
  formatMs,
  formatPercent,
} from '../analysis'
import type { ProcedureAnalysis, SessionAnalysis } from '../analysis'
import { requestCoaching } from '../coach'
import type {
  Calibration,
  EyeSide,
  Prescription,
  ProcedureId,
  SessionRecord,
  Settings,
} from '../../core/types'
import '../screens.css'

/* ------------------------------------------------------ calibration stamps */

const STAMP_KEY = 'iris.calibration-stamps.v1'
const SYMPTOM_KEY = 'iris.symptoms.v1'

interface CalibrationStamp {
  pxPerCm: number
  viewingDistanceCm: number
  redEye: EyeSide
}

function loadStamps(): Record<string, CalibrationStamp> {
  const raw = localStorage.getItem(STAMP_KEY)
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, CalibrationStamp>
  } catch {
    return {}
  }
}

/**
 * Record the calibration a session actually ran under. Without this, a slider
 * nudge during recalibration silently rescales every historical number and the
 * charts quietly compare two different units.
 */
/**
 * Catch trials are currently switched off (`CATCH_TRIAL_RATE` is 0), so this only
 * mentions them when a session actually contains some — an old session, or a future
 * one if they are turned back on. Reporting "0 blank catch trials" would describe a
 * mechanism the user has never encountered.
 */
function catchNote(a: ProcedureAnalysis): string {
  const base = `of ${a.totalTrials} presented. ${a.cannotSee} answered "I can’t see it"`
  return a.catches > 0 ? `${base}, ${a.catches} were blank catch trials.` : `${base}.`
}

export function stampSessionCalibration(sessionId: string, cal: Calibration): void {
  const all = loadStamps()
  all[sessionId] = {
    pxPerCm: cal.pxPerCm,
    viewingDistanceCm: cal.viewingDistanceCm,
    redEye: cal.redEye,
  }
  localStorage.setItem(STAMP_KEY, JSON.stringify(all))
}

function calibrationKey(stamp: CalibrationStamp | undefined): string {
  if (!stamp) return 'unstamped'
  return `${round1(stamp.pxPerCm)}|${round1(stamp.viewingDistanceCm)}|${stamp.redEye}`
}

function describeStamp(stamp: CalibrationStamp | undefined): string {
  if (!stamp) return 'calibration not recorded'
  return `${round1(stamp.pxPerCm)} px/cm at ${round1(stamp.viewingDistanceCm)} cm, red lens over the ${stamp.redEye} eye`
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/* -------------------------------------------------------- symptom storage */

function loadSymptoms(): Record<string, RedFlagId[]> {
  const raw = localStorage.getItem(SYMPTOM_KEY)
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, RedFlagId[]>
  } catch {
    return {}
  }
}

function saveSymptoms(sessionId: string, flags: RedFlagId[]): void {
  const all = loadSymptoms()
  all[sessionId] = flags
  localStorage.setItem(SYMPTOM_KEY, JSON.stringify(all))
}

/* ------------------------------------------------------------------ charts */

const SVG_NS = 'http://www.w3.org/2000/svg'

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag)
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value))
  return node
}

interface ChartSeries {
  label: string
  colour: string
  points: { x: number; y: number }[]
}

interface ChartOptions {
  xCount: number
  xLabels: { first: string; last: string } | null
  format: (value: number) => string
  floorZero: boolean
}

/** Deliberately plain: axes, a line, and dots. No library, no animation, no gloss. */
function lineChart(series: ChartSeries[], opts: ChartOptions): SVGSVGElement {
  const width = 720
  const height = 220
  const padLeft = 62
  const padRight = 16
  const padTop = 14
  const padBottom = 30

  const svg = svgEl('svg', {
    class: 'chart',
    viewBox: `0 0 ${width} ${height}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'img',
  })

  const values = series.flatMap((s) => s.points.map((p) => p.y))
  if (values.length === 0) {
    const empty = svgEl('text', {
      x: width / 2,
      y: height / 2,
      'text-anchor': 'middle',
      fill: 'var(--text-dim)',
      'font-size': 13,
    })
    empty.textContent = 'Nothing to plot yet.'
    svg.append(empty)
    return svg
  }

  let yMax = Math.max(...values)
  let yMin = opts.floorZero ? 0 : Math.min(...values)
  if (yMax === yMin) yMax = yMin + 1
  const span = yMax - yMin
  yMax += span * 0.1
  if (!opts.floorZero) yMin = Math.max(0, yMin - span * 0.1)

  const plotW = width - padLeft - padRight
  const plotH = height - padTop - padBottom
  const xFor = (x: number): number =>
    opts.xCount <= 1 ? padLeft + plotW / 2 : padLeft + (x / (opts.xCount - 1)) * plotW
  const yFor = (y: number): number => padTop + (1 - (y - yMin) / (yMax - yMin)) * plotH

  // Horizontal reference lines with their values, so no number floats unlabelled.
  for (const fraction of [0, 0.5, 1]) {
    const value = yMin + (yMax - yMin) * fraction
    const y = yFor(value)
    svg.append(
      svgEl('line', {
        x1: padLeft,
        x2: width - padRight,
        y1: y,
        y2: y,
        stroke: 'var(--border)',
        'stroke-width': 1,
      }),
    )
    const text = svgEl('text', {
      x: padLeft - 8,
      y: y + 4,
      'text-anchor': 'end',
      fill: 'var(--text-dim)',
      'font-size': 11,
    })
    text.textContent = opts.format(value)
    svg.append(text)
  }

  for (const s of series) {
    if (s.points.length > 1) {
      svg.append(
        svgEl('polyline', {
          points: s.points.map((p) => `${xFor(p.x)},${yFor(p.y)}`).join(' '),
          fill: 'none',
          stroke: s.colour,
          'stroke-width': 2,
          'stroke-linejoin': 'round',
        }),
      )
    }
    for (const p of s.points) {
      svg.append(svgEl('circle', { cx: xFor(p.x), cy: yFor(p.y), r: 3.5, fill: s.colour }))
    }
  }

  if (opts.xLabels) {
    const first = svgEl('text', {
      x: padLeft,
      y: height - 8,
      fill: 'var(--text-dim)',
      'font-size': 11,
    })
    first.textContent = opts.xLabels.first
    const last = svgEl('text', {
      x: width - padRight,
      y: height - 8,
      'text-anchor': 'end',
      fill: 'var(--text-dim)',
      'font-size': 11,
    })
    last.textContent = opts.xLabels.last
    svg.append(first, last)
  }

  return svg
}

function legend(series: ChartSeries[]): HTMLElement {
  const box = el('div', { class: 'legend' })
  for (const s of series) {
    const key = el('span', { class: 'key' })
    key.style.background = s.colour
    box.append(el('span', {}, key, s.label))
  }
  return box
}

/* -------------------------------------------------------------- the screen */

const SERIES_COLOURS: Record<string, string> = {
  convergence: '#4c9aff',
  divergence: '#3fb950',
  jumpDuctions: '#d29922',
  accommodativeRock: '#c98bdb',
}

function goalFor(id: ProcedureId, p: Prescription): number | null {
  if (id === 'convergence' || id === 'jumpDuctions') return p.convergenceGoalPd
  if (id === 'divergence') return p.divergenceGoalPd
  return null
}

export const resultsScreen: Screen = (root, nav) => {
  const settings: Settings = loadSettings()
  const sessions: SessionRecord[] = loadSessions()

  const screen = el('div', { class: 'screen' })
  root.append(screen)

  const latest: SessionRecord | undefined = [...sessions].sort(
    (a, b) => b.startedAt - a.startedAt,
  )[0]

  const checkedFlags = new Set<RedFlagId>(latest ? (loadSymptoms()[latest.id] ?? []) : [])
  let symptomsSubmitted = latest ? loadSymptoms()[latest.id] !== undefined : false
  let coachText: string | null = null
  let coachError: string | null = null
  let coachPending = false

  /* ---------------------------------------------------------- fixed copy */

  function header(): HTMLElement {
    const home = el('button', {}, 'Home')
    home.addEventListener('click', () => nav.go('home'))
    const settingsButton = el('button', {}, 'Settings')
    settingsButton.addEventListener('click', () => nav.go('settings'))
    return el(
      'div',
      { class: 'head' },
      el('h1', {}, 'Results'),
      el('div', { class: 'actions' }, home, settingsButton),
    )
  }

  function preamble(): HTMLElement {
    return el(
      'div',
      { class: 'notice' },
      el(
        'p',
        {},
        'This is practice software, not a diagnosis. It records which exercise you did and how you ' +
          'answered; it cannot measure your eyes. Near point of convergence, fusional ranges, and symptom ' +
          'scores all need a real eye exam.',
      ),
      el(
        'p',
        { class: 'muted' },
        'Terms used below. Vergence: the two eyes turning in opposite directions — inward is convergence, ' +
          'outward is divergence. Prism dioptre (Δ): the unit of that turn. Accommodative facility: how ' +
          'fast each eye can change focus. Suppression: the brain switching one eye off, which feels like ' +
          'clear single vision but is the opposite of what you are training. Keyboard response time: how ' +
          'long you took to press a key — your fingers, not your eyes, and only ever compared with yourself.',
      ),
    )
  }

  /* ------------------------------------------------------- session review */

  function findingsCard(record: SessionRecord): HTMLElement {
    const findings = analyseSession(record, settings)
    const card = el('div', { class: 'card' })
    card.append(
      el('h2', {}, `Last session — ${new Date(record.startedAt).toLocaleString()}`),
      el('p', { class: 'headline' }, findings.headline),
    )

    if (findings.observations.length > 0) {
      card.append(el('h3', {}, 'What happened'), list(findings.observations))
    }

    // Red flags override every tuning suggestion. "Stop and book an eye exam" is
    // never paired with "and meanwhile drop a level and carry on".
    const redFlagged = symptomsSubmitted && checkedFlags.size > 0
    if (redFlagged) {
      card.append(
        el('h3', {}, 'What to do next'),
        el(
          'p',
          { class: 'bad' },
          'Difficulty advice for this session is withheld: you reported a symptom below that means stop, ' +
            'not adjust. See the symptom panel.',
        ),
      )
      return card
    }

    if (findings.cautions.length > 0) {
      card.append(el('h3', {}, 'Worth reading twice'), list(findings.cautions))
    }
    card.append(el('h3', {}, 'Next session'), list(findings.nextSession))
    return card
  }

  function list(items: string[]): HTMLElement {
    const ul = el('ul', { class: 'finding-list' })
    for (const item of items) ul.append(el('li', {}, item))
    return ul
  }

  function statBox(value: string, label: string, sub: string): HTMLElement {
    return el(
      'div',
      { class: 'stat' },
      el('div', { class: 'stat-value' }, value),
      el('div', { class: 'stat-label' }, label),
      el('div', { class: 'stat-sub' }, sub),
    )
  }

  function procedureCard(a: ProcedureAnalysis): HTMLElement {
    const card = el('div', { class: 'card' })
    card.append(el('h2', {}, a.label))

    const goal = goalFor(a.procedure, settings.prescription)
    const grid = el('div', { class: 'stat-grid' })

    if (a.unit === 'none') {
      grid.append(
        statBox(
          `${a.attempted}`,
          'valid trials',
          `of ${a.totalTrials} presented. Answers faster than a real response could arrive don’t count.`,
        ),
      )
    } else {
      grid.append(
        statBox(
          formatDemand(a.highestTrustedDemand, a.unit),
          'highest demand sustained',
          a.highestTrustedDemand === null
            ? 'No level produced enough believable answers today. That is a reading on difficulty, not on you.'
            : `Held with responses that passed the honesty checks${goal === null ? '' : `; prescribed goal ${formatDemand(goal, a.unit)}`}. ` +
                'This is the number to watch — guessing cannot inflate it.',
        ),
        statBox(
          `${a.attempted}`,
          'valid trials',
          catchNote(a),
        ),
      )
    }

    grid.append(
      statBox(
        formatPercent(a.accuracy),
        'accuracy on attempted trials',
        'Guessing on a four-way choice scores 25%. Under about 65% means the level was above you, which is information, not failure.',
      ),
      statBox(
        formatMs(a.medianLatencyMs),
        'median keyboard response time',
        'Time from the target appearing to your keypress. It measures your fingers as much as your eyes — useful only against your own past sessions.',
      ),
    )

    // Rate is only a prescribed metric for Accommodative Rock. Reporting a
    // per-minute figure elsewhere would invite exactly the speed-chasing the
    // integrity checks exist to defeat.
    if (a.procedure === 'accommodativeRock' && a.clearsPerMinute !== null) {
      grid.append(
        statBox(
          `${a.clearsPerMinute}`,
          'clears per minute',
          `Goal ${settings.prescription.rockCpmGoal}. Only shown because the responses passed the integrity checks — speed on its own means nothing here.`,
        ),
      )
    }

    card.append(grid)

    if (a.highestAttemptedDemand !== null && a.unit !== 'none') {
      card.append(
        el(
          'p',
          { class: 'gloss' },
          `The procedure pushed you as far as ${formatDemand(a.highestAttemptedDemand, a.unit)}. That is ` +
            'context for how the session felt, not an achievement — reaching a level is not the same as holding it.',
        ),
      )
    }

    /* integrity flags */
    if (a.verdict.notes.length > 0) {
      card.append(el('h3', {}, 'Response pattern'))
      for (const note of a.verdict.notes) {
        card.append(el('div', { class: 'notice is-warn' }, el('p', {}, note)))
      }
      card.append(
        el(
          'p',
          { class: 'gloss' },
          `Because of this, ${a.label} starts easier next time. This is the app lowering the difficulty, ` +
            'not an accusation: answering at chance is what happens when a target genuinely cannot be fused, ' +
            'and the only useful response is less demand.',
        ),
      )
    } else if (a.attempted > 0) {
      card.append(
        el(
          'p',
          { class: 'gloss good' },
          'Response pattern looks clean: better than chance, few blank-trial answers, and nothing answered ' +
            'faster than a real response could arrive.',
        ),
      )
    }

    /* per-eye breakdown */
    if (a.perEye.length === 2) {
      const rows = el('div', {})
      for (const eye of a.perEye) {
        rows.append(
          el(
            'div',
            { class: 'eye-row' },
            el('div', { class: 'who' }, `${eye.eye} eye`),
            el('div', {}, `${formatPercent(eye.accuracy)} correct`),
            el('div', {}, `${formatMs(eye.medianLatencyMs)} median`),
            el('div', {}, `${eye.attempted} trials`),
          ),
        )
      }
      card.append(el('h3', {}, 'Per eye'), rows)
      card.append(
        el(
          'p',
          { class: 'gloss' },
          'A gap of more than about 20 percentage points that persists across sessions can mean that eye is ' +
            'being suppressed — the brain quietly ignoring it. Worth mentioning at your next eye exam; it is ' +
            'not something to train harder through.',
        ),
      )
    }

    return card
  }

  /* -------------------------------------------------------- symptom check */

  function symptomCard(record: SessionRecord): HTMLElement {
    const card = el('div', { class: 'card' })
    card.append(
      el('h2', {}, 'How do you feel now?'),
      el(
        'p',
        {},
        'Vision therapy asks for effort, and mild tiredness around the eyes is ordinary. These four are not. ' +
          'Tick anything you had during or after this session.',
      ),
    )

    const ul = el('ul', { class: 'checklist' })
    for (const symptom of RED_FLAG_SYMPTOMS) {
      const box = el('input', { type: 'checkbox', checked: checkedFlags.has(symptom.id) })
      box.addEventListener('change', () => {
        if (box.checked) checkedFlags.add(symptom.id)
        else checkedFlags.delete(symptom.id)
      })
      ul.append(
        el(
          'li',
          { class: 'check-item' },
          box,
          el('div', { class: 'body' }, el('div', { class: 'title' }, symptom.label)),
        ),
      )
    }
    card.append(ul)

    const submit = el('button', { class: 'primary' }, 'Record how it went')
    submit.addEventListener('click', () => {
      saveSymptoms(record.id, [...checkedFlags])
      symptomsSubmitted = true
      render()
    })
    card.append(el('div', { class: 'actions' }, submit))

    if (symptomsSubmitted) {
      const advice = redFlagAdvice([...checkedFlags])
      if (advice) {
        card.append(
          el(
            'div',
            { class: 'notice is-bad' },
            el('p', { class: 'headline bad' }, advice),
            el(
              'p',
              {},
              'That is the whole recommendation. There is no level to lower and no easier variant to try ' +
                'instead: this app does not know why those symptoms are happening, and neither guessing nor ' +
                'pushing on is safe. Stop running sessions until someone has looked at your eyes.',
            ),
          ),
        )
      } else {
        card.append(
          el(
            'div',
            { class: 'notice is-good' },
            el('p', {}, 'Nothing reported. Recorded against this session.'),
          ),
        )
      }
    }

    return card
  }

  /* ---------------------------------------------------------- AI coaching */

  function coachCard(record: SessionRecord, analyses: ProcedureAnalysis[]): HTMLElement {
    const card = el('div', { class: 'card' })
    card.append(
      el('h2', {}, 'Optional: have the findings narrated'),
      el(
        'p',
        {},
        'This sends the summary above — session findings and per-procedure numbers, nothing else — to an ' +
          'external language model API through the local dev server, and shows what it says. It never runs ' +
          'on its own, and nothing above depends on it. The deterministic findings are the source of truth; ' +
          'this only rephrases them.',
      ),
    )

    const ask = el('button', {}, coachPending ? 'Asking…' : 'Send this session and ask for a narration')
    ask.disabled = coachPending
    ask.addEventListener('click', () => {
      coachPending = true
      coachError = null
      coachText = null
      render()
      void requestCoaching({
        findings: analyseSession(record, settings),
        goals: settings.prescription,
        procedures: analyses.map((a) => ({
          procedure: a.procedure,
          unit: a.unit,
          attempted: a.attempted,
          accuracy: a.accuracy,
          medianLatencyMs: a.medianLatencyMs,
          highestTrustedDemand: a.highestTrustedDemand,
          highestAttemptedDemand: a.highestAttemptedDemand,
          cannotSeeRate: a.cannotSeeRate,
          falseAlarmRate: a.falseAlarmRate,
          anticipationRate: a.anticipationRate,
          trustworthy: a.verdict.trustworthy,
        })),
      }).then((result) => {
        coachPending = false
        coachText = result.text
        coachError = result.error
        render()
      })
    })
    card.append(el('div', { class: 'actions' }, ask))

    if (coachError) {
      card.append(
        el(
          'div',
          { class: 'notice is-warn' },
          el('p', {}, coachError),
          el(
            'p',
            { class: 'muted' },
            'Nothing above depends on this — most often it just means no API key is configured for the ' +
              'local dev server.',
          ),
        ),
      )
    }
    if (coachText) {
      card.append(el('p', { class: 'coach-text' }, coachText))
    }
    return card
  }

  /* -------------------------------------------------------------- history */

  function historySection(): HTMLElement[] {
    const stamps = loadStamps()
    const history: SessionAnalysis[] = analyseHistory(sessions)
    const newest = history[history.length - 1]
    const cards: HTMLElement[] = []

    if (!newest) return cards

    const currentKey = calibrationKey(stamps[newest.id])
    const comparable = history.filter((h) => calibrationKey(stamps[h.id]) === currentKey)
    const excluded = history.length - comparable.length

    const card = el('div', { class: 'card' })
    card.append(
      el('h2', {}, 'Over time'),
      el(
        'p',
        {},
        `Sessions recorded under the calibration in force now (${describeStamp(stamps[newest.id])}). ` +
          'A single session is never a trend — day-to-day variation in this kind of task is large, so read ' +
          'the band these points sit in rather than the last point.',
      ),
    )

    if (comparable.length < 2) {
      card.append(
        el(
          'p',
          { class: 'gloss' },
          'Charts appear once there are at least two sessions on the same calibration. One point is a dot, ' +
            'not a direction.',
        ),
      )
      cards.push(card)
      if (excluded > 0) cards.push(comparabilityNotice(excluded))
      return cards
    }

    const xLabels = {
      first: new Date(comparable[0]?.startedAt ?? 0).toLocaleDateString(),
      last: new Date(comparable[comparable.length - 1]?.startedAt ?? 0).toLocaleDateString(),
    }

    /* chart 1: the headline metric */
    const demandSeries = buildSeries(comparable, ['convergence', 'divergence', 'jumpDuctions'], (a) =>
      a.unit === 'pd' ? a.highestTrustedDemand : null,
    )
    if (demandSeries.length > 0) {
      card.append(
        el('h3', {}, 'Highest demand sustained with trustworthy responses (Δ)'),
        legend(demandSeries),
        lineChart(demandSeries, {
          xCount: comparable.length,
          xLabels,
          format: (v) => `${round1(v)} Δ`,
          floorZero: true,
        }),
        el(
          'p',
          { class: 'gloss' },
          `Goals: ${settings.prescription.convergenceGoalPd} Δ convergence, ` +
            `${settings.prescription.divergenceGoalPd} Δ divergence. Progress here is measured in weeks. ` +
            'Sessions where nothing was believable enough to score simply have no point on the line.',
        ),
        spreadNote(comparable),
      )
    }

    /* chart 2: keyboard response time */
    const latencySeries = buildSeries(
      comparable,
      ['convergence', 'divergence', 'accommodativeRock'],
      (a) => a.medianLatencyMs,
    )
    if (latencySeries.length > 0) {
      card.append(
        el('h3', {}, 'Median keyboard response time'),
        legend(latencySeries),
        lineChart(latencySeries, {
          xCount: comparable.length,
          xLabels,
          format: (v) => formatMs(v),
          floorZero: true,
        }),
        el(
          'p',
          { class: 'gloss' },
          'This is how long you took to press a key. It is a noisy proxy: a browser cannot measure eye ' +
            'position or vergence speed, and anything claiming to would be inventing precision. Read it only ' +
            'alongside the demand chart — getting faster at an easier level is not progress.',
        ),
      )
    }

    if (comparable.length < 3) {
      card.append(
        el(
          'p',
          { class: 'gloss warn' },
          `${comparable.length} sessions is not enough to call anything a trend. Give it a couple of weeks ` +
            'of daily sessions before reading a direction into these lines.',
        ),
      )
    }

    cards.push(card)
    if (excluded > 0) cards.push(comparabilityNotice(excluded))

    const currentSettingsKey = calibrationKey({
      pxPerCm: settings.calibration.pxPerCm,
      viewingDistanceCm: settings.calibration.viewingDistanceCm,
      redEye: settings.calibration.redEye,
    })
    if (currentSettingsKey !== currentKey) {
      cards.push(
        el(
          'div',
          { class: 'notice is-warn' },
          el(
            'p',
            {},
            'You have recalibrated since your last session, so your next session starts a new comparable ' +
              'group and will not appear on the charts above. That is deliberate: the same Δ measured under ' +
              'two calibrations is two different physical demands.',
          ),
        ),
      )
    }

    return cards
  }

  function comparabilityNotice(excluded: number): HTMLElement {
    return el(
      'div',
      { class: 'notice is-warn' },
      el(
        'p',
        {},
        `${excluded} earlier session${excluded === 1 ? '' : 's'} ran under a different calibration and ` +
          `${excluded === 1 ? 'is' : 'are'} not plotted. Screen scale and viewing distance both scale every ` +
          'demand value, so putting them on one axis would compare two different units and show a change ' +
          'that never happened.',
      ),
    )
  }

  function buildSeries(
    comparable: SessionAnalysis[],
    ids: ProcedureId[],
    pick: (a: ProcedureAnalysis) => number | null,
  ): ChartSeries[] {
    const out: ChartSeries[] = []
    for (const id of ids) {
      const points: { x: number; y: number }[] = []
      comparable.forEach((session, index) => {
        const analysis = session.byProcedure.get(id)
        if (!analysis) return
        const value = pick(analysis)
        if (value === null) return
        points.push({ x: index, y: value })
      })
      if (points.length === 0) continue
      out.push({
        label: PROCEDURE_LABELS[id],
        colour: SERIES_COLOURS[id] ?? 'var(--accent)',
        points,
      })
    }
    return out
  }

  /** 3.1: show the spread, so a normal wobble is not read as progress or regression. */
  function spreadNote(comparable: SessionAnalysis[]): HTMLElement {
    const recent = comparable.slice(-5)
    const parts: string[] = []
    for (const id of ['convergence', 'divergence'] as const) {
      const values: number[] = []
      for (const session of recent) {
        const value = session.byProcedure.get(id)?.highestTrustedDemand
        if (value === null || value === undefined) continue
        values.push(value)
      }
      if (values.length < 2) continue
      parts.push(
        `${PROCEDURE_LABELS[id]} sat between ${round1(Math.min(...values))} Δ and ` +
          `${round1(Math.max(...values))} Δ across your last ${values.length} scored sessions`,
      )
    }
    if (parts.length === 0) {
      return el(
        'p',
        { class: 'gloss' },
        'Not enough scored sessions yet to say what your normal day-to-day spread looks like.',
      )
    }
    return el(
      'p',
      { class: 'gloss' },
      `${parts.join('; ')}. Anything inside that band is noise, not news.`,
    )
  }

  /* --------------------------------------------------------------- render */

  function render(): void {
    const children: HTMLElement[] = [header(), preamble()]

    if (!latest) {
      const start = el('button', { class: 'primary' }, 'Go to the home screen')
      start.addEventListener('click', () => nav.go('home'))
      children.push(
        el(
          'div',
          { class: 'card' },
          el('h2', {}, 'No sessions recorded yet'),
          el(
            'p',
            {},
            'Once you have run a session this screen shows what happened in it, and — after a few more — ' +
              'how the picture is moving. Nothing here is a score.',
          ),
          el('div', { class: 'actions' }, start),
        ),
      )
      screen.replaceChildren(...children)
      return
    }

    const analysis = analyseSessionRecord(latest)
    const analyses = [...analysis.byProcedure.values()]

    children.push(findingsCard(latest))
    for (const a of analyses) children.push(procedureCard(a))
    children.push(symptomCard(latest))
    children.push(coachCard(latest, analyses))
    children.push(...historySection())

    screen.replaceChildren(...children)
  }

  render()
}
