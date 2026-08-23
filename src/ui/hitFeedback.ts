/**
 * Session-wide reward feedback.
 *
 * Procedures keep their clinically useful right/wrong cues; this adds a small,
 * score-free layer of delight on top of correct responses.  It intentionally has
 * no combo counter or accuracy display: those invite fast guessing in a task where
 * waiting for the percept is part of doing the rep correctly.
 */
/**
 * Consecutive hits climb a pentatonic step each, capped here. The ramp is the
 * combo counter this app refuses to draw: the ear gets the rising streak, the
 * screen never shows a number that would reward fast guessing over waiting for
 * the percept.
 */
const STREAK_CAP = 8

/** E-major pentatonic, so any streak height still lands somewhere musical. */
const PENTATONIC = [659.25, 739.99, 830.61, 987.77, 1108.73, 1318.51, 1479.98, 1661.22, 1975.53]

export class HitFeedback {
  private audio: AudioContext | null = null
  private enabled = true
  private hitIndex = 0
  private streak = 0
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

  hit(point?: { x: number; y: number }): void {
    if (!this.enabled) return
    this.hitIndex += 1
    this.streak = Math.min(this.streak + 1, STREAK_CAP)
    this.playChime()
    this.popCircle(point)
  }

  /**
   * A wrong or unanswerable rep resets the pitch ramp and nothing else — no sound
   * of its own, because every procedure already plays its own incorrect tone and a
   * second layer of failure audio would just be punishment in stereo.
   */
  miss(point?: { x: number; y: number }): void {
    this.streak = 0
    if (this.enabled && point) this.popCircle(point, 'miss')
  }

  dispose(): void {
    for (const timer of this.timers) window.clearTimeout(timer)
    this.timers.clear()
    for (const node of this.nodes) node.remove()
    this.nodes.clear()
    void this.audio?.close()
    this.audio = null
  }

  /**
   * An osu-style hitsound: a short band-passed noise click for the tactile snap,
   * under a bright tone with a quieter octave partial. The tone's pitch climbs the
   * pentatonic scale with the current streak, so a run of clean hits is audible as
   * a rising line without a single number appearing on screen.
   */
  private playChime(): void {
    const audio = this.audioContext()
    if (!audio) return

    if (audio.state === 'suspended') void audio.resume()

    const root = PENTATONIC[Math.min(this.streak - 1, PENTATONIC.length - 1)] ?? PENTATONIC[0]!
    const now = audio.currentTime

    // The click: ~30ms of white noise through a bandpass. This is what makes it
    // feel like hitting something rather than being played a note.
    const clickDur = 0.03
    const noise = audio.createBufferSource()
    const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * clickDur), audio.sampleRate)
    const samples = buffer.getChannelData(0)
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1
    noise.buffer = buffer
    const bandpass = audio.createBiquadFilter()
    bandpass.type = 'bandpass'
    bandpass.frequency.value = 2600
    bandpass.Q.value = 1.1
    const clickGain = audio.createGain()
    clickGain.gain.setValueAtTime(0.09, now)
    clickGain.gain.exponentialRampToValueAtTime(0.0001, now + clickDur)
    noise.connect(bandpass).connect(clickGain).connect(audio.destination)
    noise.start(now)

    // The tone and its octave-up partial, fast attack, short exponential tail.
    const partials: [number, number, OscillatorType][] = [
      [root, 0.05, 'sine'],
      [root * 2, 0.02, 'triangle'],
    ]
    for (const [frequency, peak, type] of partials) {
      const oscillator = audio.createOscillator()
      const gain = audio.createGain()
      const endsAt = now + 0.13

      oscillator.type = type
      oscillator.frequency.setValueAtTime(frequency, now)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(peak, now + 0.008)
      gain.gain.exponentialRampToValueAtTime(0.0001, endsAt)
      oscillator.connect(gain).connect(audio.destination)
      oscillator.start(now)
      oscillator.stop(endsAt + 0.02)
    }
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

  private popCircle(point?: { x: number; y: number }, outcome: 'hit' | 'miss' = 'hit'): void {
    const burst = document.createElement('div')
    burst.className = `hit-burst${outcome === 'miss' ? ' is-miss' : ''}`
    burst.setAttribute('aria-hidden', 'true')

    // When a procedure provides its stimulus position, the hit lands directly on
    // it. This is especially important for the four cardinal vergence squares: the
    // reward should confirm the square just seen, not pull attention back to centre.
    const x = point?.x ?? window.innerWidth / 2
    const y = point?.y ?? window.innerHeight / 2
    // Use viewport coordinates directly. Avoiding centre-relative arithmetic also
    // avoids drift when the visual viewport differs from `window.innerWidth`.
    burst.style.left = `${x}px`
    burst.style.top = `${y}px`
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
    }, 420)
    this.timers.add(timer)
  }
}
