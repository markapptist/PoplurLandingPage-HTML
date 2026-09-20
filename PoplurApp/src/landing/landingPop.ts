import { Asset } from 'expo-asset'

// The Poplur pop for the page: assets/pop.mp3 is byte-identical to the one
// the app's feed plays, decoded once and fired each time the chapter under
// the reader changes (see LandingPage's chapter spy).
//
// Browsers only let a page make a sound after a real gesture — a click, a
// tap, a key. Wheel and touch scrolling do not count. So the context is
// unlocked on the first pointerdown or keydown anywhere on the page, and the
// chapters passed before that are silent; the badge taps and the nav clicks
// are the usual first gesture.

const POP = require('@/assets/pop.mp3')
const MIN_GAP_MS = 220

let ctx: AudioContext | null = null
let buffer: AudioBuffer | null = null
let loading = false
let lastAt = 0

async function load() {
  if (buffer || loading || !ctx) return
  loading = true
  try {
    const asset = Asset.fromModule(POP)
    const uri = asset.uri || asset.localUri
    if (!uri) throw new Error('pop.mp3 has no uri')
    const bytes = await (await fetch(uri)).arrayBuffer()
    buffer = await ctx.decodeAudioData(bytes)
  } catch {
    loading = false
  }
}

/** The page's one audio context, once a gesture has unlocked it — shared with
 *  the counter pips (counterSound.ts) so every sound on the page rides one
 *  context, the way the app's do. Null until then. */
export function landingAudioContext(): AudioContext | null {
  return ctx && ctx.state === 'running' ? ctx : null
}

/** Creates and resumes the context inside a gesture, then decodes the sample. */
export function unlockLandingPop(): void {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return
  try { ctx ??= new AudioContext() } catch { return }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => { /* the next gesture retries */ })
  void load()
}

/** One pop. Silent until unlocked; never more than one every MIN_GAP_MS. */
export function landingPop(volume = 0.5): void {
  if (!ctx || !buffer || ctx.state !== 'running') return
  const now = performance.now()
  if (now - lastAt < MIN_GAP_MS) return
  lastAt = now
  const src = ctx.createBufferSource()
  src.buffer = buffer
  const gain = ctx.createGain()
  gain.gain.value = volume
  src.connect(gain)
  gain.connect(ctx.destination)
  src.onended = () => {
    try { src.disconnect() } catch { /* already gone */ }
    try { gain.disconnect() } catch { /* already gone */ }
  }
  src.start()
}

/** Arms the one-time unlock on the document. Returns its cleanup. */
export function armLandingPop(): () => void {
  if (typeof document === 'undefined') return () => {}
  const off = () => {
    document.removeEventListener('pointerdown', once)
    document.removeEventListener('keydown', once)
  }
  const once = () => { unlockLandingPop(); off() }
  document.addEventListener('pointerdown', once, { passive: true })
  document.addEventListener('keydown', once)
  return off
}
