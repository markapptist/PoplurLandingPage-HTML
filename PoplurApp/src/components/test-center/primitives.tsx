import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { C, CAUSE_LEGEND, FONT, S, T, WEB_ONLY, clockSeconds, km } from './theme';

/** The one small-caps style: column heads, tile labels, legend, fold prefixes, the divider. */
export function Label({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[T.label, style]}>{children}</Text>;
}

/** Real is the number and is unmarked; the simulation is a `+N` after it in
 *  the sim tone. No `+` at all when the simulation count is zero. */
export function Num({ real, sim, unit, size = 'cell' }: { real: number; sim?: number; unit?: string; size?: 'cell' | 'metric' }) {
  return <Text style={size === 'metric' ? T.metricValue : T.cell}>{real}{unit}{sim ? <Text style={T.simText}> +{sim}</Text> : null}</Text>;
}

/** Presence: the deep clay face online, muted away, hollow none; `live` is
 *  the header's own dot with the `now` halo breathing on it; `connecting` is
 *  the link's transitional tone. */
export function Dot({ state }: { state: 'online' | 'away' | 'none' | 'connecting' | 'live' }) {
  return <View style={[P.dot, state === 'online' ? P.dotOnline : state === 'live' ? P.dotLive : state === 'away' ? P.dotAway : state === 'connecting' ? P.dotConnecting : P.dotNone]} />;
}

/** A signed radius quantity: ▲ grows, ▼ shrinks, · flat. Never a bare `+`,
 *  which is reserved for simulation counts. `tone="sim"` is the only way a
 *  signed simulation value is rendered: prefixed `sim` and painted whole.
 *  `style` is layout only (a ledger column's flex and alignment). */
export function Delta({ meters, tone = 'real', size = 'cell', style, onSlab = false }: { meters: number; tone?: 'real' | 'sim'; size?: 'cell' | 'metric'; style?: StyleProp<TextStyle>; onSlab?: boolean }) {
  const glyph = meters > 0 ? '▲' : meters < 0 ? '▼' : '·';
  // On a pink slab the page's grey simulation tone vanishes; the deep plum
  // is the slab's own shadow colour and reads there. Growth/decay keep
  // their hues — green and orange both clear the pink.
  const flat = onSlab ? C.onSlabSoft : C.away;
  const color = tone === 'sim' ? (onSlab ? C.onSlabSim : C.sim) : meters > 0 ? C.pop : meters < 0 ? C.decay : flat;
  return <Text style={[size === 'metric' ? T.metricValue : P.delta, style, { color }]}>{tone === 'sim' ? 'sim ' : ''}{glyph} {km(Math.abs(meters))}</Text>;
}

/** A signed change in any unit (the reports' compare cells, reports §3.5):
 *  the Delta grammar — ▲ up, ▼ down, · flat, `C.pop`/`C.decay`/`C.away`,
 *  tabular nums — for metres, counts, ratios, per-post-day rates, days and
 *  CA$. `null` prints `—` in the flat tone: a value that appeared or vanished
 *  is a gate flip and never a number moving (the caller adds the chip).
 *  Metres go through `km`; a ratio is printed to two places; cad to four. */
export function Change({ value, unit, size = 'cell', style, onSlab = false, colors }: { value: number | null; unit: 'm' | 'count' | 'ratio' | 'perPostDay' | 'days' | 'cad'; size?: 'cell' | 'metric'; style?: StyleProp<TextStyle>; onSlab?: boolean; colors?: { up: string; down: string; flat: string } }) {
  // `colors` is the print route's light set (reports §4.1): the glyph's hue is
  // inline, so the paper stylesheet cannot reach it and the caller chooses it.
  const flat = colors?.flat ?? (onSlab ? C.onSlabSoft : C.away);
  if (value === null) return <Text style={[size === 'metric' ? T.metricValue : P.delta, style, { color: flat }]}>—</Text>;
  const glyph = value > 0 ? '▲' : value < 0 ? '▼' : '·';
  const color = value > 0 ? colors?.up ?? C.pop : value < 0 ? colors?.down ?? C.decay : flat;
  const magnitude = Math.abs(value);
  const text = unit === 'm' ? km(magnitude)
    : unit === 'ratio' ? magnitude.toFixed(2)
    : unit === 'cad' ? `CA$${magnitude.toFixed(4)}`
    : unit === 'perPostDay' ? `${km(magnitude)}/post-day`
    : unit === 'days' ? `${Number.isInteger(magnitude) ? magnitude : magnitude.toFixed(1)} d`
    : String(Number.isInteger(magnitude) ? magnitude : Math.round(magnitude * 100) / 100);
  return <Text style={[size === 'metric' ? T.metricValue : P.delta, style, { color }]}>{glyph} {text}</Text>;
}

