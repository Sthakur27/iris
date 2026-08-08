import type { EyeSide } from '../core/types'
import type { Procedure, ProcedureContext } from './base'
import type { IntegrityTrial, ResponseKind } from '../core/integrity'
import { FatigueMonitor } from './base'
import { CATCH_TRIAL_RATE, IntegrityMonitor, MIN_PLAUSIBLE_LATENCY_MS } from '../core/integrity'
import { drawLandoltC } from '../core/anaglyph'
import { el } from '../ui/router'

/**
 * Accommodative Rock — HTS's monocular accommodative facility drill, rebuilt.
 *
 * The user wears red/blue glasses *and* holds a monocular flipper. A row of red
 * Landolt Cs reaches only the eye behind the red filter; a row of blue Cs reaches
 * only the other eye. Because the flipper puts a different lens power in front of
 * each eye, alternating the row colour makes each eye rock through a different
 * accommodative demand on alternate half-cycles. One cycle = one red row plus one
 * blue row, which is exactly what HTS counts for its cycles-per-minute goal.
 *
 * What HTS gets right: the colour/flipper construction, and the row of four.
 * What it gets wrong, and this file fixes:
 *
 *  - The flip itself is the exercise, and HTS makes it easy to miss. Here every
 *    colour change is a full-screen cue with a mandatory beat before the first C,
 *    so an answer cannot arrive from a row the user never re-focused for.
 *  - HTS's own manual warns the flipper must be held with the number toward the
 *    patient. Held backwards, the entire session trains the wrong power and
 *    nothing in the software notices. So the level and its orientation are on
 *    screen the whole time.
 *  - Four-alternative forced choice floors at 25%, so HTS's 80% gate is really a
 *    73% gate a guesser can grind. Here there is an honest "too blurred" key,
 *    catch trials with an unresolvable gap, and rejection of anticipations.
 *  - The clinically meaningful number is the *clearing time*: how long that eye
 *    took to refocus through the new lens, i.e. the latency of the FIRST C after
 *    each colour change. Cs two through four are reading speed. HTS records
 *    neither separately; we tag the first-of-row trials so they can be pulled out.
 *  - Suppression — the brain switching one eye off — produces a single clear image
 *    and a user who feels successful while one eye does nothing. It is the most
 *    important silent failure here, so monocular probes run throughout.
 */

type Direction = 'up' | 'down' | 'left' | 'right'

const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'] as const

/** The `--anaglyph-red` / `--anaglyph-blue` values, needed here as canvas colours. */
const RED = '#ff2b2b'
const BLUE = '#2b6bff'

type RowColour = 'red' | 'blue'

const ROW_LENGTH = 4

/** A rep that gets no response at all is scored as "couldn't read it", never as wrong. */
const RESPONSE_TIMEOUT_MS = 12_000

/**
 * The mandatory beat between the FLIP cue and the first C of the new row. Long
 * enough that the hand has to have moved: if the row appeared instantly the user
 * could answer from the previous row's lens and still produce clean-looking data.
 */
const FLIP_CUE_MS = 1300
const LEVEL_CHANGE_CUE_MS = 3000

/** Roughly every ten answered reps, one monocular suppression probe. */
const PROBE_EVERY_TRIALS = 10

/** Consecutive probe misses on one eye before we say the word "suppression". */
const SUPPRESSION_ALARM_MISSES = 3

interface Response {
  kind: ResponseKind
  direction: Direction | null
  latencyMs: number
}

/**
 * The persisted trial, widened. `Trial` itself is fixed by the core contract, but
 * extra fields survive `onTrial` into storage (the analysis layer already reads
 * `isCatch`/`kind` back off stored trials defensively), so this is how clearing
 * time stays distinguishable from ordinary reading speed after the fact.
 */
interface RockTrial extends IntegrityTrial {
  /** True for the first C after a colour change: this latency is the clearing time. */
  isClearing: boolean
  rowIndex: number
  positionInRow: number
  rowColour: RowColour
  /** Dioptric power in front of the eye that was being trained on this rep. */
  flipperD: number
}

