import type { Calibration, EyeSide } from '../core/types'
import type { Procedure, ProcedureContext } from './base'
import { createElapsedClock } from './base'
import { prismDioptresToPx } from '../core/geometry'
import {
  clampDepthCinemaSettings,
  DEPTH_CINEMA_MAX_CONVERGENCE_PD,
  depthCinemaDivergenceLimit,
} from '../core/depthCinemaSafety'
import { el } from '../ui/router'

/**
 * Depth Cinema — an experimental, passive animated vergence exercise.
 *
 * This is deliberately separate from the scored convergence and divergence
 * staircases. There is no answer channel and no threshold claim: it is a short
 * binocular animation whose main subject ramps smoothly from relaxed fusion to a
 * user-configured demand. Secondary layers use fractions of that disparity, which
 * makes the scene feel spatial without pretending every object is at the headline Δ.
 */

const RED = '#ff2b2b'
const BLUE = '#2b6bff'
const RELAX_FRACTION = 0.35
const ASSUMED_IPD_CM = 6.3
const CM_PER_INCH = 2.54
const BACKMOST_SCENE_DEPTH = 0.12

interface Star {
  x: number
  y: number
  size: number
  depth: number
  phase: number
}

interface MovingArrow {
  xPhase: number
  yPhase: number
  depthPhase: number
  directionPhase: number
  speed: number
}

interface SceneAttractor {
  /** Normalized canvas coordinates so the attractor survives resizes/fullscreen. */
  x: number
  y: number
  /** Eased pull strength; kept below 1 so the arrows retain their own motion. */
  strength: number
}

const STARS: Star[] = Array.from({ length: 46 }, (_, i) => ({
  x: ((i * 73 + 31) % 997) / 997,
  y: ((i * 137 + 59) % 991) / 991,
  size: 0.7 + ((i * 17) % 9) / 7,
  depth: 0.12 + ((i * 29) % 55) / 100,
  phase: (i * 1.618) % (Math.PI * 2),
}))

const MOVING_ARROWS: MovingArrow[] = [
  { xPhase: 0.05, yPhase: 0.36, depthPhase: 0.12, directionPhase: 0.2, speed: 0.72 },
  { xPhase: 0.61, yPhase: 0.08, depthPhase: 0.58, directionPhase: 0.7, speed: 0.49 },
  { xPhase: 0.31, yPhase: 0.75, depthPhase: 0.87, directionPhase: 0.42, speed: 0.91 },
]

export const depthCinema: Procedure = {
  id: 'depthCinema',
  label: 'Depth Cinema',
  async run(ctx: ProcedureContext): Promise<void> {
    await runDepthCinema(ctx)
  },
}

