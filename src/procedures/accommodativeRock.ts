import type { EyeSide } from '../core/types'
import type { Procedure, ProcedureContext } from './base'
import type { IntegrityTrial, ResponseKind } from '../core/integrity'
import { FatigueMonitor, createElapsedClock } from './base'
import { CATCH_TRIAL_RATE, IntegrityMonitor, MIN_PLAUSIBLE_LATENCY_MS } from '../core/integrity'
import { drawLandoltC } from '../core/anaglyph'
import { createStagePlacement, loadStoredScale, saveStoredScale } from './stagePlacement'
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
 *  - Rows change colour instantly, as in HTS: the colour change itself is the cue
 *    to flip the lens, marked only by a tone. A full-screen beat interrupts solely
 *    for a flipper swap (level change) and the very first row.
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
 */

type Direction = 'up' | 'down' | 'left' | 'right'

const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'] as const

/** The `--anaglyph-red` / `--anaglyph-blue` values, needed here as canvas colours. */
const RED = '#ff2b2b'
const BLUE = '#2b6bff'

/** What an already-answered target (or the filler symbol after it) turns to. */
const ANSWERED_COLOUR = '#c7d2de'

/**
 * Non-interactive glyphs drawn between the four targets, matching HTS's row layout.
 * Fixed order, never randomised — HTS reuses the same three symbols every row.
 */
const FILLER_SYMBOLS = ['*', '#', '$'] as const

type RowColour = 'red' | 'blue'

const ROW_LENGTH = 4

/** How long the READY cue (first row only) holds the screen. */
const FLIP_CUE_MS = 1300

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

/**
 * Waits for a key, for as long as it takes. There is no timeout: a target that has
 * not been answered simply stays on screen, and only the user moves things forward.
 * SPACE remains the honest way to say a gap will not clear.
 */
