import type { Calibration } from '../core/types'
import type { Procedure, ProcedureContext } from './base'
import type { IntegrityTrial, ResponseKind } from '../core/integrity'
import { FatigueMonitor, createElapsedClock, visibleTimeout } from './base'
import { CATCH_TRIAL_RATE, IntegrityMonitor, MIN_PLAUSIBLE_LATENCY_MS } from '../core/integrity'
import { drawLandoltC } from '../core/anaglyph'
import { el } from '../ui/router'

/**
 * Pursuits — smooth-pursuit tracking.
 *
 * HTS does not publish a manual for its Pursuits or Saccades modules, so unlike the
 * vergence procedures there is no published design to reproduce. This one is
 * designed from the clinical intent rather than reverse-engineered, and the design
 * choices are stated here so they can be argued with:
 *
 *  1. **The path must be genuinely unpredictable.** A circle, a figure eight, or any
 *     looping path can be tracked by prediction after two laps, and predictive
 *     tracking is not pursuit — it is anticipation with the eyes roughly in the right
 *     place. The target here is the sum of sinusoids at incommensurate frequencies
 *     (ratios involving √2 and π), so the path never repeats within any session and
 *     cannot be learned.
 *
 *  2. **The response must be impossible to produce without actually pursuing.** A
 *     Landolt C rides inside the target and its gap subtends a small enough angle
 *     that it cannot be resolved in peripheral vision. A dim halo around it stays
 *     visible peripherally, so the target can be *found* without foveating but
 *     cannot be *read* without foveating. Answering therefore requires the eye to
 *     be on the target, which is the whole point.
 *
 *  3. **Same honesty machinery as everything else.** Space means "I cannot resolve
 *     it", catch trials carry a gap below resolution so the honest answer is space,
 *     and responses faster than a real percept are rejected rather than counted.
 *
 * Difficulty is the path speed, which adapts off the integrity monitor. Nothing
 * about a score, a streak, or a personal best is ever displayed.
 */

type Direction = 'up' | 'down' | 'left' | 'right'

const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'] as const

/** Neutral, so both anaglyph channels are lit and the task stays binocular. */
const TARGET_COLOUR = '#dfe7ef'
const HALO_COLOUR = '#5c6b7d'

/** No answer inside this window is recorded as "couldn't resolve it", never as wrong. */
const EPOCH_TIMEOUT_MS = 4500

/** Gap between an answer and the next orientation change, randomised so onsets are unpredictable. */
const REFRACTORY_MIN_MS = 450
const REFRACTORY_JITTER_MS = 900

/**
 * Path speed ladder, as multipliers on the base frequencies. The bottom of the
 * ladder is slow enough to be pursued by almost anyone; the top is fast enough
 * that pursuit starts breaking into catch-up saccades, which is where the training
 * actually lives.
 */
const SPEED_SCALES: readonly number[] = [0.55, 0.75, 1, 1.3, 1.7, 2.2]

/**
 * Base frequencies in Hz. The ratios are irrational (√2, π/2) on purpose: any
 * rational ratio produces a closed Lissajous figure that repeats, and a repeating
 * path can be predicted instead of pursued.
 */
const FREQ_X: readonly [number, number] = [0.071, 0.071 * Math.SQRT2]
const FREQ_Y: readonly [number, number] = [(0.053 * Math.PI) / 2, 0.097]
const PHASE: readonly [number, number, number, number] = [0, 1.7, 0.6, 2.9]

interface Response {
  kind: ResponseKind
  direction: Direction | null
  latencyMs: number
}

/** Extra fields ride through `onTrial` into storage alongside the core `Trial` shape. */
interface PursuitTrial extends IntegrityTrial {
  /** Approximate path speed at stimulus onset, degrees of visual angle per second. */
  speedDegPerSec: number
  speedScale: number
}

interface Stimulus {
  direction: Direction | null
  isCatch: boolean
  catchRotation: number
}

interface Path {
  cx: number
  cy: number
  ax: number
  ay: number
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
 * Ring flourishes drawn by the render loop itself, so there are no DOM nodes or
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
      g.arc(item.x, item.y, 10 + age * 44, 0, Math.PI * 2)
      g.stroke()
      g.restore()
    }
  }
}

