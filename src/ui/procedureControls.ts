import { el } from './router'

let nextPanelId = 0
const CONTROLS_COLLAPSED_KEY = 'iris.procedureControls.collapsed.v1'

function loadControlsCollapsed(fallback: boolean): boolean {
  const stored = localStorage.getItem(CONTROLS_COLLAPSED_KEY)
  if (stored === '1') return true
  if (stored === '0') return false
  return fallback
}

function saveControlsCollapsed(collapsed: boolean): void {
  localStorage.setItem(CONTROLS_COLLAPSED_KEY, collapsed ? '1' : '0')
}

export interface ProcedureControlsOptions {
  /** Stable prefix used by aria-controls; a unique suffix is added automatically. */
  id: string
  prompt?: HTMLElement
  collapsed?: boolean
  className?: string
  /** Set false when an exercise needs to own the backslash key itself. */
  keyboardToggle?: boolean
}

export interface ProcedureControls {
  node: HTMLDivElement
  toggle: HTMLButtonElement
  isCollapsed(): boolean
  setCollapsed(collapsed: boolean): void
  dispose(): void
}

export interface AutoRangeOptions {
  input: HTMLInputElement
  /** Compact text rendered beside the play/pause icon. */
  label: string
  /** Spoken/title text, for example "Y-axis rotation" or "ring spread sweep". */
  description?: string
  /** Units travelled per second. May be live, as with Helix's speed control. */
  unitsPerSecond: number | (() => number)
  /**
   * Optional visible quantum. Motion accumulates until a full increment is due,
   * preventing a range input from rounding tiny animation-frame deltas back away.
   */
  increment?: number
  active?: boolean
  className?: string
  isPaused?: () => boolean
  onChange(): void
}

export interface AutoRangeControl {
  button: HTMLButtonElement
  isActive(): boolean
  setActive(active: boolean): void
  setDirection(direction: 1 | -1): void
  dispose(): void
}

/**
 * The common in-exercise settings shell.
 *
 * It deliberately accepts ordinary DOM children rather than a large configuration
 * schema. Exercises keep ownership of their clinical state and callbacks, while the
 * shell owns disclosure, layout, ARIA, keyboard isolation, and cleanup.
 */
export function createProcedureControls(
  children: Array<HTMLElement | null>,
  options: ProcedureControlsOptions,
): ProcedureControls {
  const panelId = `${options.id}-controls-${++nextPanelId}`
  const toggle = el(
    'button',
    { class: 'cinema-action procedure-controls-toggle', type: 'button' },
  )
  const node = el(
    'div',
    {
      class: `cinema-controls procedure-controls${options.className ? ` ${options.className}` : ''}`,
      id: panelId,
    },
    toggle,
    ...children.filter((child): child is HTMLElement => child !== null),
  )
  node.dataset.exerciseControls = ''
  toggle.setAttribute('aria-controls', panelId)
  toggle.setAttribute('aria-keyshortcuts', '\\')
  toggle.title = 'Show or hide exercise controls (shortcut: \\)'
  options.prompt?.classList.add('procedure-controls-prompt')

  const resizeObserver = typeof ResizeObserver === 'undefined' || !options.prompt
    ? null
    : new ResizeObserver(([entry]) => {
        if (!entry || !options.prompt) return
        // contentRect omits the panel's padding and border, which made prompts
        // overlap the top edge of a scrollable mobile panel by a few pixels.
        const borderBoxHeight = node.getBoundingClientRect().height
        options.prompt.style.setProperty('--procedure-controls-height', `${Math.ceil(borderBoxHeight)}px`)
      })
  resizeObserver?.observe(node)

  let collapsed = loadControlsCollapsed(options.collapsed ?? true)
  const setCollapsed = (next: boolean): void => {
    collapsed = next
    saveControlsCollapsed(collapsed)
    node.classList.toggle('is-collapsed', collapsed)
    options.prompt?.classList.toggle('controls-collapsed', collapsed)
    toggle.setAttribute('aria-expanded', String(!collapsed))
    toggle.textContent = collapsed ? 'Show controls ↑' : 'Hide controls ↓'
  }

  const onToggle = (): void => {
    setCollapsed(!collapsed)
    toggle.blur()
  }
  const onKey = (event: KeyboardEvent): void => {
    if (
      options.keyboardToggle === false ||
      event.repeat ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.code !== 'Backslash' ||
      isEditableTarget(event.target)
    ) return
    event.preventDefault()
    setCollapsed(!collapsed)
  }
  // Exercise response handlers are usually installed on window. Keep keystrokes
  // used to operate a focused control from also being scored as answers.
  const isolateControlKey = (event: KeyboardEvent): void => event.stopPropagation()
  // Once a click action has fired, return keyboard ownership to the exercise.
  // Otherwise a focused button would keep swallowing Arrow/Space responses.
  const releaseButtonFocus = (event: MouseEvent): void => {
    const target = event.target
    if (!(target instanceof Element)) return
    target.closest('button')?.blur()
  }

  toggle.addEventListener('click', onToggle)
  node.addEventListener('click', releaseButtonFocus)
  node.addEventListener('keydown', isolateControlKey)
  window.addEventListener('keydown', onKey)
  setCollapsed(collapsed)

  return {
    node,
    toggle,
    isCollapsed: () => collapsed,
    setCollapsed,
    dispose: () => {
      toggle.removeEventListener('click', onToggle)
      node.removeEventListener('click', releaseButtonFocus)
      node.removeEventListener('keydown', isolateControlKey)
      window.removeEventListener('keydown', onKey)
      resizeObserver?.disconnect()
      options.prompt?.classList.remove('procedure-controls-prompt', 'controls-collapsed')
      options.prompt?.style.removeProperty('--procedure-controls-height')
    },
  }
}