interface RowSpec {
  colour: RowColour
  eye: EyeSide
  directions: Direction[]
  catches: boolean[]
  /** Rotation of each unresolvable catch ring, so the hairline gap is not always right. */
  catchRotations: number[]
}

interface RowLayout {
  size: number
  step: number
  margin: number
  width: number
  height: number
}

/** Resolves after the browser has actually painted, so latency starts at stimulus onset. */
function afterPaint(signal: AbortSignal): Promise<number> {
  return new Promise((resolve) => {
    let raf = 0
    const onAbort = (): void => {
      cancelAnimationFrame(raf)
      resolve(performance.now())
    }
    signal.addEventListener('abort', onAbort, { once: true })
    const done = (t: number): void => {
      signal.removeEventListener('abort', onAbort)
      resolve(t)
    }
    // First frame schedules the paint of what we just drew; the second fires after it.
    raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(done)
    })
  })
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    function finish(): void {
      window.clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    const timer = window.setTimeout(finish, ms)
    signal.addEventListener('abort', finish, { once: true })
  })
}

/** A short pause that survives abort — used only for the closing summary. */
function linger(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function waitForResponse(
  onset: number,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<Response | null> {
  return new Promise((resolve) => {
    const finish = (r: Response | null): void => {
      window.removeEventListener('keydown', onKey)
      signal.removeEventListener('abort', onAbort)
      window.clearTimeout(timer)
      resolve(r)
    }

    const onKey = (e: KeyboardEvent): void => {
      if (e.repeat) return
      const latencyMs = performance.now() - onset

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault()
        finish({ kind: 'cannotSee', direction: null, latencyMs })
        return
      }

      const direction: Direction | null =
        e.key === 'ArrowUp'
          ? 'up'
          : e.key === 'ArrowDown'
            ? 'down'
            : e.key === 'ArrowLeft'
              ? 'left'
              : e.key === 'ArrowRight'
                ? 'right'
                : null

      if (!direction) return
      e.preventDefault()
      finish({ kind: 'answer', direction, latencyMs })
    }

    const onAbort = (): void => finish(null)

    // Blur that never clears is honest data, not a failure: record it as "can't read it".
    const timer = window.setTimeout(
      () => finish({ kind: 'cannotSee', direction: null, latencyMs: timeoutMs }),
      timeoutMs,
    )

    window.addEventListener('keydown', onKey)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/** Non-verbal, non-scoring feedback: a short tone. */
class Feedback {
  private audio: AudioContext | null = null

  private ctxOrNull(): AudioContext | null {
    if (this.audio) return this.audio
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    this.audio = new Ctor()
    return this.audio
  }

  tone(kind: 'correct' | 'incorrect' | 'neutral' | 'flip'): void {
    const audio = this.ctxOrNull()
    if (!audio) return
    const now = audio.currentTime
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    const freq = kind === 'correct' ? 660 : kind === 'incorrect' ? 220 : kind === 'flip' ? 520 : 440
    const dur = kind === 'incorrect' ? 0.14 : kind === 'flip' ? 0.18 : 0.08
    const peak = kind === 'neutral' ? 0.04 : 0.08

    osc.type = 'sine'
    osc.frequency.value = freq
    // Ramped envelope: a raw start/stop clicks, and a click is a startle stimulus.
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur)
    osc.connect(gain).connect(audio.destination)
    osc.start(now)
    osc.stop(now + dur + 0.02)
  }

  close(): void {
    void this.audio?.close()
    this.audio = null
  }
}

/**
 * A short particle flourish on a correct answer. Purely affective — it carries no
 * count and no streak, because a number to beat is what turns this into a guessing
 * game. Every node and timer is tracked so teardown leaves nothing behind.
 */
class Sparkles {
  private readonly timers = new Set<number>()
  private readonly nodes = new Set<HTMLElement>()

  burst(host: HTMLElement, x: number, y: number, colour: string): void {
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 * i) / 6 + Math.random() * 0.6
      const dot = el('div')
      dot.style.cssText =
        `position:absolute;left:${x}px;top:${y}px;width:5px;height:5px;` +
        `margin:-2.5px 0 0 -2.5px;border-radius:50%;background:${colour};opacity:0.85;` +
        `pointer-events:none;transition:transform 380ms cubic-bezier(.2,.7,.3,1),opacity 380ms linear`
      host.append(dot)
      this.nodes.add(dot)

      const dx = Math.cos(angle) * (18 + Math.random() * 16)
      const dy = Math.sin(angle) * (18 + Math.random() * 16)
      const start = window.setTimeout(() => {
        this.timers.delete(start)
        dot.style.transform = `translate(${dx}px, ${dy}px) scale(0.4)`
        dot.style.opacity = '0'
      }, 16)
      const end = window.setTimeout(() => {
        this.timers.delete(end)
        this.nodes.delete(dot)
        dot.remove()
      }, 460)
      this.timers.add(start)
      this.timers.add(end)
    }
  }

  dispose(): void {
    for (const t of this.timers) window.clearTimeout(t)
    this.timers.clear()
    for (const n of this.nodes) n.remove()
    this.nodes.clear()
  }
}

export const accommodativeRock: Procedure = {
  id: 'accommodativeRock',
  label: 'Accommodative Rock',
  async run(ctx: ProcedureContext): Promise<void> {
    await runRock(ctx)
  },
}

async function runRock(ctx: ProcedureContext): Promise<void> {
  const { signal, settings } = ctx
  const redEye = settings.calibration.redEye
  const prescription = settings.prescription
  const goalAccuracy = prescription.rockAccuracyGoal
  const goalCpm = prescription.rockCpmGoal

  // Everything about difficulty here is prescribed, never invented by the app.
  const levels =
    prescription.flipperLevels.length > 0
      ? prescription.flipperLevels
      : [{ level: 1, rightEyeD: 0, leftEyeD: 0 }]

  // --- DOM -----------------------------------------------------------------
  const stage = el('div', { class: 'stage' })

  const canvasWrap = el('div')
  canvasWrap.style.cssText = 'position:relative;transition:opacity 140ms linear'
  const canvas = el('canvas')
  canvasWrap.append(canvas)

  // The flipper-orientation cue. HTS buries this in a paper manual; a flipper held
  // backwards trains the opposite power and nothing downstream can detect it.
  const holdCue = el('div')
  holdCue.style.cssText =
    'position:fixed;top:34px;left:0;right:0;text-align:center;font-size:19px;' +
    'font-weight:600;letter-spacing:0.02em;color:#c7d2de'
  const holdSub = el('div')
  holdSub.style.cssText = 'font-size:13px;font-weight:400;color:#6d7886;margin-top:4px'
  holdCue.append(holdSub)

  // The flip cue. Full width, unmissable, and it owns the screen for its whole beat.
  const flipCue = el('div')
  flipCue.style.cssText =
    'position:fixed;inset:0;display:none;flex-direction:column;align-items:center;' +
    'justify-content:center;gap:14px;background:#000;z-index:2'
  const flipWord = el('div')
  flipWord.style.cssText = 'font-size:64px;font-weight:700;letter-spacing:0.16em'
  const flipNote = el('div')
  flipNote.style.cssText = 'font-size:16px;color:#8b97a6;text-align:center;max-width:34rem'
  flipCue.append(flipWord, flipNote)

  const hud = el('div', { class: 'stage-hud' })
  const hudLevel = el('span')
  const hudWarning = el('span', { class: 'warn' })
  const hudClock = el('span')
  hud.append(hudLevel, hudWarning, hudClock)

  const prompt = el('div', { class: 'stage-prompt' })
  const promptMain = el('div')
  const promptNote = el('div', { class: 'muted' })
  prompt.append(promptMain, promptNote)

  stage.append(canvasWrap, holdCue, flipCue, hud, prompt)
  ctx.root.append(stage)

  const feedback = new Feedback()
  const sparkles = new Sparkles()
  const monitor = new IntegrityMonitor(4)
  const fatigue = new FatigueMonitor()

  // --- State ---------------------------------------------------------------
  let layout = rowLayout()
  let levelIndex = 0
  let rowIndex = 0
  let answered = 0
  let nextProbeAt = PROBE_EVERY_TRIALS
  let probeEye: EyeSide = redEye
  const probeHits: Record<EyeSide, number> = { left: 0, right: 0 }
  const probeMisses: Record<EyeSide, number> = { left: 0, right: 0 }
  const consecutiveMisses: Record<EyeSide, number> = { left: 0, right: 0 }
  let suppressionFlagged: EyeSide | null = null
  const recorded: RockTrial[] = []

  const onResize = (): void => {
    layout = rowLayout()
  }
  window.addEventListener('resize', onResize)

  const startedAt = performance.now()
  const clock = window.setInterval(() => paintClock(), 500)

  function currentLevel(): { level: number; rightEyeD: number; leftEyeD: number } {
    return levels[levelIndex] ?? { level: 1, rightEyeD: 0, leftEyeD: 0 }
  }

  function powerFor(eye: EyeSide): number {
    const l = currentLevel()
    return eye === 'right' ? l.rightEyeD : l.leftEyeD
  }

  function paintClock(): void {
    const s = Math.floor((performance.now() - startedAt) / 1000)
    const mm = String(Math.floor(s / 60)).padStart(2, '0')
    const ss = String(s % 60).padStart(2, '0')
    hudClock.textContent = `${mm}:${ss} elapsed`
  }

  function paintHud(): void {
    const l = currentLevel()
    hudLevel.textContent =
      `flipper level ${l.level} · R ${formatD(l.rightEyeD)} · L ${formatD(l.leftEyeD)}`
    hudWarning.textContent = suppressionFlagged
      ? `${suppressionFlagged} eye is missing the monocular probe`
      : ''
  }

  function paintHoldCue(): void {
    const l = currentLevel()
    holdCue.textContent = `Hold LEVEL ${l.level} — number facing you`
    holdSub.textContent =
      `right eye ${formatD(l.rightEyeD)} · left eye ${formatD(l.leftEyeD)} · ` +
      `red reaches your ${redEye} eye`
    holdCue.append(holdSub)
  }

  function setPrompt(note = ''): void {
    promptMain.textContent =
      'Arrow key for each gap, left to right.  SPACE = too blurred to read — that is always a good answer and never counts against you.'
    promptNote.textContent = note
  }

  paintHud()
  paintClock()
  paintHoldCue()
  setPrompt()

  try {
    let stopped = false

    while (!signal.aborted && !stopped) {
      const colour: RowColour = rowIndex % 2 === 0 ? 'red' : 'blue'
      // Red light passes the red filter, so a red row reaches the red-filtered eye only.
      const eye: EyeSide = colour === 'red' ? redEye : other(redEye)

      // A level change means physically picking up a different flipper, so it can only
      // happen at a cycle boundary (start of a red row), never mid-cycle.
      let levelChanged = false
      if (colour === 'red' && rowIndex > 0) {
        levelChanged = applyLevelRecommendation()
      }

      await showFlipCue(colour, eye, { levelChanged, first: rowIndex === 0 })
      if (signal.aborted) break

      const row = buildRow(colour, eye)
      let abandoned = false

      for (let i = 0; i < ROW_LENGTH && !abandoned; i++) {
        const direction = row.directions[i]
        if (!direction) continue

        paintRow(canvas, layout, row, i)
        const onset = await afterPaint(signal)
        if (signal.aborted) {
          stopped = true
          break
        }

        const response = await waitForResponse(onset, RESPONSE_TIMEOUT_MS, signal)
        if (!response) {
          stopped = true
          break
        }

        const isCatch = row.catches[i] === true
        const anticipated =
          response.kind === 'answer' && response.latencyMs < MIN_PLAUSIBLE_LATENCY_MS

        let correct: boolean
        if (response.kind === 'cannotSee') {
          // Honest on a catch trial is exactly right. Honest on a real C is not
          // "correct", but it is never punished either — it only lowers the level.
          correct = isCatch
        } else if (anticipated) {
          // Faster than an accommodative response can physically be. Recorded and
          // flagged, but never counted as evidence that this lens power is clearing.
          correct = false
        } else {
          correct = !isCatch && response.direction === direction
        }

        const trial: RockTrial = {
          index: recorded.length,
          // Rock is scored in flipper levels, per the core `Trial` contract.
          demand: currentLevel().level,
          eye,
          correct,
          latencyMs: Math.round(response.latencyMs),
          isCatch,
          kind: response.kind,
          isClearing: i === 0,
          rowIndex,
          positionInRow: i,
          rowColour: colour,
          flipperD: powerFor(eye),
        }
        recorded.push(trial)
        monitor.push(trial)
        fatigue.push(trial)
        ctx.onTrial(trial)
        answered += 1

        // --- Feedback ----------------------------------------------------
        const centre = cCentre(layout, i)
        if (response.kind === 'cannotSee') {
          feedback.tone('neutral')
          setPrompt(
            isCatch
              ? 'Correct — that gap was too small to read.'
              : 'Noted. If the whole row stays blurred, the level is too strong.',
          )
        } else if (anticipated) {
          feedback.tone('neutral')
          setPrompt('That arrived before the lens could clear. Wait for the gap to sharpen.')
        } else if (correct) {
          feedback.tone('correct')
          sparkles.burst(canvasWrap, centre.x, centre.y, colour === 'red' ? RED : BLUE)
          setPrompt()
        } else {
          feedback.tone('incorrect')
          setPrompt(isCatch ? 'That one had no readable gap — space is the answer there.' : '')
        }

        // --- Fatigue ------------------------------------------------------
        const breakReason = fatigue.shouldBreak()
        if (breakReason) {
          await ctx.requestBreak(breakReason)
          fatigue.reset()
          // The shell owns the rest overlay and may have torn our stage out of the DOM.
          if (!stage.isConnected) ctx.root.append(stage)
          if (signal.aborted) {
            stopped = true
            break
          }
          // The flipper was almost certainly put down during the break, so the rest of
          // this row cannot be trusted to have been seen through the right lens.
          abandoned = true
        }
      }

      if (stopped || signal.aborted) break
      rowIndex += 1

      if (answered >= nextProbeAt) {
        await runSuppressionProbe()
        nextProbeAt = answered + PROBE_EVERY_TRIALS
        if (signal.aborted) break
      }
    }

    await showSummary()
  } finally {
    window.clearInterval(clock)
    window.removeEventListener('resize', onResize)
    sparkles.dispose()
    feedback.close()
    stage.remove()
  }

  /* ------------------------------------------------------------------ rows */

  function buildRow(colour: RowColour, eye: EyeSide): RowSpec {
    const directions: Direction[] = []
    const catches: boolean[] = []
    const catchRotations: number[] = []
    for (let i = 0; i < ROW_LENGTH; i++) {
      directions.push(DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)] ?? 'up')
      // Never make the first C of a row a catch: that slot carries the clearing time,
      // which is the one measurement this procedure exists to produce.
      catches.push(i > 0 && Math.random() < CATCH_TRIAL_RATE)
      catchRotations.push(Math.random() * Math.PI * 2)
    }
    return { colour, eye, directions, catches, catchRotations }
  }

  async function showFlipCue(
    colour: RowColour,
    eye: EyeSide,
    opts: { levelChanged: boolean; first: boolean },
  ): Promise<void> {
    const tint = colour === 'red' ? RED : BLUE
    canvasWrap.style.opacity = '0'
    flipCue.style.display = 'flex'
    flipWord.style.color = opts.levelChanged ? '#e6eaef' : tint

    if (opts.levelChanged) {
      const l = currentLevel()
      flipWord.textContent = `LEVEL ${l.level}`
      flipNote.textContent =
        `Swap to the level ${l.level} flipper — right ${formatD(l.rightEyeD)}, left ${formatD(l.leftEyeD)}. ` +
        `Number facing you. Then hold it up for the ${colour} row.`
    } else if (opts.first) {
      flipWord.textContent = 'READY'
      flipNote.textContent =
        `Flipper up, number facing you. The ${colour} row trains your ${eye} eye.`
    } else {
      flipWord.textContent = 'FLIP'
      flipNote.textContent = `${colour.toUpperCase()} row — your ${eye} eye. Flip the lens now.`
    }

    feedback.tone('flip')
    await sleep(opts.levelChanged ? LEVEL_CHANGE_CUE_MS : FLIP_CUE_MS, signal)

    flipCue.style.display = 'none'
    canvasWrap.style.opacity = '1'
    paintHud()
    paintHoldCue()
    setPrompt()
  }

  /* ------------------------------------------------------------- adaptation */

  /**
   * Level control comes from the integrity monitor, not from HTS's star gates:
   * accuracy alone floors at 25% in a 4AFC task, so on its own it cannot tell a
   * cleared lens from a lucky guess. The prescribed accuracy goal is an extra
   * gate on stepping up, never a reason to step down on its own.
   */
  function applyLevelRecommendation(): boolean {
    const previous = levelIndex
    const recommendation = monitor.recommendation()
    const verdict = monitor.verdict()
    const summary = monitor.summary()
    const accuracy = summary.valid > 0 ? summary.correct / summary.valid : 0

    if (recommendation === 'increase' && !verdict.atChance && accuracy >= goalAccuracy) {
      levelIndex = Math.min(levels.length - 1, levelIndex + 1)
    } else if (recommendation === 'decrease') {
      levelIndex = Math.max(0, levelIndex - 1)
    }

    if (levelIndex !== previous) {
      // The evidence was about the old lens power; it says nothing about the new one.
      monitor.reset()
      paintHud()
      paintHoldCue()
      return true
    }
    return false
  }

  /* ------------------------------------------------------- suppression probe */

  /**
   * A mark rendered into one anaglyph channel only. The eye behind the other filter
   * cannot see it at all, so a miss means that eye's input is not reaching awareness.
   *
   * The mark is a large solid block rather than a fine detail on purpose: through a
   * strong flipper lens a fine target would be missed for optical reasons, and we
   * would call blur "suppression". A blurred block is still a visible blob in a
   * reportable position.
   */
  async function runSuppressionProbe(): Promise<void> {
    const eye = probeEye
    probeEye = other(probeEye)

    const positionIndex = Math.floor(Math.random() * DIRECTIONS.length)
    const position = DIRECTIONS[positionIndex] ?? 'up'
    const colour = eye === redEye ? RED : BLUE

    canvasWrap.style.opacity = '1'
    paintProbe(canvas, layout, position, colour)
    promptMain.textContent = 'Where is the block?  Arrow key.  SPACE if you cannot see it at all.'
    promptNote.textContent = 'Eye check — keep the flipper exactly where it is.'

    const onset = await afterPaint(signal)
    if (signal.aborted) return
    const response = await waitForResponse(onset, RESPONSE_TIMEOUT_MS, signal)
    if (!response) return

    const seen = response.kind === 'answer' && response.direction === position
    if (seen) {
      probeHits[eye] += 1
      consecutiveMisses[eye] = 0
      feedback.tone('correct')
      setPrompt('Both eyes reporting.')
    } else {
      probeMisses[eye] += 1
      consecutiveMisses[eye] += 1
      feedback.tone('neutral')
      setPrompt(`Nothing seen with the ${eye} eye that time.`)
    }

    // Probes are not therapy trials: they never enter the level ladder or the
    // accuracy record, because scoring them would mix two different questions.

    if (consecutiveMisses[eye] >= SUPPRESSION_ALARM_MISSES) {
      suppressionFlagged = eye
      consecutiveMisses[eye] = 0
      levelIndex = Math.max(0, levelIndex - 1)
      monitor.reset()
      paintHud()
      paintHoldCue()

      flipCue.style.display = 'flex'
      flipWord.style.color = '#d29922'
      flipWord.textContent = 'CHECK'
      flipNote.textContent =
        `Your ${eye} eye missed the last ${SUPPRESSION_ALARM_MISSES} checks in a row. That usually means ` +
        `your brain is switching that eye off — you see one clear image and feel fine while one eye does ` +
        `nothing. Dropping to level ${currentLevel().level}. Mention this to your optometrist; it is not ` +
        `something to push through.`
      await sleep(6000, signal)
      flipCue.style.display = 'none'
      setPrompt()
    }
  }

  /* ---------------------------------------------------------------- summary */

  /**
   * Shown once, at the end, and never during the run: no live score, no streak, no
   * personal best. Speed is only reported at all if the integrity checks passed,
   * because cycles-per-minute is the single easiest number here to fake.
   */
  async function showSummary(): Promise<void> {
    const verdict = monitor.verdict()
    canvasWrap.style.display = 'none'
    flipCue.style.display = 'none'
    holdCue.style.display = 'none'
    hudLevel.textContent = ''
    hudWarning.textContent = ''

    const minutes = (performance.now() - startedAt) / 60_000
    const cycles = Math.floor(rowIndex / 2)
    const cpm = minutes > 0.25 ? cycles / minutes : null

    const lines: string[] = []
    for (const eye of ['left', 'right'] as const) {
      const attempted = recorded.filter((t) => t.eye === eye && !t.isCatch && t.kind === 'answer')
      if (attempted.length === 0) continue
      const accuracy = attempted.filter((t) => t.correct).length / attempted.length
      const clearing = median(
        attempted.filter((t) => t.isClearing && t.correct).map((t) => t.latencyMs),
      )
      lines.push(
        `${eye} eye: ${Math.round(accuracy * 100)}% correct (goal ${Math.round(goalAccuracy * 100)}%)` +
          (clearing === null ? '' : `, cleared the lens in about ${formatMs(clearing)}`),
      )
    }

    if (suppressionFlagged) {
      lines.push(
        `Your ${suppressionFlagged} eye kept missing the monocular check ` +
          `(${probeHits[suppressionFlagged]} seen, ${probeMisses[suppressionFlagged]} missed). Worth raising with your optometrist.`,
      )
    }

    promptMain.textContent =
      lines.length > 0
        ? lines.join('   ·   ')
        : 'Not enough answered reps to say anything useful about either eye. That is a result, not a failure.'

    if (!verdict.trustworthy) {
      promptNote.textContent = verdict.notes.join(' ')
    } else if (cpm !== null) {
      promptNote.textContent =
        `${cycles} cycles at about ${cpm.toFixed(1)} per minute against a goal of ${goalCpm}. ` +
        `This only counts because the answers passed the honesty checks.`
    } else {
      promptNote.textContent = ''
    }

    await linger(2600)
  }
}