function waitForResponse(onset: number, signal: AbortSignal): Promise<Response | null> {
  return new Promise((resolve) => {
    const finish = (r: Response | null): void => {
      window.removeEventListener('keydown', onKey)
      signal.removeEventListener('abort', onAbort)
      resolve(r)
    }

    const onKey = (e: KeyboardEvent): void => {
      if (e.repeat) return
      // Keystrokes aimed at a control on the stage — the size slider or the auto
      // toggle — are not answers. Space especially: it is both the honest "too
      // blurred" key and the key that activates a focused checkbox.
      if (e.target instanceof HTMLInputElement) return
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

  // The READY cue. Full width, unmissable, and it owns the screen for its whole beat.
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
  const hudClock = el('span')
  hud.append(hudClock)

  const prompt = el('div', { class: 'stage-prompt' })
  const promptMain = el('div')
  const promptNote = el('div', { class: 'muted' })
  prompt.append(promptMain, promptNote)

  // Size control. Remembered across sessions: the right size for a screen and a
  // chair does not change day to day, so it should not need re-finding.
  let sizeScale = loadStoredScale(SIZE_SCALE_KEY)
  const sizeSlider = el('input', {
    type: 'range',
    min: '0.5',
    max: '2',
    step: '0.05',
    value: String(sizeScale),
  })
  sizeSlider.style.cssText = 'width:140px;accent-color:#8b97a6'
  const sizeLabel = el('label')
  sizeLabel.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer'
  sizeLabel.append('size', sizeSlider)
  // The row also hosts the auto-relocation toggle, appended once it exists below.
  const sizeWrap = el('div')
  sizeWrap.style.cssText =
    'position:fixed;left:18px;bottom:16px;display:flex;align-items:center;gap:14px;' +
    'font-size:12px;color:#6d7886;z-index:1'
  sizeWrap.append(sizeLabel)

  stage.append(canvasWrap, flipCue, hud, prompt, sizeWrap)
  ctx.root.append(stage)

  const feedback = new Feedback()
  const sparkles = new Sparkles()
  const monitor = new IntegrityMonitor(4)
  const fatigue = new FatigueMonitor()

  // --- State ---------------------------------------------------------------
  let layout = rowLayout(sizeScale)
  let rowIndex = 0
  /** Whatever is on the canvas right now, so a size change can repaint it in place. */
  let painted: { row: RowSpec; activeIndex: number } | null = null
  const recorded: RockTrial[] = []

  const placement = createStagePlacement({
    procedureId: accommodativeRock.id,
    stage,
    target: canvasWrap,
    // The flipper is held on-axis toward the screen centre; looking through the
    // lens off-axis induces prism (Prentice's rule) that contaminates the
    // accommodative demand, so rock offsets stay modest.
    maxFraction: 0.18,
    downBias: false,
    elemSize: () => ({ w: layout.width, h: layout.height }),
    // A jitter change means a new row layout, and the repaint path is onResize.
    onChange: () => onResize(),
  })
  sizeWrap.append(placement.autoToggle)

  /** The slider's scale, wobbled by auto mode, still bounded by the slider's range. */
  const effectiveScale = (): number =>
    Math.min(2, Math.max(0.5, sizeScale * placement.sizeJitter()))

  const onResize = (): void => {
    layout = rowLayout(effectiveScale())
    placement.apply()
    if (painted) paintRow(canvas, layout, painted.row, painted.activeIndex)
  }
  window.addEventListener('resize', onResize)
  placement.apply()

  sizeSlider.addEventListener('input', () => {
    sizeScale = Number(sizeSlider.value) || 1
    saveStoredScale(SIZE_SCALE_KEY, sizeScale)
    onResize()
  })
  // The arrow keys are the answer channel. A slider that kept focus after being
  // dragged would keep eating them as adjustments, so it lets go on commit.
  sizeSlider.addEventListener('change', () => sizeSlider.blur())

  /**
   * Therapy actually done: stops for hidden tabs and for pauses, like the session clock.
   * Cycles-per-minute is measured against this rather than wall time, so a pause cannot
   * quietly deflate the rate the user is judged on.
   */
  const elapsed = createElapsedClock()
  const clock = window.setInterval(() => paintClock(), 500)

  // The level is fixed for the whole session — named once in the READY cue, never
  // shown or changed while the exercise runs, matching HTS.
  const level = levels[0] ?? { level: 1, rightEyeD: 0, leftEyeD: 0 }

  function powerFor(eye: EyeSide): number {
    return eye === 'right' ? level.rightEyeD : level.leftEyeD
  }

  function paintClock(): void {
    hudClock.textContent = `${elapsed.format()} elapsed`
  }

  function setPrompt(note = ''): void {
    promptMain.textContent =
      'Arrow key for each gap, left to right.  SPACE = too blurred to read — that is always a good answer and never counts against you.'
    promptNote.textContent = note
  }

  paintClock()
  setPrompt()

  try {
    let stopped = false

    while (!signal.aborted && !stopped) {
      const colour: RowColour = rowIndex % 2 === 0 ? 'red' : 'blue'
      // Red light passes the red filter, so a red row reaches the red-filtered eye only.
      const eye: EyeSide = colour === 'red' ? redEye : other(redEye)

      await showFlipCue(colour, eye, { first: rowIndex === 0 })
      if (signal.aborted) break

      // Auto relocation lands only on row boundaries: the user reads the four Cs
      // left to right, and a mid-row move measures confusion, not re-fusion.
      if (placement.jumpDue()) placement.jump()

      const row = buildRow(colour, eye)
      let abandoned = false

      for (let i = 0; i < ROW_LENGTH && !abandoned; i++) {
        const direction = row.directions[i]
        if (!direction) continue

        painted = { row, activeIndex: i }
        paintRow(canvas, layout, row, i)
        const onset = await afterPaint(signal)
        if (signal.aborted) {
          stopped = true
          break
        }

        const response = await waitForResponse(onset, signal)
        if (!response) {
          stopped = true
          break
        }

        const isCatch = row.catches[i] === true

        /*
         * The anticipation rule only applies to the first C of a row.
         *
         * It exists to catch answers that arrive faster than a percept of a *newly
         * presented* stimulus could form. That holds for the first C after a colour
         * change, where the eye is genuinely refocusing through a new lens power —
         * and that latency is the accommodative clearing time we care about.
         *
         * It does not hold for Cs two to four. HTS shows the whole row at once, so
         * those have been on screen and legible since the row appeared; answering
         * one in 200 ms is fast reading, not a guess. Applying the threshold there
         * discarded legitimately quick responses as if they were cheating, which
         * both lost real data and punished the user for being good at the task.
         */
        const anticipated =
          i === 0 && response.kind === 'answer' && response.latencyMs < MIN_PLAUSIBLE_LATENCY_MS

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

        const centre = cCentre(layout, i)
        const canvasRect = canvas.getBoundingClientRect()
        const hitPoint = {
          x: canvasRect.left + (centre.x / canvas.width) * canvasRect.width,
          y: canvasRect.top + (centre.y / canvas.height) * canvasRect.height,
        }

        const trial: RockTrial = {
          index: recorded.length,
          // Rock is scored in flipper levels, per the core `Trial` contract.
          demand: level.level,
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
          ...(response.kind === 'answer' ? { hitPoint } : {}),
        }
        recorded.push(trial)
        monitor.push(trial)
        fatigue.push(trial)
        ctx.onTrial(trial)
        placement.answered()

        // --- Feedback ----------------------------------------------------
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

        // The entire row stays visible, but the active marker advances on the next
        // paint. Give the ring one readable beat on this C before moving forward.
        if (response.kind === 'answer') await sleep(260, signal)

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
    }

    await showSummary()
  } finally {
    window.clearInterval(clock)
    elapsed.dispose()
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
      // CATCH_TRIAL_RATE is currently 0, so no row ever gets a catch C and every branch
      // that depends on one — including the "that gap was too small to read" copy — is
      // dormant rather than dead. Restoring catch trials is a change to that rate.
      catches.push(i > 0 && Math.random() < CATCH_TRIAL_RATE)
      catchRotations.push(Math.random() * Math.PI * 2)
    }
    return { colour, eye, directions, catches, catchRotations }
  }

  async function showFlipCue(
    colour: RowColour,
    eye: EyeSide,
    opts: { first: boolean },
  ): Promise<void> {
    // An ordinary colour change gets no cue at all, matching HTS: the row simply
    // switches, and the colour itself is the signal to flip the lens. Only the very
    // first row gets a full-screen beat, which is also where the flipper level for
    // the whole session is named.
    if (!opts.first) {
      feedback.tone('flip')
      return
    }

    canvasWrap.style.opacity = '0'
    flipCue.style.display = 'flex'
    flipWord.style.color = colour === 'red' ? RED : BLUE
    flipWord.textContent = 'READY'
    flipNote.textContent =
      `Use the level ${level.level} flipper — right ${formatD(level.rightEyeD)}, ` +
      `left ${formatD(level.leftEyeD)}, number facing you. ` +
      `The ${colour} row trains your ${eye} eye.`

    feedback.tone('flip')
    await sleep(FLIP_CUE_MS, signal)

    flipCue.style.display = 'none'
    canvasWrap.style.opacity = '1'
    setPrompt()
  }

  /* ---------------------------------------------------------------- summary */

  /**
   * Shown once, at the end, and never during the run: no live score, no streak, no
   * personal best. Speed is only reported at all if the integrity checks passed,
   * because cycles-per-minute is the single easiest number here to fake.
   */
  async function showSummary(): Promise<void> {
    const verdict = monitor.verdict()
    painted = null
    canvasWrap.style.display = 'none'
    sizeWrap.style.display = 'none'
    flipCue.style.display = 'none'

    const minutes = elapsed.ms() / 60_000
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

/* ------------------------------------------------------------- size scale */

/** Pre-dates the shared placement helper; the key stays so saved sizes survive. */
const SIZE_SCALE_KEY = 'iris.rockSizeScale.v1'

/* ------------------------------------------------------- rendering helpers */

function rowLayout(scale: number): RowLayout {
  const base = Math.max(
    34,
    Math.min(92, Math.round(Math.min(window.innerWidth / 9, window.innerHeight / 6))),
  )
  // Whatever the slider says, the whole row must stay on screen: a clipped
  // first or last target is unanswerable, not just ugly. Row width works out to
  // size × (0.8×2 + 1.95×3 + 1), hence the divisor.
  const maxSize = Math.floor((window.innerWidth - 24) / 8.45)
  const size = Math.max(16, Math.min(maxSize, Math.round(base * scale)))
  const step = Math.round(size * 1.95)
  const margin = Math.round(size * 0.8)
  const width = margin * 2 + step * (ROW_LENGTH - 1) + size
  const height = Math.round(size * 2.6)
  return { size, step, margin, width, height }
}

/**
 * A row is laid out as 7 evenly-spaced slots — target, filler, target, filler,
 * target, filler, target — so a filler always sits exactly halfway between the two
 * targets flanking it. `layout.step` is still the target-to-target distance, so the
 * row's overall width is unchanged from a 4-target-only layout.
 */
function slotCentre(layout: RowLayout, slotIndex: number): { x: number; y: number } {
  return {
    x: layout.margin + layout.size / 2 + (slotIndex * layout.step) / 2,
    y: Math.round(layout.height / 2),
  }
}

function cCentre(layout: RowLayout, index: number): { x: number; y: number } {
  return slotCentre(layout, index * 2)
}

function fillerCentre(layout: RowLayout, index: number): { x: number; y: number } {
  return slotCentre(layout, index * 2 + 1)
}

function drawBox(g: CanvasRenderingContext2D, x: number, y: number, size: number, colour: string): void {
  g.save()
  g.strokeStyle = colour
  g.lineWidth = Math.max(1.5, size / 18)
  g.strokeRect(x - size / 2, y - size / 2, size, size)
  g.restore()
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

    // An answered target turns fully neutral rather than just fading, so the row
    // reads as "done so far" at a glance instead of a fainter version of itself.
    const shade = i < activeIndex ? ANSWERED_COLOUR : colour
    // The glyph is drawn smaller than its box so the box outline stays visible as a
    // frame around it, rather than being swallowed by the ring's own stroke width.
    const glyphSize = layout.size * 0.62
    drawBox(g, centre.x, centre.y, layout.size, shade)
    if (row.catches[i] === true) {
      drawUnresolvableC(g, centre.x, centre.y, glyphSize, shade, row.catchRotations[i] ?? 0)
    } else {
      drawLandoltC(g, centre.x, centre.y, glyphSize, direction, shade)
    }

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

  // Purely decorative filler between the targets, matching HTS's row density. Never
  // a response target — its "done" state just tracks the target immediately before it.
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = `${Math.round(layout.size * 0.5)}px sans-serif`
  for (let f = 0; f < FILLER_SYMBOLS.length; f++) {
    const symbol = FILLER_SYMBOLS[f]
    if (!symbol) continue
    const centre = fillerCentre(layout, f)
    g.fillStyle = f < activeIndex ? ANSWERED_COLOUR : colour
    g.fillText(symbol, centre.x, centre.y)
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
