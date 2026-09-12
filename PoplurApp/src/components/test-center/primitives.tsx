import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { C, CAUSE_LEGEND, S, T, clockSeconds, km } from './theme';

/** The one small-caps style: column heads, tile labels, legend, fold prefixes, the divider. */
export function Label({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[T.label, style]}>{children}</Text>;
}

/** Real is the number and is unmarked; the simulation is a `+N` after it in
 *  the sim tone. No `+` at all when the simulation count is zero. */
export function Num({ real, sim, unit, size = 'cell' }: { real: number; sim?: number; unit?: string; size?: 'cell' | 'metric' }) {
  return <Text style={size === 'metric' ? T.metricValue : T.cell}>{real}{unit}{sim ? <Text style={T.simText}> +{sim}</Text> : null}</Text>;
}

/** Presence: pink online, muted away, hollow none; `connecting` is the link's transitional tone. */
export function Dot({ state }: { state: 'online' | 'away' | 'none' | 'connecting' }) {
  return <View style={[P.dot, state === 'online' ? P.dotOnline : state === 'away' ? P.dotAway : state === 'connecting' ? P.dotConnecting : P.dotNone]} />;
}

/** A signed radius quantity: ▲ grows, ▼ shrinks, · flat. Never a bare `+`,
 *  which is reserved for simulation counts. `tone="sim"` is the only way a
 *  signed simulation value is rendered: prefixed `sim` and painted whole.
 *  `style` is layout only (a ledger column's flex and alignment). */
export function Delta({ meters, tone = 'real', size = 'cell', style }: { meters: number; tone?: 'real' | 'sim'; size?: 'cell' | 'metric'; style?: StyleProp<TextStyle> }) {
  const glyph = meters > 0 ? '▲' : meters < 0 ? '▼' : '·';
  const color = tone === 'sim' ? C.sim : meters > 0 ? C.pop : meters < 0 ? C.decay : C.away;
  return <Text style={[size === 'metric' ? T.metricValue : P.delta, style, { color }]}>{tone === 'sim' ? 'sim ' : ''}{glyph} {km(Math.abs(meters))}</Text>;
}

/** A labelled value inside a card: drill facts, the Algorithm facts row. The
 *  meta line takes a node so a signed net can sit in it as a `Delta`. */
export function Fact({ label, value, sim, meta }: { label: string; value: ReactNode; sim?: ReactNode; meta?: ReactNode }) {
  return <View style={P.fact}>
    <Label>{label}</Label>
    <Text numberOfLines={2} style={P.factValue}>{value}</Text>
    {sim !== undefined && sim !== null ? <Text style={P.factSim}>{sim}</Text> : null}
    {!!meta && <Text style={T.meta}>{meta}</Text>}
  </View>;
}

/** A Today tile: one big real number, the simulation `+N` beside it when it
 *  is a count, a second line when it is a signed value (`RADIUS MOVED`). */
export function Tile({ label, value, sim, meta }: { label: string; value: ReactNode; sim?: ReactNode; meta: string }) {
  return <View style={S.tile}>
    <Label>{label}</Label>
    <Text style={T.metricValue}>{value}{typeof sim === 'number' && sim > 0 ? <Text style={T.simText}> +{sim}</Text> : null}</Text>
    {sim !== undefined && sim !== null && typeof sim !== 'number' ? <Text style={P.tileSim}>{sim}</Text> : null}
    <Text numberOfLines={2} style={T.meta}>{meta}</Text>
  </View>;
}

/** A page section: title row outside the card, the card (or nothing) around
 *  the children. The wrapper carries `nativeID`, which RNW emits as the DOM
 *  id, so a probe can scope to `#testers` or `#radius`. */
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
      <View style={P.titleCopy}><Text style={T.sectionTitle}>{title}</Text>{!!meta && <Text style={T.meta}>{meta}</Text>}</View>
      {right}
    </View>
    {frame === 'card' ? <View style={S.card}>{children}</View> : children}
  </View>;
}

