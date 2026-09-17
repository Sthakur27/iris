import type { Procedure } from './base'
import { createElapsedClock } from './base'
import { isTherapyPaused } from '../core/sessionState'
import { el } from '../ui/router'

export interface SearchCharacter {
  value: string
  x: number
  y: number
}

/** Best-candidate sampling spreads characters organically, with no underlying grid. */
export function createSearchBoard(): SearchCharacter[] {
  const values = Array.from({ length: 100 }, (_, i) =>
    i < 10 ? String(i) : String.fromCharCode(65 + Math.floor(Math.random() * 26)),
  )
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[values[i], values[j]] = [values[j]!, values[i]!]
  }
  const characters: SearchCharacter[] = []
  for (const value of values) {
    let best = { x: Math.random(), y: Math.random() }
    let bestDistance = -1
    for (let attempt = 0; attempt < 100; attempt++) {
      const point = { x: Math.random(), y: Math.random() }
      const distance = characters.reduce(
        (min, other) => Math.min(min, Math.hypot(point.x - other.x, point.y - other.y)),
        Infinity,
      )
      if (distance > bestDistance) {
        best = point
        bestDistance = distance
      }
    }
    characters.push({ value, ...best })
  }
  return characters
}

export const numberSearch: Procedure = {
  id: 'numberSearch',
  label: 'Number Search',
  async run(ctx) {
    if (ctx.signal.aborted) return
    const stage = el('div', { class: 'stage number-search' })
    const status = el('div', { class: 'number-search-status', role: 'status', ariaLive: 'polite' })
    const field = el('div', { class: 'number-search-field', ariaLabel: 'Scattered letters and numbers' })
    const prompt = el('div', { class: 'number-search-instructions' }, 'Find a number → click → flip your lens.')
    const next = el('button', { class: 'number-search-next' }, 'New board')
    next.hidden = true
    const footer = el('div', { class: 'number-search-footer' }, prompt, next)
    stage.append(status, field, footer)
    ctx.root.append(stage)
    const clock = createElapsedClock()
    let onset = clock.ms()
    let trialIndex = 0
    let remaining = 10
    let characters: SearchCharacter[] = []

    // Size the identical character hit areas to stay separate even on narrow screens.
    function resize(): void {
      const width = Math.max(1, field.clientWidth - 48)
      const height = Math.max(1, field.clientHeight - 48)
      let separation = Infinity
      for (let i = 0; i < characters.length; i++) {
        for (let j = i + 1; j < characters.length; j++) {
          separation = Math.min(separation, Math.max(
            Math.abs(characters[i]!.x - characters[j]!.x) * width,
            Math.abs(characters[i]!.y - characters[j]!.y) * height,
          ))
        }
      }
      const size = Math.min(48, separation * 0.9)
      field.style.setProperty('--character-size', `${size}px`)
      field.style.setProperty('--character-font', `${Math.min(16, size * 0.75)}px`)
    }

    function startBoard(): void {
      characters = createSearchBoard()
      remaining = 10
      status.textContent = '10 numbers left'
      next.hidden = true
      prompt.textContent = 'Find a number → click → flip your lens.'
      field.replaceChildren(...characters.map(({ value, x, y }) => {
        const character = el('button', { class: 'number-search-character', type: 'button' }, value)
        character.style.left = `calc(24px + (100% - 48px) * ${x})`
        character.style.top = `calc(24px + (100% - 48px) * ${y})`
        character.addEventListener('click', () => {
          if (ctx.signal.aborted || isTherapyPaused() || document.hidden || character.hidden || !/\d/.test(value)) return
          character.hidden = true
          remaining--
          const now = clock.ms()
          ctx.onTrial({ index: trialIndex++, demand: 0, correct: true, latencyMs: now - onset })
          onset = now
          status.textContent = `${remaining} ${remaining === 1 ? 'number' : 'numbers'} left`
          if (remaining === 0) {
            prompt.textContent = 'All 10 found.'
            next.hidden = false
          }
        })
        return character
      }))
      resize()
      onset = clock.ms()
    }
    next.addEventListener('click', () => {
      if (!ctx.signal.aborted && !isTherapyPaused() && remaining === 0) startBoard()
    })
    const observer = new ResizeObserver(resize)
    observer.observe(field)
    startBoard()
    try {
      await new Promise<void>((resolve) => ctx.signal.addEventListener('abort', () => resolve(), { once: true }))
    } finally {
      observer.disconnect()
      clock.dispose()
      stage.remove()
    }
  },
}
