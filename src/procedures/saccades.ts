import type { Calibration } from '../core/types'
import type { Procedure, ProcedureContext } from './base'
import type { IntegrityTrial, ResponseKind } from '../core/integrity'
import { FatigueMonitor, createElapsedClock, visibleTimeout } from './base'
import { CATCH_TRIAL_RATE, IntegrityMonitor, MIN_PLAUSIBLE_LATENCY_MS } from '../core/integrity'
import { drawLandoltC } from '../core/anaglyph'
import { el } from '../ui/router'

/**
 * Saccades — fixation shifts between targets.
 *
 * HTS publishes no manual for its Saccades module, so this is designed from the
 * clinical intent rather than reverse-engineered. The design, stated so it can be
 * argued with:
 *
 *  1. **One target at a time, at an unpredictable place.** A Landolt C appears
 *     somewhere on screen, is answered, vanishes, and the next appears elsewhere.
 *     Two alternating positions would be learned within seconds and executed as a
 *     rehearsed pattern rather than a fresh fixation shift.
 *
 *  2. **Eccentricity is varied deliberately, and recorded.** Successive targets are
 *     placed at amplitudes drawn from a spread of jump sizes, and the distance
 *     jumped is stored with every trial — in degrees of visual angle as well as
 *     pixels — so saccade amplitude can be analysed against latency later. Small
 *     and large saccades are not the same act, and pooling them hides everything
 *     interesting.
 *
 *  3. **A blank gap before each target.** Fixation is released before the next
 *     target appears (the "gap paradigm"), which is standard in saccade testing and
 *     keeps the measured latency about the shift rather than about disengaging.
 *
 *  4. **The gap must be read, not guessed at.** The C is small enough that it has to
 *     be foveated, so the answer cannot be produced without the eye actually landing
 *     on the target. Space means "I cannot resolve it", catch targets carry a gap
 *     below resolution, and responses faster than a real percept are rejected.
 *
 * Difficulty is the target size, which adapts off the integrity monitor. No score,
 * streak, or personal best is displayed at any point.
 */

type Direction = 'up' | 'down' | 'left' | 'right'

const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'] as const

/** Neutral, so both anaglyph channels are lit and the task stays binocular. */
const TARGET_COLOUR = '#dfe7ef'
const FIXATION_COLOUR = '#3b444f'

/** No answer inside this window is recorded as "couldn't resolve it", never as wrong. */
const RESPONSE_TIMEOUT_MS = 5000

/** Blank interval before each new target: fixation is released, then the target lands. */
const GAP_MIN_MS = 180
const GAP_JITTER_MS = 220

/**
 * Target size ladder, as a fraction of the shorter viewport edge. Smaller means the
 * saccade has to land more accurately before the gap can be read, which is the
 * dimension worth training — not speed, which is trivially inflated by guessing.
 */
const SIZE_FRACTIONS: readonly number[] = [0.055, 0.045, 0.036, 0.03, 0.025, 0.021]

/**
 * Jump amplitudes, as fractions of the shorter viewport edge. Deliberately spread:
 * a run of same-size jumps becomes a rhythm, and a rhythm is executed predictively.
 */
const AMPLITUDE_FRACTIONS: readonly number[] = [0.15, 0.28, 0.45, 0.65, 0.85]

interface Response {
  kind: ResponseKind
  direction: Direction | null
  latencyMs: number
}

/** Extra fields ride through `onTrial` into storage alongside the core `Trial` shape. */
interface SaccadeTrial extends IntegrityTrial {
  /** Distance from the previous target to this one. */
  jumpPx: number
  jumpDeg: number
  /** Eccentricity of this target from screen centre, where the fixation mark sits. */
  eccentricityDeg: number
  targetSizePx: number
}

interface Point {
  x: number
  y: number
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
      cancelTimer()
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

