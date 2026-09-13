import { StyleSheet, Text, View } from 'react-native';
import type { BetaDashboard, BetaFeedback, RealtimeFeedPost, RealtimePublicPost } from '@/services/testControl';
import { Dot, Empty, Label, Num } from './primitives';
import { C, S, T, ago, clock, words } from './theme';

type LinkState = 'connecting' | 'live' | 'offline';
/** One live Feed channel as the route folds it: counts per media type, and
 *  how many of the rows are the simulation's. */
export type FeedChannel = [channelId: string, counts: { total: number; photos: number; videos: number; synthetic: number }];

/** The Diagnostics tab's status (spec §4.6) and its caption. The heartbeat
 *  count keeps both halves of the old TESTERS LIVE metric, printed as
 *  `active/total` (spec decision 10) — consent heartbeats, near-always zero,
 *  never the presence the tester table reads. */
export function diagnosticsStatus({ state, dashboard, posts, feedPosts, channels }: {
  state: LinkState;
  dashboard: BetaDashboard | null;
  posts: RealtimePublicPost[];
  feedPosts: RealtimeFeedPost[];
  channels: number;
}): { text: string; caption: string; tone: 'live' | 'warn' | 'off' } {
  const rows = dashboard?.rows ?? [];
  const active = rows.filter(row => row.state === 'active').length;
  const heartbeats = `${active}/${rows.length} heartbeat routes`;
  return {
    text: `Link ${state.toUpperCase()} · updated ${clock(dashboard?.generatedAtMs ?? 0)} · ${posts.length} map posts · ${feedPosts.length} feed posts · ${channels} channels · ${heartbeats}`,
    caption: heartbeats,
    tone: state === 'live' ? 'live' : state === 'offline' ? 'warn' : 'off',
  };
}

/** The Diagnostics tab's panel (spec §0, §5): the surface board, every count
 *  the dashboard ships that nothing else draws, the Feed channels, the
 *  consent heartbeats, and the one sentence that says how the page is fed. */
export function DiagnosticsBody({ dashboard, posts, feedPosts, feedChannels, state }: {
  dashboard: BetaDashboard;
  posts: RealtimePublicPost[];
  feedPosts: RealtimeFeedPost[];
  feedChannels: FeedChannel[];
  state: LinkState;
}) {
  // The normalised counts, the runner sessions and the two legacy arrays had
  // no reader on the page; here they are, printed under their field names.
  const counts: [string, number][] = [
    ['realTesters', dashboard.counts.realTesters],
    ['realPosts', dashboard.counts.realPosts],
    ['syntheticPersonas', dashboard.counts.syntheticPersonas],
    ['syntheticEvents', dashboard.counts.syntheticEvents],
    ['syntheticRecentEvents', dashboard.counts.syntheticRecentEvents],
    ['runnerActiveActors', dashboard.counts.runnerActiveActors],
    ['runnerSessions', dashboard.runnerSessions.length],
    ['posts (legacy)', dashboard.posts.length],
    ['map (legacy)', dashboard.map.length],
  ];
  return <>
    <SurfaceSyncBoard posts={posts} feedPosts={feedPosts} rows={dashboard.rows} state={state} />
    <View style={S.card}>
      <Label>DASHBOARD COUNTS · AS SHIPPED</Label>
      <View style={styles.facts}>{counts.map(([name, value]) => <View key={name} style={styles.fact}><Text style={T.meta}>{name}</Text><Text style={T.cell}>{value}</Text></View>)}</View>
    </View>
    <FeedChannels channels={feedChannels} />
    <Heartbeats rows={dashboard.rows} />
    <Text style={T.body}>{state === 'live' ? 'Private Firestore changes are streaming to this owner-only desk now.' : 'Live stream is reconnecting; bounded 15-second polling is active as a fallback.'}</Text>
  </>;
}

/** What the live Feed is receiving, per channel. The row count is real
 *  `+sim` from `RealtimeFeedPost.synthetic`, which was never drawn before. */
export function FeedChannels({ channels }: { channels: FeedChannel[] }) {
  return <View style={S.card}>
    <View style={styles.titleRow}><Text style={T.panelTitle}>Feed channels</Text><Text style={T.meta}>what the live Feed is receiving</Text></View>
    {!channels.length ? <Empty text="No feed posts." /> : channels.map(([channelId, counts]) => <View key={channelId} style={S.row}><View style={styles.count}><Num real={counts.total - counts.synthetic} sim={counts.synthetic} /></View><View style={styles.flex}><Text style={T.name}>{words(channelId)}</Text><Text style={T.meta}>{counts.photos} photos · {counts.videos} videos · {counts.total - counts.photos - counts.videos} unclassified</Text></View><Text style={T.meta}>LIVE</Text></View>)}
  </View>;
}

