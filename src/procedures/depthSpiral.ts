import type { EyeSide } from '../core/types'
import type { Procedure, ProcedureContext } from './base'
import { createElapsedClock } from './base'
import { prismDioptresToPx } from '../core/geometry'
import { el } from '../ui/router'

const RED = '#ff2b2b'
const BLUE = '#2b6bff'
const LETTERS = ['B', 'J', 'U', 'M', 'H', 'I', 'D', 'P', 'V', 'A', 'Z', 'F', 'S', 'O', 'C', 'W', 'G', 'N', 'Q', 'K', 'Y', 'E', 'L', 'X']

// A calm, fixed square coil: its only changes come from the two explicit controls.
const SPIRAL: ReadonlyArray<readonly [number, number]> = [
  [-0.47, -0.47], [0.47, -0.47], [0.47, 0.47], [-0.47, 0.47], [-0.47, -0.29],
  [0.29, -0.29], [0.29, 0.29], [-0.29, 0.29], [-0.29, -0.12], [0.12, -0.12],
  [0.12, 0.12], [-0.12, 0.12], [-0.12, 0], [0, 0],
]

export const depthSpiral: Procedure = {
  id: 'depthSpiral',
  label: 'Depth Spiral',
  async run(ctx: ProcedureContext): Promise<void> {
    const { settings, signal } = ctx
    const stage = el('div', { class: 'stage cinema-stage' })
    const canvas = el('canvas')
    const hud = el('div', { class: 'stage-hud' })
    const depthHud = el('span')
    const stateHud = el('span', {}, 'fixed target')
    const clockHud = el('span')
    hud.append(depthHud, stateHud, clockHud)
    const prompt = el('div', { class: 'stage-prompt cinema-prompt' }, 'Keep the lettered spiral single. Each node steps closer along the path; nothing moves until you change a control.')

    let depth = 4
    let scale = 1
    let direction: 'convergence' | 'divergence' = 'convergence'
    const depthInput = slider('0', '40', '0.5', String(depth), 'Fixed depth')
    const scaleInput = slider('60', '140', '1', '100', 'Spiral scale')
    const directionInput = el('select')
    directionInput.append(el('option', { value: 'convergence' }, 'Convergence'), el('option', { value: 'divergence' }, 'Divergence'))
    const depthValue = el('span', { class: 'cinema-control-value' }, '4.0Δ')
    const scaleValue = el('span', { class: 'cinema-control-value' }, '100%')
    const controls = el(
      'div',
      { class: 'cinema-controls' },
      el('label', { class: 'cinema-control' }, cinemaControlName('−  +', 'fixed depth'), depthInput, depthValue),
      el('label', { class: 'cinema-control' }, cinemaControlName('←  →', 'scale'), scaleInput, scaleValue),
      el('label', { class: 'cinema-control' }, el('span', { class: 'cinema-control-name' }, 'direction'), directionInput),
    )
    stage.append(canvas, hud, prompt, controls)
    ctx.root.append(stage)

    let width = 0
    let height = 0
    let dpr = 1
    const elapsed = createElapsedClock()
    const render = (): void => {
      drawSpiral(canvas, width, height, dpr, prismDioptresToPx(direction === 'convergence' ? depth : -depth, settings.calibration), settings.calibration.redEye, scale)
      depthHud.textContent = `${depth.toFixed(1)}Δ ${direction === 'convergence' ? 'converging' : 'diverging'}`
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
      depth = Number(depthInput.value)
      scale = Number(scaleInput.value) / 100
      direction = directionInput.value === 'divergence' ? 'divergence' : 'convergence'
      depthValue.textContent = `${depth.toFixed(1)}Δ`
      scaleValue.textContent = `${Math.round(scale * 100)}%`
      render()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
      if (event.code === 'Minus' || event.code === 'NumpadSubtract') { depthInput.value = String(Math.max(0, depth - 0.5)); update() }
      else if (event.code === 'Equal' || event.code === 'NumpadAdd') { depthInput.value = String(Math.min(40, depth + 0.5)); update() }
      else if (event.code === 'ArrowLeft') { scaleInput.value = String(Math.max(60, scale * 100 - 5)); update() }
      else if (event.code === 'ArrowRight') { scaleInput.value = String(Math.min(140, scale * 100 + 5)); update() }
    }
    depthInput.addEventListener('input', update)
    scaleInput.addEventListener('input', update)
    directionInput.addEventListener('change', update)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', resize)
    resize()
    let clockRaf = 0
    const tick = (): void => { clockHud.textContent = elapsed.format(); clockRaf = requestAnimationFrame(tick) }
    clockRaf = requestAnimationFrame(tick)
    try {
      await new Promise<void>((resolve) => { if (signal.aborted) resolve(); else signal.addEventListener('abort', () => resolve(), { once: true }) })
    } finally {
      cancelAnimationFrame(clockRaf)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', resize)
      elapsed.dispose()
      stage.remove()
    }
  },
}

