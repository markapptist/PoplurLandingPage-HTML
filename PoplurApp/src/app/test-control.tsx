import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'expo-router/head';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  readOwnerDashboard,
  readPostHistory,
  readTesterPosts,
  subscribeOwnerDashboard,
  type BetaDashboard,
  type BetaMapCell,
  type BetaTesterRow,
  type PostHistory,
  type RealtimeFeedPost,
  type RealtimePublicPost,
} from '@/services/testControl';
import AlgorithmDesk from '@/components/AlgorithmDesk';
import { DiagnosticsBody, FeedbackList, diagnosticsStatus, type FeedChannel } from '@/components/test-center/diagnostics';
import { useDeskPanels, useRadiusLabSummary, useSyntheticRunnerState, useUrlTab } from '@/components/test-center/hooks';
import { LabPanel, labStatus } from '@/components/test-center/lab';
import { Connecting, Header, Section, Strip, TabBar } from '@/components/test-center/primitives';
import { SimulationBody, simulationStatus, type SimEvent } from '@/components/test-center/simulation';
import { DailyStrip, PopsList, TesterTable, mergeRunnerPresence, type DrillOrigin, type DrillState, type LazyPops } from '@/components/test-center/testers';
import { ROOT_CSS, S, T, WEB_ONLY, clock } from '@/components/test-center/theme';
import { AlgorithmSection, LatestPopsPreview, TodayStrip, splitRadius, todayStatusLine } from '@/components/test-center/today';
import { WorldMap } from '@/components/test-center/world-map';

const REFRESH_MS = 15_000;
const EMPTY_PUBLIC_POSTS: RealtimePublicPost[] = [];
const EMPTY_FEED_POSTS: RealtimeFeedPost[] = [];
const EMPTY_MAP_CELLS: BetaMapCell[] = [];

/** The one ledger the page holds: the open post's, or the last one read. */
type FetchedLedger = { postId: string; history: PostHistory | null; state: 'idle' | 'error' };
const forgetFailedRead = (current: FetchedLedger | null) => current?.state === 'error' ? null : current;

/** The tabs, left to right (owner decision 12 Sep, spec §0). The id is the
 *  URL: `/test-control?tab=<id>`. */
const TABS = [
  { id: 'today', label: 'Today' },
  { id: 'testers', label: 'Testers' },
  { id: 'pops', label: 'Pops' },
  { id: 'map', label: 'Map' },
  { id: 'feedback', label: 'Feedback' },
  { id: 'algorithm', label: 'Algorithm' },
  { id: 'simulation', label: 'Simulation' },
  { id: 'lab', label: 'Radius Lab' },
  { id: 'diagnostics', label: 'Diagnostics' },
] as const;
type TabId = typeof TABS[number]['id'];
const TAB_IDS: readonly TabId[] = TABS.map(tab => tab.id);