async function runDepthCinema(ctx: ProcedureContext): Promise<void> {
  const { settings, signal } = ctx
  const config = clampDepthCinemaSettings(
    settings.depthCinema,
    settings.calibration.viewingDistanceCm,
  )
  const cal = settings.calibration
  const sign = config.direction === 'convergence' ? 1 : -1
  const requestedPeak =
    config.direction === 'convergence' ? config.convergencePeakPd : config.divergencePeakPd
  const maximumPeak =
    config.direction === 'convergence'
      ? DEPTH_CINEMA_MAX_CONVERGENCE_PD
      : depthCinemaDivergenceLimit(cal.viewingDistanceCm)
  const targetPeakPd = Math.min(maximumPeak, Math.max(0.5, requestedPeak))

  const stage = el('div', { class: 'stage cinema-stage' })
  const frame = el('div', { class: 'cinema-frame' })
  const canvas = el('canvas')
  frame.append(canvas)

  const hud = el('div', { class: 'stage-hud' })
  const hudDemand = el('span')
  const hudDistance = el('span')
  const hudDirection = el('span')
  const hudClock = el('span')
  hud.append(hudDemand, hudDistance, hudDirection, hudClock)

  const prompt = el(
    'div',
    { class: 'stage-prompt cinema-prompt' },
    'Keep the arrows single and clear; click to gently gather them. Stop immediately for doubling, pain, headache, nausea, or dizziness. Look far away; if double vision remains, get an eye exam before continuing.',
  )

  const speedInput = el('input', {
    type: 'range',
    min: '0.05',
    max: '1.5',
    step: '0.01',
    value: '0.5',
  })
  speedInput.setAttribute('aria-label', 'Movie speed')
  const speedValue = el('span', { class: 'cinema-control-value' }, '0.50×')
  const depthInput = el('input', {
    type: 'range',
    min: '0',
    max: String(targetPeakPd),
    step: '0.1',
    value: '0',
  })
  depthInput.setAttribute('aria-label', 'Current automatic depth')
  const depthValue = el('span', { class: 'cinema-control-value' }, '0.0Δ')
  const arrowsInput = el('input', {
    type: 'range',
    min: '0',
    max: '4',
    step: '1',
    value: String(config.movingArrowCount),
  })
  arrowsInput.setAttribute('aria-label', 'Moving arrows')
  const arrowsValue = el('span', { class: 'cinema-control-value' }, String(config.movingArrowCount))
  const depthRangeInput = el('input', {
    type: 'range',
    min: '0',
    max: '15',
    step: '0.1',
    value: '2.5',
  })
  depthRangeInput.setAttribute('aria-label', 'Scene depth range in inches')
  depthRangeInput.setAttribute('aria-valuetext', '2.5 inches')
  const depthRangeValue = el('span', { class: 'cinema-control-value' }, '2.5 in')
  const speedName = cinemaControlName('[  ]', 'speed')
  const depthName = cinemaControlName('−  +', 'current depth')
  const arrowsName = cinemaControlName(',  .', 'arrows')
  const depthRangeName = cinemaControlName(';  ’', 'depth range')
  const motionLabel = el('span', { class: 'cinema-action-label' }, 'Pause motion')
  const depthLabel = el('span', { class: 'cinema-action-label' }, 'Hold depth')
  const reverseLabel = el('span', { class: 'cinema-action-label' }, 'Reverse depth')
  const fullscreenLabel = el('span', { class: 'cinema-action-label' }, 'Fullscreen')
  const motionButton = cinemaAction('M', motionLabel)
  const depthButton = cinemaAction('H', depthLabel)
  const reverseButton = cinemaAction('R', reverseLabel)
  const fullscreenButton = cinemaAction('F', fullscreenLabel)
  const movieControls = el(
    'div',
    { class: 'cinema-controls' },
    el(
      'label',
      { class: 'cinema-control' },
      speedName,
      speedInput,
      speedValue,
    ),
    el(
      'label',
      { class: 'cinema-control' },
      depthName,
      depthInput,
      depthValue,
    ),
    el(
      'label',
      { class: 'cinema-control' },
      arrowsName,
      arrowsInput,
      arrowsValue,
    ),
    el(
      'label',
      { class: 'cinema-control' },
      depthRangeName,
      depthRangeInput,
      depthRangeValue,
    ),
    el(
      'div',
      { class: 'cinema-actions' },
      motionButton,
      depthButton,
      reverseButton,
      fullscreenButton,
    ),
  )

  stage.append(frame, hud, prompt, movieControls)
  ctx.root.append(stage)

  const elapsed = createElapsedClock()
  let width = 0
  let height = 0
  let dpr = 1
  let raf = 0
  let speed = 0.5
  let currentDemandPd = 0
  let arrowCount = Math.min(4, Math.max(0, Math.round(config.movingArrowCount)))
  arrowsInput.value = String(arrowCount)
  arrowsValue.textContent = String(arrowCount)
  let depthRangeInches = 2.5
  let motionPaused = false
  let depthPaused = false
  let depthDirection = 1
  let attractorTarget: Pick<SceneAttractor, 'x' | 'y'> | null = null
  let attractorPosition: Pick<SceneAttractor, 'x' | 'y'> | null = null
  let attractorStrength = 0

  canvas.style.cursor = 'crosshair'
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const nextTarget = {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    }
    attractorTarget = nextTarget
    // The first click begins with zero pull; later clicks retain the current
    // attractor position so the flock glides across instead of springing free.
    attractorPosition ??= nextTarget
  })

  const setSpeed = (value: number): void => {
    const min = Number(speedInput.min)
    const max = Number(speedInput.max)
    speed = Math.min(max, Math.max(min, value))
    speedInput.value = String(speed)
    speedValue.textContent = `${speed.toFixed(2)}×`
  }
  const setArrowCount = (value: number): void => {
    arrowCount = Math.min(4, Math.max(0, Math.round(value)))
    arrowsInput.value = String(arrowCount)
    arrowsValue.textContent = String(arrowCount)
  }
  const setDepthRange = (value: number): void => {
    depthRangeInches = Math.min(15, Math.max(0, value))
    depthRangeInput.value = String(depthRangeInches)
    depthRangeInput.setAttribute('aria-valuetext', `${depthRangeInches.toFixed(1)} inches`)
    depthRangeValue.textContent = `${depthRangeInches.toFixed(1)} in`
  }
  speedInput.addEventListener('input', () => setSpeed(Number(speedInput.value)))
  arrowsInput.addEventListener('input', () => setArrowCount(Number(arrowsInput.value)))
  depthRangeInput.addEventListener('input', () => setDepthRange(Number(depthRangeInput.value)))
  motionButton.setAttribute('aria-pressed', 'false')
  const toggleMotion = (): void => {
    motionPaused = !motionPaused
    motionButton.setAttribute('aria-pressed', String(motionPaused))
    motionLabel.textContent = motionPaused ? 'Resume motion' : 'Pause motion'
  }
  motionButton.addEventListener('click', toggleMotion)
  depthButton.setAttribute('aria-pressed', 'false')
  const toggleDepth = (): void => {
    depthPaused = !depthPaused
    depthButton.setAttribute('aria-pressed', String(depthPaused))
    depthLabel.textContent = depthPaused ? 'Resume depth' : 'Hold depth'
  }
  depthButton.addEventListener('click', toggleDepth)
  const reverseDepth = (): void => {
    depthDirection *= -1
    reverseLabel.textContent = depthDirection < 0 ? 'Depth returning' : 'Depth advancing'
  }
  reverseButton.addEventListener('click', reverseDepth)
  const toggleFullscreen = async (): Promise<void> => {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
    } else {
      await stage.requestFullscreen()
    }
  }
  fullscreenButton.addEventListener('click', () => void toggleFullscreen())

  const onKey = (event: KeyboardEvent): void => {
    if (event.target instanceof HTMLInputElement) return
    if (event.code === 'BracketLeft') {
      event.preventDefault()
      setSpeed(speed - 0.05)
    } else if (event.code === 'BracketRight') {
      event.preventDefault()
      setSpeed(speed + 0.05)
    } else if (event.code === 'Minus' || event.code === 'NumpadSubtract') {
      event.preventDefault()
      setCurrentDepth(currentDemandPd - 0.1)
    } else if (event.code === 'Equal' || event.code === 'NumpadAdd') {
      event.preventDefault()
      setCurrentDepth(currentDemandPd + 0.1)
    } else if (event.code === 'Comma') {
      event.preventDefault()
      setArrowCount(arrowCount - 1)
    } else if (event.code === 'Period') {
      event.preventDefault()
      setArrowCount(arrowCount + 1)
    } else if (event.code === 'Semicolon') {
      event.preventDefault()
      setDepthRange(depthRangeInches - 0.1)
    } else if (event.code === 'Quote') {
      event.preventDefault()
      setDepthRange(depthRangeInches + 0.1)
    } else if (!event.repeat && event.key.toLowerCase() === 'm') {
      event.preventDefault()
      toggleMotion()
    } else if (!event.repeat && event.key.toLowerCase() === 'h') {
      event.preventDefault()
      toggleDepth()
    } else if (!event.repeat && event.key.toLowerCase() === 'r') {
      event.preventDefault()
      reverseDepth()
    } else if (!event.repeat && event.key.toLowerCase() === 'f') {
      event.preventDefault()
      void toggleFullscreen()
    }
  }
  window.addEventListener('keydown', onKey)

  const resize = (): void => {
    width = Math.max(280, window.innerWidth)
    height = Math.max(210, window.innerHeight)
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

  }
  window.addEventListener('resize', resize)
  resize()

  const rampMs = Math.max(5, config.rampSeconds) * 1000
  const relaxMs = Math.max(3500, rampMs * RELAX_FRACTION)
  const cycleMs = rampMs + relaxMs
  let movieMs = 0
  let depthMs = 0
  let lastElapsedMs = elapsed.ms()

  const setCurrentDepth = (value: number): void => {
    currentDemandPd = Math.min(targetPeakPd, Math.max(0, value))
    const progress = targetPeakPd === 0 ? 0 : currentDemandPd / targetPeakPd
    const raw = inverseSmoothStep(progress)
    const inCycle = wrapMs(depthMs, cycleMs)
    // Keep the current half of the loop: a rising ramp continues rising, while
    // a returning ramp continues easing home after the user releases the slider.
    depthMs = inCycle <= rampMs ? raw * rampMs : rampMs + (1 - raw) * relaxMs
    depthInput.value = String(currentDemandPd)
    depthValue.textContent = `${currentDemandPd.toFixed(1)}Δ`
  }
  depthInput.addEventListener('input', () => setCurrentDepth(Number(depthInput.value)))

  const draw = (): void => {
    const elapsedMs = elapsed.ms()
    const frameDeltaMs = Math.max(0, elapsedMs - lastElapsedMs)
    const deltaMs = frameDeltaMs * speed
    if (!motionPaused) movieMs += deltaMs
    if (!depthPaused) depthMs += deltaMs * depthDirection
    lastElapsedMs = elapsedMs
    const inCycle = wrapMs(depthMs, cycleMs)
    const rising = inCycle <= rampMs
    const raw = rising ? inCycle / rampMs : 1 - (inCycle - rampMs) / relaxMs
    const progress = smoothStep(Math.max(0, Math.min(1, raw)))
    const demand = targetPeakPd * progress
    currentDemandPd = demand
    depthInput.value = String(demand)
    depthValue.textContent = `${demand.toFixed(1)}Δ`
    const signedDemand = sign * demand
    if (attractorTarget && attractorPosition) {
      const ease = 1 - Math.exp(-frameDeltaMs / 420)
      attractorPosition.x += (attractorTarget.x - attractorPosition.x) * ease
      attractorPosition.y += (attractorTarget.y - attractorPosition.y) * ease
      attractorStrength += (0.78 - attractorStrength) * ease
    }
    const attractor = attractorPosition
      ? { ...attractorPosition, strength: attractorStrength }
      : null

    renderMovieFrame(canvas, {
      width,
      height,
      dpr,
      // Forward playback recedes into the scene; reverse playback approaches the
      // viewer. Prism demand remains governed by the independent depth envelope.
      seconds: (config.reversePlayback ? 1 : -1) * (movieMs / 1000),
      signedDemandPd: signedDemand,
      calibration: cal,
      redEye: cal.redEye,
      arrowCount,
      depthRangeInches,
      attractor,
    })

    const sense = config.direction === 'convergence' ? 'converging' : 'diverging'
    hudDemand.textContent = `${demand.toFixed(1)}Δ ${sense}`
    hudDistance.textContent = simulatedDistanceLabel(demand, config.direction, cal.viewingDistanceCm)
    const travel = config.reversePlayback ? 'moving closer' : 'moving deeper'
    const depthState = depthPaused ? 'depth held' : depthDirection < 0 ? 'depth returning' : rising ? 'depth increasing' : 'depth easing home'
    hudDirection.textContent = `${travel} · ${depthState}`
    hudClock.textContent = elapsed.format()
    raf = requestAnimationFrame(draw)
  }

  raf = requestAnimationFrame(draw)

  try {
    await new Promise<void>((resolve) => {
      if (signal.aborted) resolve()
      else signal.addEventListener('abort', () => resolve(), { once: true })
    })
  } finally {
    cancelAnimationFrame(raf)
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('resize', resize)
    elapsed.dispose()
    stage.remove()
  }
}

