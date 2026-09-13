import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native';
import type { BetaTesterRow } from '@/services/testControl';

/** The app's own font stack — `poplur-clay-map/src/index.css:601` and
 *  `ClayNav.module.css .wrap`. Every text style carries it, because RNW's
 *  `Text` sets its own `System` stack and never inherits from the body. */
export const FONT = 'system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Rounded", sans-serif';

/** Colour tokens: the app's clay chrome, taken from `poplur-clay-map` and
 *  never invented (owner decision 12 Sep, spec §0b). Surfaces are glass on
 *  the page black, edges are one pink hairline at three strengths, and the
 *  clay face gradient is the only thing that glows. Every semantic hue keeps
 *  exactly one meaning, so the real-vs-simulation convention is unchanged:
 *  only the surfaces changed. */
export const C = {
  // Page: the app's page black (`ClayNav.module.css .fab` sits on it) with
  // one soft pink radial at the top-left, and nothing else.
  ground: '#09080a',
  pageGradient: 'radial-gradient(120% 60% at 0% 0%, rgba(246,59,154,.16), transparent 60%)',
  // Glass: `ClayNav.module.css .fab` — rgba(9,8,10,.72) under blur(14px).
  // Every card and the tab bar.
  glass: 'rgba(9,8,10,.72)',
  glassBlur: 'blur(14px)',
  // Nested panels: `FeedTwin.module.css:888`. `panelFill` is that gradient's
  // midpoint — the solid the gradient sits on, and the fill where only a
  // colour can go (a Switch track).
  panel: 'linear-gradient(180deg, rgba(38,20,42,.92), rgba(24,12,30,.94))',
  panelFill: 'rgba(31,16,36,.93)',
  // Hairlines: `.fab` border (cards, the tab bar, the map labels)
  // · `.searchCard` border (the open card, the selected tab) · a softer cut
  // of the same pink for every row separator, so a list reads as one
  // surface with rules on it, not a stack of boxes.
  hairline: 'rgba(246,59,154,.4)',
  hairlineStrong: 'rgba(255,143,204,.74)',
  hairlineSoft: 'rgba(255,143,204,.22)',
  // The map's graph paper: a texture, not a palette colour — one white line
  // at a whisper every 32 px over the glass.
  gridLine: 'rgba(255,255,255,.035)',
  // Clay face: `ClayNav.module.css .searchBadge` — the gradient, its 1 px
  // edge and its glow. Primary buttons, the SIM ROWS switch when on, the
  // selected tab's chip, the tile's accent bar. `clayFaceFill` is the
  // gradient's midpoint, the solid under it.
  clayFace: 'linear-gradient(145deg, #ff5cb4, #9e1a68)',
  clayFaceFill: '#ce3b8e',
  clayFaceEdge: 'rgba(255,174,219,.82)',
  clayFaceGlow: '0 0 13px rgba(255,64,164,.36), inset 0 1px 0 rgba(255,255,255,.42)',
  // Clay face, deep: the prism face stops of `ClayCornerButton.tsx`
  // (#ffb3d7 → #f24c9c → #8d124d, the treatment the owner likes) — the
  // online dot, the ▲ growth glyph in bars.
  clayFaceDeep: 'linear-gradient(145deg, #ffb3d7, #f24c9c 46%, #8d124d)',
  clayFaceDeepFill: '#f24c9c',
  // Secondary buttons: `ClayNav.module.css .ghostBtn` — a whisper of white.
  // The same whisper is the glass track under every bar (per-day strip,
  // ledger, analytics), so a fill's colour is the only thing a bar says.
  ghost: 'rgba(255,255,255,.06)',
  // Ink: `.searchHeading strong` · `.fab span` · `.searchHeading small`
  // (kickers, labels, meta) · two dimmer cuts of the same pink.
  ink: '#fff6fc',
  ink2: '#ffe1f0',
  ink3: '#ff9ace',
  ink4: '#c98fb0',
  ink5: '#7d5a70',
  now: '#ff8ac6',      // happening now: the live dot and its halo, online
  nowHalo: '0 0 0 3px rgba(255,138,198,.24), 0 0 10px rgba(255,138,198,.66)',
  people: '#8ec5ff',   // humans: signups, cause `create`
  pop: '#5af0a4',      // pops, radius growth, ▲, cause `engagement`
  decay: '#ff8a6b',    // radius decay, ▼, cause `decay`
  boost: '#ffd166',    // cause `boost`
  sim: '#8a7a96',      // simulation text, +N
  simFill: 'rgba(138,122,150,.28)',  // simulation bars, sim-only map dots, the SIM tag
  simChip: '#c8a2ff',  // ledger causes `synthetic` / `lab` only
  sync: '#8fddff',     // transitional: CONNECTING
  away: '#7d5a70',     // away dot, flat delta, backfill (= ink5)
  openTint: 'rgba(255,92,180,.07)',  // the open row and its drill-down
  cardShadow: '0 8px 22px rgba(0,0,0,.4)',  // `.fab` — nothing else glows but the clay face

  // THE CLAY MATERIAL (owner, 12 Sep: "it needs to look more like the app").
  // The app's clay is not in its CSS — it is the rendered objects: a hot-pink
  // matte body with a charcoal recessed face, thick rounded edges, lit softly
  // from above (`public/clay_cube.png`, `public/clay_tv.png`). Two recipes
  // reproduce that in CSS and every surface below is built from them.
  //
  // Slab: the pink body. A matte gradient (lighter at the top-left where the
  // light lands, plum at the bottom-right), a bright top rim and a dark
  // bottom rim as inset shadows, a soft drop shadow so it sits above the
  // page — the frame of the cube, the chassis of the TV.
  slab: 'linear-gradient(160deg, #ff62b6 0%, #f2378f 42%, #c1256f 100%)',
  slabFill: '#e8338a',
  slabEdge: 'rgba(255,190,225,.55)',
  slabShadow: 'inset 0 2px 0 rgba(255,220,240,.55), inset 0 -3px 0 rgba(112,12,64,.55), inset 0 0 0 1px rgba(255,120,190,.25), 0 10px 24px rgba(0,0,0,.45)',
  // Inset: the charcoal face pressed into the slab. Near-black with a faint
  // warm sheen, an inner shadow at the top (the slab's rim over it) — the
  // cube's black panel, the TV's screen.
  inset: 'linear-gradient(180deg, #221a20 0%, #16101a 100%)',
  insetFill: '#1a1219',
  insetShadow: 'inset 0 3px 8px rgba(0,0,0,.65), inset 0 -1px 0 rgba(255,140,200,.10), inset 0 0 0 1px rgba(0,0,0,.6)',
  // Puck: a small pink clay object (buttons, the selected tab, the SIM ROWS
  // switch): the slab recipe at button scale with a tighter rim.
  puckShadow: 'inset 0 1.5px 0 rgba(255,225,242,.6), inset 0 -2px 0 rgba(112,12,64,.55), 0 4px 10px rgba(0,0,0,.45)',
  // Ink on pink: the cube's charcoal, for text and glyphs that sit on a slab.
  onSlab: '#1a0d16',
  onSlabSoft: 'rgba(40,10,28,.78)',
  onSlabSim: '#6b0c3f',
} as const;

