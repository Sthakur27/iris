import { el } from '../ui/router'

/**
 * Draggable stimulus placement plus an opt-in auto-relocation mode, shared by the
 * fixed-target procedures (the vergence family and Accommodative Rock).
 *
 * Manual mode: dragging anywhere on the stage background — or on the stimulus
 * itself — moves the stimulus, and the drop point is remembered per exercise.
 * Like the size slider, the right spot for a screen and a chair does not change
 * day to day, so it should not need re-finding.
 *
 * Auto mode: every few answers the stimulus relocates, and its size wobbles
 * inside a narrow band around the user's chosen scale. Relocations are DISCRETE
 * jumps, never motion — a target that drifts trains smooth pursuit and lets slow
 * tonic adaptation ride along with it, while a hard jump has to be met by the
 * fast phasic system re-acquiring and re-fusing from scratch, which is the whole
 * point of varying position. The jump interval is randomised for the same
 * reason: a predictable beat invites an anticipatory move to where the target
 * is about to be.
 */

export interface StagePlacement {
  /** Small "auto" checkbox, styled to sit inline beside a size slider. */
  autoToggle: HTMLElement
  /** Multiplier auto mode applies to the user's chosen size. 1 until a jump. */
  sizeJitter(): number
  /** Counts one scored answer toward the next relocation. */
  answered(): void
  /** True when auto mode wants to relocate. The caller picks the safe boundary. */
  jumpDue(): boolean
  /** Relocate now: new random position, new size jitter, new interval. */
  jump(): void
  /** Re-clamp and re-apply the current offset. Call after resizes and repaints. */
  apply(): void
}

interface Fractions {
  fx: number
  fy: number
}

/** Answers between relocations. Re-randomised per stint so the beat is not learnable. */
const JUMP_AFTER_MIN = 4
const JUMP_AFTER_MAX = 8

/** How far auto mode may wobble the size, as a band around the user's own scale. */
const SIZE_JITTER_BAND = 0.15

function clampNum(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value))
}

function randInt(lo: number, hi: number): number {
  return lo + Math.floor(Math.random() * (hi - lo + 1))
}

