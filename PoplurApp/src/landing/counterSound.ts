import { landingAudioContext } from './landingPop'

// The app's counter voice (poplur-clay-map/src/motionEffectsAudio.ts), the
// same numbers: a terse square-wave pip that rises with progress — 560 Hz at
// the start of the count, 1480 Hz at the end — through a 420 Hz high-pass,
// 22 ms long, never more than one every 38 ms; and the two sine pips, 1180
// then 1540 Hz, 45 ms apart, when the count lands. Silent until the page's
// first gesture, like every sound here.

const TICK_MIN_GAP_MS = 38
let lastTick = 0

export function playCounterTick(progress: number): void {
  const wallNow = performance.now()
  if (wallNow - lastTick < TICK_MIN_GAP_MS) return
  lastTick = wallNow
  const c = landingAudioContext()
  if (!c) return
  const now = c.currentTime
  const p = Math.max(0, Math.min(1, progress))
  const osc = c.createOscillator()
  osc.type = 'square'
  osc.frequency.setValueAtTime(560 + p * 920, now)
  const filter = c.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.value = 420
  const gain = c.createGain()
  gain.gain.setValueAtTime(0.06, now)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.022)
  osc.connect(filter).connect(gain).connect(c.destination)
  osc.start(now)
  osc.stop(now + 0.026)
  osc.addEventListener('ended', () => { osc.disconnect(); filter.disconnect(); gain.disconnect() }, { once: true })
}

export function playCounterDone(): void {
  const c = landingAudioContext()
  if (!c) return
  const now = c.currentTime
  ;[0, 0.045].forEach((delay, i) => {
    const osc = c.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = i === 0 ? 1180 : 1540
    const gain = c.createGain()
    gain.gain.setValueAtTime(0.07, now + delay)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.045)
    osc.connect(gain).connect(c.destination)
    osc.start(now + delay)
    osc.stop(now + delay + 0.05)
    osc.addEventListener('ended', () => { osc.disconnect(); gain.disconnect() }, { once: true })
  })
}
