import type { Prescription, Settings, Trial } from '../core/types'
import type { Procedure, ProcedureContext } from './base'
import type { ProcedureId } from '../core/types'
import type { IntegrityTrial, ResponseKind } from '../core/integrity'
import { FatigueMonitor } from './base'
import { CATCH_TRIAL_RATE, IntegrityMonitor, MIN_PLAUSIBLE_LATENCY_MS } from '../core/integrity'
import { maxDemandPd, prismDioptresToPx } from '../core/geometry'
import { renderFlatFusion, renderRds } from '../core/anaglyph'
import { el } from '../ui/router'

/**
 * Shared engine for the three disparity-vergence procedures.
 *
 * All three present the same task — a random-dot stereogram with a square floating
 * in one of four positions — and differ only in how the *sign* and *sequence* of the
 * base disparity is scheduled across reps. Convergence ramps crossed disparity,
 * Divergence ramps uncrossed, and Jump Ductions alternates the two so each rep is a
 * step rather than a ramp. Everything else (adaptive demand, catch trials, integrity
 * scoring, fatigue, the screen ceiling) is identical, so it lives here once.
 */

export type Direction = 'up' | 'down' | 'left' | 'right'

/**
 * Order matters: it is the index mapping used both for the RDS target position and
 * for `renderFlatFusion`'s `oddPosition`, whose own position array is
 * [above, below, left, right] of centre.
 */
const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'] as const

/** How the procedure schedules signed demand across reps. */
export interface VergenceSpec {
  id: ProcedureId
  label: string
  /** Peak magnitude the adaptive ladder is allowed to climb toward, in Δ. */
  goalPd(p: Prescription): number
  /**
   * Signed base disparity for this rep at the current ladder magnitude.
   * Positive = crossed = convergence. Negative = uncrossed = divergence.
   */
  signedDemandPd(rep: number, magnitudePd: number, p: Prescription): number
  /**
   * Reset enforced between reps even when `settings.restBetweenRepsMs` is 0.
   * Non-zero only for Jump Ductions, where stepping is the whole procedure.
   */
  minRestMs: number
  /** One line of orientation shown under the field. */
  instruction: string
}

/** Ladder bounds, in prism dioptres. Steps are deliberately small (1–2Δ). */
const FLOOR_PD = 1.5
const STEP_UP_PD = 1
const STEP_DOWN_PD = 2

/** A rep that gets no response at all is scored as "couldn't see it", never as wrong. */
const RESPONSE_TIMEOUT_MS = 12_000

/**
 * Consecutive honest "can't see it" answers at the ladder floor before we accept that
 * random dots are not going to fuse for this user and fall back to flat targets.
 */
const FLAT_FALLBACK_AFTER = 5

const DOT_PX = 3
const DOT_DENSITY = 0.5