function cinemaControlName(shortcut: string, label: string): HTMLElement {
  return el(
    'span',
    { class: 'cinema-control-name' },
    el('kbd', { class: 'cinema-shortcut' }, shortcut),
    el('span', {}, label),
  )
}

function cinemaAction(shortcut: string, label: HTMLElement): HTMLButtonElement {
  return el(
    'button',
    { class: 'cinema-action', type: 'button', title: `Shortcut: ${shortcut}` },
    el('kbd', { class: 'cinema-shortcut' }, shortcut),
    label,
  )
}

function smoothStep(t: number): number {
  return t * t * (3 - 2 * t)
}

function inverseSmoothStep(value: number): number {
  const target = Math.max(0, Math.min(1, value))
  let low = 0
  let high = 1
  // smoothStep is monotonic on this interval, so a small binary search is more
  // than accurate enough to place the automatic envelope at a dragged value.
  for (let i = 0; i < 18; i++) {
    const middle = (low + high) / 2
    if (smoothStep(middle) < target) low = middle
    else high = middle
  }
  return (low + high) / 2
}

function simulatedDistanceLabel(
  demandPd: number,
  direction: 'convergence' | 'divergence',
  screenDistanceCm: number,
): string {
  // This is an intuitive screen-plane-relative estimate, not a clinical measure.
  // The app has no user IPD input, so it uses an adult-average 63 mm IPD.
  const screenVergencePd = (100 * ASSUMED_IPD_CM) / screenDistanceCm
  const virtualVergencePd =
    direction === 'convergence' ? screenVergencePd + demandPd : screenVergencePd - demandPd
  if (virtualVergencePd <= 0.15) return 'virtual target: beyond ∞'
  const distanceCm = (100 * ASSUMED_IPD_CM) / virtualVergencePd
  return `virtual target: ≈${(distanceCm / CM_PER_INCH).toFixed(1)} in`
}