/** The tab bar under the header — "tabbed at the top like a real website"
 *  (owner decision 12 Sep, spec §0). Part of the page's top chrome, not
 *  sticky and never a horizontally scrolling strip: it wraps. An operator
 *  tab shows its status as a one-line caption while it is not selected, so a
 *  tool's state is readable without opening it. The SIM-rows switch sits
 *  right-aligned and is passed only where rows can hide (Testers, Pops). */
export function TabBar<Id extends string = string>({ tabs, selected, onSelect, simSwitch }: {
  tabs: readonly { id: Id; label: string; caption?: string }[];
  selected: Id;
  onSelect: (id: Id) => void;
  simSwitch?: { count: number; shown: boolean; onToggle: () => void } | null;
}) {
  return <View accessibilityRole="tablist" nativeID="tab-bar" style={P.tabBar}>
    {tabs.map(tab => {
      const on = tab.id === selected;
      return <Pressable key={tab.id} accessibilityRole="tab" aria-selected={on} onPress={() => onSelect(tab.id)} style={[P.tab, on && P.tabOn]}>
        <Text style={[P.tabLabel, on && P.tabLabelOn]}>{tab.label}</Text>
        {!on && !!tab.caption && <Text numberOfLines={1} style={P.tabCaption}>{tab.caption}</Text>}
      </Pressable>;
    })}
    {simSwitch ? <Pressable accessibilityRole="switch" aria-checked={simSwitch.shown} onPress={simSwitch.onToggle} style={[S.chip, P.simSwitch, simSwitch.shown && S.chipOn]}><Label style={P.chipText}>SIM ROWS<Text style={T.simText}> +{simSwitch.count}</Text></Label></Pressable> : null}
  </View>;
}

/** Page header: the name and whether the link is live. There is no refresh
 *  control (owner decision 12 Sep): the page is live by construction — SSE
 *  frames, with the 15 s poll running only while the stream is down — so the
 *  dot turning `away` is the whole story and the poll keeps it current. */