function slider(min: string, max: string, step: string, value: string, label: string): HTMLInputElement {
  const input = el('input', { type: 'range', min, max, step, value })
  input.setAttribute('aria-label', label)
  return input
}

function cinemaControlName(shortcut: string, label: string): HTMLElement {
  return el('span', { class: 'cinema-control-name' }, el('kbd', { class: 'cinema-shortcut' }, shortcut), el('span', {}, label))
}

function drawSpiral(canvas: HTMLCanvasElement, w: number, h: number, dpr: number, disparity: number, redEye: EyeSide, scale: number): void {
  const g = canvas.getContext('2d')
  if (!g) return
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.fillStyle = '#030712'
  g.fillRect(0, 0, w, h)
  const size = Math.min(w, h) * 0.78 * scale
  for (const eye of ['left', 'right'] as const) {
    const colour = eye === redEye ? RED : BLUE
    g.save()
    g.translate(w / 2, h / 2)
    g.strokeStyle = colour
    g.fillStyle = colour
    g.globalAlpha = 0.86
    g.lineWidth = Math.max(2, size * 0.018)
    g.lineJoin = 'round'
    // The path moves through several depth planes, becoming closest toward its
    // centre, rather than keeping every letter on one flat disparity.
    for (let i = 1; i < SPIRAL.length; i++) {
      const [fromX, fromY] = SPIRAL[i - 1] ?? [0, 0]
      const [toX, toY] = SPIRAL[i] ?? [0, 0]
      const eyeSign = eye === 'left' ? 1 : -1
      g.beginPath()
      g.moveTo(fromX * size + eyeSign * disparity * spiralDepth(i - 1) * 0.5, fromY * size)
      g.lineTo(toX * size + eyeSign * disparity * spiralDepth(i) * 0.5, toY * size)
      g.stroke()
    }
    SPIRAL.forEach(([x, y], i) => {
      const px = x * size
      const py = y * size
      const r = Math.max(12, size * 0.047)
      const nodeX = px + (eye === 'left' ? 1 : -1) * disparity * spiralDepth(i) * 0.5
      // Paint an opaque backing first: no path segment can bisect a letter tile.
      g.globalAlpha = 1
      g.fillStyle = '#030712'
      g.beginPath(); g.roundRect(nodeX - r, py - r, r * 2, r * 2, r * 0.36); g.fill()
      g.strokeStyle = colour
      g.globalAlpha = 0.92
      g.beginPath(); g.roundRect(nodeX - r, py - r, r * 2, r * 2, r * 0.36); g.stroke()
      g.globalAlpha = 0.95; g.font = `600 ${Math.max(12, r * 0.92)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(LETTERS[i % LETTERS.length] ?? '•', nodeX, py + 1)
    })
    g.restore()
  }
}

function spiralDepth(index: number): number {
  return 0.12 + 0.88 * Math.max(0, Math.min(1, index / (SPIRAL.length - 1)))
}