function wrapMs(value: number, length: number): number {
  return ((value % length) + length) % length
}

function createLayerDisparity(
  frontDemandPd: number,
  rangeInches: number,
  cal: Calibration,
): (sceneDepth: number) => number {
  const screenVergencePd = (100 * ASSUMED_IPD_CM) / cal.viewingDistanceCm
  const frontVergencePd = screenVergencePd + frontDemandPd
  const frontDisparityPx = prismDioptresToPx(frontDemandPd, cal)

  // A target at or beyond optical infinity has no meaningful "further behind"
  // position. Keep the scene together there instead of inventing a depth reversal.
  if (frontVergencePd <= 0.15) return () => frontDisparityPx

  const frontDistanceCm = (100 * ASSUMED_IPD_CM) / frontVergencePd
  const rangeCm = rangeInches * CM_PER_INCH
  return (sceneDepth: number): number => {
    // The original scene uses 0.12 as its farthest layer and 1 as the ship/front.
    // Normalizing that interval makes the visible front-to-back span match the
    // slider: at 15 in, the backmost star is fifteen virtual inches behind the ship.
    const position = Math.min(
      1,
      Math.max(0, (sceneDepth - BACKMOST_SCENE_DEPTH) / (1 - BACKMOST_SCENE_DEPTH)),
    )
    const layerDistanceCm = frontDistanceCm + (1 - position) * rangeCm
    const layerVergencePd = (100 * ASSUMED_IPD_CM) / layerDistanceCm
    return prismDioptresToPx(layerVergencePd - screenVergencePd, cal)
  }
}

