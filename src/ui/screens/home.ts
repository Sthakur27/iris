/**
 * Home: the day's plan, the start gate, and the pre-session checklist.
 *
 * Two jobs beyond navigation. First, `canStartSession()` is the only door into a
 * session, and when it says no the reason is shown verbatim rather than the button
 * quietly greying out. Second, the checklist: every item on it is something that
 * invalidates the whole session while still producing a full set of plausible
 * numbers (docs/FAILURE-MODES.md 1.1, 1.4, 1.6, 1.8, 1.9, 1.10).
 *
 * The two ways to train are top-level tabs rather than a primary button with a
 * secondary section underneath. Both routes end up in the same checklist and both
 * set the same pending-session request; the tabs only decide which one you are
 * looking at, never whether a session may start.
 */

import { el } from '../router'
import type { Nav, Screen } from '../router'
import {
  DAILY_PROTOCOL,
  JUMP_DUCTIONS,
  jumpDuctionsUnlocked,
  loadSessions,
  loadSettings,
} from '../../core/settings'
import { MAX_SESSIONS_PER_DAY, canStartSession, sessionsToday } from '../../core/safety'
import { exercisePreviewCard, toProcedureId } from '../exercisePreview'
import { setPendingSession } from '../../core/sessionState'
import type { SessionRequest } from '../../core/sessionState'
import type { Settings } from '../../core/types'
import '../screens.css'

const REST_BETWEEN_PROCEDURES_SECONDS = 30
const STRIP_DAYS = 14

/** The two top-level views on the home screen. */
type HomeTab = 'plan' | 'self'

interface CheckItem {
  title: string
  why: string
}

