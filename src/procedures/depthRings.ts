import type { EyeSide } from '../core/types'
import type { Procedure, ProcedureContext } from './base'
import { createElapsedClock } from './base'
import { prismDioptresToPx } from '../core/geometry'
import {
  DEPTH_CINEMA_MAX_CONVERGENCE_PD,
  depthCinemaDivergenceLimit,
} from '../core/depthCinemaSafety'
import { isTherapyPaused } from '../core/sessionState'
import { el } from '../ui/router'
import { createProcedureControls, rangeInput } from '../ui/procedureControls'

const RED = '#ff0000'
const BLUE = '#0000ff'
const RING_COUNT = 6
const INITIAL_STACK_DEPTH_PD = 2
const INITIAL_SPREAD_PD = 1.3
const AUTO_SWEEP_PD_PER_SECOND = 0.1

/** A motionless, compact fusion target with several simultaneous depth planes. */
export const depthRings: Procedure = {
  id: 'depthRings',
  label: 'Depth Rings',
  async run(ctx: ProcedureContext): Promise<void> {
    const { settings, signal } = ctx
    const divergenceLimit = depthCinemaDivergenceLimit(settings.calibration.viewingDistanceCm)
    const stage = el('div', { class: 'stage cinema-stage' })
    const canvas = el('canvas')

    const hud = el('div', { class: 'stage-hud' })
    const depthHud = el('span')
    const rangeHud = el('span')
    const clockHud = el('span')
    hud.append(depthHud, rangeHud, clockHud)

    const prompt = el(
      'div',
      { class: 'stage-prompt cinema-prompt' },
      'Keep all six rings single. Set either slider by hand, or start its slow automatic sweep and let it reverse at each end.',
    )

    const depthInput = rangeInput(
      -divergenceLimit,
      DEPTH_CINEMA_MAX_CONVERGENCE_PD,
      0.1,
      INITIAL_STACK_DEPTH_PD,
      'Whole stack depth; divergence to the left and convergence to the right',
    )
    const spreadInput = rangeInput(0, 12, 0.1, INITIAL_SPREAD_PD, 'Depth spread between rings')
    const depthValue = el('span', { class: 'cinema-control-value' })
    const spreadValue = el('span', { class: 'cinema-control-value' })
    const depthAutoButton = autoSweepButton('stack depth')
    const spreadAutoButton = autoSweepButton('ring spread')
    const controls = createProcedureControls([
      el(
        'div',
        { class: 'cinema-control' },
        depthAutoButton,
        depthInput,
        depthValue,
      ),
      el(
        'div',
        { class: 'cinema-control' },
        spreadAutoButton,
        spreadInput,
        spreadValue,
      ),
    ], { id: 'depth-rings', prompt, collapsed: true, className: 'rings-controls' })
    stage.append(canvas, hud, prompt, controls.node)
    ctx.root.append(stage)

    let width = 0
    let height = 0
    let dpr = 1
    let stackDepthPd = INITIAL_STACK_DEPTH_PD
    let requestedSpreadPd = INITIAL_SPREAD_PD
    let autoDepth = false
    let autoSpread = false
    let depthSweepDirection = 1
    let spreadSweepDirection = 1
    const elapsed = createElapsedClock()

    const render = (): void => {
      const actualSpreadPd = Math.min(Math.abs(stackDepthPd), requestedSpreadPd)
      drawRings(
        canvas,
        width,
        height,
        dpr,
        stackDepthPd,
        actualSpreadPd,
        settings.calibration.pxPerCm,
        settings.calibration.viewingDistanceCm,
        settings.calibration.redEye,
      )
      depthValue.textContent = formatSignedDepth(stackDepthPd)
      spreadValue.textContent =
        actualSpreadPd === requestedSpreadPd
          ? `${actualSpreadPd.toFixed(1)}Δ`
          : `${actualSpreadPd.toFixed(1)}Δ at this depth`
      depthHud.textContent = formatSignedDepth(stackDepthPd)
      rangeHud.textContent = formatRange(stackDepthPd, actualSpreadPd)
      clockHud.textContent = elapsed.format()
    }

    const resize = (): void => {
      width = Math.max(280, window.innerWidth)
      height = Math.max(210, window.innerHeight)
      dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      render()
    }

    const update = (): void => {
      stackDepthPd = Number(depthInput.value)
      requestedSpreadPd = Number(spreadInput.value)
      render()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.target instanceof HTMLInputElement) return
      if (event.code === 'ArrowLeft') setStackDepth(stackDepthPd - 0.1)
      else if (event.code === 'ArrowRight') setStackDepth(stackDepthPd + 0.1)
      else if (event.code === 'Semicolon') setSpread(requestedSpreadPd - 0.1)
      else if (event.code === 'Quote') setSpread(requestedSpreadPd + 0.1)
      else return
      event.preventDefault()
    }
    const setStackDepth = (value: number): void => {
      const next = Math.min(DEPTH_CINEMA_MAX_CONVERGENCE_PD, Math.max(-divergenceLimit, value))
      depthInput.value = String(Math.round(next * 10) / 10)
      update()
    }
    const setSpread = (value: number): void => {
      spreadInput.value = String(Math.min(12, Math.max(0, Math.round(value * 10) / 10)))
      update()
    }

    depthInput.addEventListener('input', update)
    spreadInput.addEventListener('input', update)
    depthAutoButton.addEventListener('click', () => {
      autoDepth = !autoDepth
      updateAutoSweepButton(depthAutoButton, 'stack depth', autoDepth)
    })
    spreadAutoButton.addEventListener('click', () => {
      autoSpread = !autoSpread
      updateAutoSweepButton(spreadAutoButton, 'ring spread', autoSpread)
    })
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', resize)
    resize()

    let clockRaf = 0
    let previousFrameMs: number | null = null
    const tick = (frameMs: number): void => {
      const rawDeltaMs = previousFrameMs === null ? 0 : Math.max(0, frameMs - previousFrameMs)
      previousFrameMs = frameMs
      const deltaPd = isTherapyPaused()
        ? 0
        : (Math.min(100, rawDeltaMs) / 1000) * AUTO_SWEEP_PD_PER_SECOND
      let changed = false
      if (autoDepth && deltaPd > 0) {
        depthSweepDirection = advanceSweep(depthInput, depthSweepDirection, deltaPd)
        changed = true
      }
      if (autoSpread && deltaPd > 0) {
        spreadSweepDirection = advanceSweep(spreadInput, spreadSweepDirection, deltaPd)
        changed = true
      }
      if (changed) update()
      else clockHud.textContent = elapsed.format()
      clockRaf = requestAnimationFrame(tick)
    }
    clockRaf = requestAnimationFrame(tick)

    try {
      await new Promise<void>((resolve) => {
        if (signal.aborted) resolve()
        else signal.addEventListener('abort', () => resolve(), { once: true })
      })
    } finally {
      cancelAnimationFrame(clockRaf)
      controls.dispose()
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', resize)
      elapsed.dispose()
      stage.remove()
    }
  },
}

