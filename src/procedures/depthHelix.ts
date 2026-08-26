import type { EyeSide } from '../core/types'
import type { Procedure, ProcedureContext } from './base'
import { createElapsedClock } from './base'
import { prismDioptresToPx } from '../core/geometry'
import { el } from '../ui/router'

const RED = '#ff2b2b'
const BLUE = '#2b6bff'
const TAU = Math.PI * 2

interface ProjectedPoint {
  x: number
  y: number
  depth: number
  scale: number
}

interface Segment {
  a: ProjectedPoint
  b: ProjectedPoint
}

/**
 * Depth Helix — a completely still, manually positioned binocular double helix.
 *
 * Three independent Euler rotations change the direction from which the object is
 * viewed; zoom changes its size; depth changes only its binocular disparity.
 * No time value participates in the drawing, so the target cannot drift by itself.
 */
export const depthHelix: Procedure = {
  id: 'depthHelix',
  label: 'Depth Helix',
  async run(ctx: ProcedureContext): Promise<void> {
    const { settings, signal } = ctx
    const stage = el('div', { class: 'stage cinema-stage' })
    const canvas = el('canvas', { class: 'helix-canvas' })
    const hud = el('div', { class: 'stage-hud' })
    const depthHud = el('span')
    const stateHud = el('span', {}, 'manual · fixed target')
    const clockHud = el('span')
    hud.append(depthHud, stateHud, clockHud)
    const prompt = el(
      'div',
      { class: 'stage-prompt cinema-prompt helix-prompt' },
      'Keep both rails and the centre rungs single. The helix stays still until you move a control.',
    )

    let rotationX = 24
    let rotationY = -28
    let rotationZ = -18
    let zoom = 100
    let stretch = 100
    let depth = 4
    let showRungs = true
    let direction: 'convergence' | 'divergence' = 'convergence'
    const rotationXInput = slider('-180', '180', '1', String(rotationX), 'X-axis rotation')
    const rotationYInput = slider('-180', '180', '1', String(rotationY), 'Y-axis rotation')
    const rotationZInput = slider('-180', '180', '1', String(rotationZ), 'Z-axis rotation')
    const zoomInput = slider('50', '180', '1', String(zoom), 'Helix zoom')
    const stretchInput = slider('50', '200', '1', String(stretch), 'Helix stretch')
    const depthInput = slider('0', '40', '0.5', String(depth), 'Fixed depth')
    const directionInput = el('select')
    directionInput.setAttribute('aria-label', 'Depth direction')
    directionInput.append(
      el('option', { value: 'convergence' }, 'Convergence'),
      el('option', { value: 'divergence' }, 'Divergence'),
    )
    const rotationXValue = el('span', { class: 'cinema-control-value' }, `${rotationX}°`)
    const rotationYValue = el('span', { class: 'cinema-control-value' }, `${rotationY}°`)
    const rotationZValue = el('span', { class: 'cinema-control-value' }, `${rotationZ}°`)
    const zoomValue = el('span', { class: 'cinema-control-value' }, `${zoom}%`)
    const stretchValue = el('span', { class: 'cinema-control-value' }, `${stretch}%`)
    const depthValue = el('span', { class: 'cinema-control-value' }, `${depth.toFixed(1)}Δ`)
    const rungsButton = el('button', { class: 'cinema-action helix-toggle', type: 'button' }, 'Cross-lines on')
    rungsButton.setAttribute('aria-pressed', 'true')
    const resetButton = el('button', { class: 'cinema-action helix-reset', type: 'button' }, 'Reset view')
    const controls = el(
      'div',
      { class: 'cinema-controls helix-controls' },
      el('label', { class: 'cinema-control' }, controlName('drag ↕', 'rotate X'), rotationXInput, rotationXValue),
      el('label', { class: 'cinema-control' }, controlName('drag ↔', 'rotate Y'), rotationYInput, rotationYValue),
      el('label', { class: 'cinema-control' }, controlName('slider', 'rotate Z'), rotationZInput, rotationZValue),
      el('label', { class: 'cinema-control' }, controlName('wheel', 'zoom'), zoomInput, zoomValue),
      el('label', { class: 'cinema-control' }, controlName('slider', 'stretch'), stretchInput, stretchValue),
      el('label', { class: 'cinema-control' }, controlName('−  +', 'depth'), depthInput, depthValue),
      el('label', { class: 'helix-direction' }, el('span', { class: 'cinema-control-name' }, 'direction'), directionInput),
      rungsButton,
      resetButton,
    )
    stage.append(canvas, hud, prompt, controls)
    ctx.root.append(stage)

    let width = 0
    let height = 0
    let dpr = 1
    const elapsed = createElapsedClock()
    const render = (): void => {
      const signedDepth = direction === 'convergence' ? depth : -depth
      drawHelix(
        canvas,
        width,
        height,
        dpr,
        prismDioptresToPx(signedDepth, settings.calibration),
        settings.calibration.redEye,
        rotationX,
        rotationY,
        rotationZ,
        zoom / 100,
        stretch / 100,
        showRungs,
      )
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
      rotationX = Number(rotationXInput.value)
      rotationY = Number(rotationYInput.value)
      rotationZ = Number(rotationZInput.value)
      zoom = Number(zoomInput.value)
      stretch = Number(stretchInput.value)
      direction = directionInput.value === 'divergence' ? 'divergence' : 'convergence'
      const maximumDepth = direction === 'convergence' ? 40 : 20
      depthInput.max = String(maximumDepth)
      depth = Math.min(maximumDepth, Number(depthInput.value))
      depthInput.value = String(depth)
      rotationXValue.textContent = `${Math.round(rotationX)}°`
      rotationYValue.textContent = `${Math.round(rotationY)}°`
      rotationZValue.textContent = `${Math.round(rotationZ)}°`
      zoomValue.textContent = `${Math.round(zoom)}%`
      stretchValue.textContent = `${Math.round(stretch)}%`
      depthValue.textContent = `${depth.toFixed(1)}Δ`
      prompt.textContent = showRungs
        ? 'Keep both rails and the centre cross-lines single. The helix stays still until you move a control.'
        : 'Keep both helix rails single. Cross-lines are hidden; the helix stays still until you move a control.'
      render()
    }
    const nudge = (input: HTMLInputElement, amount: number): void => {
      const min = Number(input.min)
      const max = Number(input.max)
      input.value = String(Math.min(max, Math.max(min, Number(input.value) + amount)))
      update()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
      if (event.code === 'ArrowLeft') { event.preventDefault(); nudge(rotationYInput, -5) }
      else if (event.code === 'ArrowRight') { event.preventDefault(); nudge(rotationYInput, 5) }
      else if (event.code === 'ArrowUp') { event.preventDefault(); nudge(rotationXInput, -5) }
      else if (event.code === 'ArrowDown') { event.preventDefault(); nudge(rotationXInput, 5) }
      else if (event.code === 'Minus' || event.code === 'NumpadSubtract') { event.preventDefault(); nudge(depthInput, -0.5) }
      else if (event.code === 'Equal' || event.code === 'NumpadAdd') { event.preventDefault(); nudge(depthInput, 0.5) }
    }
    for (const input of [rotationXInput, rotationYInput, rotationZInput, zoomInput, stretchInput, depthInput]) {
      input.addEventListener('input', update)
    }
    directionInput.addEventListener('change', update)
    const setRotation = (input: HTMLInputElement, value: number): void => {
      input.value = String(wrapDegrees(value))
    }
    const resetView = (): void => {
      rotationXInput.value = '24'
      rotationYInput.value = '-28'
      rotationZInput.value = '-18'
      zoomInput.value = '100'
      stretchInput.value = '100'
      update()
    }
    const toggleRungs = (): void => {
      showRungs = !showRungs
      rungsButton.setAttribute('aria-pressed', String(showRungs))
      rungsButton.textContent = showRungs ? 'Cross-lines on' : 'Cross-lines off'
      update()
    }
    rungsButton.addEventListener('click', toggleRungs)
    resetButton.addEventListener('click', resetView)

    const pointers = new Map<number, { x: number; y: number }>()
    let previousPinchDistance = 0
    const onPointerDown = (event: PointerEvent): void => {
      canvas.setPointerCapture(event.pointerId)
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (pointers.size === 2) previousPinchDistance = pointerDistance(pointers)
    }
    const onPointerMove = (event: PointerEvent): void => {
      const previous = pointers.get(event.pointerId)
      if (!previous) return
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (pointers.size >= 2) {
        const distance = pointerDistance(pointers)
        if (previousPinchDistance > 0) {
          zoomInput.value = String(Math.min(180, Math.max(50, Number(zoomInput.value) + (distance - previousPinchDistance) * 0.35)))
          update()
        }
        previousPinchDistance = distance
        return
      }
      setRotation(rotationYInput, Number(rotationYInput.value) + (event.clientX - previous.x) * 0.55)
      setRotation(rotationXInput, Number(rotationXInput.value) + (event.clientY - previous.y) * 0.55)
      update()
    }
    const onPointerEnd = (event: PointerEvent): void => {
      pointers.delete(event.pointerId)
      previousPinchDistance = pointers.size === 2 ? pointerDistance(pointers) : 0
    }
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()
      nudge(zoomInput, event.deltaY > 0 ? -5 : 5)
    }
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerEnd)
    canvas.addEventListener('pointercancel', onPointerEnd)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', resize)
    resize()

    let clockRaf = 0
    const tick = (): void => { clockHud.textContent = elapsed.format(); clockRaf = requestAnimationFrame(tick) }
    clockRaf = requestAnimationFrame(tick)
    try {
      await new Promise<void>((resolve) => {
        if (signal.aborted) resolve()
        else signal.addEventListener('abort', () => resolve(), { once: true })
      })
    } finally {
      cancelAnimationFrame(clockRaf)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerEnd)
      canvas.removeEventListener('pointercancel', onPointerEnd)
      canvas.removeEventListener('wheel', onWheel)
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