export function createStagePlacement(opts: {
  procedureId: string
  /** Drag surface. Pointer events bind here, so they die with the stage node. */
  stage: HTMLElement
  /** The element the offset moves — via transform, so a jump is one repaint. */
  target: HTMLElement
  /** Cap on the offset, as a fraction of the viewport from centre, both axes. */
  maxFraction: number
  /** Weight auto positions toward the lower half of the screen (downgaze). */
  downBias: boolean
  /** Current stimulus footprint, so the clamp can keep it fully on screen. */
  elemSize(): { w: number; h: number }
  /** Fired when the helper changes the size jitter, so the caller can re-layout. */
  onChange?(): void
}): StagePlacement {
  const offsetKey = `iris.offset.${opts.procedureId}.v1`
  const autoKey = `iris.autoJump.${opts.procedureId}.v1`
  const maxF = opts.maxFraction

  function clampFractions(f: Fractions): Fractions {
    return { fx: clampNum(f.fx, -maxF, maxF), fy: clampNum(f.fy, -maxF, maxF) }
  }

  function loadHome(): Fractions {
    try {
      const raw = JSON.parse(localStorage.getItem(offsetKey) ?? 'null') as {
        fx?: unknown
        fy?: unknown
      } | null
      const fx = Number(raw?.fx)
      const fy = Number(raw?.fy)
      if (Number.isFinite(fx) && Number.isFinite(fy)) return clampFractions({ fx, fy })
    } catch {
      // A corrupt stored value is the same as no stored value.
    }
    return { fx: 0, fy: 0 }
  }

  /** The user's remembered spot. Auto jumps are transient and never overwrite it. */
  let home = loadHome()
  let current = { ...home }
  let auto = localStorage.getItem(autoKey) === '1'
  let jitter = 1
  let answers = 0
  let due = randInt(JUMP_AFTER_MIN, JUMP_AFTER_MAX)

  function applyNow(): void {
    const { w, h } = opts.elemSize()
    // Stored as fractions of the viewport so the spot survives a resize; the
    // pixel clamp then keeps the stimulus entirely on screen, because a clipped
    // target is unanswerable, not just ugly.
    const maxX = Math.min(maxF * window.innerWidth, Math.max(0, (window.innerWidth - w) / 2 - 12))
    const maxY = Math.min(maxF * window.innerHeight, Math.max(0, (window.innerHeight - h) / 2 - 12))
    const x = Math.round(clampNum(current.fx * window.innerWidth, -maxX, maxX))
    const y = Math.round(clampNum(current.fy * window.innerHeight, -maxY, maxY))
    opts.target.style.transform = x === 0 && y === 0 ? '' : `translate(${x}px, ${y}px)`
  }

  // --- Drag to reposition ----------------------------------------------------
  opts.stage.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0) return
    const hit = e.target as HTMLElement | null
    // Controls and overlays keep their own pointer behaviour: a drag starts only
    // on the bare stage background or on the stimulus itself.
    if (hit !== opts.stage && !(hit && opts.target.contains(hit))) return
    e.preventDefault()

    const startFx = current.fx
    const startFy = current.fy
    const startX = e.clientX
    const startY = e.clientY
    opts.stage.setPointerCapture(e.pointerId)

    const onMove = (ev: PointerEvent): void => {
      current = clampFractions({
        fx: startFx + (ev.clientX - startX) / window.innerWidth,
        fy: startFy + (ev.clientY - startY) / window.innerHeight,
      })
      applyNow()
    }
    const onUp = (): void => {
      opts.stage.removeEventListener('pointermove', onMove)
      opts.stage.removeEventListener('pointerup', onUp)
      opts.stage.removeEventListener('pointercancel', onUp)
      // The drop point becomes the remembered spot even while auto is on: a
      // deliberate drag is the user saying "from here", whoever moved it last.
      home = { ...current }
      localStorage.setItem(offsetKey, JSON.stringify(home))
    }
    opts.stage.addEventListener('pointermove', onMove)
    opts.stage.addEventListener('pointerup', onUp)
    opts.stage.addEventListener('pointercancel', onUp)
  })

  // --- Auto toggle -------------------------------------------------------------
  const box = el('input', { type: 'checkbox' })
  box.style.cssText = 'accent-color:#8b97a6;margin:0'
  box.checked = auto
  const toggle = el('label', { title: 'Relocate the target every few answers' })
  toggle.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer'
  toggle.append(box, 'auto')

  box.addEventListener('change', () => {
    auto = box.checked
    localStorage.setItem(autoKey, auto ? '1' : '0')
    // Space is the answer channel; a focused checkbox would swallow it as a toggle.
    box.blur()
    if (!auto) {
      // Auto's transient position and size leave with it; the remembered spot returns.
      current = { ...home }
      jitter = 1
      answers = 0
      due = randInt(JUMP_AFTER_MIN, JUMP_AFTER_MAX)
      opts.onChange?.()
      applyNow()
    }
  })

  function sampleFy(): number {
    if (!opts.downBias) return (Math.random() * 2 - 1) * maxF
    // Near-vision work happens in downgaze, so most positions land below centre;
    // the rest stay uniform so the upper field is not abandoned outright.
    return Math.random() < 0.7 ? Math.random() * maxF : (Math.random() * 2 - 1) * maxF
  }

  return {
    autoToggle: toggle,
    sizeJitter: () => jitter,
    answered() {
      answers += 1
    },
    jumpDue: () => auto && answers >= due,
    jump() {
      // A jump that lands next door reads as jitter, not as a new location to
      // re-fuse at, so resample until the stride is a decent share of the range.
      let next = current
      for (let i = 0; i < 6; i++) {
        next = { fx: (Math.random() * 2 - 1) * maxF, fy: sampleFy() }
        if (Math.hypot(next.fx - current.fx, next.fy - current.fy) >= maxF * 0.5) break
      }
      current = clampFractions(next)
      // A band around the user's chosen size, not a new size: the slider stays
      // theirs; the wobble only keeps a fixed retinal image from being memorised.
      jitter = 1 - SIZE_JITTER_BAND + Math.random() * 2 * SIZE_JITTER_BAND
      answers = 0
      due = randInt(JUMP_AFTER_MIN, JUMP_AFTER_MAX)
      opts.onChange?.()
      applyNow()
    },
    apply: applyNow,
  }
}

/* ------------------------------------------------------------- size scales */

export function loadStoredScale(key: string): number {
  const raw = Number(localStorage.getItem(key))
  return Number.isFinite(raw) && raw >= 0.5 && raw <= 2 ? raw : 1
}

export function saveStoredScale(key: string, scale: number): void {
  localStorage.setItem(key, String(scale))
}
