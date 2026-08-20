import type { Prescription, Settings, Trial } from '../core/types'
import type { Procedure, ProcedureContext } from './base'
import type { ProcedureId } from '../core/types'
import type { IntegrityTrial, ResponseKind } from '../core/integrity'
import { FatigueMonitor, createElapsedClock, visibleTimeout } from './base'
import { CATCH_TRIAL_RATE, IntegrityMonitor, MIN_PLAUSIBLE_LATENCY_MS } from '../core/integrity'
import { planStereoField, prismDioptresToPx } from '../core/geometry'
import { renderFlatFusion, renderRds } from '../core/anaglyph'
import { createStagePlacement, loadStoredScale, saveStoredScale } from './stagePlacement'
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

/** Breathing room kept between the widest eye view and the edge of the window. */
const STAGE_GUTTER_PX = 24

/**
 * One target-size scale for the whole vergence family: the engine is shared and
 * the size is a property of the screen and the chair, not of the demand schedule.
 */
const SIZE_SCALE_KEY = 'iris.vergenceSizeScale.v1'

/** Smallest field worth drawing on either axis — below this the dots stop being a field. */
const MIN_FIELD_PX = 160

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
      cancelTimer()
      resolve(r)
    }

    const onKey = (e: KeyboardEvent): void => {
      if (e.repeat) return
      // Keystrokes aimed at a control on the stage — the advanced-mode demand slider —
      // are not answers. Without this, nudging the slider with the arrow keys would
      // also log a direction response the user never intended to give.
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

    // No answer at all is honest data, not a failure: record it as "can't see it".
    // The clock stops while the tab is hidden, so a rep the user never actually saw
    // cannot manufacture one of these.
    const cancelTimer = visibleTimeout(
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

/**
 * Advanced-mode control that sets the demand magnitude by hand.
 *
 * Only the three disparity-vergence procedures get one, because only they have a
 * demand that is a continuous physical quantity — prism dioptres, bounded above by
 * what this screen and viewing distance can honestly display. It is deliberately
 * quiet chrome in the corner of the stage: available, never the point.
 *
 * Two rules make it safe to expose at all:
 *
 *  1. **Moving it suspends the staircase for the rest of the run**, not just for the
 *     next rep. A ladder that resumed from a hand-set level would carry that level
 *     forward as its own starting point and then report a threshold it never actually
 *     found — the contamination would outlive the reps that are marked. A one-rep
 *     suspension is also incoherent from the user's side: the ladder would drag the
 *     demand off whatever they set, so they would keep re-setting it and the run would
 *     end up an uninterpretable mixture. Taking the wheel is therefore a decision for
 *     the exercise, and the copy below says so before the first move and after it.
 *  2. **Every trial from that point carries `manualDemand`**, and none of them feed
 *     the "highest demand held" figure. A demand you chose is not evidence you can
 *     hold it.
 *
 * The slider is live: every drag repaints the stimulus that is on screen right now
 * at the new demand, same dot field and same target, so the effect is visible
 * immediately rather than one rep late. A rep whose demand was changed mid-flight
 * is marked `manualDemand` — the answer that follows was made against a demand the
 * user chose, whatever the ladder thought at onset.
 *
 * The "keep the ladder running" checkbox is the sanctioned way back to automatic.
 * With it checked, a drag re-seeds rather than takes over: the demand jumps to the
 * hand-set level and the ladder resumes adapting from there on the next rep. This
 * stays honest because a level only ever counts toward the headline figure after
 * three trustworthy correct answers at it — seeding the ladder at a level is not
 * the same as holding it. Checking the box while the ladder is already suspended
 * releases it from the current level.
 */
interface ManualDemand {
  node: HTMLElement
  /** True while the slider has taken over and the ladder is suspended. */
  engaged(): boolean
  magnitudePd(): number
  /** Re-bound to a new screen ceiling after a resize, clamping the current value. */
  setCeiling(ceilingPd: number): void
  /** Track the staircase while it is still in charge, so the slider reads true. */
  followLadder(magnitudePd: number): void
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value))
}