function controlName(shortcut: string, label: string): HTMLElement {
  return el(
    'span',
    { class: 'cinema-control-name' },
    el('kbd', { class: 'cinema-shortcut' }, shortcut),
    el('span', {}, label),
  )
}

export function drawHelix(
  canvas: HTMLCanvasElement,
  w: number,
  h: number,
  dpr: number,
  disparity: number,
  redEye: EyeSide,
  rotationXDeg: number,
  rotationYDeg: number,
  rotationZDeg: number,
  zoom: number,
  stretch: number,
  showRungs: boolean,
): void {
  const g = canvas.getContext('2d')
  if (!g) return
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.fillStyle = '#030712'
  g.fillRect(0, 0, w, h)

  const length = Math.min(w * 0.72, h * 1.08) * zoom * stretch
  const radius = Math.min(w, h) * 0.115 * zoom
  const rotationX = rotationXDeg * Math.PI / 180
  const rotationY = rotationYDeg * Math.PI / 180
  const rotationZ = rotationZDeg * Math.PI / 180
  const samples = 112
  const turns = 3.25

  for (const eye of ['left', 'right'] as const) {
    const colour = eye === redEye ? RED : BLUE
    const eyeSign = eye === 'left' ? 1 : -1
    const strands: ProjectedPoint[][] = [[], []]
    for (let strand = 0; strand < 2; strand++) {
      for (let i = 0; i <= samples; i++) {
        const u = i / samples
        strands[strand]?.push(projectPoint(u, strand, length, radius, turns, rotationX, rotationY, rotationZ))
      }
    }

    g.save()
    g.translate(w / 2, h / 2)
    g.strokeStyle = colour
    g.fillStyle = colour
    g.lineCap = 'round'
    g.lineJoin = 'round'

    if (showRungs) {
      // Optional cross-lines make the DNA form unmistakable, but can be hidden when
      // their red/blue overlap makes a particular orientation visually too busy.
      for (let rung = 0; rung <= 16; rung++) {
        const u = 0.035 + (rung / 16) * 0.93
        const a = projectPoint(u, 0, length, radius, turns, rotationX, rotationY, rotationZ)
        const b = projectPoint(u, 1, length, radius, turns, rotationX, rotationY, rotationZ)
        const ax = a.x + eyeSign * disparity * a.depth * 0.5
        const bx = b.x + eyeSign * disparity * b.depth * 0.5
        g.globalAlpha = 0.38 + 0.26 * ((a.depth + b.depth) / 2)
        g.lineWidth = Math.max(1.2, radius * 0.035 * ((a.scale + b.scale) / 2))
        g.beginPath(); g.moveTo(ax, a.y); g.lineTo(bx, b.y); g.stroke()
      }
    }

    const railSegments: Segment[] = []
    for (const strand of strands) {
      for (let i = 1; i < strand.length; i++) {
        const a = strand[i - 1]
        const b = strand[i]
        if (!a || !b) continue
        railSegments.push({ a, b })
      }
    }
    // Paint far rail pieces first so the crossings actually flip front-to-back as
    // the user spins the object; otherwise one entire strand would always win.
    railSegments.sort((left, right) =>
      (left.a.depth + left.b.depth) - (right.a.depth + right.b.depth))
    for (const { a, b } of railSegments) {
      g.globalAlpha = 0.58 + 0.35 * ((a.depth + b.depth) / 2)
      g.lineWidth = Math.max(2.2, radius * 0.075 * ((a.scale + b.scale) / 2))
      g.beginPath()
      g.moveTo(a.x + eyeSign * disparity * a.depth * 0.5, a.y)
      g.lineTo(b.x + eyeSign * disparity * b.depth * 0.5, b.y)
      g.stroke()
    }

    const nodes: ProjectedPoint[] = []
    for (let node = 0; node <= 16; node++) {
      const u = 0.035 + (node / 16) * 0.93
      for (let strand = 0; strand < 2; strand++) {
        nodes.push(projectPoint(u, strand, length, radius, turns, rotationX, rotationY, rotationZ))
      }
    }
    nodes.sort((a, b) => a.depth - b.depth)
    for (const p of nodes) {
      const x = p.x + eyeSign * disparity * p.depth * 0.5
      const r = Math.max(2.7, radius * 0.055 * p.scale)
      g.globalAlpha = 0.74 + 0.23 * p.depth
      g.beginPath(); g.arc(x, p.y, r, 0, TAU); g.fill()
    }
    g.restore()
  }
}