/** The web-only keys, cast once: `backgroundImage`, `backdropFilter` and
 *  the keyframes are not in RN's style types, so they live here and are spread
 *  into the typed sheets below (cast as the intersection of both style types, so
 *  a View and a Text sheet both take them). RNW compiles each to its CSS property; a
 *  native target ignores them and keeps the solid fill under each. */
type WebStyle = ViewStyle & TextStyle;
export const WEB_ONLY = {
  page: { backgroundImage: C.pageGradient } as unknown as WebStyle,
  glass: { backdropFilter: C.glassBlur } as unknown as WebStyle,
  panel: { backgroundImage: C.panel } as unknown as WebStyle,
  clayFace: { backgroundImage: C.clayFace } as unknown as WebStyle,
  clayFaceDeep: { backgroundImage: C.clayFaceDeep } as unknown as WebStyle,
  slab: { backgroundImage: C.slab } as unknown as WebStyle,
  inset: { backgroundImage: C.inset } as unknown as WebStyle,
  // The clay face painted through a glyph (the Fold's ▸): the gradient is
  // clipped to the text, and the solid under it is what an older engine shows.
  clayText: { backgroundImage: C.clayFace, backgroundClip: 'text', WebkitBackgroundClip: 'text', color: 'transparent' } as unknown as WebStyle,
  // The live dot's halo breathes on a CSS keyframe — opacity only, no JS
  // loop, so the desk does no work while it idles.
  livePulse: { animationKeyframes: [{ '0%': { opacity: 1 }, '50%': { opacity: 0.55 }, '100%': { opacity: 1 } }], animationDuration: '1.8s', animationIterationCount: 'infinite', animationTimingFunction: 'ease-in-out' } as unknown as WebStyle,
};

