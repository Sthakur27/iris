/**
 * Home: the day's plan, the start gate, and the pre-session checklist.
 *
 * Two jobs beyond navigation. First, `canStartSession()` is the only door into a
 * session, and when it says no the reason is shown verbatim rather than the button
 * quietly greying out. Second, the checklist: every item on it is something that
 * invalidates the whole session while still producing a full set of plausible
 * numbers (docs/FAILURE-MODES.md 1.1, 1.4, 1.6, 1.8, 1.9, 1.10).
 */

import { el } from '../router'
import type { Nav, Screen } from '../router'
import {
  DAILY_PROTOCOL,
  JUMP_DUCTIONS,
  jumpDuctionsUnlocked,
  loadSessions,
  loadSettings,
  saveSettings,
} from '../../core/settings'
import { MAX_SESSIONS_PER_DAY, canStartSession, sessionsToday } from '../../core/safety'
import type { EyeSide, Settings } from '../../core/types'
import '../screens.css'

const REST_BETWEEN_PROCEDURES_SECONDS = 30
const STRIP_DAYS = 14

type CheckId =
  | 'glasses'
  | 'ghosting'
  | 'room'
  | 'flipper'
  | 'distance'
  | 'correction'
  | 'orientation'

interface CheckItem {
  id: CheckId
  title: string
  why: string
}