/* ------------------------------------------------------- rendering helpers */

function rowLayout(): RowLayout {
  const size = Math.max(
    34,
    Math.min(92, Math.round(Math.min(window.innerWidth / 9, window.innerHeight / 6))),
  )
  const step = Math.round(size * 1.95)
  const margin = Math.round(size * 0.8)
  const width = margin * 2 + step * (ROW_LENGTH - 1) + size
  const height = Math.round(size * 2.6)
  return { size, step, margin, width, height }
}

function cCentre(layout: RowLayout, index: number): { x: number; y: number } {
  return {
    x: layout.margin + layout.size / 2 + index * layout.step,
    y: Math.round(layout.height / 2),
  }
}

function paintRow(
  canvas: HTMLCanvasElement,
  layout: RowLayout,
  row: RowSpec,
  activeIndex: number,
): void {
  canvas.width = layout.width
  canvas.height = layout.height
  const g = canvas.getContext('2d')
  if (!g) return

  const colour = row.colour === 'red' ? RED : BLUE
  g.clearRect(0, 0, layout.width, layout.height)

  for (let i = 0; i < ROW_LENGTH; i++) {
    const direction = row.directions[i]
    if (!direction) continue
    const centre = cCentre(layout, i)

    // Answered Cs stay on screen but recede, so the row still reads as a row while
    // the eye is pulled to the next one.
    g.globalAlpha = i < activeIndex ? 0.18 : 1
    if (row.catches[i] === true) {
      drawUnresolvableC(g, centre.x, centre.y, layout.size, colour, row.catchRotations[i] ?? 0)
    } else {
      drawLandoltC(g, centre.x, centre.y, layout.size, direction, colour)
    }
    g.globalAlpha = 1

    if (i === activeIndex) {
      // Marker in the same channel as the row, so it reaches the same single eye.
      const y = centre.y + layout.size * 0.85
      g.save()
      g.strokeStyle = colour
      g.lineWidth = 3
      g.globalAlpha = 0.85
      g.beginPath()
      g.moveTo(centre.x - layout.size * 0.32, y)
      g.lineTo(centre.x + layout.size * 0.32, y)
      g.stroke()
      g.restore()
    }
  }
}