interface Response {
  kind: ResponseKind
  direction: Direction | null
  latencyMs: number
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

function waitForResponse(onset: number, signal: AbortSignal): Promise<Response | null> {
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

    // No answer at all is honest data, not a failure: record it as "can't see it".
    const timer = window.setTimeout(
      () => finish({ kind: 'cannotSee', direction: null, latencyMs: RESPONSE_TIMEOUT_MS }),
      RESPONSE_TIMEOUT_MS,
    )

    window.addEventListener('keydown', onKey)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Turns a flat-fusion display into a no-target catch display.
 *
 * `renderFlatFusion` always draws exactly one odd target out, so there is no way to
 * ask it for a catch trial. Overprinting the missing horizontal arm of the odd
 * position makes all four positions identical crosses, i.e. nothing to report. The
 * geometry constants below mirror `renderFlatFusion` — keep them in sync if that
 * renderer's layout ever changes.
 */
function neutraliseFlatTarget(
  ctx: CanvasRenderingContext2D,
  opts: {
    width: number
    height: number
    baseDisparityPx: number
    redEye: Settings['calibration']['redEye']
    oddPosition: 0 | 1 | 2 | 3
  },
): void {
  const cx = opts.width / 2
  const cy = opts.height / 2
  const r = Math.min(opts.width, opts.height) * 0.3
  const positions = [
    { x: cx, y: cy - r },
    { x: cx, y: cy + r },
    { x: cx - r, y: cy },
    { x: cx + r, y: cy },
  ]
  const pos = positions[opts.oddPosition]
  if (!pos) return

  const half = opts.baseDisparityPx / 2
  const shift: Record<'left' | 'right', number> = { left: +half, right: -half }

  for (const eye of ['left', 'right'] as const) {
    ctx.save()
    ctx.translate(shift[eye], 0)
    ctx.strokeStyle = eye === opts.redEye ? '#ff2b2b' : '#2b6bff'
    ctx.lineWidth = 3
    ctx.globalCompositeOperation = 'lighter'
    ctx.beginPath()
    ctx.moveTo(pos.x - 14, pos.y)
    ctx.lineTo(pos.x + 14, pos.y)
    ctx.stroke()
    ctx.restore()
  }
}

/** Non-verbal, non-scoring feedback: a short tone and a brief outline flash. */
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

export function createVergenceProcedure(spec: VergenceSpec): Procedure {
  return {
    id: spec.id,
    label: spec.label,
    async run(ctx: ProcedureContext): Promise<void> {
      await runVergence(spec, ctx)
    },
  }
}

async function runVergence(spec: VergenceSpec, ctx: ProcedureContext): Promise<void> {
  const { signal, settings } = ctx
  const cal = settings.calibration
  const goalPd = Math.max(FLOOR_PD, spec.goalPd(settings.prescription))

  // --- DOM -----------------------------------------------------------------
  const stage = el('div', { class: 'stage' })
  const canvasWrap = el('div')
  const canvas = el('canvas')
  canvasWrap.append(canvas)

  // Distant fixation dot for the enforced inter-rep reset.
  const restDot = el('div')
  restDot.style.cssText =
    'width:6px;height:6px;border-radius:50%;background:#2a3138;display:none'

  const hud = el('div', { class: 'stage-hud' })
  const hudDemand = el('span')
  const hudWarning = el('span', { class: 'warn' })
  const hudClock = el('span')
  hud.append(hudDemand, hudWarning, hudClock)

  const prompt = el('div', { class: 'stage-prompt' })
  const promptMain = el('div')
  const promptNote = el('div', { class: 'muted' })
  prompt.append(promptMain, promptNote)

  stage.append(canvasWrap, restDot, hud, prompt)
  ctx.root.append(stage)

  const feedback = new Feedback()
  const monitor = new IntegrityMonitor(4)
  const fatigue = new FatigueMonitor()

  // --- Geometry ------------------------------------------------------------
  let fieldPx = fieldSize()
  let popPx = popDisparityPx(cal)
  let ceilingPd = screenCeilingPd(fieldPx, popPx, cal)

  const onResize = (): void => {
    fieldPx = fieldSize()
    popPx = popDisparityPx(cal)
    ceilingPd = screenCeilingPd(fieldPx, popPx, cal)
    magnitude = Math.min(magnitude, reachableGoal())
    paintHud()
  }
  window.addEventListener('resize', onResize)

  const reachableGoal = (): number => Math.max(FLOOR_PD, Math.min(goalPd, ceilingPd))

  // --- Adaptive state ------------------------------------------------------
  // Start low deliberately: the ladder should climb on evidence, not drop the user
  // straight into a demand they cannot fuse and let them guess their way through it.
  let magnitude = Math.min(reachableGoal(), Math.max(FLOOR_PD, goalPd * 0.25))
  let rep = 0
  let consecutiveCannotSee = 0
  let mode: 'rds' | 'flat' = 'rds'
  let currentSignedPd = 0

  /**
   * The real outcome measure: the highest demand the user actually held with
   * trustworthy responses. A raw peak demand is meaningless if it was reached by
   * guessing, so a level only counts once it has enough non-anticipatory, correct
   * answers behind it.
   */
  const levelStats = new Map<number, { valid: number; correct: number }>()

  const startedAt = performance.now()
  const clock = window.setInterval(() => paintClock(), 500)

  function paintClock(): void {
    const s = Math.floor((performance.now() - startedAt) / 1000)
    const mm = String(Math.floor(s / 60)).padStart(2, '0')
    const ss = String(s % 60).padStart(2, '0')
    hudClock.textContent = `${mm}:${ss} elapsed`
  }

  function paintHud(): void {
    const sense = currentSignedPd >= 0 ? 'crossed' : 'uncrossed'
    hudDemand.textContent = `${Math.abs(currentSignedPd).toFixed(1)}Δ ${sense}`
    // HTS lets you fail forever at a demand your screen physically cannot display.
    hudWarning.textContent =
      ceilingPd < goalPd
        ? `screen ceiling ${ceilingPd.toFixed(1)}Δ — below the ${goalPd.toFixed(0)}Δ goal; sit closer or use a wider display`
        : ''
  }

  function setPrompt(note = ''): void {
    promptMain.textContent =
      'Arrow key for where the square floats.  SPACE = I can’t see it — that is always a good answer and never counts against you.'
    promptNote.textContent = mode === 'flat' ? `Flat fusion targets. ${note}`.trim() : note
  }

  paintHud()
  paintClock()
  setPrompt()

  try {
    while (!signal.aborted) {
      // --- Enforced reset between reps -----------------------------------
      // A vergence demand held continuously is quietly taken over by slow tonic
      // adaptation. Blanking the field and forcing a return to a distant fixation
      // means the next rep is a genuine step stimulus and has to be met by the
      // phasic (fast) vergence system, which is the system being trained.
      const restMs = Math.max(settings.restBetweenRepsMs, spec.minRestMs)
      if (rep > 0 && restMs > 0) {
        canvasWrap.style.display = 'none'
        restDot.style.display = 'block'
        promptNote.textContent = 'Let your eyes settle on the dot.'
        await sleep(restMs, signal)
        restDot.style.display = 'none'
        canvasWrap.style.display = 'block'
        setPrompt()
        if (signal.aborted) break
      }

      // --- Build the stimulus --------------------------------------------
      // Catch trials contain no fusible target at all. They are the only way to tell
      // a user who is fusing from a user who is producing plausible-looking keypresses:
      // a guesser answers a direction here, an honest observer presses space.
      const isCatch = Math.random() < CATCH_TRIAL_RATE
      const dirIndex = Math.floor(Math.random() * DIRECTIONS.length)
      const direction = DIRECTIONS[dirIndex] ?? 'up'

      const requested = spec.signedDemandPd(rep, magnitude, settings.prescription)
      const signedPd =
        Math.sign(requested) * Math.min(Math.abs(requested), ceilingPd)
      currentSignedPd = signedPd
      paintHud()

      const disparityPx = prismDioptresToPx(signedPd, cal)
      if (mode === 'rds') {
        paintRds(canvas, {
          fieldPx,
          disparityPx,
          popPx,
          redEye: cal.redEye,
          target: isCatch ? null : direction,
        })
      } else {
        paintFlat(canvas, {
          fieldPx,
          disparityPx,
          redEye: cal.redEye,
          oddPosition: dirIndex as 0 | 1 | 2 | 3,
          neutralise: isCatch,
        })
      }

      const onset = await afterPaint(signal)
      if (signal.aborted) break

      const response = await waitForResponse(onset, signal)
      if (!response) break

      // --- Score ----------------------------------------------------------
      const anticipated =
        response.kind === 'answer' && response.latencyMs < MIN_PLAUSIBLE_LATENCY_MS

      let correct: boolean
      if (response.kind === 'cannotSee') {
        // Honest on a catch trial is exactly right; honest on a real trial is not
        // "correct", but it is never punished either — it only lowers demand.
        correct = isCatch
      } else if (anticipated) {
        // Too fast to be a fused percept. Recorded, flagged, but never counted as
        // evidence that this demand is achievable.
        correct = false
      } else {
        correct = !isCatch && response.direction === direction
      }

      const trial: IntegrityTrial = {
        index: rep,
        demand: signedPd,
        correct,
        latencyMs: Math.round(response.latencyMs),
        isCatch,
        kind: response.kind,
      }
      monitor.push(trial)
      fatigue.push(trial)
      ctx.onTrial({
        index: trial.index,
        demand: trial.demand,
        correct: trial.correct,
        latencyMs: trial.latencyMs,
      })

      if (!isCatch && response.kind === 'answer' && !anticipated) {
        const key = Math.round(Math.abs(signedPd) * 2) / 2
        const bucket = levelStats.get(key) ?? { valid: 0, correct: 0 }
        bucket.valid += 1
        if (correct) bucket.correct += 1
        levelStats.set(key, bucket)
      }

      // --- Feedback -------------------------------------------------------
      if (response.kind === 'cannotSee') {
        feedback.tone('neutral')
        flash(canvasWrap, 'var(--accent-dim)')
        setPrompt(isCatch ? 'Correct — there was nothing there.' : 'Noted. Dropping the demand.')
      } else if (anticipated) {
        feedback.tone('neutral')
        flash(canvasWrap, 'var(--warn)')
        setPrompt('That arrived before the target could resolve. Wait for it.')
      } else if (correct) {
        feedback.tone('correct')
        flash(canvasWrap, 'var(--good)')
        setPrompt()
      } else {
        feedback.tone('incorrect')
        flash(canvasWrap, 'var(--bad)')
        setPrompt(isCatch ? 'That one had no target — space is the answer there.' : '')
      }

      // --- Flat-fusion fallback -------------------------------------------
      if (response.kind === 'cannotSee' && !isCatch) consecutiveCannotSee += 1
      else if (response.kind === 'answer') consecutiveCannotSee = 0

      const atFloor = magnitude <= FLOOR_PD + 0.01
      if (mode === 'rds' && atFloor && consecutiveCannotSee >= FLAT_FALLBACK_AFTER) {
        // Some people genuinely cannot resolve a random-dot stereogram — stereo-deficient,
        // or simply not yet. Second-degree (superimposition) targets still train fusional
        // vergence, so switch rather than let the user grind at an impossible task.
        mode = 'flat'
        consecutiveCannotSee = 0
        monitor.reset()
        setPrompt('Random dots weren’t fusing, so these are simpler targets. Find the odd one out.')
      }

      // --- Adaptive demand -------------------------------------------------
      // Driven by the integrity monitor rather than a star/streak gate: accuracy alone
      // floors at 25% chance in a 4AFC task, so it cannot distinguish fusing from guessing.
      const recommendation = monitor.recommendation()
      if (response.kind === 'cannotSee' && !isCatch) {
        magnitude = Math.max(FLOOR_PD, magnitude - STEP_DOWN_PD)
      } else if (recommendation === 'increase' && !monitor.verdict().atChance) {
        magnitude = Math.min(reachableGoal(), magnitude + STEP_UP_PD)
      } else if (recommendation === 'decrease') {
        magnitude = Math.max(FLOOR_PD, magnitude - STEP_DOWN_PD)
      }

      rep += 1

      // --- Fatigue ---------------------------------------------------------
      const breakReason = fatigue.shouldBreak()
      if (breakReason) {
        await ctx.requestBreak(breakReason)
        fatigue.reset()
        // The shell owns the rest overlay and may have torn our stage out of the DOM.
        if (!stage.isConnected) ctx.root.append(stage)
        if (signal.aborted) break
      }
    }

    await showSummary()
  } finally {
    window.clearInterval(clock)
    window.removeEventListener('resize', onResize)
    feedback.close()
    stage.remove()
  }

  /**
   * Shown once, at the end, and never during the run: the point is the demand held
   * honestly, not a score. Nothing here is a personal best and nothing accumulates
   * across sessions, because a number to beat is exactly what turns this into a
   * guessing game.
   */
  async function showSummary(): Promise<void> {
    const verdict = monitor.verdict()
    let sustained = 0
    for (const [pd, s] of levelStats) {
      if (s.valid >= 3 && s.correct / s.valid >= 0.75 && pd > sustained) sustained = pd
    }

    canvasWrap.style.display = 'none'
    restDot.style.display = 'none'
    hudDemand.textContent = ''
    hudWarning.textContent = ''

    promptMain.textContent =
      sustained > 0
        ? `Highest demand you held with trustworthy responses: ${sustained.toFixed(1)}Δ`
        : 'No demand level had enough trustworthy responses to score. That is a result, not a failure.'
    promptNote.textContent = verdict.trustworthy
      ? ''
      : verdict.notes.join(' ')
    await linger(2200)
  }
}

// --- Rendering helpers -----------------------------------------------------

function fieldSize(): number {
  const byWidth = Math.round(window.innerWidth * 0.28)
  const byHeight = Math.round(window.innerHeight * 0.5)
  return Math.max(160, Math.min(340, Math.min(byWidth, byHeight)))
}

/**
 * Stereo depth of the target relative to the field. Half a prism dioptre is a large,
 * unambiguous float — this task is about the *base* vergence demand, so the target
 * itself should never be the limiting difficulty.
 */
function popDisparityPx(cal: Settings['calibration']): number {
  return Math.max(6, Math.min(20, Math.round(prismDioptresToPx(0.5, cal))))
}

function screenCeilingPd(
  fieldPx: number,
  popPx: number,
  cal: Settings['calibration'],
): number {
  // renderRds widens the canvas by the base disparity plus the target's excursion and
  // a dot of slack, so the field width fed to maxDemandPd has to include those.
  const effectiveField = fieldPx + 2 * popPx + 4 * DOT_PX
  return Math.max(0, maxDemandPd(window.innerWidth, effectiveField, cal))
}

function paintRds(
  canvas: HTMLCanvasElement,
  opts: {
    fieldPx: number
    disparityPx: number
    popPx: number
    redEye: Settings['calibration']['redEye']
    target: Direction | null
  },
): void {
  const { fieldPx } = opts
  const offset = fieldPx * 0.26
  const sizePx = Math.max(24, Math.round(fieldPx * 0.18))
  const c = fieldPx / 2

  const centres: Record<Direction, { cx: number; cy: number }> = {
    up: { cx: c, cy: c - offset },
    down: { cx: c, cy: c + offset },
    left: { cx: c - offset, cy: c },
    right: { cx: c + offset, cy: c },
  }
  const centre = opts.target ? centres[opts.target] : null

  renderRds(canvas, {
    fieldW: fieldPx,
    fieldH: fieldPx,
    dotPx: DOT_PX,
    density: DOT_DENSITY,
    baseDisparityPx: opts.disparityPx,
    // A fresh seed per rep: the dot field must not be memorable between trials.
    seed: Math.floor(Math.random() * 0x7fffffff),
    redEye: opts.redEye,
    target: centre ? { cx: centre.cx, cy: centre.cy, sizePx, popPx: opts.popPx } : null,
  })
}

function paintFlat(
  canvas: HTMLCanvasElement,
  opts: {
    fieldPx: number
    disparityPx: number
    redEye: Settings['calibration']['redEye']
    oddPosition: 0 | 1 | 2 | 3
    neutralise: boolean
  },
): void {
  const width = Math.round(opts.fieldPx + Math.abs(opts.disparityPx) + 40)
  const height = opts.fieldPx
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const args = {
    width,
    height,
    baseDisparityPx: opts.disparityPx,
    redEye: opts.redEye,
    oddPosition: opts.oddPosition,
  }
  renderFlatFusion(ctx, args)
  if (opts.neutralise) neutraliseFlatTarget(ctx, args)
}

function flash(node: HTMLElement, color: string): void {
  node.style.boxShadow = `0 0 0 2px ${color}`
  window.setTimeout(() => {
    node.style.boxShadow = ''
  }, 140)
}

/** Re-exported for the three procedure modules, which only need the factory and this type. */
export type { Trial }
