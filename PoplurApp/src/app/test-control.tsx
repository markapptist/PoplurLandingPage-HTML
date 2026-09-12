import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  readOwnerDashboard,
  readPostHistory,
  readTesterPosts,
  subscribeOwnerDashboard,
  type BetaDashboard,
  type BetaMapCell,
  type BetaTesterPost,
  type PostHistory,
  type RealtimeFeedPost,
  type RealtimePublicPost,
} from '@/services/testControl';
import AlgorithmDesk from '@/components/AlgorithmDesk';
import RadiusLab from '@/components/radius-lab';
import { SurfaceSyncBoard } from '@/components/test-center/diagnostics';
import { ActualSessionMonitor, PersonaCard } from '@/components/test-center/simulation';
import { PostDrilldown, TesterTable } from '@/components/test-center/testers';
import { WEB_ONLY, ago, clock, words } from '@/components/test-center/theme';
import { WorldMap } from '@/components/test-center/world-map';

const REFRESH_MS = 15_000;
const EMPTY_PUBLIC_POSTS: RealtimePublicPost[] = [];
const EMPTY_FEED_POSTS: RealtimeFeedPost[] = [];
const EMPTY_MAP_CELLS: BetaMapCell[] = [];

export default function TestControlScreen() {
  const [dashboard, setDashboard] = useState<BetaDashboard | null>(null); const [loading, setLoading] = useState(true); const [notice, setNotice] = useState<string | null>(null);
  const [deskRealtimeState, setDeskRealtimeState] = useState<'connecting' | 'live' | 'offline'>('connecting');
  // The tester table's drill-down. Expanding a tester is local; opening a post
  // fetches its radius ledger through the proxy on demand rather than shipping
  // every post's history inside every live frame.
  const [expandedTester, setExpandedTester] = useState<string | null>(null);
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const [postHistory, setPostHistory] = useState<PostHistory | null>(null);
  const [postHistoryState, setPostHistoryState] = useState<'idle' | 'loading' | 'error'>('idle');
  const openPost = useCallback((postId: string) => {
    setOpenPostId(current => current === postId ? null : postId);
  }, []);
  // Tester rows arrive with an empty posts[] (the dashboard counts, it no
  // longer reads every post); a row's posts load when it is expanded and are
  // refetched when its last-post stamp moves.
  const [testerPosts, setTesterPosts] = useState<Record<string, { atMs: number; posts: BetaTesterPost[] | null }>>({});
  const expandedRow = dashboard?.testers.find(row => row.uid === expandedTester) ?? null;
  const expandedStamp = expandedRow?.lastPostedAtMs ?? 0;
  useEffect(() => {
    if (!expandedTester) return;
    const cached = testerPosts[expandedTester];
    if (cached && cached.atMs === expandedStamp && cached.posts !== null) return;
    let cancelled = false;
    setTesterPosts(current => ({ ...current, [expandedTester]: { atMs: expandedStamp, posts: null } }));
    readTesterPosts(expandedTester)
      .then(posts => { if (!cancelled) setTesterPosts(current => ({ ...current, [expandedTester]: { atMs: expandedStamp, posts } })); })
      .catch(() => { if (!cancelled) setTesterPosts(current => ({ ...current, [expandedTester]: { atMs: expandedStamp, posts: [] } })); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedTester, expandedStamp]);
  useEffect(() => {
    if (!openPostId) { setPostHistory(null); setPostHistoryState('idle'); return; }
    let cancelled = false;
    setPostHistoryState('loading');
    readPostHistory(openPostId)
      .then(history => { if (!cancelled) { setPostHistory(history); setPostHistoryState('idle'); } })
      .catch(() => { if (!cancelled) setPostHistoryState('error'); });
    return () => { cancelled = true; };
  }, [openPostId]);
  const refreshInFlight = useRef(false); const requestGeneration = useRef(0);
  const refresh = useCallback(async () => { if (refreshInFlight.current) return; refreshInFlight.current = true; const generation = ++requestGeneration.current; setLoading(true); try { const next = await readOwnerDashboard(); if (generation === requestGeneration.current) { setDashboard(next); setNotice(null); } } catch (error) { if (generation === requestGeneration.current) setNotice(error instanceof Error ? error.message : 'The local beta desk connection is unavailable.'); } finally { refreshInFlight.current = false; if (generation === requestGeneration.current) setLoading(false); } }, []);
  useEffect(() => subscribeOwnerDashboard(next => {
    setDashboard(next);
    setLoading(false);
    setNotice(null);
  }, setDeskRealtimeState), []);
  useEffect(() => { if (deskRealtimeState === 'live') return; let cancelled = false; let timer: ReturnType<typeof setTimeout> | undefined; const schedule = (delay = REFRESH_MS) => { if (!cancelled) timer = setTimeout(run, delay); }; const run = async () => { if (cancelled) return; if (typeof document === 'undefined' || document.visibilityState !== 'hidden') await refresh(); schedule(); }; const onVisibility = () => { if (document.visibilityState === 'visible') { if (timer) clearTimeout(timer); schedule(0); } }; schedule(0); if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility); return () => { cancelled = true; if (timer) clearTimeout(timer); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility); }; }, [deskRealtimeState, refresh]);
  const realtimePosts = dashboard?.publicPosts ?? EMPTY_PUBLIC_POSTS;
  const realtimeFeedPosts = dashboard?.publicFeed ?? EMPTY_FEED_POSTS;
  const realtimeCells = dashboard?.publicMap ?? EMPTY_MAP_CELLS;
  const realtimeState = deskRealtimeState;
  const events = useMemo(() => { if (!dashboard) return []; const posts = realtimePosts.map(post => ({ id: `post-${post.id}`, actor: post.label, kind: 'posted', place: post.place, radius: post.radiusKm, at: post.updatedAtMs || post.postedAtMs, simulated: post.synthetic })); const simulation = dashboard.simulation.map(event => ({ id: `sim-${event.id}`, actor: event.actor, kind: event.kind, place: event.place, radius: event.radiusKm, at: event.eventAtMs, simulated: true })); const runner = dashboard.runnerEvents.map(event => ({ id: `runner-${event.eventId}`, actor: event.actor, kind: event.action, place: event.place, radius: 0, at: event.eventAtMs, simulated: true })); return [...posts, ...runner, ...simulation].sort((a, b) => b.at - a.at).slice(0, 10); }, [dashboard, realtimePosts]);
  const feedChannels = useMemo(() => Object.entries(realtimeFeedPosts.reduce<Record<string, { total: number; photos: number; videos: number }>>((counts, post) => {
    const row = counts[post.channelId] ?? { total: 0, photos: 0, videos: 0 };
    row.total += 1;
    if (post.mediaType === 'photo') row.photos += 1;
    if (post.mediaType === 'video') row.videos += 1;
    counts[post.channelId] = row;
    return counts;
  }, {})).sort((left, right) => right[1].total - left[1].total || left[0].localeCompare(right[0])), [realtimeFeedPosts]);
  const radiusDelta = realtimePosts.reduce((sum, post) => sum + post.radiusDeltaKm, 0); const velocity = Math.max(0, ...realtimePosts.map(post => post.viralPerHour));
  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}><ScrollView contentContainerStyle={[styles.page, WEB_ONLY.page]}>
    <View style={styles.broadcast}><View style={styles.broadcastLeft}><View style={styles.liveDot} /><Text style={styles.liveText}>LIVE BETA DESK</Text></View><Text style={styles.broadcastRight}>PRIVATE · LOCAL OWNER VIEW</Text></View>
    <View style={styles.header}><Text style={styles.brand}>POPLUR</Text><Text style={styles.title}>Beta Control Room</Text><Text style={styles.subtitle}>A newsroom view of the closed beta: Firestore-realtime public post regions, timing, radius movement, viral pace, runner signals and tester reports.</Text></View>
    <View style={styles.headline}><View><Text style={styles.kicker}>THE BETA IN MOTION</Text><Text style={styles.roomTitle}>Global Situation Room</Text></View><Pressable onPress={refresh} style={styles.refresh}><Text style={styles.refreshText}>{loading ? 'SYNCING' : 'REFRESH'}</Text></Pressable></View>
    <WorldMap cells={realtimeCells} realtimeState={realtimeState} />
    <RadiusLab />
    <ActualSessionMonitor dashboard={dashboard} />
    {!dashboard ? <View style={styles.connecting}><ActivityIndicator color="#ff4aa3" /><View style={styles.flex}><Text style={styles.cardTitle}>{loading ? 'Connecting to your private desk…' : 'Desk unavailable'}</Text><Text style={styles.copy}>The world stays visible while the local telemetry link reconnects.</Text></View></View> : <>
      <View style={styles.stats}><Metric label="TESTERS LIVE" value={`${dashboard.rows.filter(row => row.state === 'active').length}`} note={`${dashboard.rows.length} opted-in humans`} /><Metric label="RUNNER ACTORS" value={`${dashboard.runnerActors.filter(profile => profile.state === 'live').length}`} note={`${dashboard.runnerActors.length} clearly labelled`} /><Metric label="PUBLIC POSTS LIVE" value={`${realtimePosts.length}`} note="Firestore · coarse regions" /><Metric label="RADIUS DELTA" value={`${radiusDelta >= 0 ? '+' : ''}${radiusDelta.toFixed(1)}`} suffix="km" note="across public posts" /><Metric label="TOP VIRAL PACE" value={velocity.toFixed(1)} note="signals / hour" /></View>
      <View style={styles.split}><View style={styles.card}><Text style={styles.kicker}>SYNTHETIC COHORT</Text><Text style={styles.cardTitle}>Runner safety lock</Text><Text style={styles.copy}>{dashboard.runnerEnabled ? `Cloud generation ${dashboard.runnerGeneration} is armed. The local runner still reports its own state below.` : 'Cloud runner is OFF. No synthetic browser events can be accepted.'}</Text><Text style={[styles.simState, dashboard.runnerEnabled ? styles.simLive : styles.simPaused]}>{dashboard.runnerEnabled ? '● CLOUD RUNNER ARMED' : '○ CLOUD RUNNER OFF'}</Text></View><View style={styles.card}><Text style={styles.kicker}>SYNC STATUS</Text><Text style={styles.cardTitle}>Last desk update</Text><Text style={styles.time}>{clock(dashboard.generatedAtMs)}</Text><Text style={styles.copy}>{deskRealtimeState === 'live' ? 'Private Firestore changes are streaming to this owner-only desk now.' : 'Live stream is reconnecting; bounded 15-second polling is active as a fallback.'}</Text></View></View>
      <SurfaceSyncBoard posts={realtimePosts} feedPosts={realtimeFeedPosts} rows={dashboard.rows} publicState={realtimeState} privateState={deskRealtimeState} />
      <Section title="Signals arriving at the desk" kicker="LIVE TICKER">{!events.length ? <Empty text="No opted-in or simulated signals have arrived yet." /> : events.map(event => <View key={event.id} style={styles.listRow}><View style={[styles.badge, event.simulated ? styles.simBadge : styles.betaBadge]}><Text style={styles.badgeText}>{event.simulated ? 'SIM' : 'BETA'}</Text></View><View style={styles.flex}><Text style={styles.name}>{event.actor} <Text style={styles.verb}>{event.kind.replace('-', ' ')}</Text></Text><Text style={styles.meta}>{event.place} · {Math.round(event.radius)} km radius</Text></View><Text style={styles.when}>{ago(event.at)}</Text></View>)}</Section>
      <Section title="The five isolated testing profiles" kicker="RUNNER PERSONAS"><View style={styles.personaGrid}>{!dashboard.runnerActors.length ? <Empty text="The beta runner manifest is loading." /> : dashboard.runnerActors.map(profile => <PersonaCard key={profile.id} profile={profile} />)}</View></Section>
      <Section title="Radius and virality desk" kicker="FIRESTORE REALTIME POST MOMENTUM">{!realtimePosts.length ? <Empty text="A published post with an approximate public area will appear here immediately." /> : realtimePosts.slice(0, 12).map(post => <View key={post.id} style={styles.listRow}><View style={styles.rate}><Text style={styles.rateValue}>{Math.round(post.viralPerHour)}</Text><Text style={styles.rateLabel}>/HR</Text></View><View style={styles.flex}><Text style={styles.name}>{post.label} · {post.place}</Text><Text style={styles.meta}>Posted {clock(post.postedAtMs)} · {post.initialRadiusKm.toFixed(1)} km → {post.radiusKm.toFixed(1)} km ({post.radiusDeltaKm >= 0 ? '+' : ''}{post.radiusDeltaKm.toFixed(1)} km)</Text></View><Text style={styles.when}>{ago(post.updatedAtMs || post.postedAtMs)}</Text></View>)}</Section>
      <Section title="What the live Feed is receiving" kicker="FIRESTORE REALTIME FEED CHANNELS">{!feedChannels.length ? <Empty text="The wiped Feed is empty. Channels will appear here at the same moment a published Firestore post reaches the app." /> : feedChannels.map(([channelId, counts]) => <View key={channelId} style={styles.listRow}><View style={styles.badge}><Text style={styles.badgeText}>{counts.total}</Text></View><View style={styles.flex}><Text style={styles.name}>{words(channelId)}</Text><Text style={styles.meta}>{counts.photos} photos · {counts.videos} videos · {counts.total - counts.photos - counts.videos} unclassified</Text></View><Text style={styles.when}>LIVE</Text></View>)}</Section>
      <Section title="Every tester, live" kicker="TESTER TABLE">{!dashboard.testers.length ? <Empty text="No accounts yet." /> : <TesterTable rows={dashboard.testers} daily={dashboard.daily} expandedUid={expandedTester} expandedPosts={expandedTester ? testerPosts[expandedTester]?.posts ?? null : null} onToggle={uid => setExpandedTester(current => current === uid ? null : uid)} openPostId={openPostId} onOpenPost={openPost} />}{!!openPostId && <PostDrilldown postId={openPostId} history={postHistory} state={postHistoryState} />}</Section>
      <AlgorithmDesk digest={dashboard.algorithm} refusal={dashboard.algorithmRefusal} openPostId={openPostId} onOpenPost={openPost} postHistory={postHistory} postHistoryState={postHistoryState} testers={dashboard.testers} />
      <Section title="Who is testing right now" kicker="TESTER ACTIVITY">{!dashboard.rows.length ? <Empty text="No opted-in tester activity yet." /> : dashboard.rows.map(row => <View key={row.id} style={styles.listRow}><View style={[styles.statusDot, row.state === 'active' ? styles.statusLive : styles.statusAway]} /><View style={styles.flex}><Text style={styles.name}>{row.label}</Text><Text style={styles.meta}>{row.screen.replace(/-/g, ' ')} · {row.platform} · v{row.appVersion}</Text></View><Text style={styles.when}>{row.state === 'active' ? 'LIVE' : ago(row.lastActivityAtMs)}</Text></View>)}</Section>
      <Section title="Findings, wins and improvements" kicker="WHAT TESTERS ARE SAYING">{!dashboard.feedback.length ? <Empty text="Voluntary tester reports will land here." /> : dashboard.feedback.map(report => <View key={report.id} style={styles.report}><View style={styles.row}><Text style={styles.name}>{report.label}</Text><Text style={styles.when}>{ago(report.createdAtMs)}</Text></View>{!!report.finding && <Text style={styles.reportText}><Text style={styles.reportLabel}>FOUND </Text>{report.finding}</Text>}{!!report.liked && <Text style={styles.reportText}><Text style={styles.reportLabel}>LIKED </Text>{report.liked}</Text>}{!!report.improve && <Text style={styles.reportText}><Text style={styles.reportLabel}>IMPROVE </Text>{report.improve}</Text>}</View>)}</Section>
    </>}{!!notice && <Text style={styles.notice}>{notice}</Text>}
  </ScrollView></SafeAreaView>;
}
function Metric({ label, value, suffix, note }: { label: string; value: string; suffix?: string; note: string }) { return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}{suffix && <Text style={styles.metricSuffix}> {suffix}</Text>}</Text><Text style={styles.metricNote}>{note}</Text></View>; }
function Section({ title, kicker, children }: { title: string; kicker: string; children: React.ReactNode }) { return <View style={[styles.card, { flexGrow: 0, flexBasis: 'auto' }]}><Text style={styles.kicker}>{kicker}</Text><Text style={styles.cardTitle}>{title}</Text>{children}</View>; }
function Empty({ text }: { text: string }) { return <Text style={styles.copy}>{text}</Text>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#12020c' },
  page: { flexGrow: 1, width: '100%', maxWidth: 1120, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 48, gap: 16 },
  broadcast: { minHeight: 42, marginHorizontal: -20, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f20b69', borderBottomWidth: 3, borderBottomColor: '#8d0642' },
  broadcastLeft: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  liveText: { color: '#fff', fontWeight: '900', fontSize: 11, letterSpacing: 1.2 },
  broadcastRight: { color: '#ffe1ef', fontWeight: '800', fontSize: 10, letterSpacing: 1 },
  header: { paddingTop: 28, gap: 5 },
  brand: { color: '#ff4aa3', fontWeight: '900', fontSize: 13, letterSpacing: 4, textShadowColor: '#ff1680', textShadowRadius: 12 },
  title: { color: '#fff7fb', fontSize: 42, fontWeight: '900', letterSpacing: -1.6 },
  subtitle: { color: '#e0b8cc', fontSize: 15, lineHeight: 21, maxWidth: 700 },
  connecting: { flexDirection: 'row', gap: 12, padding: 18, alignItems: 'center', borderWidth: 1, borderColor: '#78204b', borderRadius: 18, backgroundColor: '#210914' },
  headline: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 8 },
  kicker: { color: '#ff4aa3', fontSize: 10, fontWeight: '900', letterSpacing: 1.6 },
  roomTitle: { color: '#fff7fb', fontSize: 27, fontWeight: '900' },
  refresh: { backgroundColor: '#ff2f91', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 2, borderColor: '#ff8ac5' },
  refreshText: { color: '#fff', fontWeight: '900', fontSize: 10, letterSpacing: 1 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { flexGrow: 1, flexBasis: 190, minHeight: 112, padding: 15, justifyContent: 'space-between', borderWidth: 1, borderTopWidth: 3, borderColor: '#6b2548', borderTopColor: '#ff2f91', borderRadius: 18, backgroundColor: 'rgba(39,9,25,.93)', boxShadow: '0 10px 28px rgba(0,0,0,.25)' },
  metricLabel: { color: '#d29ab7', fontWeight: '900', fontSize: 10, letterSpacing: 1.1 },
  metricValue: { color: '#fff9fc', fontSize: 31, fontWeight: '900' },
  metricSuffix: { color: '#edbfd6', fontSize: 14 },
  metricNote: { color: '#b7859f', fontSize: 11 },
  split: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { flexGrow: 1, flexBasis: 340, gap: 12, padding: 18, borderWidth: 1, borderColor: '#6b2548', borderRadius: 20, backgroundColor: 'rgba(37,8,23,.94)', boxShadow: '0 12px 30px rgba(0,0,0,.24)' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  cardTitle: { color: '#fff8fc', fontSize: 19, fontWeight: '800' },
  copy: { color: '#d5a7bf', fontSize: 13, lineHeight: 19 },
  simState: { fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
  simLive: { color: '#6ff5b0' },
  simPaused: { color: '#d1a0b9' },
  time: { color: '#fff7fb', fontSize: 27, fontWeight: '900' },
  listRow: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#57203d' },
  flex: { flex: 1, gap: 2 },
  badge: { minWidth: 34, paddingVertical: 4, alignItems: 'center', borderRadius: 8 },
  betaBadge: { backgroundColor: '#ed176f' },
  simBadge: { backgroundColor: '#493547' },
  badgeText: { color: '#fff', fontSize: 8, fontWeight: '900' },
  name: { color: '#fff8fc', fontSize: 13, fontWeight: '800' },
  verb: { color: '#ff6caf', textTransform: 'uppercase', fontSize: 10 },
  meta: { color: '#d0a2b9', fontSize: 11 },
  when: { color: '#8fddff', fontSize: 10, fontWeight: '900' },
  rate: { width: 42, alignItems: 'center', borderLeftWidth: 3, borderLeftColor: '#ff2f91' },
  rateValue: { color: '#fff8fc', fontSize: 18, fontWeight: '900' },
  rateLabel: { color: '#c890ac', fontSize: 8, fontWeight: '900' },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  statusLive: { backgroundColor: '#5af0a4' },
  statusAway: { backgroundColor: '#806476' },
  report: { gap: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#57203d' },
  reportText: { color: '#dec0cf', fontSize: 12, lineHeight: 18 },
  reportLabel: { color: '#ff6caf', fontSize: 10, fontWeight: '900', letterSpacing: .8 },
  personaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  notice: { color: '#ffe8f3', backgroundColor: '#59132f', borderRadius: 12, padding: 12, fontSize: 12 },
});