export function rangeInput(
  min: number,
  max: number,
  step: number,
  value: number,
  ariaLabel: string,
): HTMLInputElement {
  const input = el('input', {
    type: 'range',
    min: String(min),
    max: String(max),
    step: String(step),
    value: String(value),
  })
  input.setAttribute('aria-label', ariaLabel)
  return input
}

export function controlName(shortcut: string | null, label: string): HTMLElement {
  const node = el('span', { class: 'cinema-control-name' })
  if (shortcut) node.append(el('kbd', { class: 'cinema-shortcut' }, shortcut))
  node.append(el('span', {}, label))
  return node
}

export function controlRow(
  name: HTMLElement | string,
  control: HTMLElement,
  value?: HTMLElement,
  className = '',
): HTMLElement {
  const label = typeof name === 'string' ? controlName(null, name) : name
  return el(
    'label',
    { class: `cinema-control${className ? ` ${className}` : ''}` },
    label,
    control,
    value ?? el('span', { class: 'cinema-control-value' }),
  )
}

export function actionButton(shortcut: string | null, label: string): HTMLButtonElement {
  const button = el('button', { class: 'cinema-action', type: 'button' })
  if (shortcut) button.append(el('kbd', { class: 'cinema-shortcut' }, shortcut))
  button.append(el('span', { class: 'cinema-action-label' }, label))
  return button
}

/**
 * Reusable play/pause controller for a numeric range that sweeps to each endpoint
 * and reverses. It owns timing, quantised accumulation, button state, range
 * synchronisation, pause handling, and cleanup; the exercise only owns meaning.
 */
export function createAutoRangeControl(options: AutoRangeOptions): AutoRangeControl {
  const button = el('button', {
    class: `cinema-action${options.className ? ` ${options.className}` : ''}`,
    type: 'button',
  })
  const description = options.description ?? options.label
  let active = options.active ?? false
  let direction: 1 | -1 = 1
  let remainder = 0
  let previousMs = performance.now()

  const paintButton = (): void => {
    const action = active ? 'Pause' : 'Start'
    button.textContent = `${active ? 'Ⅱ' : '▶'} ${options.label}`
    button.setAttribute('aria-pressed', String(active))
    button.setAttribute('aria-label', `${action} automatic ${description}`)
    button.title = `${action} automatic ${description}`
  }
  const setActive = (next: boolean): void => {
    active = next
    remainder = 0
    previousMs = performance.now()
    paintButton()
  }
  const onButtonClick = (): void => setActive(!active)
  const onManualInput = (): void => {
    remainder = 0
    options.onChange()
  }
  button.addEventListener('click', onButtonClick)
  options.input.addEventListener('input', onManualInput)
  paintButton()

  const timer = window.setInterval(() => {
    const now = performance.now()
    const elapsedMs = Math.min(100, Math.max(0, now - previousMs))
    previousMs = now
    if (!active || options.isPaused?.() === true) return

    const configuredRate = typeof options.unitsPerSecond === 'function'
      ? options.unitsPerSecond()
      : options.unitsPerSecond
    const rate = Number.isFinite(configuredRate) ? Math.max(0, configuredRate) : 0
    const movement = (elapsedMs / 1000) * rate
    if (movement <= 0) return

    const increment = options.increment
    if (increment !== undefined && increment > 0) {
      remainder += movement
      let changed = false
      while (remainder + Number.EPSILON >= increment) {
        direction = advanceBouncingRange(options.input, direction, increment)
        remainder -= increment
        changed = true
      }
      if (changed) options.onChange()
      return
    }

    direction = advanceBouncingRange(options.input, direction, movement)
    options.onChange()
  }, 50)

  return {
    button,
    isActive: () => active,
    setActive,
    setDirection: (next) => {
      direction = next
      remainder = 0
    },
    dispose: () => {
      window.clearInterval(timer)
      button.removeEventListener('click', onButtonClick)
      options.input.removeEventListener('input', onManualInput)
    },
  }
}

export function clampRange(input: HTMLInputElement, value: number): number {
  const min = Number(input.min)
  const max = Number(input.max)
  const next = Math.min(max, Math.max(min, value))
  input.value = String(next)
  return next
}

function advanceBouncingRange(
  input: HTMLInputElement,
  direction: 1 | -1,
  amount: number,
): 1 | -1 {
  const min = Number(input.min)
  const max = Number(input.max)
  let next = Number(input.value) + direction * amount
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

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
}