function renderMovieFrame(
  canvas: HTMLCanvasElement,
  opts: {
    width: number
    height: number
    dpr: number
    seconds: number
    signedDemandPd: number
    calibration: Calibration
    redEye: EyeSide
    arrowCount: number
    depthRangeInches: number
    attractor: SceneAttractor | null
  },
): void {
  const g = canvas.getContext('2d')
  if (!g) return
  const { width: w, height: h, dpr, seconds: t } = opts
  const visibleArrowCount = Math.min(4, Math.max(0, Math.round(opts.arrowCount)))
  const disparityPx = prismDioptresToPx(opts.signedDemandPd, opts.calibration)
  const layerDisparityPx = createLayerDisparity(
    opts.signedDemandPd,
    opts.depthRangeInches,
    opts.calibration,
  )
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.clearRect(0, 0, w, h)

  const sky = g.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, '#030712')
  sky.addColorStop(0.55, '#07101e')
  sky.addColorStop(1, '#02040a')
  g.fillStyle = sky
  g.fillRect(0, 0, w, h)

  g.save()
  g.globalCompositeOperation = 'lighter'
  for (const eye of ['left', 'right'] as const) {
    const colour = eye === opts.redEye ? RED : BLUE
    const eyeSign = eye === 'left' ? 1 : -1

    drawStars(g, STARS, w, h, t, colour, eyeSign, layerDisparityPx)
    drawMoon(g, w, h, t, colour, eyeSign * layerDisparityPx(0.68) * 0.5)
    drawMovingArrows(
      g,
      // The ship is itself an arrow-shaped moving object, so the secondary
      // arrows fill only the remainder of the requested visible total.
      MOVING_ARROWS.slice(0, Math.max(0, visibleArrowCount - 1)),
      w,
      h,
      t,
      colour,
      eyeSign,
      layerDisparityPx,
      opts.attractor,
    )

    // Three gates drift toward the viewer. Their increasing depth factors make the
    // scene genuinely layered while the ship itself carries the displayed demand.
    // The range control stretches only these relative layers, never that headline.
    for (let i = 0; i < 3; i++) {
      const travel = wrap01(t * 0.085 + i / 3)
      const radius = 18 + travel * Math.min(w, h) * 0.34
      const alpha = Math.sin(travel * Math.PI) * 0.5
      const depth = 0.42 + travel * 0.42
      drawGate(
        g,
        w / 2,
        h / 2 + 8,
        radius,
        colour,
        eyeSign * layerDisparityPx(depth) * 0.5,
        alpha,
        t + i * 1.7,
      )
    }

    if (visibleArrowCount > 0) {
      drawShip(g, w, h, t, colour, eyeSign * disparityPx * 0.5, opts.attractor)
    }
  }
  g.restore()

  // A neutral vignette belongs to the screen, not either eye, so it never supplies
  // a monocular shortcut to the animated objects.
  const vignette = g.createRadialGradient(w / 2, h / 2, h * 0.12, w / 2, h / 2, h * 0.75)
  vignette.addColorStop(0, 'rgba(0,0,0,0)')
  vignette.addColorStop(1, 'rgba(0,0,0,.74)')
  g.fillStyle = vignette
  g.fillRect(0, 0, w, h)
}

