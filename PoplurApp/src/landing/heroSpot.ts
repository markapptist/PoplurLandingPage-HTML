// The TV spots behind the hero — people using Poplur, generated in Google AI
// Studio (Veo) from .codex/landing-tv-spot-script.md and its sequels — one
// of which plays, full-bleed under the headline, on each visit: rolled at
// random, never the one the last visit showed. Each file is the generated
// clip as delivered, audio and all, with a faststart header so it starts
// before it has fully downloaded; each poster is its frame at 1.5 s, shown
// until the first frame decodes. Metro resolves assets at bundle time, so a
// spot joins this list only once its file is in assets/videos/landing.
export type HeroSpot = { id: string; video: number; poster: number }

export const HERO_SPOTS: readonly HeroSpot[] = [
  { id: 'kensington', video: require('@/assets/videos/landing/tv-spot.mp4'), poster: require('@/assets/images/landing/tv-spot-poster.jpg') },
  // Spot 2, "Radius" (.codex/landing-tv-spot-2-script.md): wordless, aerial,
  // the ring drawn by people around Noor's yellow coat, 8 s.
  { id: 'radius', video: require('@/assets/videos/landing/tv-spot-2.mp4'), poster: require('@/assets/images/landing/tv-spot-2-poster.jpg') },
]

/** Remembers only which spot the last visit played, so this one differs. */
const LAST_SPOT_KEY = 'poplur.landing.spot'

export function pickHeroSpot(): HeroSpot | null {
  if (!HERO_SPOTS.length) return null
  let last: string | null = null
  try { last = window.localStorage.getItem(LAST_SPOT_KEY) } catch { /* private mode */ }
  const pool = HERO_SPOTS.length > 1 ? HERO_SPOTS.filter(s => s.id !== last) : HERO_SPOTS
  const pick = pool[Math.floor(Math.random() * pool.length)]
  try { window.localStorage.setItem(LAST_SPOT_KEY, pick.id) } catch { /* private mode */ }
  return pick
}
