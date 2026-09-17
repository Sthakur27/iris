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
  presets: ProcedurePresets
  isCollapsed(): boolean
  setCollapsed(collapsed: boolean): void
  dispose(): void
}

export interface PresetField {
  /** Stable within this exercise; changing it intentionally stops loading old values. */
  id: string
  label: string
  read(): string
  /** Apply without changing unrelated modes such as automatic motion. */
  apply(value: string): void
}

export interface ProcedurePresets {
  register(...fields: PresetField[]): void
  save(slot: number): boolean
  load(slot: number): boolean
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
  const gear = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  gear.setAttribute('viewBox', '0 0 24 24')
  gear.setAttribute('aria-hidden', 'true')
  gear.setAttribute('fill', 'none')
  gear.setAttribute('stroke', 'currentColor')
  gear.setAttribute('stroke-width', '1.7')
  gear.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" d="m9.5 3-.6 2.3-1.5.9-2.3-.6-2.5 4.3 1.7 1.7v1.8l-1.7 1.7 2.5 4.3 2.3-.6 1.5.9.6 2.3h5l.6-2.3 1.5-.9 2.3.6 2.5-4.3-1.7-1.7v-1.8l1.7-1.7-2.5-4.3-2.3.6-1.5-.9L14.5 3z"/><circle cx="12" cy="12.5" r="3.2"/>'
  const toggleLabel = el('span', { class: 'procedure-controls-toggle-label' }, 'Hide settings')
  toggle.append(gear, toggleLabel)
  const presetStatus = el('span', { class: 'procedure-presets-status' })
  presetStatus.setAttribute('aria-live', 'polite')
  const presetSaveButton = el(
    'button',
    { class: 'procedure-preset-save', type: 'button' },
    'save',
  )
  presetSaveButton.setAttribute('aria-label', 'Save current settings to a preset slot')
  const slotButtons = Array.from({ length: 5 }, (_, index) => {
    const button = el(
      'button',
      { class: 'procedure-preset-slot', type: 'button' },
      String(index + 1),
    )
    button.dataset.presetSlot = String(index + 1)
    return button
  })
  const presetBar = el(
    'div',
    { class: 'procedure-presets' },
    el('span', { class: 'procedure-presets-label' }, 'presets'),
    presetSaveButton,
    ...slotButtons,
    el('span', { class: 'procedure-presets-help' }, '1–5 load · ⇧1–5 save'),
    presetStatus,
  )
  const content = el(
    'div',
    { class: 'procedure-controls-content', id: panelId },
    presetBar,
    ...children.filter((child): child is HTMLElement => child !== null),
  )
  const node = el(
    'div',
    {
      class: `cinema-controls procedure-controls${options.className ? ` ${options.className}` : ''}`,
    },
    toggle,
    content,
  )
  node.dataset.exerciseControls = ''
  toggle.setAttribute('aria-controls', panelId)
  if (options.keyboardToggle !== false) toggle.setAttribute('aria-keyshortcuts', '\\')
  options.prompt?.classList.add('procedure-controls-prompt')