export const homeScreen: Screen = (root, nav) => {
  let settings: Settings = loadSettings()
  let mode: 'home' | 'checklist' = 'home'
  let blockedReason: string | null = null

  const ticked = new Set<CheckId>()
  let eyeCheck: 'ask' | 'ok' | 'mismatch' = 'ask'

  const screen = el('div', { class: 'screen' })
  root.append(screen)

  /* ------------------------------------------------------------------ home */

  function planCard(): HTMLElement {
    const card = el('div', { class: 'card' })
    card.append(el('h2', {}, "Today's plan"))

    let totalSeconds = 0
    for (const step of DAILY_PROTOCOL) {
      totalSeconds += step.seconds
      card.append(
        el(
          'div',
          { class: 'plan-row' },
          el('div', { class: 'name' }, step.label),
          el('div', { class: 'dur' }, formatMinutes(step.seconds)),
        ),
      )
    }

    const unlocked = jumpDuctionsUnlocked()
    if (unlocked) totalSeconds += JUMP_DUCTIONS.seconds
    card.append(
      el(
        'div',
        { class: `plan-row${unlocked ? '' : ' is-locked'}` },
        el('div', { class: 'name' }, unlocked ? JUMP_DUCTIONS.label : `${JUMP_DUCTIONS.label} — locked`),
        el('div', { class: 'dur' }, formatMinutes(JUMP_DUCTIONS.seconds)),
      ),
    )

    if (!unlocked) {
      card.append(
        el(
          'p',
          { class: 'gloss' },
          'Jump Ductions unlocks after you have completed Convergence and Divergence at least once each. ' +
            'It jumps between a converging and a diverging target rather than ramping smoothly, so it only ' +
            'makes sense once you can hold each direction on its own.',
        ),
      )
    }

    const rests = (DAILY_PROTOCOL.length + (unlocked ? 1 : 0) - 1) * REST_BETWEEN_PROCEDURES_SECONDS
    card.append(
      el(
        'p',
        { class: 'gloss' },
        `${formatMinutes(totalSeconds)} of exercises, plus ${REST_BETWEEN_PROCEDURES_SECONDS}-second rests ` +
          `between blocks — about ${formatMinutes(totalSeconds + rests)} in the chair. The rests are part of ` +
          'the treatment, not padding, so there is no way to skip them.',
      ),
    )
    return card
  }

  function startCard(): HTMLElement {
    const card = el('div', { class: 'card' })
    const gate = canStartSession()

    card.append(
      el('h2', {}, 'Start a session'),
      el(
        'p',
        {},
        `Sit at ${settings.calibration.viewingDistanceCm} cm from the screen, dim the room, and have your ` +
          'anaglyph glasses and flippers to hand.',
      ),
    )

    if (!gate.allowed && gate.reason) {
      card.append(el('div', { class: 'notice is-bad' }, el('p', {}, gate.reason)))
    }
    if (blockedReason && blockedReason !== gate.reason) {
      card.append(el('div', { class: 'notice is-bad' }, el('p', {}, blockedReason)))
    }

    const start = el('button', { class: 'primary big-start' }, 'Start session')
    start.addEventListener('click', () => {
      const now = canStartSession()
      if (!now.allowed) {
        blockedReason = now.reason ?? 'This session cannot start right now.'
        render()
        return
      }
      blockedReason = null
      mode = 'checklist'
      ticked.clear()
      eyeCheck = 'ask'
      render()
    })
    card.append(start)

    card.append(
      el(
        'p',
        { class: 'gloss' },
        `${sessionsToday()} of a maximum ${MAX_SESSIONS_PER_DAY} sessions done today. The cap is there because ` +
          'fatigue degrades both performance and learning — a third session makes the data worse, not better.',
      ),
    )
    return card
  }

  function historyCard(): HTMLElement {
    const sessions = loadSessions()
    const card = el('div', { class: 'card' })
    card.append(el('h2', {}, `Last ${STRIP_DAYS} days`))

    const strip = el('div', { class: 'day-strip' })
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    let daysWithSession = 0
    for (let i = STRIP_DAYS - 1; i >= 0; i--) {
      const start = new Date(today)
      start.setDate(today.getDate() - i)
      const end = new Date(start)
      end.setDate(start.getDate() + 1)
      const count = sessions.filter(
        (s) => s.startedAt >= start.getTime() && s.startedAt < end.getTime(),
      ).length
      if (count > 0) daysWithSession++
      const box = el('div', { class: `day${count > 0 ? ' is-done' : ''}` })
      box.title = `${start.toLocaleDateString()} — ${count} session${count === 1 ? '' : 's'}`
      strip.append(box)
    }

    card.append(
      strip,
      el(
        'p',
        { class: 'gloss' },
        `${daysWithSession} of the last ${STRIP_DAYS} days had a session. This is here as a fact about ` +
          'frequency, not a score: vision therapy responds to short daily practice, so a missed day is a ' +
          'missed day and nothing more.',
      ),
    )
    return card
  }

  /* ------------------------------------------------------------- checklist */

  function checkItems(): CheckItem[] {
    return [
      {
        id: 'glasses',
        title: 'Anaglyph glasses are on, and the lenses are clean',
        why: 'A smudged or scratched lens leaks the other eye’s image through, so both eyes see both pictures and nothing is actually being separated.',
      },
      {
        id: 'ghosting',
        title: 'Ghosting check: close one eye — can you still faintly see the other colour?',
        why: 'Look at the red and blue squares below with one eye closed. If the blocked colour is still faintly visible instead of near-black, clean the lenses or dim the room. Faint leakage lets you "succeed" without ever fusing anything.',
      },
      {
        id: 'room',
        title: 'The room is dim — no lamp or window washing out the screen',
        why: 'Bright ambient light lifts the black level, which collapses the separation between the red and blue channels.',
      },
      {
        id: 'flipper',
        title: 'The correct flipper is in my hand, with the level number facing me',
        why: 'Accommodative Rock (training how fast your eyes can change focus) trains whatever power is actually in front of your eye. A flipper held backwards trains the opposite power all session.',
      },
      {
        id: 'distance',
        title: `I am sitting ${settings.calibration.viewingDistanceCm} cm from the screen`,
        why: 'That is the distance this app is calibrated to. Sitting closer silently reduces the demand while the screen still reports the old difficulty.',
      },
      {
        id: 'correction',
        title: 'I am wearing my glasses or contacts exactly as in my last session',
        why: 'Switching between corrected and uncorrected vision between sessions makes the sessions mutually incomparable, and the charts cannot tell.',
      },
    ]
  }

  function checkRow(item: CheckItem): HTMLElement {
    const box = el('input', { type: 'checkbox', checked: ticked.has(item.id) })
    box.addEventListener('change', () => {
      if (box.checked) ticked.add(item.id)
      else ticked.delete(item.id)
      updateBegin()
    })
    return el(
      'li',
      { class: 'check-item' },
      box,
      el(
        'div',
        { class: 'body' },
        el('div', { class: 'title' }, item.title),
        el('p', { class: 'muted' }, item.why),
      ),
    )
  }

  /** One-click re-run of the setup eye check: 1.1 is worth re-verifying every session. */
  function orientationRow(): HTMLElement {
    const expected: 'red' | 'blue' = settings.calibration.redEye === 'right' ? 'blue' : 'red'
    const body = el('div', { class: 'body' })
    const box = el('input', { type: 'checkbox', checked: eyeCheck === 'ok' })
    box.disabled = true

    body.append(
      el('div', { class: 'title' }, 'Red/blue orientation check'),
      el(
        'p',
        { class: 'muted' },
        'Close your LEFT eye and click the square that goes black. Saved setting: red lens over your ' +
          `${settings.calibration.redEye.toUpperCase()} eye. If this is the wrong way round, every convergence ` +
          'rep trains divergence instead.',
      ),
    )

    if (eyeCheck === 'ask') {
      body.append(
        el(
          'div',
          { class: 'swatch-stage' },
          swatchButton('red', () => resolveEyeCheck('red', expected)),
          swatchButton('blue', () => resolveEyeCheck('blue', expected)),
        ),
      )
    }

    if (eyeCheck === 'ok') {
      body.append(
        el(
          'p',
          { class: 'muted good' },
          `Matches your saved setting: red lens over your ${settings.calibration.redEye} eye.`,
        ),
      )
    }

    if (eyeCheck === 'mismatch') {
      const flipped: EyeSide = settings.calibration.redEye === 'right' ? 'left' : 'right'
      const retry = el('button', {}, 'The glasses were upside down — let me retry')
      retry.addEventListener('click', () => {
        eyeCheck = 'ask'
        render()
      })
      const update = el('button', {}, `Update the setting: red lens over my ${flipped} eye`)
      update.addEventListener('click', () => {
        settings = { ...settings, calibration: { ...settings.calibration, redEye: flipped } }
        saveSettings(settings)
        eyeCheck = 'ok'
        render()
      })
      body.append(
        el(
          'div',
          { class: 'notice is-bad' },
          el(
            'p',
            {},
            'That is the opposite of what is saved. Either the glasses are on upside down, or the saved ' +
              'setting is wrong. Fix it now — running the session like this trains the exact opposite of ' +
              'what was prescribed.',
          ),
        ),
        el('div', { class: 'actions' }, retry, update),
      )
    }

    return el('li', { class: 'check-item' }, box, body)
  }

  function swatchButton(colour: 'red' | 'blue', onPick: () => void): HTMLElement {
    const button = el('button', { class: `swatch swatch-${colour}` })
    button.setAttribute('aria-label', `${colour} square`)
    button.addEventListener('click', onPick)
    return el(
      'div',
      { class: 'swatch-wrap' },
      button,
      el('div', { class: 'muted' }, colour.toUpperCase()),
    )
  }

  function resolveEyeCheck(clicked: 'red' | 'blue', expected: 'red' | 'blue'): void {
    if (clicked === expected) {
      eyeCheck = 'ok'
      ticked.add('orientation')
    } else {
      eyeCheck = 'mismatch'
      ticked.delete('orientation')
    }
    render()
  }

  let beginButton: HTMLButtonElement | null = null
  let beginNote: HTMLElement | null = null

  function updateBegin(): void {
    const items = checkItems()
    const outstanding = items.filter((i) => !ticked.has(i.id)).length + (eyeCheck === 'ok' ? 0 : 1)
    if (beginButton) beginButton.disabled = outstanding > 0
    if (beginNote) {
      beginNote.textContent =
        outstanding > 0
          ? `${outstanding} item${outstanding === 1 ? '' : 's'} left to confirm. Every one of them can ruin a ` +
            'session without the app being able to detect it, which is why none of them can be skipped.'
          : 'All checks confirmed. The session starts on a black screen and runs about half an hour.'
    }
  }

  function checklistView(): HTMLElement[] {
    const card = el('div', { class: 'card' })
    card.append(
      el('h2', {}, 'Before you start'),
      el(
        'p',
        {},
        'Each of these fails silently: the session would still produce a full set of believable numbers ' +
          'while training nothing. Tick each one as you actually do it.',
      ),
    )

    const list = el('ul', { class: 'checklist' })
    for (const item of checkItems()) list.append(checkRow(item))
    list.append(orientationRow())
    card.append(list)

    if (eyeCheck === 'ok') ticked.add('orientation')

    beginButton = el('button', { class: 'primary big-start' }, 'Begin session')
    beginButton.addEventListener('click', () => {
      const gate = canStartSession()
      if (!gate.allowed) {
        blockedReason = gate.reason ?? 'This session cannot start right now.'
        mode = 'home'
        render()
        return
      }
      nav.go('session')
    })

    const cancel = el('button', {}, 'Not now')
    cancel.addEventListener('click', () => {
      mode = 'home'
      render()
    })

    beginNote = el('p', { class: 'gloss' })
    card.append(el('div', { class: 'actions' }, beginButton, cancel), beginNote)
    updateBegin()
    return [card]
  }

  /* ---------------------------------------------------------------- render */

  function header(nav_: Nav): HTMLElement {
    const settingsButton = el('button', {}, 'Settings')
    settingsButton.addEventListener('click', () => nav_.go('settings'))
    const resultsButton = el('button', {}, 'Results')
    resultsButton.addEventListener('click', () => nav_.go('results'))
    return el(
      'div',
      { class: 'head' },
      el('h1', {}, 'SidVision'),
      el('div', { class: 'actions' }, resultsButton, settingsButton),
    )
  }

  function render(): void {
    const children: HTMLElement[] = [header(nav)]

    if (mode === 'checklist') {
      children.push(...checklistView())
      screen.replaceChildren(...children)
      return
    }

    children.push(
      el(
        'p',
        {},
        'Practice software for a home vision therapy programme, not a diagnosis. It cannot measure your ' +
          'eyes; it can only give you a consistent exercise and an honest record of how it went. Anything ' +
          'that feels clinically wrong belongs in front of an optometrist, not in this app.',
      ),
      planCard(),
      startCard(),
      historyCard(),
    )
    screen.replaceChildren(...children)
  }

  render()
}

function formatMinutes(seconds: number): string {
  const minutes = seconds / 60
  if (Number.isInteger(minutes)) return `${minutes} min`
  return `${Math.floor(minutes)} min ${seconds % 60} s`
}
