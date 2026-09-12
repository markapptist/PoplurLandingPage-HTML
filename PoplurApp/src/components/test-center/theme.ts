import { StyleSheet, type ViewStyle } from 'react-native';
import type { BetaTesterRow } from '@/services/testControl';

/** Colour tokens. Pink means "happening now" and nothing else; every other
 *  hue carries exactly one meaning (spec §3.1), so a reader never has to
 *  learn a second palette between the tiles, the table and the ledger. */
export const C = {
  bg: '#12020c',
  gradient: 'radial-gradient(circle at 50% 0%, #501032 0%, #18030f 38%, #080409 76%)',
  surface: 'rgba(37,8,23,.94)',
  panel: '#2a1120',
  edge: '#4a1a34',
  line: '#57203d',
  lineSoft: '#3d2130',
  ink: '#fff8fc',
  ink2: '#f4d7e6',
  ink3: '#d5a7bf',
  ink4: '#b98aa6',
  ink5: '#806476',
  now: '#ff4aa3',      // happening now: live dot, online dot, primary button
  people: '#8ec5ff',   // humans: signups, cause `create`
  pop: '#5af0a4',      // pops, radius growth, ▲, cause `engagement`
  decay: '#ff8a6b',    // radius decay, ▼, cause `decay`
  boost: '#ffd166',    // cause `boost`
  sim: '#8a7a96',      // simulation text, +N
  simFill: '#5a4a66',  // simulation bars, sim-only map dots
  simChip: '#c8a2ff',  // ledger causes `synthetic` / `lab` only
  sync: '#8fddff',     // transitional: CONNECTING / SYNCING
  away: '#806476',     // away dot, flat delta, backfill
  openTint: 'rgba(90,240,164,.06)',
} as const;

/** Type scale: eight sizes, one small-caps label, nothing under 10 px.
 *  Every numeric style is tabular so columns of counts do not wobble. */
export const T = StyleSheet.create({
  pageTitle: { color: C.ink, fontSize: 22, fontWeight: '900', letterSpacing: -0.4 },
  sectionTitle: { color: C.ink, fontSize: 17, fontWeight: '800' },
  metricValue: { color: C.ink, fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'] },
  panelTitle: { color: C.ink, fontSize: 14, fontWeight: '800' },
  name: { color: C.ink, fontSize: 13, fontWeight: '700' },
  body: { color: C.ink3, fontSize: 13, lineHeight: 19 },
  cell: { color: C.ink2, fontSize: 12, fontWeight: '500', fontVariant: ['tabular-nums'] },
  meta: { color: C.ink4, fontSize: 11, fontVariant: ['tabular-nums'] },
  label: { color: C.ink4, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  simText: { color: C.sim, fontWeight: '600' },
});

/** Surfaces: one card, one nested panel, one open highlight, one row. The
 *  page is one column (spec §0): `safe` carries the gradient, `chrome` holds
 *  the header and the tab bar, `scroll` is the viewport-bounded ScrollView
 *  whose content container is `page` — the selected tab's panel only. */
export const S = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  chrome: { width: '100%', maxWidth: 1120, alignSelf: 'center', paddingHorizontal: 20 },
  scroll: { flex: 1 },
  page: { flexGrow: 1, width: '100%', maxWidth: 1120, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 48, gap: 20 },
  notice: { color: C.ink2, backgroundColor: '#59132f', borderRadius: 12, padding: 12, fontSize: 12 },
  card: { padding: 16, borderRadius: 14, borderWidth: 1, borderColor: C.edge, backgroundColor: C.surface, gap: 12 },
  panel: { padding: 12, borderRadius: 10, backgroundColor: C.panel, gap: 8 },
  open: { backgroundColor: C.openTint, borderLeftWidth: 3, borderLeftColor: C.pop },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line },
  // Four across inside the card at 736: the card's border leaves 662 px, so
  // the basis sits under 160 and the tiles grow to fill.
  tile: { flexGrow: 1, flexBasis: 150, minHeight: 84, gap: 4, padding: 12, borderRadius: 10, backgroundColor: C.panel },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: C.panel },
  chipOn: { borderColor: C.pop, backgroundColor: C.openTint },
  // Secondary: panel fill + line border (mode picker, PREV / NEXT, Show more).
  // Primary: the `now` fill — the one place pink means "do this now" (RUN…).
  button: { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: C.line, backgroundColor: C.panel },
  buttonPrimary: { alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, backgroundColor: C.now },
  disabled: { opacity: 0.38 },
});

/** The one web-only style key. `backgroundImage` is not in RN's ViewStyle, so
 *  it lives outside the typed StyleSheet and is layered onto `S.safe` — the
 *  root, so the gradient stays put while the panel scrolls under the chrome. */
export const WEB_ONLY = { page: { backgroundImage: C.gradient } as unknown as ViewStyle };

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