export default function TestControlScreen() {
  const [dashboard, setDashboard] = useState<BetaDashboard | null>(null); const [loading, setLoading] = useState(true); const [notice, setNotice] = useState<string | null>(null);
  const [deskRealtimeState, setDeskRealtimeState] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [tab, selectTab] = useUrlTab(TAB_IDS, 'today');
  const panels = useDeskPanels();
  // The route keeps every live source (spec §0): the stream, the fallback
  // poll, the runner's state poll and the Lab summary run whichever tab is
  // shown, so a tab is current the moment it mounts and nothing re-fetches on
  // a switch. Only rendering — plus the frame poll and the Lab widget's own
  // subscription, which live inside their tab bodies — unmounts with a tab.
  const runner = useSyntheticRunnerState();
  const testersLive = useMemo(() => mergeRunnerPresence(dashboard?.testers ?? [], runner.state), [dashboard?.testers, runner.state]);
  const labSummary = useRadiusLabSummary(tab !== 'lab');
  // The ledger drill-down. Opening a post fetches its radius ledger through
  // the proxy on demand rather than shipping every post's history inside every
  // live frame. One post is open at a time, tagged with the host that opened
  // it, so re-opening it from another host switches the origin without a
  // second `postHistory` call (the fetch is keyed on the id alone).
  const [expandedTester, setExpandedTester] = useState<string | null>(null);
  const [opened, setOpened] = useState<{ postId: string; origin: DrillOrigin } | null>(null);
  const openPostId = opened?.postId ?? null;
  // The fetched ledger is written only inside the promise callbacks and the
  // handlers below; loading and history are derived from whether it belongs
  // to the open post, so closing needs no clearing (spec §4.3, the lint-clean
  // form). A failed read is forgotten by the handler that opens or closes its
  // post, so the next open retries it — never the effect, which would loop.
  const [fetched, setFetched] = useState<FetchedLedger | null>(null);
  const openPost = useCallback((postId: string, origin: DrillOrigin) => {
    setOpened(current => current?.postId === postId && current.origin === origin ? null : { postId, origin });
    setFetched(forgetFailedRead);
  }, []);
  const closeDrill = useCallback(() => { setOpened(null); setFetched(forgetFailedRead); }, []);
  useEffect(() => {
    if (!openPostId) return;
    // The ledger already held is not read again: closing and re-opening the
    // same post, from any host, costs no second `postHistory` cloud call.
    if (fetched?.postId === openPostId) return;
    let cancelled = false;
    readPostHistory(openPostId)
      .then(history => { if (!cancelled) setFetched({ postId: openPostId, history, state: 'idle' }); })
      .catch(() => { if (!cancelled) setFetched({ postId: openPostId, history: null, state: 'error' }); });
    return () => { cancelled = true; };
  }, [openPostId, fetched]);
  const drill = useMemo<DrillState>(() => ({
    openPostId,
    origin: opened?.origin ?? null,
    history: fetched?.postId === openPostId ? fetched.history : null,
    state: !openPostId ? 'idle' : fetched?.postId !== openPostId ? 'loading' : fetched.state,
    open: openPost,
  }), [openPostId, opened?.origin, fetched, openPost]);
  const openRadiusPost = useCallback((postId: string) => openPost(postId, 'radius'), [openPost]);
  // Tester rows arrive with an empty posts[] (the dashboard counts, it no
  // longer reads every post); a row's pops are fetched on the expand that
  // first needs them and cached against the row's pop stamp, so the same
  // tester is never re-read while its POPS / LAST POP cells stand still and
  // is re-read on the next expand once the stream moves them (there is no
  // refresh control to drop the cache: the page is live). Every write here
  // happens in a handler or a promise callback, never in an effect.
  const [lazyPops, setLazyPops] = useState<Record<string, LazyPops>>({});
  const requested = useRef(new Map<string, string>());
  const loadPops = useCallback((uid: string, popsStamp: string) => {
    requested.current.set(uid, popsStamp);
    setLazyPops(current => ({ ...current, [uid]: { state: 'loading', posts: [] } }));
    readTesterPosts(uid)
      .then(posts => setLazyPops(current => ({ ...current, [uid]: { state: 'ready', posts } })))
      .catch(() => setLazyPops(current => ({ ...current, [uid]: { state: 'error', posts: [] } })));
  }, []);
  const toggleTester = useCallback((row: BetaTesterRow) => {
    const expanding = expandedTester !== row.uid;
    setExpandedTester(expanding ? row.uid : null);
    if (drill.origin === 'testers') closeDrill();
    const popsStamp = `${row.postCount}:${row.lastPostedAtMs}`;
    if (expanding && row.posts.length === 0 && row.postCount > 0 && requested.current.get(row.uid) !== popsStamp) loadPops(row.uid, popsStamp);
  }, [expandedTester, drill.origin, closeDrill, loadPops]);
  // RETRY re-issues the failed read against the stamp it was made for.
  const retryPops = useCallback((uid: string) => loadPops(uid, requested.current.get(uid) ?? ''), [loadPops]);
  // `refresh` is the fallback poll's internal only — there is no control for
  // it (owner decision 12 Sep): the page is live, and the poll runs solely
  // while the stream is down.
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
  // The old ticker split in two: its pop rows are Latest pops (below); the
  // runner's button clicks and the cohort's events are the Simulation tab's
  // own list and never enter the owner's lists (spec decision 11).
  const simulationEvents = useMemo<SimEvent[]>(() => { if (!dashboard) return []; const simulation = dashboard.simulation.map(event => ({ id: `sim-${event.id}`, actor: event.actor, kind: event.kind, place: event.place, radius: event.radiusKm, at: event.eventAtMs })); const runner = dashboard.runnerEvents.map(event => ({ id: `runner-${event.eventId}`, actor: event.actor, kind: event.action, place: event.place, radius: 0, at: event.eventAtMs })); return [...runner, ...simulation].sort((a, b) => b.at - a.at).slice(0, 20); }, [dashboard]);
  const feedChannels = useMemo<FeedChannel[]>(() => Object.entries(realtimeFeedPosts.reduce<Record<string, FeedChannel[1]>>((counts, post) => {
    const row = counts[post.channelId] ?? { total: 0, photos: 0, videos: 0, synthetic: 0 };
    row.total += 1;
    if (post.mediaType === 'photo') row.photos += 1;
    if (post.mediaType === 'video') row.videos += 1;
    if (post.synthetic) row.synthetic += 1;
    counts[post.channelId] = row;
    return counts;
  }, {})).sort((left, right) => right[1].total - left[1].total || left[0].localeCompare(right[0])), [realtimeFeedPosts]);
  // Newest first by the ticker's clock; the Today preview and the Pops tab read this.
  const latestPops = useMemo(() => realtimePosts.slice().sort((a, b) => (b.updatedAtMs || b.postedAtMs) - (a.updatedAtMs || a.postedAtMs)), [realtimePosts]);
  // Radius moved over the same window, real and simulation apart, for the
  // Algorithm tab's facts row above the peer's desk.
  const radiusSplit = useMemo(() => splitRadius(realtimePosts), [realtimePosts]);
  const latestReal = latestPops.find(post => !post.synthetic) ?? null;
  const simAccounts = dashboard?.testers.filter(row => row.synthetic).length ?? 0;
  const toggleSimRows = useCallback(() => panels.toggle('showSimRows'), [panels]);
  const seeAllPops = useCallback(() => selectTab('pops'), [selectTab]);
  // The operator tabs' status lines: the strip at the top of their panels,
  // and — while another tab is selected — the caption under their labels,
  // so a tool's state is readable without opening it (spec §0).
  const simulation = simulationStatus(runner, dashboard);
  const lab = labStatus(labSummary);
  const diagnostics = diagnosticsStatus({ state: deskRealtimeState, dashboard, posts: realtimePosts, feedPosts: realtimeFeedPosts, channels: feedChannels.length });
  const tabs = useMemo(() => TABS.map(item => ({ ...item, caption: item.id === 'simulation' ? simulation.caption : item.id === 'lab' ? lab.caption : item.id === 'diagnostics' ? diagnostics.caption : undefined })), [simulation.caption, lab.caption, diagnostics.caption]);
  const simSwitch = tab === 'testers' || tab === 'pops' ? { count: simAccounts, shown: panels.open.showSimRows, onToggle: toggleSimRows } : null;

  const panel = (() => {
    switch (tab) {
      case 'today': return <>
        {!dashboard && <Connecting loading={loading} />}
        <Section id="today" title="Today" meta={dashboard ? `as of ${clock(dashboard.generatedAtMs)} · days roll at midnight ${dashboard.daily.timeZone.replace('_', ' ')}` : 'connecting'}>
          <TodayStrip testers={dashboard ? testersLive : null} daily={dashboard?.daily ?? null} posts={dashboard?.publicPosts ?? null} runner={runner.state} statusLine={todayStatusLine({ latestReal, simulationCount: (dashboard?.publicPosts ?? []).filter(post => post.synthetic).length, simulationLive: runner.state?.status === 'live' })} />
        </Section>
        <Section id="daily" title="Joining and dropping, per day">{dashboard ? <DailyStrip series={dashboard.daily} /> : <Text style={T.body}>Connecting…</Text>}</Section>
        <LatestPopsPreview posts={latestPops} showSim={panels.open.showSimRows} drill={drill} onSeeAll={seeAllPops} />
      </>;
      case 'testers': return !dashboard ? <Connecting loading={loading} /> : <TesterTable rows={testersLive} counts={dashboard.counts} expandedUid={expandedTester} onToggle={toggleTester} lazy={lazyPops} onRetry={retryPops} showSim={panels.open.showSimRows} onToggleSim={toggleSimRows} drill={drill} />;
      case 'pops': return !dashboard ? <Connecting loading={loading} /> : <PopsList posts={latestPops} showSim={panels.open.showSimRows} onToggleSim={toggleSimRows} drill={drill} />;
      // The map owns its tab, so it is taller than the long page's 280 (spec §0).
      case 'map': return <>
        {!dashboard && <Connecting loading={loading} />}
        <Section id="map" title="Where pops are landing" meta="city buckets only" frame="none"><WorldMap cells={realtimeCells} height={360} /></Section>
      </>;
      case 'feedback': return !dashboard ? <Connecting loading={loading} /> : <Section id="feedback" title="What testers are saying" meta={dashboard.feedback.length ? `${dashboard.feedback.length} ${dashboard.feedback.length === 1 ? 'report' : 'reports'}` : 'voluntary reports'}><FeedbackList reports={dashboard.feedback} /></Section>;
      // The peer's desk shares the page's drill state through the origin
      // adapter: a post open under a tester row is not also selected in its
      // panel K, and re-opening it there switches the origin without a
      // second `postHistory` call (spec decision 21).
      case 'algorithm': return !dashboard ? <Connecting loading={loading} /> : <AlgorithmSection split={radiusSplit}>
        <AlgorithmDesk digest={dashboard.algorithm} refusal={dashboard.algorithmRefusal} openPostId={drill.origin === 'radius' ? drill.openPostId : null} onOpenPost={openRadiusPost} postHistory={drill.history} postHistoryState={drill.state} testers={dashboard.testers} />
      </AlgorithmSection>;
      case 'simulation': return <>
        <Strip text={simulation.text} tone={simulation.tone} />
        <SimulationBody dashboard={dashboard} runner={runner} events={simulationEvents} panels={panels} />
      </>;
      case 'lab': return <LabPanel summary={labSummary} />;
      case 'diagnostics': return <>
        <Strip text={diagnostics.text} tone={diagnostics.tone} />
        {!dashboard ? <Connecting loading={loading} /> : <DiagnosticsBody dashboard={dashboard} posts={realtimePosts} feedPosts={realtimeFeedPosts} feedChannels={feedChannels} state={deskRealtimeState} />}
      </>;
    }
  })();

  // The body takes the app's font and ground while this route is focused
  // (spec §0b: the font stack on the root); RNW's Text never inherits it, so
  // every text style in `theme.ts` carries the stack as well.
  return <SafeAreaView style={[S.safe, WEB_ONLY.page]} edges={['top', 'bottom']}>
    <Head><style>{ROOT_CSS}</style></Head>
    <View style={S.chrome}>
      <Header state={deskRealtimeState} updatedAtMs={dashboard?.generatedAtMs ?? 0} />
      <TabBar tabs={tabs} selected={tab} onSelect={selectTab} simSwitch={simSwitch} />
    </View>
    <ScrollView style={S.scroll} contentContainerStyle={S.page}>
      {!!notice && <Text style={S.notice}>{notice}</Text>}
      {panel}
    </ScrollView>
  </SafeAreaView>;
}