/** A labelled value inside a card: drill facts, the Algorithm facts row — a
 *  small glass card with a 2 px clay bar down its edge. The meta line takes
 *  a node so a signed net can sit in it as a `Delta`. */
export function Fact({ label, value, sim, meta }: { label: string; value: ReactNode; sim?: ReactNode; meta?: ReactNode }) {
  return <View style={P.fact}>
    <View style={[S.accent, S.accentThin]} />
    <Label>{label}</Label>
    <Text numberOfLines={2} style={P.factValue}>{value}</Text>
    {sim !== undefined && sim !== null ? <Text style={P.factSim}>{sim}</Text> : null}
    {!!meta && <Text style={T.meta}>{meta}</Text>}
  </View>;
}

/** A Today tile: a glass card with the clay face down its left edge, one big
 *  real number in ink, the simulation `+N` beside it when it is a count, a
 *  second line when it is a signed value (`RADIUS MOVED`). */
export function Tile({ label, value, sim, meta }: { label: string; value: ReactNode; sim?: ReactNode; meta: string }) {
  // A pink clay slab: everything on it is charcoal, the cube's face colour,
  // with the simulation's +N in the slab's own deep plum so the convention
  // survives on pink.
  return <View style={S.tile}>
    <Label style={P.onSlabLabel}>{label}</Label>
    <Text style={[T.metricValue, P.onSlab]}>{value}{typeof sim === 'number' && sim > 0 ? <Text style={P.onSlabSim}> +{sim}</Text> : null}</Text>
    {sim !== undefined && sim !== null && typeof sim !== 'number' ? <Text style={[P.tileSim, P.onSlabSoft]}>{sim}</Text> : null}
    <Text numberOfLines={2} style={[T.meta, P.onSlabSoft]}>{meta}</Text>
  </View>;
}

/** A page section: the heading stack outside the glass card — the meta as
 *  the pink kicker line above the title, the app's `.searchHeading` (small
 *  above strong) — then the card (or nothing) around the children. The
 *  wrapper carries `nativeID`, which RNW emits as the DOM id, so a probe can
 *  scope to `#testers` or `#radius`. */
export function Section({ id, title, meta, right, frame = 'card', children }: {
  id: string;
  title: string;
  meta?: ReactNode;
  right?: ReactNode;
  frame?: 'card' | 'none';
  children?: ReactNode;
}) {
  return <View nativeID={id} style={P.section}>
    <View style={P.titleRow}>
      <View style={P.titleCopy}>{!!meta && <Text style={[T.meta, P.kicker]}>{meta}</Text>}<Text style={T.sectionTitle}>{title}</Text></View>
      {right}
    </View>
    {frame === 'card' ? <View style={S.cardFrame}><View style={S.card}>{children}</View></View> : children}
  </View>;
}

/** The tab bar under the header — "tabbed at the top like a real website"
 *  (owner decision 12 Sep, spec §0). A glass strip closed by one hairline,
 *  part of the page's top chrome, not sticky and never a horizontally
 *  scrolling strip: it wraps. The selected tab is a clay pill — the app's
 *  own FAB shape, the one place a pill is right — and the others are bare
 *  ink3 text with no box. An operator tab shows its status as a one-line
 *  caption while it is not selected, so a tool's state is readable without
 *  opening it. The SIM-rows switch sits right-aligned and is passed only
 *  where rows can hide (Testers, Pops); on it wears the clay face (§0b names
 *  it), and its count goes to ink there — the sim tone cannot be read on the
 *  gradient, and the word SIM ROWS already carries the meaning. */