function autoSweepButton(label: string): HTMLButtonElement {
  const button = el('button', { class: 'cinema-action rings-auto', type: 'button' })
  updateAutoSweepButton(button, label, false)
  return button
}

function updateAutoSweepButton(button: HTMLButtonElement, label: string, active: boolean): void {
  button.textContent = `${active ? 'Ⅱ' : '▶'} ${label}`
  button.setAttribute('aria-pressed', String(active))
  button.setAttribute('aria-label', `${active ? 'Pause' : 'Start'} automatic ${label} sweep`)
  button.title = `${active ? 'Pause' : 'Start'} automatic ${label} sweep`
}

/** Move a slider toward one endpoint, reflect there, and continue back. */
function advanceSweep(input: HTMLInputElement, direction: number, delta: number): number {
  const min = Number(input.min)
  const max = Number(input.max)
  let next = Number(input.value) + direction * delta
  let nextDirection = direction
  if (next >= max) {
    next = max - (next - max)
    nextDirection = -1
  } else if (next <= min) {
    next = min + (min - next)
    nextDirection = 1
  }
  input.value = String(Math.min(max, Math.max(min, next)))
  return nextDirection
}

function formatSignedDepth(depthPd: number): string {
  if (Math.abs(depthPd) < 0.05) return '0.0Δ · screen plane'
  return `${Math.abs(depthPd).toFixed(1)}Δ · ${depthPd > 0 ? 'convergence' : 'divergence'}`
}

function formatRange(stackDepthPd: number, spreadPd: number): string {
  if (Math.abs(stackDepthPd) < 0.05) return 'all rings at screen depth'
  const nearScreenPd = Math.max(0, Math.abs(stackDepthPd) - spreadPd)
  return `rings: ${nearScreenPd.toFixed(1)}–${Math.abs(stackDepthPd).toFixed(1)}Δ`
}

function drawRings(
  canvas: HTMLCanvasElement,
  w: number,
  h: number,
  dpr: number,
  stackDepthPd: number,
  spreadPd: number,
  pxPerCm: number,
  viewingDistanceCm: number,
  redEye: EyeSide,
): void {
  const g = canvas.getContext('2d')
  if (!g) return
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.fillStyle = '#030712'
  g.fillRect(0, 0, w, h)
  const direction = stackDepthPd < 0 ? -1 : 1
  const magnitude = Math.abs(stackDepthPd)
  // Fill the stage while preserving a small, distant centre. Radius follows the
  // ring's position in the stack, adding a congruent perspective cue without
  // changing the calibrated red/blue disparity that sets vergence demand.
  const minDimension = Math.min(w, h)
  const innerRadius = Math.max(18, minDimension * 0.035)
  const outerRadius = Math.max(62, minDimension * 0.36)
  g.save()
  g.globalCompositeOperation = 'lighter'
  for (const eye of ['left', 'right'] as const) {
    const colour = eye === redEye ? RED : BLUE
    const eyeSign = eye === 'left' ? 1 : -1
    g.strokeStyle = colour
    g.lineWidth = 1.5
    g.globalAlpha = 0.84
    for (let i = 0; i < RING_COUNT; i++) {
      const fraction = i / (RING_COUNT - 1)
      // Convergent layers become closer as they grow; divergent layers become
      // farther as they shrink. This keeps the size and binocular depth cues in
      // agreement in both directions.
      const depthFraction = direction > 0 ? fraction : 1 - fraction
      const demandPd = direction * (magnitude - spreadPd + spreadPd * depthFraction)
      const disparityPx = prismDioptresToPx(demandPd, { pxPerCm, viewingDistanceCm, redEye })
      g.beginPath()
      g.arc(
        w / 2 + eyeSign * disparityPx * 0.5,
        h / 2,
        innerRadius + fraction * (outerRadius - innerRadius),
        0,
        Math.PI * 2,
      )
      g.stroke()
    }
  }
  g.restore()
}