/**
 * A catch C: a ring whose gap is far below what the eye can resolve at this size.
 * There is no orientation to report, so an arrow key here is a false alarm and the
 * honest answer is space. This is what keeps cycles-per-minute meaningful.
 */
function drawUnresolvableC(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  colour: string,
  rotation: number,
): void {
  const gapAngle = 0.05
  g.save()
  g.strokeStyle = colour
  g.lineWidth = size / 5
  g.beginPath()
  g.arc(x, y, size / 2, rotation + gapAngle / 2, rotation - gapAngle / 2 + Math.PI * 2)
  g.stroke()
  g.restore()
}

function paintProbe(
  canvas: HTMLCanvasElement,
  layout: RowLayout,
  position: Direction,
  colour: string,
): void {
  canvas.width = layout.width
  canvas.height = layout.height
  const g = canvas.getContext('2d')
  if (!g) return

  const cx = layout.width / 2
  const cy = layout.height / 2
  const offset = Math.min(layout.height, layout.width) * 0.3
  const block = Math.round(layout.size * 0.55)
  const at: Record<Direction, { x: number; y: number }> = {
    up: { x: cx, y: cy - offset },
    down: { x: cx, y: cy + offset },
    left: { x: cx - offset * 2, y: cy },
    right: { x: cx + offset * 2, y: cy },
  }
  const p = at[position]

  g.clearRect(0, 0, layout.width, layout.height)
  g.fillStyle = colour
  g.fillRect(p.x - block / 2, p.y - block / 2, block, block)

  // A faint centre mark in the same channel, so there is something to fixate.
  g.globalAlpha = 0.4
  g.fillRect(cx - 2, cy - 2, 4, 4)
  g.globalAlpha = 1
}

/* ------------------------------------------------------------------ utils */

function other(eye: EyeSide): EyeSide {
  return eye === 'left' ? 'right' : 'left'
}

function formatD(dioptres: number): string {
  const sign = dioptres >= 0 ? '+' : '−'
  return `${sign}${Math.abs(dioptres).toFixed(2)} D`
}

function formatMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid] ?? null
  const lo = sorted[mid - 1]
  const hi = sorted[mid]
  if (lo === undefined || hi === undefined) return null
  return (lo + hi) / 2
}