function drawStars(
  g: CanvasRenderingContext2D,
  stars: Star[],
  w: number,
  h: number,
  t: number,
  colour: string,
  eyeSign: number,
  layerDisparityPx: (sceneDepth: number) => number,
): void {
  g.fillStyle = colour
  for (const star of stars) {
    const drift = wrap01(star.x + t * (0.002 + star.depth * 0.0025))
    const x = drift * w + eyeSign * layerDisparityPx(star.depth) * 0.5
    const y = star.y * h + Math.sin(t * 0.35 + star.phase) * 3
    g.globalAlpha = 0.18 + star.depth * 0.38
    g.beginPath()
    g.arc(x, y, star.size, 0, Math.PI * 2)
    g.fill()
  }
}

function wrap01(value: number): number {
  return ((value % 1) + 1) % 1
}

function drawMoon(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  colour: string,
  shift: number,
): void {
  const x = w * 0.76 + Math.sin(t * 0.12) * 5 + shift
  const y = h * 0.28 + Math.cos(t * 0.1) * 3
  g.globalAlpha = 0.28
  g.fillStyle = colour
  g.beginPath()
  g.arc(x, y, Math.min(w, h) * 0.065, 0, Math.PI * 2)
  g.fill()
  g.globalAlpha = 0.2
  g.beginPath()
  g.arc(x + 4, y - 3, Math.min(w, h) * 0.09, 0, Math.PI * 2)
  g.strokeStyle = colour
  g.lineWidth = 2
  g.stroke()
}

function drawMovingArrows(
  g: CanvasRenderingContext2D,
  arrows: MovingArrow[],
  w: number,
  h: number,
  t: number,
  colour: string,
  eyeSign: number,
  layerDisparityPx: (sceneDepth: number) => number,
  attractor: SceneAttractor | null,
): void {
  const size = Math.max(14, Math.min(w, h) * 0.026)
  g.strokeStyle = colour
  g.fillStyle = colour
  g.lineWidth = Math.max(1.5, size * 0.12)

  for (const arrow of arrows) {
    // Each arrow gets a different orbit, heading and disparity fraction. This gives
    // the eyes several simultaneously moving depth planes to fuse, not duplicates.
    const phase = t * arrow.speed
    const baseX = w * (0.34 + 0.32 * wrap01(arrow.xPhase + phase * 0.075))
    const baseY = h * (0.35 + 0.3 * (0.5 + Math.sin(phase * 0.93 + arrow.yPhase * Math.PI * 2) * 0.5))
    const { x, y } = softlyAttractedPosition(
      baseX,
      baseY,
      w,
      h,
      attractor,
      phase * 0.82 + arrow.directionPhase * Math.PI * 2,
      phase * 0.67 + arrow.yPhase * Math.PI * 2,
    )
    const depth = 0.18 + 0.67 * (0.5 + Math.sin(phase * 0.67 + arrow.depthPhase * Math.PI * 2) * 0.5)
    const heading = phase * 0.68 + arrow.directionPhase * Math.PI * 2
    const shift = eyeSign * layerDisparityPx(depth) * 0.5

    g.save()
    g.globalAlpha = 0.5 + depth * 0.32
    g.translate(x + shift, y)
    g.rotate(heading)
    g.beginPath()
    g.moveTo(size * 1.15, 0)
    g.lineTo(-size * 0.7, -size * 0.7)
    g.lineTo(-size * 0.28, 0)
    g.lineTo(-size * 0.7, size * 0.7)
    g.closePath()
    g.stroke()
    g.globalAlpha *= 0.22
    g.fill()
    g.restore()
  }
}

