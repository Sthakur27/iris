import { el } from './router'

let nextPanelId = 0

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

  let collapsed = options.collapsed ?? true
  const setCollapsed = (next: boolean): void => {
    collapsed = next
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

export function clampRange(input: HTMLInputElement, value: number): number {
  const min = Number(input.min)
  const max = Number(input.max)
  const next = Math.min(max, Math.max(min, value))
  input.value = String(next)
  return next
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
}