/** The consent heartbeats (`dashboard.rows`): a route name per opted-in
 *  device, nothing else. Both halves of the old TESTERS LIVE metric stay in
 *  the title (spec decision 10). */
export function Heartbeats({ rows }: { rows: BetaDashboard['rows'] }) {
  const active = rows.filter(row => row.state === 'active').length;
  return <View style={S.card}>
    <View style={styles.titleRow}><Text style={T.panelTitle}>Heartbeats · {active} active of {rows.length}</Text><Text style={T.meta}>needs tester consent</Text></View>
    {!rows.length ? <Empty text="No heartbeats — testers have not opted in." /> : rows.map(row => <View key={row.id} style={S.row}><Dot state={row.state === 'active' ? 'online' : 'away'} /><View style={styles.flex}><Text style={T.name}>{row.label}</Text><Text style={T.meta}>{row.screen.replace(/-/g, ' ')} · {row.platform} · v{row.appVersion}</Text></View><Text style={T.meta}>{row.state === 'active' ? 'LIVE' : ago(row.lastActivityAtMs)}</Text></View>)}
  </View>;
}

export function SurfaceSyncBoard({ posts, feedPosts, rows, state }: {
  posts: RealtimePublicPost[];
  feedPosts: RealtimeFeedPost[];
  rows: BetaDashboard['rows'];
  state: LinkState;
}) {
  const channels = new Set(feedPosts.map(post => post.channelId));
  const activeScreens = new Set(rows.filter(row => row.state === 'active').map(row => row.screen));
  // The public and the private surfaces read the same link: one stream feeds the desk.
  const surfaces = [
    { name: 'MAP', state, detail: `${posts.length} Firestore posts · add/change/delete` },
    { name: 'FEED', state, detail: `${feedPosts.length} posts across ${channels.size} live channels` },
    { name: 'PROFILE', state, detail: 'Owner account posts only · never globally projected' },
    { name: 'PHONE + HOUSE', state, detail: 'Realtime radius discovery · coordinates remain in app' },
    { name: 'NOTIFICATIONS', state, detail: 'Account listener · private notification content excluded' },
    { name: 'DM + CALLS', state, detail: 'Realtime app state only · private content excluded' },
    { name: 'EVERY SCREEN', state, detail: `${activeScreens.size} opted-in routes active now · route name only` },
  ];
  return <View style={S.card}>
    <View><Label>APP ↔ FIREBASE ↔ TEST CENTER</Label><Text style={T.panelTitle}>Realtime surface matrix</Text></View>
    <Text style={T.body}>Map receives canonical public posts globally; Feed applies each post’s earned radius before showing it. Profile remains strictly account-owned, while notifications, DMs and calls retain their account-scoped listeners. Consenting test devices publish only their current route. Messages, media, coordinates, keystrokes, camera and microphone data never enter this desk.</Text>
    <View style={styles.surfaceGrid}>{surfaces.map(surface => <View key={surface.name} style={[S.panel, styles.surface]}><View style={styles.row}><Label style={styles.surfaceName}>{surface.name}</Label><Label style={surface.state === 'live' ? styles.toneLive : styles.toneOff}>{surface.state.toUpperCase()}</Label></View><Text style={T.meta}>{surface.detail}</Text></View>)}</View>
  </View>;
}

/** What testers are saying: the voluntary reports, or the literal fact that
 *  no feedback UI has shipped (`submitBetaFeedback` has no caller). */
export function FeedbackList({ reports }: { reports: BetaFeedback[] }) {
  if (!reports.length) return <Empty text="No feedback UI has shipped yet." />;
  return <View>{reports.map(report => <View key={report.id} style={styles.report}>
    <View style={styles.row}><Text style={T.name}>{report.label}</Text><Text style={T.meta}>{ago(report.createdAtMs)}</Text></View>
    {!!report.finding && <Text style={T.body}><Label>FOUND </Label>{report.finding}</Text>}
    {!!report.liked && <Text style={T.body}><Label>LIKED </Label>{report.liked}</Text>}
    {!!report.improve && <Text style={T.body}><Label>IMPROVE </Label>{report.improve}</Text>}
  </View>)}</View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  flex: { flex: 1, gap: 2 },
  count: { minWidth: 44 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  fact: { flexGrow: 1, flexBasis: 140, minWidth: 0, gap: 2 },
  surfaceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  surface: { flexGrow: 1, flexBasis: 190, minHeight: 84 },
  surfaceName: { color: C.ink },
  toneLive: { color: C.pop },
  toneOff: { color: C.ink4 },
  report: { gap: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.hairlineSoft },
});
