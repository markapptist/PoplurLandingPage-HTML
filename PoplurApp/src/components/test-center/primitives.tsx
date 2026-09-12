import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type TextStyle } from 'react-native';
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
 *  signed simulation value is rendered: prefixed `sim` and painted whole. */
export function Delta({ meters, tone = 'real', size = 'cell' }: { meters: number; tone?: 'real' | 'sim'; size?: 'cell' | 'metric' }) {
  const glyph = meters > 0 ? '▲' : meters < 0 ? '▼' : '·';
  const color = tone === 'sim' ? C.sim : meters > 0 ? C.pop : meters < 0 ? C.decay : C.away;
  return <Text style={[size === 'metric' ? T.metricValue : P.delta, { color }]}>{tone === 'sim' ? 'sim ' : ''}{glyph} {km(Math.abs(meters))}</Text>;
}

/** A labelled value inside a card: drill facts, the Algorithm facts row. */
export function Fact({ label, value, sim, meta }: { label: string; value: ReactNode; sim?: ReactNode; meta?: string }) {
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
 *  id, and its host node is handed back so the navigator can measure it at
 *  press time (spec §4.1). */
export function Section<Id extends string = string>({ id, title, meta, right, frame = 'card', innerRef, onLayout, children }: {
  id: Id;
  title: string;
  meta?: ReactNode;
  right?: ReactNode;
  frame?: 'card' | 'none';
  innerRef?: (id: Id, node: View | null) => void;
  onLayout?: (id: Id, y: number) => void;
  children?: ReactNode;
}) {
  return <View nativeID={id} ref={node => innerRef?.(id, node)} onLayout={onLayout ? (event: LayoutChangeEvent) => onLayout(id, event.nativeEvent.layout.y) : undefined} style={P.section}>
    <View style={P.titleRow}>
      <View style={P.titleCopy}><Text style={T.sectionTitle}>{title}</Text>{!!meta && <Text style={T.meta}>{meta}</Text>}</View>
      {right}
    </View>
    {frame === 'card' ? <View style={S.card}>{children}</View> : children}
  </View>;
}

/** The sticky navigator: one chip per section, the SIM-rows switch on the
 *  right. It wraps rather than scrolls, and reports its own height so the
 *  jump lands the title just under it. */
export function SectionNav<Id extends string = string>({ sections, onSelect, simCount, simShown, onToggleSim, onLayout }: {
  sections: readonly { id: Id; chip: string }[];
  onSelect: (id: Id) => void;
  simCount: number;
  simShown: boolean;
  onToggleSim: () => void;
  onLayout?: (height: number) => void;
}) {
  return <View nativeID="section-nav" onLayout={onLayout ? event => onLayout(event.nativeEvent.layout.height) : undefined} style={P.nav}>
    {sections.map(section => <Pressable key={section.id} accessibilityRole="button" onPress={() => onSelect(section.id)} style={S.chip}><Label style={P.chipText}>{section.chip}</Label></Pressable>)}
    <View style={P.navSpacer} />
    <Pressable accessibilityRole="switch" aria-checked={simShown} onPress={onToggleSim} style={[S.chip, simShown && S.chipOn]}><Label style={P.chipText}>SIM ROWS<Text style={T.simText}> +{simCount}</Text></Label></Pressable>
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

/** A collapsible operator fold. The header is a row of two siblings — the
 *  toggling Pressable and the `right` slot — never one inside the other: a
 *  Link's click bubbles to an ancestor Pressable on web and would toggle
 *  (and persist) the fold on every navigation (spec §4.6). */
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
  return <View nativeID={id} style={P.fold}>
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
 *  because their counts stay on this row, bound to the same switch. */
export function GroupRow({ count, noun, pops, open, onToggle }: { count: number; noun: string; pops?: number; open: boolean; onToggle: () => void }) {
  return <Pressable accessibilityRole="switch" aria-checked={open} onPress={onToggle} style={P.groupRow}>
    <Label style={P.groupText}>SIMULATION · {count} {noun}{pops !== undefined ? ` · ${pops} pops` : ''} {open ? '▾' : '▸'}</Label>
  </Pressable>;
}

export function Empty({ text }: { text: string }) { return <Text style={T.body}>{text}</Text>; }

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
  nav: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginHorizontal: -20, paddingHorizontal: 20, paddingVertical: 8, backgroundColor: C.bg, borderBottomWidth: 1, borderBottomColor: C.line },
  navSpacer: { flexGrow: 1 },
  chipText: { color: C.ink2 },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingTop: 16 },
  headerRight: { alignItems: 'flex-end', gap: 4 },
  headerLink: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fold: { gap: 8 },
  foldHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  foldPress: { flex: 1, minWidth: 0, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 },
  foldGlyph: { color: C.ink4, fontSize: 14, width: 14, textAlign: 'center' },
  foldBody: { gap: 12 },
  toneLive: { color: C.pop },
  toneWarn: { color: C.boost },
  groupRow: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line },
  groupText: { color: C.sim },
  simTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: '#493547' },
  simTagText: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch: { width: 8, height: 8, borderRadius: 4 },
});