export function Header({ state, updatedAtMs }: { state: 'connecting' | 'live' | 'offline'; updatedAtMs: number }) {
  const dot = state === 'live' ? 'online' : state === 'connecting' ? 'connecting' : 'away';
  const link = state === 'live' ? 'Live' : state === 'connecting' ? 'Connecting' : 'Offline';
  return <View style={P.header}>
    <Text style={T.pageTitle}>Beta Test Center</Text>
    <View style={P.headerRight}>
      <View style={P.headerLink}><Dot state={dot} /><Text style={T.meta}>{link} · updated {clockSeconds(updatedAtMs)}</Text></View>
      <Text style={T.meta}>Private · local owner view</Text>
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

/** The in-place simulation affordance: hidden rows never look vanished
 *  because their counts stay on this row, bound to the same switch. Only the
 *  word is small-caps; the counts keep their case, so the row reads
 *  `SIMULATION · 19 accounts · 361 pops ▸` on screen and in `innerText`. */
export function GroupRow({ count, noun, pops, open, onToggle }: { count: number; noun: string; pops?: number; open: boolean; onToggle: () => void }) {
  return <Pressable accessibilityRole="switch" aria-checked={open} onPress={onToggle} style={P.groupRow}>
    <Text style={[T.cell, P.groupText]}><Text style={P.groupLabel}>SIMULATION</Text> · {count} {noun}{pops !== undefined ? ` · ${pops} pops` : ''} {open ? '▾' : '▸'}</Text>
  </Pressable>;
}

export function Empty({ text }: { text: string }) { return <Text style={T.body}>{text}</Text>; }

/** Shown before the first dashboard frame: the link is not there yet, or it
 *  was tried and failed (`loading` false), and nothing below should pretend. */
export function Connecting({ loading }: { loading: boolean }) {
  return <View style={[S.card, P.connecting]}>
    <ActivityIndicator color={C.sync} />
    <View style={P.titleCopy}><Text style={T.panelTitle}>{loading ? 'Connecting to the local link…' : 'Local link unavailable'}</Text><Text style={T.body}>The page fills in the moment the first frame arrives; the fallback poll keeps trying.</Text></View>
  </View>;
}

/** The one-line status at the top of an operator tab's panel — the same
 *  derivation the tab shows as its caption while it is not selected. */
export function Strip({ text, tone = 'off' }: { text: string; tone?: 'live' | 'warn' | 'off' }) {
  return <Text numberOfLines={2} style={[T.meta, P.strip, tone === 'live' ? P.toneLive : tone === 'warn' ? P.toneWarn : null]}>{text}</Text>;
}

/** The tag on every simulation row: colour never carries the meaning alone. */
export function SimTag() { return <View style={P.simTag}><Text style={P.simTagText}>SIM</Text></View>; }

/** Shared by the ledger and the Algorithm section; the cause map had no legend before. */
export function CauseLegend() {
  return <View style={P.legend}>{CAUSE_LEGEND.map(item => <View key={item.cause} style={P.legendItem}><View style={[P.legendSwatch, { backgroundColor: item.color }]} /><Text style={T.meta}>{item.label}</Text></View>)}</View>;
}

const P = StyleSheet.create({
  dot: { width: 9, height: 9, borderRadius: 5 },
  dotOnline: { backgroundColor: C.now },
  dotAway: { backgroundColor: C.away },
  dotConnecting: { backgroundColor: C.sync },
  dotNone: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.away },
  delta: { fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  fact: { flexGrow: 1, flexBasis: 140, minWidth: 0, gap: 3 },
  factValue: { color: C.ink, fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  factSim: { color: C.sim, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  tileSim: { color: C.sim, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  section: { gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  titleCopy: { flex: 1, minWidth: 0, gap: 2 },
  // The bar spans the gradient edge to edge (the page's ±20 inset) and closes
  // with one rule; a tab's 2 px underline overlaps that rule by one pixel so
  // the selected tab reads as joined to its panel. Nine labels fit one row at
  // 696 px only if a caption never widens its tab: the caption is laid out
  // absolutely in the room every tab reserves under its label, as wide as
  // the tab itself, and truncates past that — so the bar's width is the
  // labels' alone and it wraps on the pane, not on the runner's state.
  tabBar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', marginHorizontal: -20, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: C.line },
  tab: { alignItems: 'center', minWidth: 0, paddingHorizontal: 10, paddingTop: 10, paddingBottom: 22, marginBottom: -1, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: C.now },
  tabLabel: { color: C.ink4, fontSize: 13, fontWeight: '800' },
  tabLabelOn: { color: C.ink },
  tabCaption: { position: 'absolute', left: 0, right: 0, bottom: 7, textAlign: 'center', color: C.ink5, fontSize: 10, letterSpacing: -0.2 },
  // Right-aligned on whichever row it lands: nine labels fill the row at
  // 736, so the chip wraps to its own line there and still sits right.
  simSwitch: { marginLeft: 'auto', marginBottom: 8 },
  chipText: { color: C.ink2 },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingTop: 16 },
  headerRight: { alignItems: 'flex-end', gap: 4 },
  headerLink: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  foldHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  foldPress: { flex: 1, minWidth: 0, minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 10 },
  foldGlyph: { color: C.ink4, fontSize: 14, width: 14, textAlign: 'center' },
  foldBody: { gap: 12 },
  strip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: C.panel },
  connecting: { flexDirection: 'row', alignItems: 'center' },
  toneLive: { color: C.pop },
  toneWarn: { color: C.boost },
  groupRow: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line },
  groupText: { color: C.sim, fontWeight: '600' },
  groupLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  simTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: '#493547' },
  simTagText: { color: C.ink, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch: { width: 8, height: 8, borderRadius: 4 },
});
