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
  // Spot 3, "Biscuit" (.codex/landing-tv-spot-3-script.md): spot 1's three
  // people on a summer night after rain — Rosa's dog runs off, she posts,
  // Maya's tap carries it to Dev, who finds the dog. 8 s.
  { id: 'biscuit', video: require('@/assets/videos/landing/tv-spot-3.mp4'), poster: require('@/assets/images/landing/tv-spot-3-poster.jpg') },
  // Spot 5, "Clay" (.codex/landing-tv-spot-5-script.md): stop-motion claymation
  // on a tabletop Toronto — Lou posts, the pink ring rolls out, and every clay
  // person that taps makes it bigger. The one spot that looks like the app. 8 s.
  { id: 'clay', video: require('@/assets/videos/landing/tv-spot-5.mp4'), poster: require('@/assets/images/landing/tv-spot-5-poster.jpg') },
]

/** Remembers only which spot played last, so the next one differs. */
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

/**
 * The spot to roll to when the one playing ends: any of the others, at
 * random. The hero used to loop its one spot forever, so a visitor who
 * stayed on the page saw a single clip however many were made; now the roll
 * continues while they watch, and never repeats back to back.
 */
export function nextHeroSpot(currentId: string | null): HeroSpot | null {
  if (!HERO_SPOTS.length) return null
  const pool = HERO_SPOTS.length > 1 ? HERO_SPOTS.filter(spot => spot.id !== currentId) : HERO_SPOTS
  const pick = pool[Math.floor(Math.random() * pool.length)]
  try { window.localStorage.setItem(LAST_SPOT_KEY, pick.id) } catch { /* private mode */ }
  return pick
}