export function TabBar<Id extends string = string>({ tabs, selected, onSelect, simSwitch }: {
  tabs: readonly { id: Id; label: string; caption?: string }[];
  selected: Id;
  onSelect: (id: Id) => void;
  simSwitch?: { count: number; shown: boolean; onToggle: () => void } | null;
}) {
  return <View accessibilityRole="tablist" nativeID="tab-bar" style={P.tabBar}>
    {tabs.map(tab => {
      const on = tab.id === selected;
      return <Pressable key={tab.id} accessibilityRole="tab" aria-selected={on} onPress={() => onSelect(tab.id)} style={[P.tab, on && S.chip]}>
        <Text style={[P.tabLabel, on && P.tabLabelOn]}>{tab.label}</Text>
        {!on && !!tab.caption && <Text numberOfLines={1} style={P.tabCaption}>{tab.caption}</Text>}
      </Pressable>;
    })}
    {simSwitch ? <Pressable accessibilityRole="switch" aria-checked={simSwitch.shown} onPress={simSwitch.onToggle} style={[P.simSwitch, simSwitch.shown ? S.chip : P.simSwitchOff]}><Label style={[P.chipText, simSwitch.shown && P.chipTextOn]}>SIM ROWS<Text style={[T.simText, simSwitch.shown && P.chipCountOn]}> +{simSwitch.count}</Text></Label></Pressable> : null}
  </View>;
}

/** Page header: the name and whether the link is live. There is no refresh
 *  control (owner decision 12 Sep): the page is live by construction — SSE
 *  frames, with the 15 s poll running only while the stream is down — so the
 *  dot turning `away` is the whole story and the poll keeps it current. */
export function Header({ state, updatedAtMs }: { state: 'connecting' | 'live' | 'offline'; updatedAtMs: number }) {
  const dot = state === 'live' ? 'live' : state === 'connecting' ? 'connecting' : 'away';
  const link = state === 'live' ? 'Live' : state === 'connecting' ? 'Connecting' : 'Offline';
  return <View style={P.header}>
    <Text style={T.pageTitle}>Beta Test Center</Text>
    <View style={P.headerRight}>
      <View style={P.headerLink}><Dot state={dot} /><Text style={[T.meta, P.headerMeta]}>{link} · updated {clockSeconds(updatedAtMs)}</Text></View>
      <Text style={[T.meta, P.headerMeta]}>Private · local owner view</Text>
    </View>
  </View>;
}

/** A collapsible panel (the Simulation sub-panels; the operator tools are
 *  tabs, spec §0). The header is a row of two siblings — the toggling
 *  Pressable and the `right` slot — never one inside the other: a Link's
 *  click bubbles to an ancestor Pressable on web and would toggle (and
 *  persist) the panel on every navigation (spec §4.6). */
export function Fold({ id, title, status, tone, open, onToggle, right, children }: {
  id: string;
  title: string;
  status: string;
  tone: 'live' | 'warn' | 'off';
  open: boolean;
  onToggle: () => void;
  right?: ReactNode;
  children?: ReactNode;
}) {
  return <View nativeID={id} style={S.card}>
    <View style={P.foldHeader}>
      <Pressable accessibilityRole="button" aria-expanded={open} onPress={onToggle} style={P.foldPress}>
        <Text style={P.foldGlyph}>{open ? '▾' : '▸'}</Text>
        <View style={P.titleCopy}><Text style={T.panelTitle}>{title}</Text><Text numberOfLines={2} style={[T.meta, tone === 'live' ? P.toneLive : tone === 'warn' ? P.toneWarn : null]}>{status}</Text></View>
      </Pressable>
      {right}
    </View>
    {open ? <View style={P.foldBody}>{children}</View> : null}
  </View>;
}