    const cancelTimer = visibleTimeout(
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

  tone(kind: 'correct' | 'incorrect' | 'neutral'): void {
    const audio = this.ctxOrNull()
    if (!audio) return
    const now = audio.currentTime
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    const freq = kind === 'correct' ? 660 : kind === 'incorrect' ? 220 : 440
    const dur = kind === 'incorrect' ? 0.14 : 0.08
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
 * Expanding rings drawn by the render loop itself, so there are no DOM nodes or
 * timers to leak. Affective only: they carry no count and no streak.
 */
class Ripples {
  private readonly items: { x: number; y: number; born: number; colour: string }[] = []

  add(x: number, y: number, colour: string): void {
    this.items.push({ x, y, born: performance.now(), colour })
    if (this.items.length > 6) this.items.shift()
  }

  draw(g: CanvasRenderingContext2D, now: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i]
      if (!item) continue
      const age = (now - item.born) / 420
      if (age >= 1) {
        this.items.splice(i, 1)
        continue
      }
      g.save()
      g.globalAlpha = (1 - age) * 0.7
      g.strokeStyle = item.colour
      g.lineWidth = 2
      g.beginPath()
      g.arc(item.x, item.y, 8 + age * 40, 0, Math.PI * 2)
      g.stroke()
      g.restore()
    }
  }
}

export const saccades: Procedure = {
  id: 'saccades',
  label: 'Saccades',
  async run(ctx: ProcedureContext): Promise<void> {
    await runSaccades(ctx)
  },
}

async function runSaccades(ctx: ProcedureContext): Promise<void> {
  const { signal, settings } = ctx
  const cal = settings.calibration

  // --- DOM -----------------------------------------------------------------
  const stage = el('div', { class: 'stage' })
  const canvas = el('canvas')

  const hud = el('div', { class: 'stage-hud' })
  const hudSize = el('span')
  const hudWarning = el('span', { class: 'warn' })
  const hudClock = el('span')
  hud.append(hudSize, hudWarning, hudClock)

  const prompt = el('div', { class: 'stage-prompt' })
  const promptMain = el('div')
  const promptNote = el('div', { class: 'muted' })
  prompt.append(promptMain, promptNote)

  stage.append(canvas, hud, prompt)
  ctx.root.append(stage)

  const feedback = new Feedback()
  const ripples = new Ripples()
  const monitor = new IntegrityMonitor(4)
  const fatigue = new FatigueMonitor()

  /** Measured from the stage, not from `window`: a page scrollbar makes them differ. */
  function viewport(): { w: number; h: number } {
    return {
      w: stage.clientWidth || window.innerWidth,
      h: stage.clientHeight || window.innerHeight,
    }
  }

  // --- State ---------------------------------------------------------------
  let sizeIndex = 1
  let previous: Point = { x: viewport().w / 2, y: viewport().h / 2 }
  const target: { at: Point; direction: Direction | null; isCatch: boolean; rotation: number } = {
    at: { ...previous },
    direction: null,
    isCatch: false,
    rotation: 0,
  }
  const recorded: SaccadeTrial[] = []

  /** Therapy actually done: stops for hidden tabs and for pauses, like the session clock. */
  const elapsed = createElapsedClock()

  function sizeCanvas(): void {
    const { w, h } = viewport()
    canvas.width = w
    canvas.height = h
  }
  const onResize = (): void => sizeCanvas()
  window.addEventListener('resize', onResize)
  sizeCanvas()

  function shortEdge(): number {
    const { w, h } = viewport()
    return Math.min(w, h)
  }

  function targetSize(): number {
    const fraction = SIZE_FRACTIONS[sizeIndex] ?? 0.04
    return Math.max(14, Math.round(shortEdge() * fraction))
  }

  // --- Render loop ---------------------------------------------------------
  // Draws whatever the trial loop below has set, so the trial loop can stay a plain
  // async sequence and latency can still be taken from a real paint.
  let raf = 0
  const frame = (): void => {
    const now = performance.now()
    const g = canvas.getContext('2d')
    if (g) {
      g.clearRect(0, 0, canvas.width, canvas.height)

      // Centre mark: somewhere to return to during the blank gap, and the reference
      // point the recorded eccentricity is measured from.
      g.save()
      g.fillStyle = FIXATION_COLOUR
      g.beginPath()
      g.arc(canvas.width / 2, canvas.height / 2, 3, 0, Math.PI * 2)
      g.fill()
      g.restore()

      const size = targetSize()
      if (target.isCatch) {
        drawUnresolvableC(g, target.at.x, target.at.y, size, TARGET_COLOUR, target.rotation)
      } else if (target.direction) {
        drawLandoltC(g, target.at.x, target.at.y, size, target.direction, TARGET_COLOUR)
      }

      ripples.draw(g, now)
    }
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)

  const clock = window.setInterval(() => paintClock(), 500)

  function paintClock(): void {
    hudClock.textContent = `${elapsed.format()} elapsed`
  }

  function paintHud(): void {
    const gapDeg = pxToDegrees(targetSize() / 5, cal) * 60
    hudSize.textContent = `target ${targetSize()} px · gap ≈ ${gapDeg.toFixed(1)}′`
  }

  function setPrompt(note = ''): void {
    promptMain.textContent =
      'Look straight at each target and arrow-key its gap.  SPACE = I can’t resolve it — that is always a good answer and never counts against you.'
    promptNote.textContent = note
  }

  paintClock()
  paintHud()
  setPrompt()

  try {
    while (!signal.aborted) {
      // --- Blank gap ------------------------------------------------------
      // Fixation is released before the next target lands, so the latency that
      // follows is about the shift rather than about letting go of the last target.
      target.direction = null
      target.isCatch = false
      await sleep(GAP_MIN_MS + Math.random() * GAP_JITTER_MS, signal)
      if (signal.aborted) break

      // --- Place the next target -------------------------------------------
      const size = targetSize()
      const amplitudeFraction =
        AMPLITUDE_FRACTIONS[Math.floor(Math.random() * AMPLITUDE_FRACTIONS.length)] ?? 0.3
      const amplitudePx = shortEdge() * amplitudeFraction
      const at = nextPosition(previous, amplitudePx, size)

      // CATCH_TRIAL_RATE is currently 0, so `isCatch` is always false and every branch
      // below that depends on it — including the "that gap was too small to read" copy —
      // is dormant rather than dead. Restoring catch trials is a change to that rate.
      const isCatch = Math.random() < CATCH_TRIAL_RATE
      const direction = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)] ?? 'up'

      target.at = at
      target.rotation = Math.random() * Math.PI * 2
      target.isCatch = isCatch
      target.direction = direction

      const jumpPx = Math.hypot(at.x - previous.x, at.y - previous.y)
      const eccentricityPx = Math.hypot(at.x - canvas.width / 2, at.y - canvas.height / 2)
      previous = at

      const onset = await afterPaint(signal)
      if (signal.aborted) break

      const response = await waitForResponse(onset, RESPONSE_TIMEOUT_MS, signal)
      if (!response) break

      // --- Score ------------------------------------------------------------
      const anticipated =
        response.kind === 'answer' && response.latencyMs < MIN_PLAUSIBLE_LATENCY_MS

      let correct: boolean
      if (response.kind === 'cannotSee') {
        correct = isCatch
      } else if (anticipated) {
        // Below the floor for a saccade plus a percept plus a keypress, so it cannot
        // be evidence that this target was actually read.
        correct = false
      } else {
        correct = !isCatch && response.direction === direction
      }

      const jumpDeg = pxToDegrees(jumpPx, cal)
      const trial: SaccadeTrial = {
        index: recorded.length,
        // Saccades has no clinical demand unit; the recorded demand is the amplitude
        // of the jump this response was made across.
        demand: Math.round(jumpDeg * 10) / 10,
        correct,
        latencyMs: Math.round(response.latencyMs),
        isCatch,
        kind: response.kind,
        jumpPx: Math.round(jumpPx),
        jumpDeg: Math.round(jumpDeg * 10) / 10,
        eccentricityDeg: Math.round(pxToDegrees(eccentricityPx, cal) * 10) / 10,
        targetSizePx: size,
      }
      recorded.push(trial)
      monitor.push(trial)
      fatigue.push(trial)
      ctx.onTrial(trial)

      // --- Feedback ---------------------------------------------------------
      if (response.kind === 'cannotSee') {
        feedback.tone('neutral')
        setPrompt(
          isCatch ? 'Correct — that gap was too small to read.' : 'Noted. Making the targets bigger.',
        )
      } else if (anticipated) {
        feedback.tone('neutral')
        setPrompt('That arrived before your eyes could land on it. Look at the target first.')
      } else if (correct) {
        feedback.tone('correct')
        ripples.add(at.x, at.y, TARGET_COLOUR)
        setPrompt()
      } else {
        feedback.tone('incorrect')
        setPrompt(isCatch ? 'That one had no readable gap — space is the answer there.' : '')
      }

      // --- Adaptive size ------------------------------------------------------
      // Driven by the integrity monitor rather than raw accuracy: at four
      // alternatives, accuracy alone cannot separate reading from guessing.
      const recommendation = monitor.recommendation()
      if (response.kind === 'cannotSee' && !isCatch) {
        sizeIndex = Math.max(0, sizeIndex - 1)
      } else if (recommendation === 'increase' && !monitor.verdict().atChance) {
        sizeIndex = Math.min(SIZE_FRACTIONS.length - 1, sizeIndex + 1)
      } else if (recommendation === 'decrease') {
        sizeIndex = Math.max(0, sizeIndex - 1)
      }
      paintHud()

      // --- Fatigue -------------------------------------------------------------
      const breakReason = fatigue.shouldBreak()
      if (breakReason) {
        target.direction = null
        target.isCatch = false
        await ctx.requestBreak(breakReason)
        fatigue.reset()
        // The shell owns the rest overlay and may have torn our stage out of the DOM.
        if (!stage.isConnected) ctx.root.append(stage)
        sizeCanvas()
        previous = { x: viewport().w / 2, y: viewport().h / 2 }
        if (signal.aborted) break
      }
    }

