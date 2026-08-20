import type { Settings } from '../core/types'
import type { Procedure, ProcedureContext } from './base'
import type { IntegrityTrial, ResponseKind } from '../core/integrity'
import { FatigueMonitor, createElapsedClock, visibleTimeout } from './base'
import { IntegrityMonitor, MIN_PLAUSIBLE_LATENCY_MS } from '../core/integrity'
import { planStereoField, prismDioptresToPx } from '../core/geometry'
import { rasterizeLetterMask, renderMaskedRds } from '../core/rdsMask'
import { el } from '../ui/router'

/**
 * Cyclopean Letters — experimental vergence trainer on a random-dot letter.
 *
 * The same convergence demand as the vergence procedures, but the target is a large
 * letter that exists only in the disparity field, exactly like the clinical Random
 * Dot E / TNO plates. Neither eye's image contains any letter shape; it is churning
 * speckle to each eye alone, and the letter only assembles once the two views fuse.
 * Design decisions, stated so they can be argued with:
 *
 *  1. **The answer space is the letter, not a position.** Four-position tasks give a
 *     guesser 25%; a letter drawn from a 16-strong alphabet gives ~6%, and the
 *     integrity monitor's chance test is told so. More importantly the failure mode
 *     is self-diagnosing: a user suppressing one eye sees pure noise, has nothing to
 *     type, and the honest space-bar answer they are pushed toward is itself the
 *     clinical observation.
 *
 *  2. **The dot field re-randomises continuously.** With static dots, shifting the
 *     letter region leaves a monocular silhouette at its edges — a red/blue fringe a
 *     one-eyed viewer could read, which would let the letter be answered without any
 *     fusion at all. Refreshing the field every ~120 ms buries those edge artefacts
 *     in motion: the fused viewer sees a stable letter floating in churning speckle,
 *     the monocular viewer sees only the churn. This is what makes the task honest,
 *     not a cosmetic flourish.
 *
 *  3. **One enormous, heavy letter, from a reduced alphabet.** Cyclopean form is
 *     resolved at far coarser acuity than luminance form, so the glyph fills most of
 *     the field and letters that differ only in fine detail (O/Q, I/L/J, and kin) are
 *     excluded. The task is "can you fuse it", never "can you read small print".
 *
 *  4. **Demand is crossed disparity on the whole field**, on the same adaptive
 *     ladder as the vergence procedures: small steps up on sustained trustworthy
 *     accuracy, larger steps down on misses and honest can't-sees, floor and screen
 *     ceiling respected. Positive = crossed = convergence throughout.
 *
 * No score, streak, or personal best is displayed at any point.
 */

/**
 * Confusable pairs are excluded wholesale: O/Q, I/L/J, and everything (B/D/G/M/W)
 * whose identity at coarse cyclopean acuity hangs on a detail the occlusion strips
 * can plausibly eat. 16 alternatives, so chance is 6.25%.
 */
const LETTERS = 'ACEFHKNPRSTUVXYZ'

/** Ladder bounds, in prism dioptres — same shape as the vergence procedures'. */
const FLOOR_PD = 1.5
const STEP_UP_PD = 1
const STEP_DOWN_PD = 2

/** A rep that gets no response at all is scored as "couldn't see it", never as wrong. */
const RESPONSE_TIMEOUT_MS = 12_000

/**
 * How often the dot field re-randomises while a stimulus is up. Fast enough that a
 * monocular edge artefact never persists long enough to trace, slow enough that the
 * fused letter reads as a stable object in front of boiling noise rather than flicker.
 */
const DOT_REFRESH_MS = 120

const DOT_PX = 3
const DOT_DENSITY = 0.5

/** Breathing room kept between the widest eye view and the edge of the window. */
const STAGE_GUTTER_PX = 24

/** Smallest field worth drawing on either axis — the letter needs room to be huge. */
const MIN_FIELD_PX = 200