function drawGate(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  colour: string,
  shift: number,
  alpha: number,
  seconds: number,
): void {
  g.globalAlpha = alpha
  g.strokeStyle = colour
  g.lineWidth = Math.max(1.2, radius * 0.025)
  g.beginPath()
  g.ellipse(x + shift, y, radius * 1.25, radius, 0, 0, Math.PI * 2)
  g.stroke()

  // Tiny bright segments race around the otherwise stable fusion ring. They add
  // motion information while keeping the ring's centre fixed and easy to fuse.
  g.globalAlpha = alpha * 1.65
  g.lineWidth = Math.max(1.5, radius * 0.04)
  for (let i = 0; i < 3; i++) {
    const start = wrap01(seconds * 0.34 + i / 3) * Math.PI * 2
    g.beginPath()
    g.ellipse(x + shift, y, radius * 1.25, radius, 0, start, start + 0.23)
    g.stroke()
  }
}

function drawShip(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  colour: string,
  shift: number,
  attractor: SceneAttractor | null,
): void {
  const baseX = w / 2 + Math.sin(t * 0.7) * w * 0.12
  const baseY = h / 2 + Math.sin(t * 1.05 + 0.8) * h * 0.08
  const attracted = softlyAttractedPosition(baseX, baseY, w, h, attractor, t * 0.61, t * 0.83 + 1.4)
  const x = attracted.x + shift
  const y = attracted.y
  const size = Math.min(w, h) * 0.065
  const tilt = Math.cos(t * 0.7) * 0.18
  g.save()
  g.translate(x, y)
  g.rotate(tilt)
  g.fillStyle = colour
  g.strokeStyle = colour
  g.globalAlpha = 0.88
  g.lineWidth = 2
  g.beginPath()
  g.moveTo(size * 1.1, 0)
  g.lineTo(-size * 0.7, -size * 0.48)
  g.lineTo(-size * 0.3, 0)
  g.lineTo(-size * 0.7, size * 0.48)
  g.closePath()
  g.stroke()
  g.globalAlpha = 0.34
  g.fill()

  // Two short engine trails make the frozen red/blue shape read as motion.
  g.globalAlpha = 0.48 + Math.sin(t * 8) * 0.12
  g.beginPath()
  g.moveTo(-size * 0.36, -size * 0.15)
  g.lineTo(-size * 1.05, -size * 0.15)
  g.moveTo(-size * 0.36, size * 0.15)
  g.lineTo(-size * 1.05, size * 0.15)
  g.stroke()
  g.restore()
}

/**
 * Pull an object's normal trajectory toward a small orbit around the clicked point.
 * The blend never reaches 100%, so both its original drift and its local wobble remain.
 */
function softlyAttractedPosition(
  baseX: number,
  baseY: number,
  w: number,
  h: number,
  attractor: SceneAttractor | null,
  orbitXPhase: number,
  orbitYPhase: number,
): { x: number; y: number } {
  if (!attractor) return { x: baseX, y: baseY }
  const radius = Math.min(w, h) * 0.105
  const localX = Math.cos(orbitXPhase) * radius
  const localY = Math.sin(orbitYPhase) * radius * 0.72
  const targetX = attractor.x * w + localX
  const targetY = attractor.y * h + localY
  return {
    x: baseX + (targetX - baseX) * attractor.strength,
    y: baseY + (targetY - baseY) * attractor.strength,
  }
}
