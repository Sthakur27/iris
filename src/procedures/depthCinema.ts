import type { EyeSide } from '../core/types'
import type { Procedure, ProcedureContext } from './base'
import { createElapsedClock } from './base'
import { prismDioptresToPx, pxToPrismDioptres } from '../core/geometry'
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

interface Star {
  x: number
  y: number
  size: number
  depth: number
  phase: number
}

const STARS: Star[] = Array.from({ length: 46 }, (_, i) => ({
  x: ((i * 73 + 31) % 997) / 997,
  y: ((i * 137 + 59) % 991) / 991,
  size: 0.7 + ((i * 17) % 9) / 7,
  depth: 0.12 + ((i * 29) % 55) / 100,
  phase: (i * 1.618) % (Math.PI * 2),
}))

export const depthCinema: Procedure = {
  id: 'depthCinema',
  label: 'Depth Cinema',
  async run(ctx: ProcedureContext): Promise<void> {
    await runDepthCinema(ctx)
  },
}

async function runDepthCinema(ctx: ProcedureContext): Promise<void> {
  const { settings, signal } = ctx
  const config = settings.depthCinema
  const cal = settings.calibration
  const sign = config.direction === 'convergence' ? 1 : -1
  const requestedPeak =
    config.direction === 'convergence' ? config.convergencePeakPd : config.divergencePeakPd

  const stage = el('div', { class: 'stage cinema-stage' })
  const frame = el('div', { class: 'cinema-frame' })
  const canvas = el('canvas')
  frame.append(canvas)

  const hud = el('div', { class: 'stage-hud' })
  const hudDemand = el('span')
  const hudDirection = el('span')
  const hudClock = el('span')
  hud.append(hudDemand, hudDirection, hudClock)

  const prompt = el(
    'div',
    { class: 'stage-prompt cinema-prompt' },
    'Keep the little ship single as the scene deepens. Pause if it doubles or feels uncomfortable.',
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
    min: '0.5',
    max: String(requestedPeak),
    step: '0.5',
    value: String(requestedPeak),
  })
  depthInput.setAttribute('aria-label', 'Maximum depth')
  const depthValue = el(
    'span',
    { class: 'cinema-control-value' },
    `${requestedPeak.toFixed(1)}Δ`,
  )
  const speedName = cinemaControlName('[  ]', 'speed')
  const depthName = cinemaControlName('−  +', 'depth')
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
  let screenCeilingPd = 0
  let raf = 0
  let speed = 0.5
  let livePeakPd = requestedPeak
  let motionPaused = false
  let depthPaused = false
  let depthDirection = 1

  const setSpeed = (value: number): void => {
    const min = Number(speedInput.min)
    const max = Number(speedInput.max)
    speed = Math.min(max, Math.max(min, value))
    speedInput.value = String(speed)
    speedValue.textContent = `${speed.toFixed(2)}×`
  }
  const setDepth = (value: number): void => {
    const min = Number(depthInput.min)
    const max = Number(depthInput.max)
    livePeakPd = Math.min(max, Math.max(min, value))
    depthInput.value = String(livePeakPd)
    depthValue.textContent = `${livePeakPd.toFixed(1)}Δ`
  }
  speedInput.addEventListener('input', () => setSpeed(Number(speedInput.value)))
  depthInput.addEventListener('input', () => setDepth(Number(depthInput.value)))
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
      setDepth(livePeakPd - 0.5)
    } else if (event.code === 'Equal' || event.code === 'NumpadAdd') {
      event.preventDefault()
      setDepth(livePeakPd + 0.5)
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

    // The hero is allowed to use at most 24% of the movie width as total disparity.
    // Beyond that the two eye images lose too much common scene to read as one movie.
    screenCeilingPd = pxToPrismDioptres(width * 0.24, cal)
    const availablePeak = Math.max(0.5, Math.min(requestedPeak, screenCeilingPd))
    depthInput.max = String(availablePeak)
    livePeakPd = Math.min(livePeakPd, availablePeak)
    depthInput.value = String(livePeakPd)
    depthValue.textContent = `${livePeakPd.toFixed(1)}Δ`
  }
  window.addEventListener('resize', resize)
  resize()

  const rampMs = Math.max(5, config.rampSeconds) * 1000
  const relaxMs = Math.max(3500, rampMs * RELAX_FRACTION)
  const cycleMs = rampMs + relaxMs
  let movieMs = 0
  let depthMs = 0
  let lastElapsedMs = elapsed.ms()

  const draw = (): void => {
    const elapsedMs = elapsed.ms()
    const deltaMs = Math.max(0, elapsedMs - lastElapsedMs) * speed
    if (!motionPaused) movieMs += deltaMs
    if (!depthPaused) depthMs += deltaMs * depthDirection
    lastElapsedMs = elapsedMs
    const inCycle = wrapMs(depthMs, cycleMs)
    const rising = inCycle <= rampMs
    const raw = rising ? inCycle / rampMs : 1 - (inCycle - rampMs) / relaxMs
    const progress = smoothStep(Math.max(0, Math.min(1, raw)))
    const peak = Math.max(0.5, Math.min(livePeakPd, screenCeilingPd))
    const demand = peak * progress
    const signedDemand = sign * demand

    renderMovieFrame(canvas, {
      width,
      height,
      dpr,
      // Forward playback recedes into the scene; reverse playback approaches the
      // viewer. Prism demand remains governed by the independent depth envelope.
      seconds: (config.reversePlayback ? 1 : -1) * (movieMs / 1000),
      disparityPx: prismDioptresToPx(signedDemand, cal),
      redEye: cal.redEye,
    })

    const sense = config.direction === 'convergence' ? 'converging' : 'diverging'
    hudDemand.textContent = `${demand.toFixed(1)}Δ ${sense}`
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

function wrapMs(value: number, length: number): number {
  return ((value % length) + length) % length
}

function renderMovieFrame(
  canvas: HTMLCanvasElement,
  opts: {
    width: number
    height: number
    dpr: number
    seconds: number
    disparityPx: number
    redEye: EyeSide
  },
): void {
  const g = canvas.getContext('2d')
  if (!g) return
  const { width: w, height: h, dpr, seconds: t, disparityPx } = opts
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

    drawStars(g, STARS, w, h, t, colour, eyeSign, disparityPx)
    drawMoon(g, w, h, t, colour, eyeSign * disparityPx * 0.34)

    // Three gates drift toward the viewer. Their increasing depth factors make the
    // scene genuinely layered while the ship itself carries the displayed demand.
    for (let i = 0; i < 3; i++) {
      const travel = wrap01(t * 0.085 + i / 3)
      const radius = 18 + travel * Math.min(w, h) * 0.34
      const alpha = Math.sin(travel * Math.PI) * 0.5
      const depth = 0.42 + travel * 0.42
      drawGate(g, w / 2, h / 2 + 8, radius, colour, eyeSign * disparityPx * depth * 0.5, alpha)
    }

    drawShip(g, w, h, t, colour, eyeSign * disparityPx * 0.5)
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
  disparityPx: number,
): void {
  g.fillStyle = colour
  for (const star of stars) {
    const drift = wrap01(star.x + t * (0.002 + star.depth * 0.0025))
    const x = drift * w + eyeSign * disparityPx * star.depth * 0.5
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

function drawGate(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  colour: string,
  shift: number,
  alpha: number,
): void {
  g.globalAlpha = alpha
  g.strokeStyle = colour
  g.lineWidth = Math.max(1.2, radius * 0.025)
  g.beginPath()
  g.ellipse(x + shift, y, radius * 1.25, radius, 0, 0, Math.PI * 2)
  g.stroke()
}

function drawShip(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  colour: string,
  shift: number,
): void {
  const x = w / 2 + Math.sin(t * 0.7) * w * 0.12 + shift
  const y = h / 2 + Math.sin(t * 1.05 + 0.8) * h * 0.08
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
