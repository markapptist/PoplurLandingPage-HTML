import { Fragment, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { BetaDailySeries, BetaDashboardCounts, BetaTesterPost, BetaTesterRow, PostHistory, RealtimePublicPost } from '@/services/testControl';
import { CauseLegend, Delta, Dot, Empty, Fact, GroupRow, Label, Num, Section, SimTag } from './primitives';
import { C, CAUSE_COLOR, PRESENCE_LABEL, PUBLIC_POPS_WINDOW, S, T, ago, clock, dayLabel, km, share, stamp } from './theme';

/** Which host opened the ledger drill-down. A post open under a tester row is
 *  not also selected in Latest pops or the Algorithm desk; re-opening it from
 *  another host only switches the origin, so the fetch (keyed on the post id
 *  alone) is not repeated (spec decision 12). */
export type DrillOrigin = 'testers' | 'pops' | 'radius';
export type DrillState = {
  openPostId: string | null;
  origin: DrillOrigin | null;
  history: PostHistory | null;
  state: 'idle' | 'loading' | 'error';
  open: (postId: string, origin: DrillOrigin) => void;
};
/** A tester's pops, fetched on expand when the dashboard ships counts only
 *  (`row.posts` empty, `postCount` > 0 — spec decision 20). */
export type LazyPops = { state: 'loading' | 'ready' | 'error'; posts: BetaTesterPost[] };
/** The ledger shows its newest rows by default; the rest is one press away. */
const LEDGER_DEFAULT_ROWS = 12;
/** Latest pops shows this many rows per group before `Show 12 more`. */
const POPS_PAGE = 12;

/** One column per calendar day: how many people joined and how many pops were
 *  dropped. Real counts draw solid; the simulation's share sits behind them in
 *  the muted tone so a busy cohort day never reads as a busy beta day. The
 *  body of the `Joining and dropping, per day` card — its host draws the
 *  title and the card. Empty series: the literal state, never a `reduce`. */
export function DailyStrip({ series }: { series: BetaDailySeries }) {
  if (!series.days.length) return <Empty text="No daily series yet." />;
  // The track is the largest REAL day (spec decision 7): the simulation
  // layer is the day's total, clamped to a full track by share(), so a cohort
  // day reads as a full muted track with a readable real bar in front and
  // the +N beneath, instead of squashing every real bar under the cohort.
  const maxSignups = Math.max(1, ...series.days.map(day => day.signups - day.syntheticSignups));
  const maxPosts = Math.max(1, ...series.days.map(day => day.posts - day.syntheticPosts));
  const realSignups = series.days.reduce((sum, day) => sum + day.signups - day.syntheticSignups, 0);
  const realPosts = series.days.reduce((sum, day) => sum + day.posts - day.syntheticPosts, 0);
  return <View style={styles.daily}>
    <Text style={T.meta}>Last {series.days.length} days · {realSignups} new testers · {realPosts} pops dropped · days roll at midnight {series.timeZone.replace('_', ' ')}{series.postsComplete ? '' : ' · earliest days under-count pops (ledger slice capped)'}</Text>
    <View style={styles.dailyLegend}>
      <View style={styles.legendItem}><View style={[styles.legendSwatch, styles.dailyBarSignups]} /><Label>NEW TESTERS</Label></View>
      <View style={styles.legendItem}><View style={[styles.legendSwatch, styles.dailyBarPosts]} /><Label>POPS DROPPED</Label></View>
      <View style={styles.legendItem}><View style={[styles.legendSwatch, styles.dailyBarSim]} /><Label>SIMULATION (+N)</Label></View>
    </View>
    <View style={styles.dailyRow}>
      {series.days.map(day => {
        const people = day.signups - day.syntheticSignups;
        const pops = day.posts - day.syntheticPosts;
        return <View key={day.day} style={styles.dailyCol}>
          <View style={styles.dailyBars}>
            <View style={styles.dailyTrack}>
              <View style={[styles.dailyBar, styles.dailyBarSim, { height: share(day.signups, maxSignups) }]} />
              <View style={[styles.dailyBar, styles.dailyBarSignups, { height: share(people, maxSignups) }]} />
            </View>
            <View style={styles.dailyTrack}>
              <View style={[styles.dailyBar, styles.dailyBarSim, { height: share(day.posts, maxPosts) }]} />
              <View style={[styles.dailyBar, styles.dailyBarPosts, { height: share(pops, maxPosts) }]} />
            </View>
          </View>
          <Text style={[styles.dailyNum, styles.dailyNumSignups]} numberOfLines={1}>{people}{day.syntheticSignups ? <Text style={T.simText}>+{day.syntheticSignups}</Text> : null}</Text>
          <Text style={[styles.dailyNum, styles.dailyNumPosts]} numberOfLines={1}>{pops}{day.syntheticPosts ? <Text style={T.simText}>+{day.syntheticPosts}</Text> : null}</Text>
          <Text style={[T.meta, styles.dailyDay]} numberOfLines={1}>{dayLabel(day.day)}</Text>
        </View>;
      })}
    </View>
  </View>;
}

/** Online first, then away, then no signal; inside a rank the newest pop,
 *  then the newest account (spec §4.8). Real and simulation rows are ranked
 *  the same way, each within its own group. */
const PRESENCE_RANK: Record<BetaTesterRow['presence'], number> = { online: 0, away: 1, unknown: 2 };
export const byPresence = (a: BetaTesterRow, b: BetaTesterRow) => PRESENCE_RANK[a.presence] - PRESENCE_RANK[b.presence] || b.lastPostedAtMs - a.lastPostedAtMs || b.signedUpAtMs - a.signedUpAtMs;

/** The Testers tab: the title row carries the two counts (real number, `+N`
 *  simulation — never a sum), the card the real rows online-first, then the
 *  group row and, only while the switch is on, the simulation rows. Rows can
 *  hide; counts never do (spec decision 6). While the dashboard ships no
 *  rows at all the title falls back to its `counts` (spec §4.7). */
export function TesterTable({ rows, counts, expandedUid, onToggle, lazy, onRetry, showSim, onToggleSim, drill }: {
  rows: BetaTesterRow[];
  counts: BetaDashboardCounts;
  expandedUid: string | null;
  onToggle: (row: BetaTesterRow) => void;
  lazy: Record<string, LazyPops>;
  onRetry: (uid: string) => void;
  showSim: boolean;
  onToggleSim: () => void;
  drill: DrillState;
}) {
  const people = rows.filter(row => !row.synthetic).sort(byPresence);
  const simulation = rows.filter(row => row.synthetic).sort(byPresence);
  const pops = (group: BetaTesterRow[]) => group.reduce((sum, row) => sum + row.postCount, 0);
  const realAccounts = rows.length ? people.length : counts.realTesters;
  const realPops = rows.length ? pops(people) : counts.realPosts;
  const simPops = pops(simulation);
  const renderRow = (row: BetaTesterRow) => <TesterRow key={row.uid} row={row} expanded={expandedUid === row.uid} onToggle={onToggle} lazy={lazy[row.uid] ?? null} onRetry={onRetry} drill={drill} />;
  return <Section id="testers" title="Testers" meta={<><Num real={realAccounts} sim={simulation.length} /> accounts · <Num real={realPops} sim={simPops} /> pops</>}>
    {!rows.length ? <Empty text="No accounts yet." /> : <View>
      <View style={[S.row, styles.tableHead]}><Label style={styles.colName}>TESTER</Label><Label style={styles.colStatus}>STATUS</Label><Label style={styles.colWhen}>SIGNED UP</Label><Label style={styles.colNum}>POPS</Label><Label style={styles.colWhen}>LAST POP</Label></View>
      {people.map(renderRow)}
      {simulation.length > 0 && <GroupRow count={simulation.length} noun="accounts" pops={simPops} open={showSim} onToggle={onToggleSim} />}
      {showSim && simulation.map(renderRow)}
    </View>}
  </Section>;
}

/** One tester and, while expanded, its pops. A Fragment, not a wrapper View:
 *  the expansion is the next DOM sibling of the row that opened it. A
 *  simulation row carries the `SIM` tag and the muted tone together — colour
 *  never carries the meaning alone (spec §3.5). */
function TesterRow({ row, expanded, onToggle, lazy, onRetry, drill }: { row: BetaTesterRow; expanded: boolean; onToggle: (row: BetaTesterRow) => void; lazy: LazyPops | null; onRetry: (uid: string) => void; drill: DrillState }) {
  const sim = row.synthetic;
  const online = row.presence === 'online';
  const status = online ? (row.screen ? row.screen.replace(/-/g, ' ') : row.presenceSource === 'lease' ? 'IN APP' : 'LIVE') : row.presence === 'away' ? ago(row.lastActivityAtMs) : PRESENCE_LABEL.unknown;
  return <Fragment>
    <Pressable accessibilityRole="button" aria-expanded={expanded} onPress={() => onToggle(row)} style={[S.row, expanded && S.open]}>
      <View style={styles.colName}>
        <View style={styles.nameLine}>{sim && <SimTag />}<Text style={[T.name, sim && T.simText]} numberOfLines={1}>{row.label}</Text></View>
        <Text style={T.meta} numberOfLines={1}>{row.username ? `@${row.username}` : row.uid.slice(0, 8)}{row.accountType !== 'user' ? ` · ${row.accountType}` : ''}{row.platform ? ` · ${row.platform}` : ''}</Text>
      </View>
      <View style={styles.colStatus}>
        <View style={styles.statusLine}><Dot state={online ? 'online' : row.presence === 'away' ? 'away' : 'none'} /><Text style={[T.cell, sim && T.simText]} numberOfLines={1}>{status}</Text></View>
        {/* The sign-in stamp was shipped and never drawn; it answers "when were they last here?" once the presence line cannot. */}
        {!online && <Text style={T.meta} numberOfLines={1}>last sign-in {ago(row.lastSignInAtMs)}</Text>}
      </View>
      <Text style={[T.cell, styles.colWhen, sim && T.simText]}>{stamp(row.signedUpAtMs)}</Text>
      <Text style={[T.cell, styles.colNum, sim && T.simText]}>{row.postCount}</Text>
      <Text style={[T.cell, styles.colWhen, sim && T.simText]}>{row.lastPostedAtMs ? ago(row.lastPostedAtMs) : '—'}</Text>
    </Pressable>
    {expanded && <PopList row={row} lazy={lazy} drill={drill} onRetry={onRetry} />}
  </Fragment>;
}

/** The expansion under a tester row. `row.posts` is the list while the server
 *  still ships summaries; otherwise the lazily fetched result, with its
 *  loading / error states. The drill-down renders inside this list, directly
 *  under the pop that opened it (spec §4.10, §5). */
export function PopList({ row, lazy, drill, onRetry }: { row: BetaTesterRow; lazy: LazyPops | null; drill: DrillState; onRetry: (uid: string) => void }) {
  const list = row.posts.length ? row.posts : lazy?.posts ?? [];
  const lazyState = row.posts.length ? null : lazy;
  if (lazyState?.state === 'loading') return <View style={[styles.postList, styles.postState]}><ActivityIndicator color={C.sync} /><Text style={T.body}>Loading pops…</Text></View>;
  if (lazyState?.state === 'error') return <View style={[styles.postList, styles.postState]}><Text style={T.body}>Pops could not be loaded.</Text><Pressable accessibilityRole="button" onPress={() => onRetry(row.uid)} style={S.button}><Label>RETRY</Label></Pressable></View>;
  if (!list.length) return <Text style={[T.body, styles.postList]}>No pops yet.</Text>;
  return <View style={styles.postList}>{list.map(post => {
    const open = drill.openPostId === post.id && drill.origin === 'testers';
    return <Fragment key={post.id}>
      <PostRow post={post} open={open} onPress={() => drill.open(post.id, 'testers')} />
      {open && <PostDrilldown key={post.id} postId={post.id} history={drill.history} state={drill.state} />}
    </Fragment>;
  })}</View>;
}

export function PostRow({ post, open, onPress }: { post: BetaTesterPost; open: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" aria-selected={open} onPress={onPress} style={[S.row, styles.postRow, open && S.open]}>
    <Label style={styles.postKind}>{post.mediaType === 'video' ? 'VIDEO' : post.mediaCount > 1 ? `CAROUSEL ×${post.mediaCount}` : 'PHOTO'}</Label>
    <View style={styles.flex}><Text style={T.cell} numberOfLines={1}>{post.caption || post.id}</Text><Text style={T.meta}>{stamp(post.createdAtMs)}{post.channelId ? ` · ${post.channelId}` : ''}{post.coarse ? ` · ${post.coarse.latitude.toFixed(3)}, ${post.coarse.longitude.toFixed(3)}` : ''}</Text></View>
    <Text style={[T.cell, styles.postRadius]}>{km(post.radiusMeters)}</Text>
  </Pressable>;
}

/** One public pop in Latest pops (spec §4.9): the ticker's row and the
 *  momentum row folded into one — every field both printed survives. A press
 *  opens the ledger under it; the `SIM` tag marks a simulation row. */
export function PopRow({ post, open, onPress }: { post: RealtimePublicPost; open: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" aria-selected={open} onPress={onPress} style={[S.row, open && S.open]}>
    {post.synthetic && <SimTag />}
    <View style={styles.flex}>
      <Text style={T.name} numberOfLines={1}>{post.label} · {post.place}</Text>
      <Text style={T.meta} numberOfLines={2}>Posted {clock(post.postedAtMs)} · {post.initialRadiusKm.toFixed(1)} km → {post.radiusKm.toFixed(1)} km · <Delta meters={post.radiusDeltaKm * 1000} /></Text>
    </View>
    <View style={styles.popRight}>
      <Text style={T.meta}>pace {post.viralPerHour.toFixed(1)}/h</Text>
      <Text style={T.meta}>{ago(post.updatedAtMs || post.postedAtMs)}</Text>
    </View>
  </Pressable>;
}

/** The Pops tab: every public pop in the window, newest first — the ticker's
 *  pop rows and the old momentum list folded into one list. Real rows come
 *  first; the simulation sits behind its group row and shows only while the
 *  SIM ROWS switch is on, so hidden pops never look vanished (spec §4.8).
 *  Each group pages 12 at a time from an in-memory count. A press opens the
 *  ledger directly under the row; the origin is shared with the Today
 *  preview, which is the same list seen through a smaller window. */
export function PopsList({ posts, showSim, onToggleSim, drill }: { posts: RealtimePublicPost[]; showSim: boolean; onToggleSim: () => void; drill: DrillState }) {
  const [realShown, setRealShown] = useState(POPS_PAGE);
  const [simShown, setSimShown] = useState(POPS_PAGE);
  const real = posts.filter(post => !post.synthetic);
  const simulation = posts.filter(post => post.synthetic);
  const renderRow = (post: RealtimePublicPost) => {
    const open = drill.openPostId === post.id && drill.origin === 'pops';
    return <Fragment key={post.id}>
      <PopRow post={post} open={open} onPress={() => drill.open(post.id, 'pops')} />
      {open && <PostDrilldown key={post.id} postId={post.id} history={drill.history} state={drill.state} />}
    </Fragment>;
  };
  const showMore = (total: number, shown: number, grow: () => void) => total > shown
    ? <Pressable accessibilityRole="button" onPress={grow} style={[S.button, styles.showMore]}><Text style={T.cell}>Show {Math.min(POPS_PAGE, total - shown)} more</Text></Pressable>
    : null;
  // One View, not the card's gapped children: rows meet on their top rules.
  return <Section id="pops" title="Latest pops" meta={<>newest first · <Num real={real.length} sim={simulation.length} /> in the {PUBLIC_POPS_WINDOW}-pop window</>}>
    <View>
      {!real.length && <Empty text="No pops yet." />}
      {real.slice(0, realShown).map(renderRow)}
      {showMore(real.length, realShown, () => setRealShown(current => current + POPS_PAGE))}
      {simulation.length > 0 && <GroupRow count={simulation.length} noun="pops" open={showSim} onToggle={onToggleSim} />}
      {showSim && simulation.slice(0, simShown).map(renderRow)}
      {showSim && showMore(simulation.length, simShown, () => setSimShown(current => current + POPS_PAGE))}
    </View>
  </Section>;
}

/** Radius over time, drawn with plain views: no chart dependency in this app. */
export function RadiusBars({ history }: { history: PostHistory['history'] }) {
  const peak = Math.max(1, ...history.map(entry => entry.radiusMeters));
  return <View style={styles.bars}>{history.map(entry => <View key={entry.id} style={styles.barCol}><View style={[styles.bar, { height: Math.max(3, Math.round((entry.radiusMeters / peak) * 72)), backgroundColor: CAUSE_COLOR[entry.cause] ?? C.away }]} /></View>)}</View>;
}

export function PostDrilldown({ postId, history, state }: { postId: string; history: PostHistory | null; state: 'idle' | 'loading' | 'error' }) {
  // In-memory only; the drill-down is keyed by post id at its call site, so a
  // different post always opens on the 12 newest.
  const [showAll, setShowAll] = useState(false);
  if (state === 'loading' || (!history && state === 'idle')) return <View style={[S.open, S.panel, styles.drill]}><ActivityIndicator color={C.sync} /><Text style={T.body}>Loading the radius ledger for {postId}…</Text></View>;
  if (state === 'error' || !history) return <View style={[S.open, S.panel, styles.drill]}><Text style={T.body}>That post&apos;s ledger could not be read.</Text></View>;
  const first = history.history[0];
  const last = history.history[history.history.length - 1];
  const peak = history.history.reduce((best, entry) => entry.radiusMeters > best.radiusMeters ? entry : best, first ?? { radiusMeters: 0, atMs: 0 });
  const where = history.exact ?? history.coarse;
  const total = history.history.length;
  const newestFirst = history.history.slice().reverse();
  const ledger = showAll ? newestFirst : newestFirst.slice(0, LEDGER_DEFAULT_ROWS);
  // The open highlight's left rule sits on the nested panel tone: the
  // drill-down is the one open thing besides the row that opened it.
  return <View style={[S.open, S.panel, styles.drill]}>
    <Text style={T.panelTitle}>{history.caption || history.postId}</Text>
    <Text style={T.meta}>Posted {stamp(history.createdAtMs)}{history.channelId ? ` · ${history.channelId}` : ''} · {history.mediaType === 'video' ? 'video' : history.mediaCount > 1 ? `carousel ×${history.mediaCount}` : 'photo'}</Text>
    <Text style={T.meta}>{where ? `${history.exact ? 'Dropped at' : 'Near'} ${where.latitude.toFixed(5)}, ${where.longitude.toFixed(5)}` : 'Location hidden'}{history.locationVisibility ? ` · ${history.locationVisibility}` : ''}</Text>
    <Text style={T.meta}>Seed {km(history.seedRadiusMeters)} · earned {km(history.organicRadiusMeters)}</Text>
    <View style={styles.drillFacts}>
      <Fact label="STARTED" value={first ? km(first.radiusMeters) : km(history.seedRadiusMeters)} />
      <Fact label="NOW" value={km(history.radiusMeters)} />
      <Fact label="PEAK" value={peak.radiusMeters ? `${km(peak.radiusMeters)} · ${ago(peak.atMs)}` : '—'} />
      {/* A signed quantity takes the ▲/▼ glyph, never a bare `+` — that is the simulation-count mark (spec §3.5). */}
      <Fact label="GROWTH" value={first && last ? `${last.radiusMeters > first.radiusMeters ? '▲' : last.radiusMeters < first.radiusMeters ? '▼' : '·'} ${km(Math.abs(last.radiusMeters - first.radiusMeters))}` : '—'} />
    </View>
    {!total ? <Text style={T.body}>No radius changes recorded yet — the ledger starts with the post&apos;s first engagement.</Text> : <>
      <RadiusBars history={history.history} />
      <CauseLegend />
      <View style={styles.ledgerHead}>
        <Text style={T.meta}>{showAll ? `All ${total} entries` : total > LEDGER_DEFAULT_ROWS ? `${LEDGER_DEFAULT_ROWS} newest ·` : `${total} ${total === 1 ? 'entry' : 'entries'}`}</Text>
        {total > LEDGER_DEFAULT_ROWS && <Pressable accessibilityRole="button" aria-expanded={showAll} onPress={() => setShowAll(current => !current)} style={S.button}><Text style={T.cell}>{showAll ? `Show ${LEDGER_DEFAULT_ROWS} newest` : `Show all ${total}`}</Text></Pressable>}
      </View>
      <View style={[S.row, styles.ledgerRow]}>
        <View style={styles.causeChipSpace} />
        <Label style={styles.ledgerCause}>CAUSE</Label>
        <Label style={styles.ledgerWhen}>WHEN</Label>
        <Label style={styles.ledgerRadius}>RADIUS</Label>
        <Label style={styles.ledgerChange}>CHANGE</Label>
      </View>
      {ledger.map(entry => <View key={entry.id} style={[S.row, styles.ledgerRow]}>
        <View style={[styles.causeChip, { backgroundColor: CAUSE_COLOR[entry.cause] ?? C.away }]} />
        <Text style={[T.cell, styles.ledgerCause]}>{entry.cause}{entry.kind ? ` · ${entry.kind}` : ''}</Text>
        <Text style={[T.cell, styles.ledgerWhen]}>{stamp(entry.atMs)}</Text>
        <Text style={[T.cell, styles.ledgerRadius]}>{km(entry.radiusMeters)}</Text>
        <Delta meters={entry.delta} style={styles.ledgerChange} />
      </View>)}
    </>}
  </View>;
}

const styles = StyleSheet.create({
  tableHead: { borderTopWidth: 0, paddingVertical: 4 },
  colName: { flex: 2.2, minWidth: 0 },
  colStatus: { flex: 1.4, minWidth: 0, gap: 2 },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  colWhen: { flex: 1.2, minWidth: 0 },
  colNum: { flex: 0.6, textAlign: 'right' },
  postList: { paddingLeft: 12, paddingBottom: 6 },
  postState: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  // A pop row inside a tester's expansion: the row, on the softer rule.
  postRow: { gap: 10, paddingVertical: 7, borderTopColor: C.lineSoft },
  postKind: { width: 92 },
  postRadius: { color: C.pop, fontWeight: '700' },
  drill: { marginTop: 8 },
  drillFacts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginVertical: 4 },
  // A long ledger has more columns than the panel is wide: the newest bars
  // stay in view and the oldest clip on the left, never the page's width.
  bars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'flex-end', gap: 2, height: 76, marginVertical: 6, overflow: 'hidden' },
  barCol: { flex: 1, minWidth: 3, maxWidth: 14, justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 2 },
  ledgerRow: { paddingVertical: 4, borderTopColor: C.lineSoft },
  ledgerHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  causeChip: { width: 8, height: 8, borderRadius: 4 },
  causeChipSpace: { width: 8 },
  ledgerCause: { flex: 1.6 },
  ledgerWhen: { flex: 1.4 },
  ledgerRadius: { flex: 1, textAlign: 'right' },
  ledgerChange: { flex: 1, textAlign: 'right' },
  flex: { flex: 1, gap: 2 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  popRight: { alignItems: 'flex-end', gap: 2 },
  showMore: { alignSelf: 'flex-start', marginTop: 8 },
  daily: { gap: 8 },
  dailyLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch: { width: 10, height: 10, borderRadius: 2 },
  dailyRow: { flexDirection: 'row', gap: 4 },
  dailyCol: { flex: 1, minWidth: 0, alignItems: 'center' },
  dailyBars: { flexDirection: 'row', gap: 2, height: 56, alignItems: 'flex-end', width: '100%' },
  dailyTrack: { flex: 1, height: '100%', position: 'relative', borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.04)', overflow: 'hidden' },
  dailyBar: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  dailyBarSignups: { backgroundColor: C.people },
  dailyBarPosts: { backgroundColor: C.pop },
  dailyBarSim: { backgroundColor: C.simFill },
  dailyNum: { fontSize: 11, fontWeight: '700', marginTop: 4, fontVariant: ['tabular-nums'] },
  dailyNumSignups: { color: C.people },
  dailyNumPosts: { color: C.pop, marginTop: 1 },
  dailyDay: { marginTop: 3 },
});