/** The one stylesheet the route owns outside React: the body takes the app's
 *  font and the page black so the ground runs behind the scroll and the
 *  bounce, exactly as `index.css` does for the app. Mounted through
 *  `expo-router/head`, so it lives only while this route is focused. */
export const ROOT_CSS = `body{font-family:${FONT};background:${C.ground};color-scheme:dark}`;

/** Type scale: the app's rounded heavy type — 800 for titles and numbers,
 *  the heaviest face for kickers — eight sizes and nothing under 10 px.
 *  Every numeric style is tabular so columns of counts do not wobble. */
export const T = StyleSheet.create({
  pageTitle: { fontFamily: FONT, color: C.ink, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  sectionTitle: { fontFamily: FONT, color: C.ink, fontSize: 17, fontWeight: '800' },
  metricValue: { fontFamily: FONT, color: C.ink, fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'] },
  panelTitle: { fontFamily: FONT, color: C.ink, fontSize: 14, fontWeight: '800' },
  name: { fontFamily: FONT, color: C.ink, fontSize: 13, fontWeight: '700' },
  body: { fontFamily: FONT, color: C.ink2, fontSize: 13, fontWeight: '600', lineHeight: 19 },
  cell: { fontFamily: FONT, color: C.ink2, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  meta: { fontFamily: FONT, color: C.ink4, fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'] },
  // The kicker (`.searchHeading small`): RN's type stops at '900', the
  // heaviest face the stack ships anyway.
  label: { fontFamily: FONT, color: C.ink3, fontSize: 10, fontWeight: '900', letterSpacing: 1.3, textTransform: 'uppercase' },
  simText: { color: C.sim, fontWeight: '600' },
});

/** Surfaces: glass cards (radius 18), nested panels and tiles (radius 14),
 *  pills for chips and buttons (999 — the app's own FAB shape, the one place
 *  a pill is right). The page is one column (spec §0): `safe` carries the
 *  ground and its radial, `chrome` holds the header and the tab bar,
 *  `scroll` is the viewport-bounded ScrollView whose content container is
 *  `page` — the selected tab's panel only. */
export const S = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.ground },
  chrome: { width: '100%', maxWidth: 1120, alignSelf: 'center', paddingHorizontal: 20 },
  scroll: { flex: 1 },
  page: { flexGrow: 1, width: '100%', maxWidth: 1120, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 48, gap: 20 },
  notice: { fontFamily: FONT, color: C.ink2, fontSize: 12, fontWeight: '600', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: C.decay, backgroundColor: C.panelFill, ...WEB_ONLY.panel },
  // A card is the cube: a pink clay slab (`cardFrame`, the thick rounded
  // body) around a charcoal inset (`card`, the recessed face the content
  // sits in). Section renders the two nested; the 6 px between them is the
  // slab's visible rim, as on the cube's faces.
  cardFrame: { padding: 6, borderRadius: 22, backgroundColor: C.slabFill, boxShadow: C.slabShadow, ...WEB_ONLY.slab },
  card: { padding: 16, borderRadius: 16, backgroundColor: C.insetFill, gap: 12, boxShadow: C.insetShadow, ...WEB_ONLY.inset },
  // A nested panel is a shallower inset of the same charcoal.
  panel: { padding: 12, borderRadius: 14, backgroundColor: C.insetFill, gap: 8, boxShadow: C.insetShadow, ...WEB_ONLY.inset },
  open: { backgroundColor: C.openTint, borderLeftWidth: 3, borderLeftColor: C.hairlineStrong },
  // Rows meet on the soft hairline: the separator, never a card edge.
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.hairlineSoft },
  // A tile is a glass card with the clay face down its left edge (`accent`,
  // an absolute bar clipped by the tile's own radius). Four across inside
  // the card at 736: the card's border leaves 662 px, so the basis sits
  // under 160 and the tiles grow to fill.
  // A tile is a small pink clay slab with its number pressed into it —
  // the TV's chassis with the P on it. Text on it is charcoal (`onSlab`).
  tile: { flexGrow: 1, flexBasis: 150, minHeight: 84, gap: 4, padding: 12, borderRadius: 16, backgroundColor: C.slabFill, boxShadow: C.slabShadow, overflow: 'hidden', ...WEB_ONLY.slab },
  // Kept for the Fact's thin bar; a tile no longer needs an accent.
  accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: C.slabFill, ...WEB_ONLY.slab },
  accentThin: { width: 2 },
  // The clay face itself: the fill, its edge and its glow, on a pill — the
  // selected tab's chip, the SIM ROWS switch when on and the primary
  // buttons, which is all §0b names for it. Text on the face is `ink`, the
  // `.searchBadge` colour: on the gradient nothing but white reads.
  // The clay puck: the selected tab, the SIM ROWS switch when on, primary
  // buttons — a small pink object, not a flat pill. Text on it is charcoal.
  clay: { backgroundColor: C.slabFill, boxShadow: C.puckShadow, ...WEB_ONLY.slab },
  chip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: C.insetFill, boxShadow: C.insetShadow, ...WEB_ONLY.inset },
  // A secondary selection (the mode picker, a persona tab, the session
  // pill, an activity chip, a replay step): the clay edge and its glow over
  // the open wash, never the face — so the text on it keeps its own tone
  // (a meta line, a green status, an away dot) and still clears 4.5:1.
  chipOn: { borderColor: C.clayFaceEdge, backgroundColor: C.openTint, boxShadow: C.clayFaceGlow },
  // Secondary: the ghost pill (mode picker, PREV / NEXT, Show more, RETRY).
  // Primary: the clay face — the one place pink means "do this now" (RUN…).
  // Secondary: a charcoal inset puck. Primary: a pink clay puck.
  button: { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, backgroundColor: C.insetFill, boxShadow: C.insetShadow, ...WEB_ONLY.inset },
  buttonPrimary: { alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: C.slabFill, boxShadow: C.puckShadow, ...WEB_ONLY.slab },
  disabled: { opacity: 0.38 },
});