/**
 * Consecutive honest can't-sees at the ladder floor before the prompt says plainly
 * that random-dot stereo may not be fusing for this user. There is no flat-fusion
 * fallback here — a letter that exists monocularly is a different task, not an
 * easier version of this one — so the honest exit is named instead.
 */
const SUPPRESSION_NOTE_AFTER = 5

interface Response {
  kind: ResponseKind
  letter: string | null
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

/** A short pause that survives abort — used only for the closing summary. */
function linger(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function waitForResponse(onset: number, signal: AbortSignal): Promise<Response | null> {
  return new Promise((resolve) => {
    const finish = (r: Response | null): void => {
      window.removeEventListener('keydown', onKey)
      signal.removeEventListener('abort', onAbort)
      cancelTimer()
      resolve(r)
    }

    const onKey = (e: KeyboardEvent): void => {
      if (e.repeat) return
      // Browser and OS shortcuts are not answers.
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const latencyMs = performance.now() - onset

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault()
        finish({ kind: 'cannotSee', letter: null, latencyMs })
        return
      }

      // Any letter is an answer, including ones outside the alphabet in use — typing
      // 'O' when only 16 letters can appear is a wrong answer, not a non-event.
      if (e.key.length === 1 && /[a-z]/i.test(e.key)) {
        e.preventDefault()
        finish({ kind: 'answer', letter: e.key.toUpperCase(), latencyMs })
      }
    }

    const onAbort = (): void => finish(null)

    // No answer at all is honest data, not a failure: record it as "can't see it".
    // The clock stops while the tab is hidden, so a rep the user never actually saw
    // cannot manufacture one of these.
    const cancelTimer = visibleTimeout(
      () => finish({ kind: 'cannotSee', letter: null, latencyMs: RESPONSE_TIMEOUT_MS }),
      RESPONSE_TIMEOUT_MS,
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

export const cyclopeanLetters: Procedure = {
  id: 'cyclopeanLetters',
  label: 'Cyclopean Letters',
  async run(ctx: ProcedureContext): Promise<void> {
    await runCyclopeanLetters(ctx)
  },
}

async function runCyclopeanLetters(ctx: ProcedureContext): Promise<void> {
  const { signal, settings } = ctx
  const cal = settings.calibration
  // Crossed disparity, so the convergence prescription is the relevant peak.
  const goalPd = Math.max(FLOOR_PD, settings.prescription.convergenceGoalPd)

  // --- DOM -----------------------------------------------------------------
  const stage = el('div', { class: 'stage' })
  const canvasWrap = el('div')
  const canvas = el('canvas')
  canvasWrap.append(canvas)

  const hud = el('div', { class: 'stage-hud' })
  const hudDemand = el('span')
  const hudWarning = el('span', { class: 'warn' })
  const hudClock = el('span')
  hud.append(hudDemand, hudWarning, hudClock)

  const prompt = el('div', { class: 'stage-prompt' })
  const promptMain = el('div')
  const promptNote = el('div', { class: 'muted' })
  prompt.append(promptMain, promptNote)

  stage.append(canvasWrap, hud, prompt)
  ctx.root.append(stage)

  const feedback = new Feedback()
  // 16 alternatives, so the against-chance test uses 6.25% rather than 25%.
  const monitor = new IntegrityMonitor(LETTERS.length)
  const fatigue = new FatigueMonitor()

  // --- Geometry ------------------------------------------------------------
  // Sized once for the top of the ladder, like the vergence procedures, so the two
  // eye views keep a dominant common region at every demand the ladder can reach.
  let popPx = popDisparityPx(cal)
  let field = planField(goalPd, popPx, cal)

  // Refuse to run in a window that cannot present a real demand — below the ladder
  // floor the stimulus collapses toward a flat picture and nothing is being trained.
  if (!(field.ceilingPd >= FLOOR_PD)) {
    ctx.root.append(
      el(
        'div',
        { class: 'stage-prompt' },
        'This window is too narrow to present a real convergence demand — it tops out ' +
          `below ${FLOOR_PD}Δ, which is not enough to train anything. Make the window ` +
          'wider, or move Iris to a larger display, and start again.',
      ),
    )
    await new Promise<void>((resolve) => {
      if (signal.aborted) resolve()
      else signal.addEventListener('abort', () => resolve(), { once: true })
    })
    return
  }

  const reachableGoal = (): number => Math.max(FLOOR_PD, Math.min(goalPd, field.ceilingPd))

  const onResize = (): void => {
    popPx = popDisparityPx(cal)
    field = planField(goalPd, popPx, cal)
    magnitude = Math.min(magnitude, reachableGoal())
    paintHud()
  }
  window.addEventListener('resize', onResize)

  // --- Adaptive state --------------------------------------------------------
  // Start low deliberately: the ladder should climb on evidence, not drop the user
  // straight into a demand they cannot fuse and let them guess their way through it.
  let magnitude = Math.min(reachableGoal(), Math.max(FLOOR_PD, goalPd * 0.25))
  let rep = 0
  let consecutiveCannotSee = 0
  let currentPd = 0

  /**
   * The stimulus currently on screen, kept outside the rep loop so the dot-refresh
   * loop can redraw it with a fresh seed — same letter, same disparity, new noise.
   */
  const live = {
    onScreen: false,
    letter: 'A',
    mask: null as Uint8Array | null,
    seed: 0,
  }

  /**
   * Letter masks are cached against the geometry they were rasterised for, so the
   * ~8 Hz refresh loop re-randomises dots without re-rasterising a glyph each frame.
   */
  const maskCache = new Map<string, Uint8Array | null>()
  function maskFor(letter: string): Uint8Array | null {
    const key = `${letter}:${field.widthPx}x${field.heightPx}:${popPx}`
    let mask = maskCache.get(key)
    if (mask === undefined) {
      mask = rasterizeLetterMask(letter, field.widthPx, field.heightPx, {
        // Pre-widen by the occlusion strip each depth edge will cost, so the shape
        // that fuses keeps the stroke weight the font drew.
        dilatePx: popPx / 2,
      })
      maskCache.set(key, mask)
      if (maskCache.size > 40) maskCache.clear()
    }
    return mask
  }

  function paintStimulus(): void {
    renderMaskedRds(canvas, {
      fieldW: field.widthPx,
      fieldH: field.heightPx,
      dotPx: DOT_PX,
      density: DOT_DENSITY,
      baseDisparityPx: prismDioptresToPx(currentPd, cal),
      popPx,
      mask: live.mask,
      redEye: cal.redEye,
      seed: live.seed,
    })
  }

  // --- Dynamic noise ---------------------------------------------------------
  // The refresh loop runs on rAF so it stops with the tab, and only reseeds while a
  // stimulus is actually up. See the header: this is what deletes the monocular edge
  // silhouette, so it is part of the stimulus, not decoration.
  let raf = 0
  let lastRefresh = 0
  const refreshLoop = (now: number): void => {
    if (live.onScreen && now - lastRefresh >= DOT_REFRESH_MS) {
      lastRefresh = now
      live.seed = Math.floor(Math.random() * 0x7fffffff)
      paintStimulus()
    }
    raf = requestAnimationFrame(refreshLoop)
  }
  raf = requestAnimationFrame(refreshLoop)

  /**
   * The real outcome measure: the highest demand actually held with trustworthy
   * responses, bucketed in 0.5Δ steps exactly as the vergence procedures score it.
   */
  const levelStats = new Map<number, { valid: number; correct: number }>()

  const elapsed = createElapsedClock()
  const clock = window.setInterval(() => paintClock(), 500)

  function paintClock(): void {
    hudClock.textContent = `${elapsed.format()} elapsed`
  }

  function paintHud(): void {
    hudDemand.textContent = `${currentPd.toFixed(1)}Δ crossed · letters`
    hudWarning.textContent =
      field.ceilingPd < goalPd
        ? `screen ceiling ${field.ceilingPd.toFixed(1)}Δ — below the ${goalPd.toFixed(0)}Δ goal; sit closer or use a wider display`
        : ''
  }

  const spacedLetters = LETTERS.split('').join(' ')

  function setPrompt(note = ''): void {
    promptMain.textContent =
      'Type the letter floating in the noise.  SPACE = I see only noise — that is always a good answer and never counts against you.'
    promptNote.textContent = note || `One of: ${spacedLetters}. The letter exists only when both eyes work together — no amount of squinting one-eyed can reveal it.`
  }

  paintHud()
  paintClock()
  setPrompt()

  try {
    while (!signal.aborted) {
      // --- Build the stimulus ---------------------------------------------
      const letter = LETTERS[Math.floor(Math.random() * LETTERS.length)] ?? 'A'
      currentPd = Math.min(magnitude, field.ceilingPd)
      paintHud()

      live.letter = letter
      live.mask = maskFor(letter)
      live.seed = Math.floor(Math.random() * 0x7fffffff)
      paintStimulus()
      live.onScreen = true
      lastRefresh = performance.now()

      const onset = await afterPaint(signal)
      if (signal.aborted) break

      const response = await waitForResponse(onset, signal)
      live.onScreen = false
      if (!response) break

      // --- Score ------------------------------------------------------------
      const anticipated =
        response.kind === 'answer' && response.latencyMs < MIN_PLAUSIBLE_LATENCY_MS

      let correct: boolean
      if (response.kind === 'cannotSee') {
        // Honest, never punished — it only lowers the demand.
        correct = false
      } else if (anticipated) {
        // Below the floor for a fused percept plus a keypress, so it cannot be
        // evidence that this letter was actually seen.
        correct = false
      } else {
        correct = response.letter === letter
      }

      const trial: IntegrityTrial = {
        index: rep,
        demand: currentPd,
        correct,
        latencyMs: Math.round(response.latencyMs),
        isCatch: false,
        kind: response.kind,
      }
      monitor.push(trial)
      fatigue.push(trial)
      ctx.onTrial(trial)

      if (response.kind === 'answer' && !anticipated) {
        const key = Math.round(currentPd * 2) / 2
        const bucket = levelStats.get(key) ?? { valid: 0, correct: 0 }
        bucket.valid += 1
        if (correct) bucket.correct += 1
        levelStats.set(key, bucket)
      }

      // --- Feedback ---------------------------------------------------------
      if (response.kind === 'cannotSee') {
        consecutiveCannotSee += 1
        feedback.tone('neutral')
        flash(canvasWrap, 'var(--accent-dim)')
        const atFloor = magnitude <= FLOOR_PD + 0.01
        setPrompt(
          atFloor && consecutiveCannotSee >= SUPPRESSION_NOTE_AFTER
            ? 'Still only noise at the gentlest demand. That usually means the random dots are not fusing for you today — suppression or fatigue, not effort. Convergence has simpler targets; this exercise will still be here.'
            : 'Noted. Dropping the demand.',
        )
      } else {
        consecutiveCannotSee = 0
        if (anticipated) {
          feedback.tone('neutral')
          flash(canvasWrap, 'var(--warn)')
          setPrompt('That arrived before the letter could resolve. Wait for it to float clear of the noise.')
        } else if (correct) {
          feedback.tone('correct')
          flash(canvasWrap, 'var(--good)')
          setPrompt()
        } else {
          feedback.tone('incorrect')
          flash(canvasWrap, 'var(--bad)')
          setPrompt()
        }
      }

      // --- Adaptive demand ----------------------------------------------------
      // Driven by the integrity monitor rather than raw accuracy — although with 16
      // alternatives a guesser floors at 6%, so accuracy and honesty mostly agree here.
      const recommendation = monitor.recommendation()
      if (response.kind === 'cannotSee') {
        magnitude = Math.max(FLOOR_PD, magnitude - STEP_DOWN_PD)
      } else if (recommendation === 'increase' && !monitor.verdict().atChance) {
        magnitude = Math.min(reachableGoal(), magnitude + STEP_UP_PD)
      } else if (recommendation === 'decrease') {
        magnitude = Math.max(FLOOR_PD, magnitude - STEP_DOWN_PD)
      }

      rep += 1

      // --- Fatigue -------------------------------------------------------------
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
    cancelAnimationFrame(raf)
    window.clearInterval(clock)
    elapsed.dispose()
    window.removeEventListener('resize', onResize)
    feedback.close()
    stage.remove()
  }

  /**
   * Shown once, at the end: the demand held honestly, not a score. Nothing here is
   * a personal best and nothing accumulates across sessions.
   */
  async function showSummary(): Promise<void> {
    // An abort mid-rep can leave the stimulus flagged live; stop the refresh loop
    // redrawing behind the summary.
    live.onScreen = false
    const verdict = monitor.verdict()
    let sustained = 0
    for (const [pd, s] of levelStats) {
      if (s.valid >= 3 && s.correct / s.valid >= 0.75 && pd > sustained) sustained = pd
    }

    canvasWrap.style.display = 'none'
    hudDemand.textContent = ''
    hudWarning.textContent = ''

    promptMain.textContent =
      sustained > 0
        ? `Highest demand you read letters through with trustworthy responses: ${sustained.toFixed(1)}Δ`
        : 'No demand level had enough trustworthy responses to score. With letters that only exist in fused depth, that usually means the dots were not fusing — a result worth knowing, not a failure.'
    promptNote.textContent = verdict.trustworthy ? '' : verdict.notes.join(' ')
    await linger(2400)
  }
}

// --- Geometry helpers --------------------------------------------------------

interface FieldPlan {
  widthPx: number
  heightPx: number
  /** Highest demand this field can present, in Δ. */
  ceilingPd: number
}

/** Vertical room the field may use, after the HUD and the prompt take their bands. */
function usableHeightPx(): number {
  return Math.max(160, Math.round(window.innerHeight * 0.62))
}

/**
 * Same construction as the vergence engine's field plan: width is a stereo
 * constraint (the two eye views must keep a dominant common region at the peak
 * demand), height just follows toward a square, which is also the shape that gives
 * the letter the most room.
 */
function planField(goalPd: number, popPx: number, cal: Settings['calibration']): FieldPlan {
  const plan = planStereoField({
    usableWidthPx: Math.max(0, window.innerWidth - 2 * STAGE_GUTTER_PX),
    minFieldWidthPx: MIN_FIELD_PX,
    // Everything renderMaskedRds adds to the canvas beyond `field + disparity`:
    // the target's excursion, a dot of slack each side, and a pixel of rounding.
    extraPx: popPx + 2 * DOT_PX + 2,
    goalPd,
    cal,
  })
  const heightPx = Math.max(MIN_FIELD_PX, Math.min(plan.fieldWidthPx, usableHeightPx()))
  return { widthPx: plan.fieldWidthPx, heightPx, ceilingPd: plan.ceilingPd }
}

/**
 * Stereo depth of the letter relative to the field. Half a prism dioptre is a large,
 * unambiguous float — the base vergence demand is the difficulty being trained, so
 * the letter's own pop should never be the limiting factor.
 */
function popDisparityPx(cal: Settings['calibration']): number {
  return Math.max(6, Math.min(20, Math.round(prismDioptresToPx(0.5, cal))))
}

function flash(node: HTMLElement, color: string): void {
  node.style.boxShadow = `0 0 0 2px ${color}`
  window.setTimeout(() => {
    node.style.boxShadow = ''
  }, 140)
}