    await showSummary()
  } finally {
    cancelAnimationFrame(raf)
    window.clearInterval(clock)
    elapsed.dispose()
    window.removeEventListener('resize', onResize)
    feedback.close()
    stage.remove()
  }

  /**
   * Placement for the next target: a random direction at the requested amplitude,
   * resampled until it lands on screen. Sampling the angle rather than the point
   * keeps the amplitude honest — clamping a point to the viewport would quietly
   * shorten exactly the large jumps we are trying to record.
   */
  function nextPosition(from: Point, amplitudePx: number, size: number): Point {
    const { w, h } = viewport()
    const margin = size * 1.2 + 24
    const minX = margin
    const maxX = Math.max(margin, w - margin)
    // Extra room top and bottom for the HUD and the prompt, which are fixed overlays.
    const minY = margin + 40
    const maxY = Math.max(margin + 40, h - margin - 60)

    for (let attempt = 0; attempt < 32; attempt++) {
      const angle = Math.random() * Math.PI * 2
      const x = from.x + Math.cos(angle) * amplitudePx
      const y = from.y + Math.sin(angle) * amplitudePx
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) return { x, y }
    }
    // Nothing at this amplitude fits from here — fall back to a free position and let
    // the recorded jump distance say what actually happened.
    return {
      x: minX + Math.random() * (maxX - minX),
      y: minY + Math.random() * (maxY - minY),
    }
  }

  /**
   * Shown once, at the end. Latency is split by jump size because a large saccade
   * and a small one are different acts, and it is reported as keyboard response
   * time — a browser cannot measure an eye.
   */
  async function showSummary(): Promise<void> {
    const verdict = monitor.verdict()
    target.direction = null
    target.isCatch = false
    cancelAnimationFrame(raf)
    const g = canvas.getContext('2d')
    if (g) g.clearRect(0, 0, canvas.width, canvas.height)
    hudSize.textContent = ''
    hudWarning.textContent = ''

    const attempted = recorded.filter((t) => !t.isCatch && t.kind === 'answer')
    const correct = attempted.filter((t) => t.correct)

    if (correct.length === 0) {
      promptMain.textContent =
        'No target size produced enough believable answers to score. That is a calibration result, not a failure.'
      promptNote.textContent = verdict.trustworthy ? '' : verdict.notes.join(' ')
      await linger(2400)
      return
    }

    const amplitudes = correct.map((t) => t.jumpDeg)
    const split = median(amplitudes) ?? 0
    const shortJumps = median(correct.filter((t) => t.jumpDeg <= split).map((t) => t.latencyMs))
    const longJumps = median(correct.filter((t) => t.jumpDeg > split).map((t) => t.latencyMs))
    const smallest = Math.min(...correct.map((t) => t.targetSizePx))

    const parts = [`smallest target read: ${smallest} px`]
    if (shortJumps !== null) parts.push(`short jumps ${formatMs(shortJumps)}`)
    if (longJumps !== null) parts.push(`long jumps ${formatMs(longJumps)}`)
    promptMain.textContent = parts.join('   ·   ')
    promptNote.textContent = verdict.trustworthy
      ? 'Response times are keyboard response times, not eye movement times.'
      : verdict.notes.join(' ')

    await linger(2600)
  }
}

/* ------------------------------------------------------- rendering helpers */

/**
 * A catch target: a ring whose gap is far below what the eye can resolve at this
 * size, so there is no orientation to report and the honest answer is space.
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

/** Small-angle conversion through the screen calibration. Approximate, and reported as such. */
function pxToDegrees(px: number, cal: Calibration): number {
  const cm = px / cal.pxPerCm
  return (Math.atan2(cm, cal.viewingDistanceCm) * 180) / Math.PI
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