  const presetFields = new Map<string, PresetField>()
  const presetStorageKey = `iris.procedurePresets.v1.${options.id}`
  let storedPresets = loadPresets(presetStorageKey)
  let saveArmed = false
  const announcePreset = (message: string): void => {
    presetStatus.textContent = message
  }
  const refreshPresetButtons = (): void => {
    presetSaveButton.classList.toggle('is-armed', saveArmed)
    presetSaveButton.setAttribute('aria-pressed', String(saveArmed))
    presetSaveButton.title = saveArmed ? 'Cancel saving a preset' : 'Choose a slot to save or overwrite'
    slotButtons.forEach((button, index) => {
      const filled = storedPresets[index] !== null
      button.classList.toggle('is-filled', filled)
      button.setAttribute(
        'aria-label',
        filled
          ? `Load preset ${index + 1}; Shift+${index + 1} overwrites it`
          : `Save current settings as preset ${index + 1}`,
      )
      button.title = filled
        ? `Load preset ${index + 1} · Shift-click to overwrite`
        : `Save current settings as preset ${index + 1}`
    })
  }
  const savePreset = (slot: number): boolean => {
    const index = slot - 1
    if (index < 0 || index >= 5 || presetFields.size === 0) return false
    const values: Record<string, string> = {}
    for (const field of presetFields.values()) values[field.id] = field.read()
    storedPresets[index] = values
    if (!storePresets(presetStorageKey, storedPresets)) {
      announcePreset(`Preset ${slot} could not be saved`)
      return false
    }
    refreshPresetButtons()
    announcePreset(`Preset ${slot} saved`)
    return true
  }
  const loadPreset = (slot: number): boolean => {
    const values = storedPresets[slot - 1]
    if (!values) return false
    let applied = 0
    for (const field of presetFields.values()) {
      const value = values[field.id]
      if (typeof value !== 'string') continue
      try {
        field.apply(value)
        applied += 1
      } catch {
        // A renamed or newly constrained field should not prevent compatible
        // values in the same preset from loading.
      }
    }
    if (applied === 0) return false
    announcePreset(`Preset ${slot} loaded`)
    return true
  }
  const presets: ProcedurePresets = {
    register: (...fields) => {
      for (const field of fields) presetFields.set(field.id, field)
    },
    save: savePreset,
    load: loadPreset,
  }
  const onPresetClick = (event: MouseEvent): void => {
    const target = event.target
    if (!(target instanceof Element)) return
    if (target.closest('.procedure-preset-save')) {
      saveArmed = !saveArmed
      announcePreset(saveArmed ? 'Choose a slot to save' : '')
      refreshPresetButtons()
      return
    }
    const button = target.closest<HTMLButtonElement>('[data-preset-slot]')
    const slot = Number(button?.dataset.presetSlot)
    if (!button || !Number.isInteger(slot)) return
    if (saveArmed || event.shiftKey || storedPresets[slot - 1] === null) {
      savePreset(slot)
      saveArmed = false
      refreshPresetButtons()
    } else loadPreset(slot)
  }
  presetBar.addEventListener('click', onPresetClick)
  refreshPresetButtons()

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
    content.hidden = collapsed
    options.prompt?.classList.toggle('controls-collapsed', collapsed)
    toggle.setAttribute('aria-expanded', String(!collapsed))
    const label = collapsed ? 'Show exercise settings' : 'Hide exercise settings'
    toggle.setAttribute('aria-label', label)
    toggle.title = `${label}${options.keyboardToggle === false ? '' : ' (shortcut: \\)'}`
    if (collapsed) content.scrollTop = 0
  }

  const onToggle = (event: MouseEvent): void => {
    setCollapsed(!collapsed)
    if (event.detail > 0) toggle.blur()
  }
  const onKey = (event: KeyboardEvent): void => {
    if (
      event.repeat ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      isEditableTarget(event.target)
    ) return
    if (event.code === 'Backslash' && options.keyboardToggle !== false) {
      event.preventDefault()
      setCollapsed(!collapsed)
      return
    }
    const presetMatch = /^(?:Digit|Numpad)([1-5])$/.exec(event.code)
    if (!presetMatch) return
    const slot = Number(presetMatch[1])
    const handled = event.shiftKey ? savePreset(slot) : loadPreset(slot)
    if (handled) {
      if (event.shiftKey) {
        saveArmed = false
        refreshPresetButtons()
      }
      event.preventDefault()
    }
  }
  // Exercise response handlers are usually installed on window. Keep keystrokes
  // used to operate a focused control from also being scored as answers.
  const isolateControlKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && !collapsed) {
      event.preventDefault()
      setCollapsed(true)
      toggle.focus()
    } else if (event.code === 'Backslash') {
      onKey(event)
    }
    event.stopPropagation()
  }
  // Once a click action has fired, return keyboard ownership to the exercise.
  // Otherwise a focused button would keep swallowing Arrow/Space responses.
  const releaseButtonFocus = (event: MouseEvent): void => {
    if (event.detail === 0) return
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
    presets,
    isCollapsed: () => collapsed,
    setCollapsed,
    dispose: () => {
      toggle.removeEventListener('click', onToggle)
      node.removeEventListener('click', releaseButtonFocus)
      node.removeEventListener('keydown', isolateControlKey)
      presetBar.removeEventListener('click', onPresetClick)
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

export function presetInput(
  id: string,
  label: string,
  input: HTMLInputElement | HTMLSelectElement,
  onApply: () => void,
): PresetField {
  return {
    id,
    label,
    read: () => input.value,
    apply: (value) => {
      input.value = value
      onApply()
    },
  }
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

type StoredPreset = Record<string, string> | null

function loadPresets(storageKey: string): StoredPreset[] {
  const empty = (): StoredPreset[] => Array.from({ length: 5 }, () => null)
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return empty()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return empty()
    return Array.from({ length: 5 }, (_, index) => {
      const candidate: unknown = parsed[index]
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null
      const values: Record<string, string> = {}
      for (const [key, value] of Object.entries(candidate)) {
        if (typeof value === 'string') values[key] = value
      }
      return Object.keys(values).length > 0 ? values : null
    })
  } catch {
    return empty()
  }
}

function storePresets(storageKey: string, presets: StoredPreset[]): boolean {
  try {
    localStorage.setItem(storageKey, JSON.stringify(presets))
    return true
  } catch {
    return false
  }
}