function projectPoint(
  u: number,
  strand: number,
  length: number,
  radius: number,
  turns: number,
  rotationX: number,
  rotationY: number,
  rotationZ: number,
): ProjectedPoint {
  const along = (u - 0.5) * length
  const theta = u * turns * TAU + strand * Math.PI
  const localY = Math.cos(theta) * radius
  const localZ = Math.sin(theta) * radius

  const cosX = Math.cos(rotationX); const sinX = Math.sin(rotationX)
  const yX = localY * cosX - localZ * sinX
  const zX = localY * sinX + localZ * cosX
  const cosY = Math.cos(rotationY); const sinY = Math.sin(rotationY)
  const xY = along * cosY + zX * sinY
  const zY = -along * sinY + zX * cosY
  const cosZ = Math.cos(rotationZ); const sinZ = Math.sin(rotationZ)
  const x = xY * cosZ - yX * sinZ
  const y = xY * sinZ + yX * cosZ

  const depthRange = length * 0.5 + radius
  const depth = Math.max(0, Math.min(1, 0.5 + zY / (depthRange * 2)))
  const perspective = 0.86 + depth * 0.28
  return { x: x * perspective, y: y * perspective, depth, scale: perspective }
}

function wrapDegrees(value: number): number {
  return Math.round((((value + 180) % 360) + 360) % 360 - 180)
}

function pointerDistance(pointers: Map<number, { x: number; y: number }>): number {
  const [a, b] = [...pointers.values()]
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
}
