/**
 * Session-wide reward feedback.
 *
 * Procedures keep their clinically useful right/wrong cues; this adds a small,
 * score-free layer of delight on top of correct responses.  It intentionally has
 * no combo counter or accuracy display: those invite fast guessing in a task where
 * waiting for the percept is part of doing the rep correctly.
 */
export class HitFeedback {
  private audio: AudioContext | null = null
  private enabled = true
  private hitIndex = 0
  private readonly nodes = new Set<HTMLElement>()
  private readonly timers = new Set<number>()

  constructor(private readonly root: HTMLElement) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) {
      for (const node of this.nodes) node.remove()
      this.nodes.clear()
    }
  }

  hit(): void {
    if (!this.enabled) return
    this.hitIndex += 1
    this.playChime()
    this.popCircle()
  }

  dispose(): void {
    for (const timer of this.timers) window.clearTimeout(timer)
    this.timers.clear()
    for (const node of this.nodes) node.remove()
    this.nodes.clear()
    void this.audio?.close()
    this.audio = null
  }

  /** A tiny two-note major/pentatonic flourish, varied so repeated hits feel alive. */
  private playChime(): void {
    const audio = this.audioContext()
    if (!audio) return

    if (audio.state === 'suspended') void audio.resume()

    const roots = [659.25, 739.99, 783.99, 880]
    const root = roots[this.hitIndex % roots.length] ?? roots[0]!
    const notes = [root, root * 1.5]
    const now = audio.currentTime

    notes.forEach((frequency, index) => {
      const oscillator = audio.createOscillator()
      const gain = audio.createGain()
      const startsAt = now + index * 0.035
      const endsAt = startsAt + 0.14

      oscillator.type = index === 0 ? 'sine' : 'triangle'
      oscillator.frequency.setValueAtTime(frequency, startsAt)
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.025, endsAt)
      gain.gain.setValueAtTime(0.0001, startsAt)
      gain.gain.exponentialRampToValueAtTime(index === 0 ? 0.045 : 0.025, startsAt + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, endsAt)
      oscillator.connect(gain).connect(audio.destination)
      oscillator.start(startsAt)
      oscillator.stop(endsAt + 0.02)
    })
  }

  private audioContext(): AudioContext | null {
    if (this.audio) return this.audio
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    this.audio = new Ctor()
    return this.audio
  }

  private popCircle(): void {
    const burst = document.createElement('div')
    burst.className = 'hit-burst'
    burst.setAttribute('aria-hidden', 'true')

    // Most fusion targets live near centre. A small alternating offset keeps the
    // flourish playful without sending the eye on a second, unrelated search task.
    const angle = this.hitIndex * 2.39996
    const radius = 12 + (this.hitIndex % 3) * 7
    burst.style.setProperty('--hit-x', `${Math.cos(angle) * radius}px`)
    burst.style.setProperty('--hit-y', `${Math.sin(angle) * radius}px`)
    burst.style.setProperty('--hit-hue', String(188 + (this.hitIndex % 4) * 18))

    const ring = document.createElement('span')
    ring.className = 'hit-ring'
    burst.append(ring)
    for (let i = 0; i < 5; i++) {
      const particle = document.createElement('i')
      particle.style.setProperty('--particle-angle', `${i * 72 + (this.hitIndex % 2) * 18}deg`)
      particle.style.setProperty('--particle-distance', `${24 + (i % 2) * 9}px`)
      burst.append(particle)
    }

    this.root.append(burst)
    this.nodes.add(burst)
    const timer = window.setTimeout(() => {
      burst.remove()
      this.nodes.delete(burst)
      this.timers.delete(timer)
    }, 620)
    this.timers.add(timer)
  }
}