/** The in-place simulation affordance, a panel strip: hidden rows never look
 *  vanished because their counts stay on this row, bound to the same switch.
 *  Only the word is small-caps; the counts keep their case, so the row reads
 *  `SIMULATION · 19 accounts · 361 pops ▸` on screen and in `innerText`. */
export function GroupRow({ count, noun, pops, open, onToggle }: { count: number; noun: string; pops?: number; open: boolean; onToggle: () => void }) {
  return <Pressable accessibilityRole="switch" aria-checked={open} onPress={onToggle} style={[S.panel, P.groupRow]}>
    <Text style={[T.cell, P.groupText]}><Text style={P.groupLabel}>SIMULATION</Text> · {count} {noun}{pops !== undefined ? ` · ${pops} pops` : ''} {open ? '▾' : '▸'}</Text>
  </Pressable>;
}

export function Empty({ text }: { text: string }) { return <Text style={[T.body, P.empty]}>{text}</Text>; }

/** Shown before the first dashboard frame: the link is not there yet, or it
 *  was tried and failed (`loading` false), and nothing below should pretend. */
export function Connecting({ loading }: { loading: boolean }) {
  return <View style={[S.card, P.connecting]}>
    <ActivityIndicator color={C.sync} />
    <View style={P.titleCopy}><Text style={T.panelTitle}>{loading ? 'Connecting to the local link…' : 'Local link unavailable'}</Text><Text style={T.body}>The page fills in the moment the first frame arrives; the fallback poll keeps trying.</Text></View>
  </View>;
}

/** The one-line status at the top of an operator tab's panel — the same
 *  derivation the tab shows as its caption while it is not selected. A
 *  caption is clamped to two lines; a strip that carries a sentence the
 *  reader must see whole (a report's first line, reports §3.4 item 1) passes
 *  `lines={0}` — React Native's own "no limit" value for `numberOfLines`. */
export function Strip({ text, tone = 'off', lines = 2 }: { text: string; tone?: 'live' | 'warn' | 'off'; lines?: number }) {
  return <Text numberOfLines={lines} style={[T.meta, P.strip, tone === 'live' ? P.toneLive : tone === 'warn' ? P.toneWarn : null]}>{text}</Text>;
}

/** The tag on every simulation row: colour never carries the meaning alone. */
export function SimTag() { return <View style={P.simTag}><Text style={P.simTagText}>SIM</Text></View>; }

/** Shared by the ledger and the Algorithm section; the cause map had no legend before. */
export function CauseLegend() {
  return <View style={P.legend}>{CAUSE_LEGEND.map(item => <View key={item.cause} style={P.legendItem}><View style={[P.legendSwatch, { backgroundColor: item.color }]} /><Text style={T.meta}>{item.label}</Text></View>)}</View>;
}