export const pursuits: Procedure = {
  id: 'pursuits',
  label: 'Pursuits',
  async run(ctx: ProcedureContext): Promise<void> {
    await runPursuits(ctx)
  },
}

async function runPursuits(ctx: ProcedureContext): Promise<void> {
  const { signal, settings } = ctx
  const cal = settings.calibration

  // --- DOM -----------------------------------------------------------------
  const stage = el('div', { class: 'stage' })
  const canvas = el('canvas')

  const hud = el('div', { class: 'stage-hud' })
  const hudSpeed = el('span')
  const hudWarning = el('span', { class: 'warn' })
  const hudClock = el('span')
  hud.append(hudSpeed, hudWarning, hudClock)

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
    const w = stage.clientWidth || window.innerWidth
    const h = stage.clientHeight || window.innerHeight
    return { w, h }
  }

  // --- State ---------------------------------------------------------------
  let path = layoutPath(viewport().w, viewport().h)
  let targetSize = targetSizeFor(viewport().w, viewport().h)
  let speedIndex = 1
  const stimulus: Stimulus = { direction: null, isCatch: false, catchRotation: 0 }
  const recorded: PursuitTrial[] = []
  let position = { x: path.cx, y: path.cy }

  /**
   * Phase reference for the animated path. This one is a raw wall clock on purpose:
   * it drives where the target *is*, and a paused clock would only mean the target
   * resumes from where it stopped — which is what we want, but is already what
   * happens, since the render loop is a `requestAnimationFrame` that does not run
   * while the tab is hidden. The user-facing elapsed counter is separate, below.
   */
  const startedAt = performance.now()

  /** Therapy actually done: stops for hidden tabs and for pauses, like the session clock. */
  const elapsed = createElapsedClock()

  const onResize = (): void => {
    const { w, h } = viewport()
    path = layoutPath(w, h)
    targetSize = targetSizeFor(w, h)
    sizeCanvas()
  }
  window.addEventListener('resize', onResize)

  function sizeCanvas(): void {
    const { w, h } = viewport()
    canvas.width = w
    canvas.height = h
  }
  sizeCanvas()

  function speedScale(): number {
    return SPEED_SCALES[speedIndex] ?? 1
  }

  /**
   * Instantaneous path speed, in degrees of visual angle per second. Computed as a
   * numeric derivative of the path and converted through the screen calibration —
   * approximate by construction, and reported as such rather than dressed up.
   */
  function speedDegPerSec(atSeconds: number): number {
    const dt = 1 / 60
    const a = pathAt(atSeconds, path, speedScale())
    const b = pathAt(atSeconds + dt, path, speedScale())
    const px = Math.hypot(b.x - a.x, b.y - a.y) / dt
    return pxToDegrees(px, cal)
  }

  // --- Render loop ---------------------------------------------------------
  // Runs continuously and only reads state, so the trial loop below can stay a
  // plain async sequence and latency can still be taken from a real paint.
  let raf = 0
  const frame = (): void => {
    const now = performance.now()
    const seconds = (now - startedAt) / 1000
    position = pathAt(seconds, path, speedScale())

    const g = canvas.getContext('2d')
    if (g) {
      g.clearRect(0, 0, canvas.width, canvas.height)

      // A short fading trail. Purely cosmetic, and deliberately behind the target so
      // it can never be mistaken for the gap.
      for (let i = 8; i >= 1; i--) {
        const p = pathAt(seconds - i * 0.05, path, speedScale())
        g.save()
        g.globalAlpha = 0.05 * (1 - i / 9)
        g.fillStyle = TARGET_COLOUR
        g.beginPath()
        g.arc(p.x, p.y, targetSize * 0.5, 0, Math.PI * 2)
        g.fill()
        g.restore()
      }

      // The halo is what makes this a pursuit task rather than a search task: it is
      // findable in peripheral vision, while the gap inside it is not.
      g.save()
      g.globalAlpha = 0.5
      g.strokeStyle = HALO_COLOUR
      g.lineWidth = 2
      g.beginPath()
      g.arc(position.x, position.y, targetSize * 1.55, 0, Math.PI * 2)
      g.stroke()
      g.restore()

      if (stimulus.isCatch) {
        drawUnresolvableC(
          g,
          position.x,
          position.y,
          targetSize,
          TARGET_COLOUR,
          stimulus.catchRotation,
        )
      } else if (stimulus.direction) {
        drawLandoltC(g, position.x, position.y, targetSize, stimulus.direction, TARGET_COLOUR)
      } else {
        // Between epochs the ring is closed, so there is nothing to answer and the
        // moment a gap appears is an unambiguous stimulus onset.
        drawClosedRing(g, position.x, position.y, targetSize, TARGET_COLOUR)
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
    const seconds = (performance.now() - startedAt) / 1000
    hudSpeed.textContent = `path speed ≈ ${speedDegPerSec(seconds).toFixed(1)} °/s`
  }

  function setPrompt(note = ''): void {
    promptMain.textContent =
      'Follow the target and arrow-key the gap in the ring.  SPACE = I can’t resolve it — that is always a good answer and never counts against you.'
    promptNote.textContent = note
  }

  paintClock()
  paintHud()
  setPrompt()

  try {
    while (!signal.aborted) {
      // --- Build the stimulus --------------------------------------------
      // A catch epoch's gap is below resolution however well the target is tracked,
      // so an arrow key here is a false alarm rather than a tracking failure.
      // CATCH_TRIAL_RATE is currently 0, so `isCatch` is always false and every branch
      // below that depends on it — including the "that gap was too small to read" copy —
      // is dormant rather than dead. Restoring catch trials is a change to that rate.
      const isCatch = Math.random() < CATCH_TRIAL_RATE
      const direction = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)] ?? 'up'

      stimulus.isCatch = isCatch
      stimulus.catchRotation = Math.random() * Math.PI * 2
      stimulus.direction = direction

      const onset = await afterPaint(signal)
      if (signal.aborted) break

      const speed = speedDegPerSec((onset - startedAt) / 1000)
      paintHud()

      const response = await waitForResponse(onset, EPOCH_TIMEOUT_MS, signal)
      if (!response) break

      // --- Score ----------------------------------------------------------
      const anticipated =
        response.kind === 'answer' && response.latencyMs < MIN_PLAUSIBLE_LATENCY_MS

      let correct: boolean
      if (response.kind === 'cannotSee') {
        correct = isCatch
      } else if (anticipated) {
        correct = false
      } else {
        correct = !isCatch && response.direction === direction
      }

      const trial: PursuitTrial = {
        index: recorded.length,
        // Pursuits has no clinical demand unit, so the recorded demand is the path
        // speed the response was made against.
        demand: Math.round(speed * 10) / 10,
        correct,
        latencyMs: Math.round(response.latencyMs),
        isCatch,
        kind: response.kind,
        speedDegPerSec: Math.round(speed * 10) / 10,
        speedScale: speedScale(),
      }
      recorded.push(trial)
      monitor.push(trial)
      fatigue.push(trial)
      ctx.onTrial(trial)

      // --- Feedback -------------------------------------------------------
      if (response.kind === 'cannotSee') {
        feedback.tone('neutral')
        setPrompt(
          isCatch ? 'Correct — that gap was too small to read.' : 'Noted. Slowing the target down.',
        )
      } else if (anticipated) {
        feedback.tone('neutral')
        setPrompt('That arrived before the gap could be resolved. Stay with the target.')
      } else if (correct) {
        feedback.tone('correct')
        ripples.add(position.x, position.y, TARGET_COLOUR)
        setPrompt()
      } else {
        feedback.tone('incorrect')
        setPrompt(isCatch ? 'That one had no readable gap — space is the answer there.' : '')
      }

      // --- Adaptive speed --------------------------------------------------
      // Driven by the integrity monitor rather than raw accuracy: at four
      // alternatives, accuracy alone cannot separate tracking from guessing.
      const recommendation = monitor.recommendation()
      if (response.kind === 'cannotSee' && !isCatch) {
        speedIndex = Math.max(0, speedIndex - 1)
      } else if (recommendation === 'increase' && !monitor.verdict().atChance) {
        speedIndex = Math.min(SPEED_SCALES.length - 1, speedIndex + 1)
      } else if (recommendation === 'decrease') {
        speedIndex = Math.max(0, speedIndex - 1)
      }

      // Close the ring and wait a random beat, so the next onset cannot be timed.
      stimulus.direction = null
      stimulus.isCatch = false
      await sleep(REFRACTORY_MIN_MS + Math.random() * REFRACTORY_JITTER_MS, signal)
      if (signal.aborted) break

      // --- Fatigue ---------------------------------------------------------
      const breakReason = fatigue.shouldBreak()
      if (breakReason) {
        await ctx.requestBreak(breakReason)
        fatigue.reset()
        // The shell owns the rest overlay and may have torn our stage out of the DOM.
        if (!stage.isConnected) ctx.root.append(stage)
        sizeCanvas()
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
   * Shown once, at the end. The headline is the fastest path speed that was tracked
   * with responses we can believe — a number guessing cannot inflate — and never a
   * count, a streak, or a personal best.
   */
  async function showSummary(): Promise<void> {
    const verdict = monitor.verdict()
    stimulus.direction = null
    cancelAnimationFrame(raf)
    const g = canvas.getContext('2d')
    if (g) g.clearRect(0, 0, canvas.width, canvas.height)
    hudSpeed.textContent = ''
    hudWarning.textContent = ''

    const attempted = recorded.filter((t) => !t.isCatch && t.kind === 'answer')
    const byScale = new Map<number, { valid: number; correct: number }>()
    for (const t of attempted) {
      const bucket = byScale.get(t.speedScale) ?? { valid: 0, correct: 0 }
      bucket.valid += 1
      if (t.correct) bucket.correct += 1
      byScale.set(t.speedScale, bucket)
    }

    let bestSpeed: number | null = null
    for (const [scale, stats] of byScale) {
      if (stats.valid < 3 || stats.correct / stats.valid < 0.75) continue
      const speeds = attempted.filter((t) => t.speedScale === scale).map((t) => t.speedDegPerSec)
      const typical = median(speeds)
      if (typical !== null && (bestSpeed === null || typical > bestSpeed)) bestSpeed = typical
    }

    const latency = median(attempted.filter((t) => t.correct).map((t) => t.latencyMs))
    const tail = latency === null ? '' : `, reading the gap in about ${formatMs(latency)}`
    promptMain.textContent =
      bestSpeed === null
        ? 'No path speed produced enough believable answers to score. That is a calibration result, not a failure.'
        : `Fastest path you tracked with trustworthy answers: about ${bestSpeed.toFixed(1)} °/s${tail}`

    promptNote.textContent = verdict.trustworthy ? '' : verdict.notes.join(' ')
    await linger(2400)
  }
}

/* ------------------------------------------------------- rendering helpers */

function layoutPath(w: number, h: number): Path {
  const margin = Math.min(w, h) * 0.12
  return {
    cx: w / 2,
    cy: h / 2,
    ax: Math.max(60, w / 2 - margin),
    ay: Math.max(50, h / 2 - margin),
  }
}

/**
 * The C is sized so its gap sits near foveal acuity and well below what peripheral
 * vision can resolve. Anything larger can be read out of the corner of the eye,
 * which turns a pursuit task into a guessing game with a moving distraction.
 */
function targetSizeFor(w: number, h: number): number {
  return Math.max(16, Math.round(Math.min(w, h) * 0.026))
}

function pathAt(seconds: number, path: Path, scale: number): { x: number; y: number } {
  const t = seconds * scale
  const x =
    path.cx +
    path.ax *
      (0.62 * Math.sin(2 * Math.PI * FREQ_X[0] * t + PHASE[0]) +
        0.38 * Math.sin(2 * Math.PI * FREQ_X[1] * t + PHASE[1]))
  const y =
    path.cy +
    path.ay *
      (0.58 * Math.sin(2 * Math.PI * FREQ_Y[0] * t + PHASE[2]) +
        0.42 * Math.sin(2 * Math.PI * FREQ_Y[1] * t + PHASE[3]))
  return { x, y }
}

function drawClosedRing(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  colour: string,
): void {
  g.save()
  g.strokeStyle = colour
  g.lineWidth = size / 5
  g.beginPath()
  g.arc(x, y, size / 2, 0, Math.PI * 2)
  g.stroke()
  g.restore()
}

/**
 * A catch epoch: a ring whose gap is far below what the eye can resolve at this
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