export const homeScreen: Screen = (root, nav) => {
  let settings: Settings = loadSettings()
  /*
   * View state comes from the route, not from closure alone.
   *
   * The preview used to be a plain flag, so the browser back button did nothing when
   * you were looking at one — you would press it expecting to escape and either
   * nothing happened or you left the app. Both the tab and the preview now live in
   * the URL, which gives each a real history entry and makes back mean what it looks
   * like it means.
   */
  const routeParams = nav.params()
  let mode: 'home' | 'checklist' = routeParams.view === 'prepare' ? 'checklist' : 'home'
  let tab: HomeTab = routeParams.tab === 'self' ? 'self' : 'plan'
  let selfGuidedHalf = false
  let blockedReason: string | null = null

  // What the checklist is about to launch, so its closing note can describe the
  // right thing — "about half an hour" is a lie in front of a five-minute run.
  let requested: SessionRequest = { mode: 'plan' }

  const screen = el('div', { class: 'screen' })
  root.append(screen)

  /* ------------------------------------------------------------------ home */

  /**
   * The single door into a session, shared by both tabs.
   *
   * The gate is re-checked here rather than trusted from render time: the daily cap
   * and the rest interval can both come true while the home screen is just sitting
   * open, and a stale render must not be a way past them.
   */
  function beginWith(request: SessionRequest): void {
    const now = canStartSession()
    if (!now.allowed) {
      blockedReason = now.reason ?? 'This session cannot start right now.'
      render()
      return
    }
    blockedReason = null
    requested = request
    setPendingSession(request)
    mode = 'checklist'
    // Pushes a history entry, so browser back leaves the preview rather than the app.
    nav.go('home', { tab, view: 'prepare' })
  }

  /** Refusals are stated in full, on whichever tab you are standing on. */
  function gateNotices(): HTMLElement[] {
    const gate = canStartSession()
    const notices: HTMLElement[] = []
    if (!gate.allowed && gate.reason) {
      notices.push(el('div', { class: 'notice is-bad' }, el('p', {}, gate.reason)))
    }
    if (blockedReason && blockedReason !== gate.reason) {
      notices.push(el('div', { class: 'notice is-bad' }, el('p', {}, blockedReason)))
    }
    return notices
  }

  function sessionsTodayNote(): HTMLElement {
    return el(
      'p',
      { class: 'gloss' },
      `${sessionsToday()} of a maximum ${MAX_SESSIONS_PER_DAY} sessions done today. The cap is there because ` +
        'fatigue degrades both performance and learning — a third session makes the data worse, not better.',
    )
  }

  function tabs(): HTMLElement {
    const row = el('div', { class: 'steps home-tabs' })
    row.setAttribute('role', 'tablist')
    const labels: [HomeTab, string][] = [
      ['plan', 'Structured plan'],
      ['self', 'Self-guided'],
    ]
    for (const [id, label] of labels) {
      const b = el('button', { class: tab === id ? 'primary' : '' }, label)
      b.setAttribute('role', 'tab')
      b.setAttribute('aria-selected', String(tab === id))
      b.addEventListener('click', () => {
        tab = id
        // `replace`, not `go`: flipping between two tabs is not something people
        // expect to unwind one press at a time, but the URL must still say which
        // tab you are on so a reload — or backing out of a preview — returns here.
        nav.replace('home', { tab })
      })
      row.append(b)
    }
    return row
  }

  /** The exercises available to run on their own: the protocol, plus Jump Ductions once earned. */
  function availableProcedures(): { id: string; label: string; seconds: number }[] {
    const list: { id: string; label: string; seconds: number }[] = [...DAILY_PROTOCOL]
    if (jumpDuctionsUnlocked()) list.push(JUMP_DUCTIONS)
    return list
  }

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
          'the treatment rather than padding. You can skip a rest if you need to, and skipped rests are recorded.',
      ),
    )
    return card
  }

  function startCard(): HTMLElement {
    const card = el('div', { class: 'card' })

    card.append(
      el('h2', {}, 'Start a session'),
      el(
        'p',
        {},
        `Sit at ${settings.calibration.viewingDistanceCm} cm from the screen, dim the room, and have your ` +
          'anaglyph glasses and flippers to hand.',
      ),
    )

    card.append(...gateNotices())

    const start = el('button', { class: 'primary big-start' }, 'Start the full plan')
    start.addEventListener('click', () => beginWith({ mode: 'plan' }))
    card.append(start)

    card.append(sessionsTodayNote())
    return card
  }

  /**
   * Self-guided: one exercise, for as long as you feel like.
   *
   * The structured plan is the better treatment and stays the recommended path. But
   * a 27-minute commitment is the thing people skip entirely on a bad day, and the
   * measured adherence numbers for home vision therapy are dire — roughly a quarter
   * to a third of prescribed sessions actually get done. Five minutes of one exercise
   * beats the nothing that a 27-minute ask often turns into.
   *
   * The rows deliberately mirror the plan list, down to the `.plan-row` markup, so
   * that this reads as the same programme taken one piece at a time rather than as a
   * different feature.
   */
  function selfGuidedCard(): HTMLElement {
    const card = el('div', { class: 'card' })
    card.append(
      el('h2', {}, 'One exercise, now'),
      el(
        'p',
        {},
        'Press play and that exercise runs for the length the programme prescribes for it — the same number ' +
          'the Structured plan tab shows. It is recorded exactly like a full session.',
      ),
    )

    card.append(...gateNotices())

    // Half length is the one deviation on offer. There is no free-form minutes box:
    // each exercise already has a prescribed duration, and asking for a number the
    // user has no basis for choosing invites a guess to override the right answer.
    const halfBox = el('input', { type: 'checkbox', checked: selfGuidedHalf })
    const durationCells: { cell: HTMLElement; seconds: number }[] = []
    const paintDurations = (): void => {
      for (const { cell, seconds } of durationCells) {
        cell.textContent = formatMinutes(selfGuidedHalf ? seconds / 2 : seconds)
      }
    }
    halfBox.addEventListener('change', () => {
      selfGuidedHalf = halfBox.checked
      paintDurations()
    })
    card.append(
      el(
        'label',
        { class: 'half-toggle' },
        halfBox,
        el('span', {}, 'Half length — shorter than prescribed, but far better than skipping it'),
      ),
    )

    for (const step of availableProcedures()) {
      const dur = el('div', { class: 'dur' })
      durationCells.push({ cell: dur, seconds: step.seconds })

      const play = el('button', { class: 'row-play' }, '▶')
      play.setAttribute('aria-label', `Start ${step.label}`)
      play.title = `Start ${step.label} on its own`
      play.addEventListener('click', () => {
        const seconds = selfGuidedHalf ? step.seconds / 2 : step.seconds
        beginWith({ mode: 'single', procedureId: step.id, minutes: seconds / 60 })
      })

      card.append(el('div', { class: 'plan-row' }, el('div', { class: 'name' }, step.label), dur, play))
    }
    paintDurations()

    card.append(
      el(
        'p',
        { class: 'gloss' },
        'This is not quite the same treatment: the structured plan rotates the exercises on purpose, and ' +
          'rotating them works better than repeating one. It is here for the days the full plan would not ' +
          'happen at all.',
      ),
    )

    if (!jumpDuctionsUnlocked()) {
      card.append(
        el(
          'p',
          { class: 'gloss' },
          'Jump Ductions is not in this list yet — it appears once you have completed Convergence and ' +
            'Divergence at least once each, for the reason given on the Structured plan tab.',
        ),
      )
    }

    card.append(sessionsTodayNote())
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

  /* ------------------------------------------------------------- reminders */

  function checkItems(): CheckItem[] {
    return [
      {
        title: 'Anaglyph glasses on, lenses clean',
        why: 'A smudged or scratched lens leaks the other eye’s image through, so both eyes see both pictures and nothing is actually being separated.',
      },
      {
        title: 'Ghosting check: close one eye — can you still faintly see the other colour?',
        why: 'If the blocked colour is still faintly visible instead of near-black, clean the lenses or dim the room. Faint leakage lets you "succeed" without ever fusing anything.',
      },
      {
        title: 'Room dim — no lamp or window washing out the screen',
        why: 'Bright ambient light lifts the black level, which collapses the separation between the red and blue channels.',
      },
      {
        title: 'Correct flipper in hand, level number facing you',
        why: 'Accommodative Rock (training how fast your eyes can change focus) trains whatever power is actually in front of your eye. A flipper held backwards trains the opposite power all session.',
      },
      {
        title: `Sitting ${settings.calibration.viewingDistanceCm} cm from the screen`,
        why: 'That is the distance this app is calibrated to. Sitting closer silently reduces the demand while the screen still reports the old difficulty.',
      },
      {
        title: 'Same glasses or contacts as your last session',
        why: 'Switching between corrected and uncorrected vision between sessions makes the sessions mutually incomparable, and the charts cannot tell.',
      },
    ]
  }

  function checkRow(item: CheckItem): HTMLElement {
    return el(
      'li',
      { class: 'check-item' },
      el('span', { class: 'check-bullet' }, '•'),
      el(
        'div',
        { class: 'body' },
        el('div', { class: 'title' }, item.title),
        el('p', { class: 'muted' }, item.why),
      ),
    )
  }

  /**
   * Orientation is stated, not tested.
   *
   * The old version asked you to close one eye and click the square that vanished.
   * Working out which lens you are looking through is genuinely confusing, and a
   * wrong answer silently inverts every exercise for the whole session. Red over the
   * right eye is now simply the required orientation, shown rather than inferred.
   */
  function orientationRow(): HTMLElement {
    const body = el(
      'div',
      { class: 'body' },
      el('div', { class: 'title' }, 'Red lens goes over your RIGHT eye'),
      el(
        'p',
        { class: 'muted' },
        'Worn the other way round, every convergence rep trains divergence and nothing on screen looks ' +
          'wrong. Check the glasses on your face right now rather than from memory.',
      ),
      el('div', { class: 'orientation-pair' }, miniGlasses(true), miniGlasses(false)),
    )

    return el('li', { class: 'check-item' }, el('span', { class: 'check-bullet' }, '•'), body)
  }

  /** Drawn as if you are wearing them and looking out: right of picture = right eye. */
  function miniGlasses(correct: boolean): HTMLElement {
    const leftColour = correct ? 'blue' : 'red'
    const rightColour = correct ? 'red' : 'blue'
    return el(
      'div',
      { class: `glasses${correct ? ' is-correct' : ' is-wrong'}` },
      el('div', { class: 'glasses-mark' }, correct ? '✓' : '✗'),
      el(
        'div',
        { class: 'glasses-lenses' },
        el('div', { class: `lens lens-${leftColour}` }, el('span', {}, 'your\nleft eye')),
        el('div', { class: 'glasses-bridge' }),
        el('div', { class: `lens lens-${rightColour}` }, el('span', {}, 'your\nright eye')),
      ),
      el('div', { class: 'glasses-caption' }, correct ? 'Correct' : 'Turn them over'),
    )
  }


  /** What is about to run, so the reminder screen never promises the wrong length. */
  function requestedDescription(): string {
    // Copied to a const because `requested` is reassigned from another closure,
    // which stops TypeScript narrowing the union on the field access below.
    const request: SessionRequest = requested
    if (request.mode === 'plan') {
      return 'The full plan starts on a black screen and runs about half an hour, rests included.'
    }
    const step = availableProcedures().find((p) => p.id === request.procedureId)
    const name = step ? step.label : 'This exercise'
    return `${name} on its own, ${formatMinutes(request.minutes * 60)}, starting on a black screen.`
  }

  /**
   * The way out.
   *
   * `tab` is closure state that the checklist never touches, so returning here lands
   * on whichever tab launched the session — going back must not silently move you.
   */
  function goBack(): void {
    // Delegates to history so the in-app control and the browser button behave
    // identically, instead of the two drifting into different notions of "back".
    nav.back()
  }

  function backRow(): HTMLElement {
    const label = tab === 'plan' ? '← Back to today’s plan' : '← Back to Self-guided'
    const back = el('button', { class: 'back-button' }, label)
    back.addEventListener('click', goBack)
    return el('div', { class: 'back-row' }, back)
  }

  /** Which exercise the preview should show, and what to say about the rest. */
  function previewCard(): HTMLElement | null {
    const request: SessionRequest = requested
    const first = DAILY_PROTOCOL[0]
    const step =
      request.mode === 'plan'
        ? first
        : availableProcedures().find((p) => p.id === request.procedureId)
    if (!step) return null

    const id = toProcedureId(step.id)
    if (!id) return null

    return exercisePreviewCard({
      procedureId: id,
      label: step.label,
      settings,
      planNote:
        request.mode === 'plan'
          ? `${step.label} is where the session opens. It then moves through the rest of the plan in ` +
            'order, with a rest between each one, and each exercise explains itself as it starts.'
          : null,
    })
  }

  /**
   * Reminders, not a gate.
   *
   * Everything in the list fails silently — the session would still produce a full set
   * of believable numbers while training nothing — so it is worth reading. But none of
   * it is machine-checkable, so making the user confirm it only bought a click-through
   * ritual, and that ritual is exactly the friction that stops people doing their
   * exercises. Begin is always live; the real gate is `canStartSession()`, which is
   * re-checked below and blocks on calibration drift and the daily cap.
   *
   * Split across three cards, in the order a first-timer needs them: how to leave,
   * what they are about to see, then what to check before they meet it.
   */
  function checklistView(): HTMLElement[] {
    const card = el('div', { class: 'card' })
    card.append(el('h2', {}, 'Before you start'))

    card.append(...gateNotices())

    const begin = el('button', { class: 'primary big-start' }, 'Begin session')
    begin.addEventListener('click', () => {
      const gate = canStartSession()
      if (!gate.allowed) {
        blockedReason = gate.reason ?? 'This session cannot start right now.'
        mode = 'home'
        nav.replace('home', { tab })
        return
      }
      nav.go('session')
    })

    // A second way out, next to Begin. The reminder list is long enough that someone
    // who changes their mind at the bottom of it should not have to hunt upward.
    const cancel = el('button', {}, 'Not now')
    cancel.addEventListener('click', goBack)

    card.append(
      el('div', { class: 'actions' }, begin, cancel),
      el('p', { class: 'gloss' }, requestedDescription()),
    )

    const reminders = el('div', { class: 'card' })
    reminders.append(
      el('h2', {}, 'Worth a quick read first'),
      el(
        'p',
        {},
        'Nothing to tick off. Each of these fails silently: the session would still produce a full set of ' +
          'believable numbers while training nothing, and the app cannot detect any of them.',
      ),
    )
    const list = el('ul', { class: 'checklist' })
    for (const item of checkItems()) list.append(checkRow(item))
    list.append(orientationRow())
    reminders.append(list)

    const preview = previewCard()
    return preview ? [backRow(), card, preview, reminders] : [backRow(), card, reminders]
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
      el('h1', {}, 'Iris'),
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
      tabs(),
    )

    if (tab === 'plan') children.push(planCard(), startCard())
    else children.push(selfGuidedCard())

    children.push(historyCard())
    screen.replaceChildren(...children)
  }

  render()
}

function formatMinutes(seconds: number): string {
  const minutes = seconds / 60
  if (Number.isInteger(minutes)) return `${minutes} min`
  return `${Math.floor(minutes)} min ${seconds % 60} s`
}