const P = StyleSheet.create({
  dot: { width: 9, height: 9, borderRadius: 5 },
  dotOnline: { backgroundColor: C.clayFaceDeepFill, ...WEB_ONLY.clayFaceDeep },
  dotLive: { backgroundColor: C.now, boxShadow: C.nowHalo, ...WEB_ONLY.livePulse },
  dotAway: { backgroundColor: C.away },
  dotConnecting: { backgroundColor: C.sync },
  dotNone: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.ink5 },
  delta: { fontFamily: FONT, fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  // A fact is the tile's recipe at 2 px, inside a panel or a facts row.
  fact: { flexGrow: 1, flexBasis: 140, minWidth: 0, gap: 3, padding: 10, paddingLeft: 13, borderRadius: 14, borderWidth: 1, borderColor: C.hairlineSoft, backgroundColor: C.glass, overflow: 'hidden', ...WEB_ONLY.glass },
  factValue: { fontFamily: FONT, color: C.ink, fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  factSim: { fontFamily: FONT, color: C.sim, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  tileSim: { fontFamily: FONT, color: C.sim, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  section: { gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  titleCopy: { flex: 1, minWidth: 0, gap: 2 },
  // The section's meta in the kicker's place and tone (`.searchHeading
  // small`): the pink line above the title. Its case is the copy's own — a
  // meta such as `city buckets only` reads the same on screen and in
  // `innerText`.
  kicker: { color: C.ink3, fontWeight: '700', letterSpacing: 0.3 },
  // The bar is a glass strip spanning the gradient edge to edge (the page's
  // ±20 inset), closed by one hairline; its own inset is the page's 20 less
  // the pill's edge and padding, so every label's text starts on the
  // content's line. Nine labels fit one row at 736 px only if a caption never
  // widens its tab: the caption is laid out absolutely under its pill, as
  // wide as the tab itself, in the room every tab reserves below (its bottom
  // margin), and truncates past that — so the bar's width is the labels'
  // alone and it wraps on the pane, not on the runner's state.
  // The tab bar is a pink clay bar (the TV's chassis): unselected tabs are
  // charcoal text on the pink, the selected tab is the recessed charcoal
  // face (the screen) with pink text — so the "current" tab reads as the
  // pressed-in one, exactly as the cube's faces read.
  tabBar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', marginHorizontal: -20, paddingHorizontal: 10, paddingTop: 6, backgroundColor: C.slabFill, boxShadow: C.slabShadow, ...WEB_ONLY.slab },
  // Every tab is pill-shaped with a transparent edge, so the selected one's
  // clay face changes nothing in the layout.
  tab: { alignItems: 'center', minWidth: 0, paddingHorizontal: 9, paddingVertical: 7, marginTop: 4, marginBottom: 18, borderRadius: 999, borderWidth: 1, borderColor: 'transparent' },
  tabLabel: { fontFamily: FONT, color: C.onSlab, fontSize: 13, fontWeight: '800' },
  tabLabelOn: { color: C.ink3 },
  tabCaption: { position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 1, textAlign: 'center', fontFamily: FONT, color: C.onSlabSoft, fontSize: 10, fontWeight: '600', letterSpacing: -0.2 },
  // Right-aligned on whichever row it lands: nine labels fill the row at
  // 736, so the chip wraps to its own line there and still sits right.
  simSwitch: { marginLeft: 'auto', marginTop: 4, marginBottom: 18, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999 },
  // Off: an outline pressed into the pink; on: the recessed charcoal face.
  simSwitchOff: { borderWidth: 1, borderColor: C.onSlabSoft },
  chipText: { color: C.onSlab },
  chipTextOn: { color: C.ink3 },
  // Ink on a pink slab (tiles, pucks): the cube's charcoal, a softer cut of
  // it for meta, and the deep plum for the simulation's +N.
  onSlab: { color: C.onSlab },
  onSlabSoft: { color: C.onSlabSoft },
  onSlabLabel: { color: C.onSlabSoft },
  onSlabSim: { color: C.onSlabSim, fontWeight: '700' },
  // The `+N` on the face: ink like the word, the count's own weight.
  chipCountOn: { color: C.ink },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingTop: 16, paddingBottom: 4 },
  headerRight: { alignItems: 'flex-end', gap: 4 },
  headerLink: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerMeta: { color: C.ink3 },
  foldHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  foldPress: { flex: 1, minWidth: 0, minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 10 },
  // The ▸ wears the clay face: the gradient clipped to the glyph.
  foldGlyph: { fontFamily: FONT, fontSize: 14, fontWeight: '900', width: 14, textAlign: 'center', backgroundColor: C.clayFaceFill, ...WEB_ONLY.clayText },
  foldBody: { gap: 12 },
  strip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14, backgroundColor: C.panelFill, ...WEB_ONLY.panel },
  connecting: { flexDirection: 'row', alignItems: 'center' },
  toneLive: { color: C.pop },
  toneWarn: { color: C.boost },
  groupRow: { paddingVertical: 8, paddingHorizontal: 12, marginTop: 8 },
  groupText: { color: C.sim, fontWeight: '600' },
  groupLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  empty: { color: C.ink4 },
  simTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, borderWidth: 1, borderColor: C.sim, backgroundColor: C.simFill },
  simTagText: { fontFamily: FONT, color: C.ink, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch: { width: 8, height: 8, borderRadius: 4 },
});