function createManualDemand(opts: {
  floorPd: number
  ceilingPd: number
  startPd: number
  /** Fired on every drag, with the new magnitude. The run repaints live from here. */
  onSet(magnitudePd: number): void
}): ManualDemand {
  let engaged = false
  let autoRun = false
  // A slider whose ends meet cannot be moved, so the ceiling is never the floor.
  let ceilingPd = Math.max(opts.floorPd + STEP_UP_PD, opts.ceilingPd)
  let magnitudePd = clamp(opts.startPd, opts.floorPd, ceilingPd)

  const node = el('div')
  node.style.cssText =
    'position:fixed;left:16px;bottom:14px;width:212px;padding:10px 12px;' +
    'border:1px solid var(--border);border-radius:8px;background:var(--bg-raised);' +
    'font-size:12px;color:var(--text-dim);z-index:20'

  const header = el('div')
  header.style.cssText =
    'display:flex;justify-content:space-between;gap:8px;font-family:var(--mono);margin-bottom:6px'
  const value = el('span')
  value.style.color = 'var(--text)'
  header.append(el('span', {}, 'manual demand'), value)

  const slider = el('input', {
    type: 'range',
    min: String(opts.floorPd),
    max: String(ceilingPd),
    // Matches the 0.5Δ buckets the run scores levels in, so the slider cannot land
    // between two of them.
    step: '0.5',
    value: String(magnitudePd),
  })
  slider.style.cssText = 'width:100%;margin:0;display:block'

  const autoBox = el('input', { type: 'checkbox' })
  const autoRow = el('label')
  autoRow.style.cssText =
    'display:flex;gap:6px;align-items:center;margin-top:6px;cursor:pointer'
  autoRow.append(autoBox, el('span', {}, 'keep the ladder running'))

  const note = el('div')
  note.style.cssText = 'margin-top:6px;line-height:1.45'

  node.append(header, slider, autoRow, note)

  function paint(): void {
    value.textContent = `${magnitudePd.toFixed(1)}Δ`
    note.textContent = engaged
      ? 'Hand-set. The adaptive ladder is off for the rest of this exercise, and these reps are marked — they do not count toward the demand you held.'
      : autoRun
        ? 'Ladder on. Dragging changes the demand on screen immediately and the ladder adapts from there; reps you adjusted are marked.'
        : `Advanced mode. Drag to set the demand yourself, up to this screen’s ${ceilingPd.toFixed(1)}Δ ceiling. Doing so stops the adaptive ladder for the rest of this exercise.`
  }

  slider.addEventListener('input', () => {
    const next = Number(slider.value)
    if (!Number.isFinite(next)) return
    magnitudePd = clamp(next, opts.floorPd, ceilingPd)
    if (!autoRun) engaged = true
    paint()
    opts.onSet(magnitudePd)
  })

  // The arrow keys are the answer channel. A slider that kept focus after being
  // dragged would quietly eat every answer that followed, so it lets go on commit.
  slider.addEventListener('change', () => slider.blur())

  autoBox.addEventListener('change', () => {
    autoRun = autoBox.checked
    // Release a suspended ladder: it resumes from the level currently held.
    if (autoRun && engaged) engaged = false
    // Same reason as the slider: space is the answer channel, and a focused
    // checkbox would swallow it as a toggle instead.
    autoBox.blur()
    paint()
  })

  paint()

  return {
    node,
    engaged: () => engaged,
    magnitudePd: () => magnitudePd,
    setCeiling(next) {
      ceilingPd = Math.max(opts.floorPd + STEP_UP_PD, next)
      magnitudePd = clamp(magnitudePd, opts.floorPd, ceilingPd)
      slider.max = String(ceilingPd)
      slider.value = String(magnitudePd)
      paint()
    },
    followLadder(next) {
      if (engaged) return
      magnitudePd = clamp(next, opts.floorPd, ceilingPd)
      slider.value = String(magnitudePd)
      paint()
    },
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

  // Size control for the target square, mirroring Rock's slider. Bottom-right,
  // because the advanced-mode demand panel already owns the bottom-left corner.
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
  const controlsWrap = el('div')
  controlsWrap.style.cssText =
    'position:fixed;right:18px;bottom:16px;display:flex;align-items:center;gap:14px;' +
    'font-size:12px;color:#6d7886;z-index:1'
  controlsWrap.append(sizeLabel)

  stage.append(canvasWrap, restDot, hud, prompt, controlsWrap)
  ctx.root.append(stage)

  const feedback = new Feedback()
  const monitor = new IntegrityMonitor(4)
  const fatigue = new FatigueMonitor()

  // --- Geometry ------------------------------------------------------------
  // The field is sized once, for the top of this procedure's ladder, so that the two
  // eye views keep a dominant common region at every demand the ladder can reach.
  let popPx = popDisparityPx(cal)
  let field = planField(goalPd, popPx, cal)

  /*
   * Refuse to run in a window that cannot present a real demand.
   *
   * Below the ladder floor there is nothing to train: the stimulus collapses toward
   * zero disparity, which is a flat picture, and the exercise would still count reps
   * and report a level as though something had happened. A too-small window is also
   * the one case where the honest advice is to change the window rather than to sit
   * closer, so the usual ceiling warning reads as nonsense here.
   */
  if (!(field.ceilingPd >= FLOOR_PD)) {
    ctx.root.append(
      el(
        'div',
        { class: 'stage-prompt' },
        `This window is too narrow to present a real ${spec.label.toLowerCase()} demand — ` +
          `it tops out below ${FLOOR_PD}Δ, which is not enough to train anything. ` +
          'Make the window wider, or move Iris to a larger display, and start again.',
      ),
    )
    await new Promise<void>((resolve) => {
      if (ctx.signal.aborted) resolve()
      else ctx.signal.addEventListener('abort', () => resolve(), { once: true })
    })
    return
  }

  const onResize = (): void => {
    popPx = popDisparityPx(cal)
    field = planField(goalPd, popPx, cal)
    manual?.setCeiling(field.ceilingPd)
    // A hand-set demand answers only to the screen ceiling; the ladder also answers
    // to the prescribed goal.
    magnitude = Math.min(
      magnitude,
      manual?.engaged() === true ? Math.max(FLOOR_PD, field.ceilingPd) : reachableGoal(),
    )
    placement.apply()
    paintHud()
  }
  window.addEventListener('resize', onResize)

  const reachableGoal = (): number => Math.max(FLOOR_PD, Math.min(goalPd, field.ceilingPd))

  const placement = createStagePlacement({
    procedureId: spec.id,
    stage,
    target: canvasWrap,
    // Vergence targets can roam: the fusional demand is carried by disparity, not
    // by where the field sits on the screen.
    maxFraction: 0.4,
    downBias: true,
    elemSize: () => ({ w: canvas.width, h: canvas.height }),
    // A jitter change resizes the target; if one is on screen it must follow now.
    onChange: () => {
      if (live.onScreen) paintStimulus()
    },
  })
  controlsWrap.append(placement.autoToggle)

  /** The slider's scale, wobbled by auto mode, still bounded by the slider's range. */
  const targetScale = (): number =>
    Math.min(2, Math.max(0.5, sizeScale * placement.sizeJitter()))

  sizeSlider.addEventListener('input', () => {
    sizeScale = Number(sizeSlider.value) || 1
    saveStoredScale(SIZE_SCALE_KEY, sizeScale)
    if (live.onScreen) paintStimulus()
  })
  // Same reason as the demand slider: a control that kept focus would eat answers.
  sizeSlider.addEventListener('change', () => sizeSlider.blur())

  // --- Adaptive state ------------------------------------------------------
  // Start low deliberately: the ladder should climb on evidence, not drop the user
  // straight into a demand they cannot fuse and let them guess their way through it.
  let magnitude = Math.min(reachableGoal(), Math.max(FLOOR_PD, goalPd * 0.25))
  let rep = 0
  let consecutiveCannotSee = 0
  let mode: 'rds' | 'flat' = 'rds'
  let currentSignedPd = 0

  /** Did any rep in this run run on a hand-set demand? Only affects the summary. */
  let everManual = false
  /** Did the slider ever latch and suspend the ladder (as opposed to re-seeding it)? */
  let everLatched = false

  /**
   * The stimulus currently on screen, kept outside the rep loop so a slider drag can
   * repaint it at the new demand immediately — same seed, same target, new disparity.
   * Without this the drag only lands on the next rep, which reads as a dead control.
   */
  const live = {
    onScreen: false,
    isCatch: false,
    direction: 'up' as Direction,
    dirIndex: 0 as 0 | 1 | 2 | 3,
    seed: 0,
    /** The demand under the current stimulus was changed by hand mid-rep. */
    handSet: false,
    /** A drag landed between reps; the next rep runs on it and must be marked. */
    pendingMark: false,
  }

  /** Draws the current stimulus at the current magnitude. Safe to call mid-rep. */
  function paintStimulus(): void {
    const requested = spec.signedDemandPd(rep, magnitude, settings.prescription)
    currentSignedPd = Math.sign(requested) * Math.min(Math.abs(requested), field.ceilingPd)
    paintHud()
    const disparityPx = prismDioptresToPx(currentSignedPd, cal)
    if (mode === 'rds') {
      paintRds(canvas, {
        fieldW: field.widthPx,
        fieldH: field.heightPx,
        disparityPx,
        popPx,
        redEye: cal.redEye,
        target: live.isCatch ? null : live.direction,
        seed: live.seed,
        scale: targetScale(),
      })
    } else {
      paintFlat(canvas, {
        // The flat canvas is not the stereo field, so its size is free to follow
        // the slider; the disparity it carries is unchanged.
        fieldPx: Math.max(
          120,
          Math.min(usableHeightPx(), Math.round(field.heightPx * targetScale())),
        ),
        disparityPx,
        redEye: cal.redEye,
        oddPosition: live.dirIndex,
        neutralise: live.isCatch,
      })
    }
    // The canvas may have changed size, so the offset re-clamps against it.
    placement.apply()
  }

  // Present only in advanced mode. Off by default, and never turned on for the user.
  const manual: ManualDemand | null = settings.advancedMode
    ? createManualDemand({
        floorPd: FLOOR_PD,
        ceilingPd: field.ceilingPd,
        startPd: magnitude,
        onSet(pd) {
          magnitude = clamp(pd, FLOOR_PD, Math.max(FLOOR_PD, field.ceilingPd))
          if (!live.onScreen) {
            // Mid-rest drag: nothing to repaint, but the rep it lands on is still
            // a demand the user chose, so it must carry the mark.
            live.pendingMark = true
            return
          }
          live.handSet = true
          everManual = true
          paintStimulus()
        },
      })
    : null
  if (manual) stage.append(manual.node)

  /**
   * The real outcome measure: the highest demand the user actually held with
   * trustworthy responses. A raw peak demand is meaningless if it was reached by
   * guessing, so a level only counts once it has enough non-anticipatory, correct
   * answers behind it.
   */
  const levelStats = new Map<number, { valid: number; correct: number }>()

  const elapsed = createElapsedClock()
  const clock = window.setInterval(() => paintClock(), 500)

  function paintClock(): void {
    hudClock.textContent = `${elapsed.format()} elapsed`
  }

  function paintHud(): void {
    const sense = currentSignedPd >= 0 ? 'crossed' : 'uncrossed'
    // Say it in the HUD too, not only next to the slider: what the demand is and
    // where it came from are the same fact.
    const source = manual?.engaged() === true || live.handSet ? ' · hand-set' : ''
    hudDemand.textContent = `${Math.abs(currentSignedPd).toFixed(1)}Δ ${sense}${source}`
    // HTS lets you fail forever at a demand your screen physically cannot display.
    hudWarning.textContent =
      field.ceilingPd < goalPd
        ? `screen ceiling ${field.ceilingPd.toFixed(1)}Δ — below the ${goalPd.toFixed(0)}Δ goal; sit closer or use a wider display`
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

      // Auto relocation lands here — after the previous answer was scored, before
      // the next target exists — so a jump can never move a target mid-judgement.
      if (placement.jumpDue()) placement.jump()

      // --- Build the stimulus --------------------------------------------
      // Catch trials contain no fusible target at all. They are the only way to tell
      // a user who is fusing from a user who is producing plausible-looking keypresses:
      // a guesser answers a direction here, an honest observer presses space.
      // CATCH_TRIAL_RATE is currently 0, so `isCatch` is always false and every branch
      // below that depends on it is dormant rather than dead. The code stays so that
      // restoring catch trials is a one-line change to that rate.
      const isCatch = Math.random() < CATCH_TRIAL_RATE
      const dirIndex = Math.floor(Math.random() * DIRECTIONS.length)
      const direction = DIRECTIONS[dirIndex] ?? 'up'

      // Where this rep's magnitude comes from. A latched slider is the only source
      // for the rest of the run; otherwise the slider mirrors the ladder. Mid-rep
      // drags land through `paintStimulus` and mark the rep via `live.handSet`.
      let handSet = false
      if (manual) {
        if (manual.engaged()) {
          magnitude = Math.min(manual.magnitudePd(), field.ceilingPd)
          handSet = true
          everLatched = true
        } else {
          manual.followLadder(magnitude)
        }
      }
      if (live.pendingMark) {
        handSet = true
        live.pendingMark = false
      }
      if (handSet) everManual = true

      live.isCatch = isCatch
      live.direction = direction
      live.dirIndex = dirIndex as 0 | 1 | 2 | 3
      // A fresh seed per rep: the dot field must not be memorable between trials.
      // Held for the rep so a live repaint changes the disparity and nothing else.
      live.seed = Math.floor(Math.random() * 0x7fffffff)
      live.handSet = false
      paintStimulus()
      live.onScreen = true

      const onset = await afterPaint(signal)
      if (signal.aborted) break

      const response = await waitForResponse(onset, signal)
      live.onScreen = false
      if (!response) break

      // A drag during the rep makes it hand-set regardless of how it started.
      handSet = handSet || live.handSet

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
        // The demand on screen when the answer arrived — a live drag mid-rep means
        // this can differ from the demand at onset, and the on-screen one is the
        // one the response was actually made against.
        demand: currentSignedPd,
        correct,
        latencyMs: Math.round(response.latencyMs),
        isCatch,
        kind: response.kind,
        ...(handSet ? { manualDemand: true } : {}),
      }
      monitor.push(trial)
      fatigue.push(trial)
      // Forward the whole trial, not a hand-picked subset. The earlier version
      // rebuilt it field by field and silently dropped `kind` and `isCatch`, which
      // the results screen needs: it counts attempted reps by `kind === 'answer'`,
      // so every vergence procedure was reporting zero valid trials no matter how
      // the session actually went. `IntegrityTrial` extends `Trial`, so there is no
      // reason to copy fields across by hand.
      ctx.onTrial(trial)
      placement.answered()

      // Hand-set reps are recorded but never scored as a level held: the metric they
      // would feed exists to say the staircase found the demand, which it did not.
      if (!handSet && !isCatch && response.kind === 'answer' && !anticipated) {
        const key = Math.round(Math.abs(currentSignedPd) * 2) / 2
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
      //
      // Skipped on any hand-set rep. While the slider is latched, the ladder must not
      // go on moving underneath a demand the user is holding fixed — it would either
      // fight the slider or, worse, carry the hand-set level forward as its own and
      // report it later as a level it found. On a re-seed rep ("keep the ladder
      // running") the skip is one rep long: the ladder resumes from the seeded level
      // on the next rep, which is exactly what the checkbox promises.
      if (!handSet) {
        const recommendation = monitor.recommendation()
        if (response.kind === 'cannotSee' && !isCatch) {
          magnitude = Math.max(FLOOR_PD, magnitude - STEP_DOWN_PD)
        } else if (recommendation === 'increase' && !monitor.verdict().atChance) {
          magnitude = Math.min(reachableGoal(), magnitude + STEP_UP_PD)
        } else if (recommendation === 'decrease') {
          magnitude = Math.max(FLOOR_PD, magnitude - STEP_DOWN_PD)
        }
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
    elapsed.dispose()
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
    controlsWrap.style.display = 'none'
    if (manual) manual.node.style.display = 'none'

    promptMain.textContent =
      sustained > 0
        ? `Highest demand you held with trustworthy responses: ${sustained.toFixed(1)}Δ`
        : 'No demand level had enough trustworthy responses to score. That is a result, not a failure.'

    const notes = verdict.trustworthy ? [] : [...verdict.notes]
    if (everLatched) {
      notes.push(
        'You set the demand by hand for part of this run. Those reps are recorded and marked, but excluded from the figure above — it only means anything when the ladder found the level.',
      )
    } else if (everManual) {
      notes.push(
        'You re-seeded the ladder by hand during this run. The hand-set reps themselves are marked and excluded, but the levels the ladder then confirmed count as normal.',
      )
    }
    promptNote.textContent = notes.join(' ')
    await linger(everManual ? 3200 : 2200)
  }
}

// --- Rendering helpers -----------------------------------------------------

interface FieldPlan {
  widthPx: number
  heightPx: number
  /** Highest demand this field can present, in Δ. */
  ceilingPd: number
}

/** Vertical room the field may use, after the HUD and the prompt take their bands. */
function usableHeightPx(): number {
  return Math.max(120, Math.round(window.innerHeight * 0.62))
}

/**
 * Width, unlike height, is a stereo constraint rather than a taste decision.
 *
 * The whole field is drawn twice, shifted by ±disparity/2, so a field that is merely
 * "a nice size" pulls apart into two barely-overlapping halves as the demand climbs —
 * mostly monocular, which drives rivalry instead of fusion. `planStereoField` sizes it
 * against the peak disparity instead and reports what that leaves reachable.
 *
 * Height is then free to follow, because disparity is purely horizontal and height has
 * no bearing on how much of the two eye views overlap. So it simply tracks the width:
 * a square field is the neutral shape, and it is roughly the shape of a real vectogram
 * target. Pinning it to a fixed cap instead — which is what it used to do — made the
 * aspect ratio run away with the goal, since only the width grew: a 35Δ goal on a
 * 1440px viewport produced a 3.2:1 letterbox.
 *
 * Where a square does not fit vertically, the field letterboxes rather than giving
 * width back. Width is load-bearing and height is not, so a short wide field is a
 * cosmetic compromise while a narrow one is a broken stimulus.
 */
function planField(
  goalPd: number,
  popPx: number,
  cal: Settings['calibration'],
): FieldPlan {
  const plan = planStereoField({
    usableWidthPx: Math.max(0, window.innerWidth - 2 * STAGE_GUTTER_PX),
    // Never narrower than the shortest field we would draw, however shallow the goal.
    minFieldWidthPx: MIN_FIELD_PX,
    // Everything renderRds adds to the canvas apart from the base disparity itself:
    // the target's excursion, a dot of slack each side, and a pixel of rounding.
    extraPx: popPx + 2 * DOT_PX + 2,
    goalPd,
    cal,
  })
  const heightPx = Math.max(
    MIN_FIELD_PX,
    Math.min(plan.fieldWidthPx, usableHeightPx()),
  )
  return { widthPx: plan.fieldWidthPx, heightPx, ceilingPd: plan.ceilingPd }
}

/**
 * Stereo depth of the target relative to the field. Half a prism dioptre is a large,
 * unambiguous float — this task is about the *base* vergence demand, so the target
 * itself should never be the limiting difficulty.
 */
function popDisparityPx(cal: Settings['calibration']): number {
  return Math.max(6, Math.min(20, Math.round(prismDioptresToPx(0.5, cal))))
}

function paintRds(
  canvas: HTMLCanvasElement,
  opts: {
    fieldW: number
    fieldH: number
    disparityPx: number
    popPx: number
    redEye: Settings['calibration']['redEye']
    target: Direction | null
    seed: number
    scale: number
  },
): void {
  const { fieldW, fieldH } = opts
  // The four positions are scaled by the field's height and clustered around its
  // centre. The field is far wider than it is tall, so a target laid out against the
  // width would drift out towards the wings, where only one eye has field content.
  const offset = fieldH * 0.26
  // The user's size scale moves only the square, never `offset`: pushing the four
  // positions outward would send them toward the wings the comment above avoids.
  // At the slider's 2× ceiling the square still fits inside the field's height.
  const sizePx = Math.max(24, Math.round(fieldH * 0.18 * opts.scale))
  const cx = fieldW / 2
  const cy = fieldH / 2

  const centres: Record<Direction, { cx: number; cy: number }> = {
    up: { cx, cy: cy - offset },
    down: { cx, cy: cy + offset },
    left: { cx: cx - offset, cy },
    right: { cx: cx + offset, cy },
  }
  const centre = opts.target ? centres[opts.target] : null

  renderRds(canvas, {
    fieldW,
    fieldH,
    dotPx: DOT_PX,
    density: DOT_DENSITY,
    baseDisparityPx: opts.disparityPx,
    // Owned by the rep loop: fresh per rep so the dot field is not memorable
    // between trials, held within a rep so a live repaint only moves disparity.
    seed: opts.seed,
    redEye: opts.redEye,
    target: centre
      ? {
          cx: centre.cx,
          cy: centre.cy,
          sizePx,
          // Widened by the pop disparity so that what fuses is a square rather than
          // a vertical rectangle: the occlusion strips at each depth edge eat
          // `popPx / 2` off the width and nothing off the height.
          widthPx: sizePx + opts.popPx,
          popPx: opts.popPx,
        }
      : null,
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