/** The dashboard ships the newest 160 public pops (`publicPosts`); every list
 *  and radius sum drawn from them is that window, never a day, and says so. */
export const PUBLIC_POPS_WINDOW = 160;

export const ago = (time: number) => !time ? '—' : Date.now() - time < 12_000 ? 'NOW' : Date.now() - time < 3_600_000 ? `${Math.round((Date.now() - time) / 60_000)}m ago` : `${Math.round((Date.now() - time) / 3_600_000)}h ago`;
export const clock = (time: number) => time ? new Date(time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—';
export const clockSeconds = (time: number) => time ? new Date(time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '—';
export const words = (value: string) => value.replace(/[-_]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
export const duration = (milliseconds: number) => {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  return hours ? `${hours}h ${minutes}m` : minutes ? `${minutes}m ${remainder}s` : `${remainder}s`;
};
export const km = (meters: number) => meters >= 100_000 ? `${Math.round(meters / 1000)} km` : meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
export const stamp = (ms: number) => !ms ? '—' : new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
export const dayLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
export const share = (part: number, whole: number) => `${Math.round(Math.max(0, Math.min(1, whole > 0 ? part / whole : 0)) * 100)}%` as const;

export const PRESENCE_LABEL: Record<BetaTesterRow['presence'], string> = { online: 'ONLINE', away: 'AWAY', unknown: 'NO SIGNAL' };
export const CAUSE_COLOR: Record<string, string> = { create: C.people, engagement: C.pop, decay: C.decay, boost: C.boost, synthetic: C.simChip, lab: C.simChip, backfill: C.away };
/** The ledger's cause colours, in legend order; `synthetic` and `lab` share a swatch. */
export const CAUSE_LEGEND: { cause: string; label: string; color: string }[] = [
  { cause: 'create', label: 'create', color: C.people },
  { cause: 'engagement', label: 'engagement', color: C.pop },
  { cause: 'decay', label: 'decay', color: C.decay },
  { cause: 'boost', label: 'boost', color: C.boost },
  { cause: 'synthetic', label: 'simulation / lab', color: C.simChip },
  { cause: 'backfill', label: 'backfill', color: C.away },
];
