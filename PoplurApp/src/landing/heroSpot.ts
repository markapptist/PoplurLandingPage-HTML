// The TV spot behind the hero — people using Poplur — plays full-bleed under
// the headline when it exists, and the phone stands in until then. Metro
// resolves assets at bundle time, so this points at nothing until the file
// is in the repo: when the spot lands at assets/videos/landing/tv-spot.mp4,
// set HERO_SPOT to require('@/assets/videos/landing/tv-spot.mp4').
export const HERO_SPOT: number | null = null
