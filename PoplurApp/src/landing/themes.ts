// The app's own profile themes (poplur-clay-map/src/profileThemes.ts), as the
// site's colour badge: same ids, names and accents; the same background art
// from the profile-themes pack, compressed for the web. Default is the
// pre-login welcome: hot pink with the dotted map and white ink.

export type LandingThemeId = 'default' | 'chocolate' | 'rainbowNeon' | 'camouflage' | 'toy' | 'rubberPink' | 'icyCrystal' | 'luxeGold' | 'glamPink'

export interface LandingTheme {
  id: LandingThemeId
  name: string
  accent: string
  accent2: string
  /** page background colour (under the art) */
  bg: string
  /** text on the page background */
  ink: string
  background: number | null
  thumb: number | null
}

export const LANDING_THEMES: readonly LandingTheme[] = [
  { id: 'default', name: 'Poplur', accent: '#ff2d96', accent2: '#5fe1ea', bg: '#ff2d96', ink: '#ffffff', background: null, thumb: null },
  { id: 'chocolate', name: 'Chocolate', accent: '#ff3b8d', accent2: '#8b4a2b', bg: '#2b1712', ink: '#fff4ec', background: require('@/assets/images/landing/themes/chocolate.jpg'), thumb: require('@/assets/images/landing/themes/thumbs/chocolate.jpg') },
  { id: 'rainbowNeon', name: 'Rainbow Neon', accent: '#00e7ff', accent2: '#ff2d96', bg: '#0b0714', ink: '#ffffff', background: require('@/assets/images/landing/themes/rainbowNeon.jpg'), thumb: require('@/assets/images/landing/themes/thumbs/rainbowNeon.jpg') },
  { id: 'camouflage', name: 'Camouflage', accent: '#f43f8e', accent2: '#a3b18a', bg: '#1f2a1b', ink: '#f3f6ee', background: require('@/assets/images/landing/themes/camouflage.jpg'), thumb: require('@/assets/images/landing/themes/thumbs/camouflage.jpg') },
  { id: 'toy', name: 'Toy', accent: '#1677ff', accent2: '#ff335f', bg: '#fff3f7', ink: '#222222', background: require('@/assets/images/landing/themes/toy.jpg'), thumb: require('@/assets/images/landing/themes/thumbs/toy.jpg') },
  { id: 'rubberPink', name: 'Rubber Pink', accent: '#ff2e88', accent2: '#ffd1e6', bg: '#ff5aa5', ink: '#ffffff', background: require('@/assets/images/landing/themes/rubberPink.jpg'), thumb: require('@/assets/images/landing/themes/thumbs/rubberPink.jpg') },
  { id: 'icyCrystal', name: 'Icy Crystal', accent: '#19bdf2', accent2: '#ffffff', bg: '#dff4ff', ink: '#0b2a3a', background: require('@/assets/images/landing/themes/icyCrystal.jpg'), thumb: require('@/assets/images/landing/themes/thumbs/icyCrystal.jpg') },
  { id: 'luxeGold', name: 'Luxe Gold', accent: '#f5c452', accent2: '#e9378f', bg: '#1a1408', ink: '#fff8e6', background: require('@/assets/images/landing/themes/luxeGold.jpg'), thumb: require('@/assets/images/landing/themes/thumbs/luxeGold.jpg') },
  { id: 'glamPink', name: 'Glam Pink', accent: '#ff2d9b', accent2: '#49ddf7', bg: '#ff2d9b', ink: '#ffffff', background: require('@/assets/images/landing/themes/glamPink.jpg'), thumb: require('@/assets/images/landing/themes/thumbs/glamPink.jpg') },
]

/** Remembers only which theme the last visit wore, so the next one is different. */
export const LANDING_THEME_STORAGE_KEY = 'poplur.landing.theme'

/** A theme at random for this visit — never the one the previous visit
 *  showed, so a refresh always changes the page (owner's ask, 19 Sep). The
 *  colour badge still lets a visitor pick one for the rest of the visit; that
 *  choice is not kept, the next load rolls again. */
export function randomLandingThemeId(): LandingThemeId {
  let last: string | null = null
  try { last = window.localStorage.getItem(LANDING_THEME_STORAGE_KEY) } catch { /* private mode */ }
  const pool = LANDING_THEMES.filter(t => t.id !== last)
  const pick = pool[Math.floor(Math.random() * pool.length)] ?? LANDING_THEMES[0]
  try { window.localStorage.setItem(LANDING_THEME_STORAGE_KEY, pick.id) } catch { /* private mode */ }
  return pick.id
}

export const themeById = (id: LandingThemeId): LandingTheme => LANDING_THEMES.find(t => t.id === id) ?? LANDING_THEMES[0]
