import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import type { BetaDashboard, BetaRunnerActor, BetaRunnerAnalytics } from '@/services/testControl';
import {
  readSyntheticRunnerFrames,
  readSyntheticRunnerFrameImage,
  runFirstUserOnboarding,
  runSharedFirstUserOnboarding,
  setSyntheticRunnerEnabled,
  isCohortMode,
  SYNTHETIC_ACTIVITY_FALLBACK,
  type SyntheticActivity,
  type SyntheticCohortMode,
  type SyntheticRunnerActor,
  type SyntheticRunnerFrame,
  type SyntheticRunnerState,
} from '@/services/syntheticRunner';
import type { useDeskPanels, useSyntheticRunnerState } from './hooks';
import { Dot, Empty, Fact, Fold, Label, SimTag } from './primitives';
import { C, S, T, ago, clock, duration, words } from './theme';

const RUNNER_REFRESH_MS = 2_500;
/** The five accounts are the cohort's whole roster; the title counts against it. */
const COHORT_SIZE = 5;

type Runner = ReturnType<typeof useSyntheticRunnerState>;
type Panels = ReturnType<typeof useDeskPanels>;
/** A runner click or a cohort event, as the Simulation tab lists it — the
 *  ticker's row shape, minus the pops (those are Latest pops now). */
export type SimEvent = { id: string; actor: string; kind: string; place: string; radius: number; at: number };

/** The Simulation tab's status (spec §4.6) — the strip at the top of its
 *  panel — and the short caption under its label while another tab is
 *  selected. Local and cloud are on one line because a local Start silently
 *  pauses when the cloud gate is off. The roster's own `signedIn` / `posting`
 *  arithmetic is reused, not re-derived. */
export function simulationStatus(runner: { state: SyntheticRunnerState | null; error: string | null }, dashboard: BetaDashboard | null): { text: string; caption: string; tone: 'live' | 'warn' | 'off' } {
  const s = runner.state;
  const cloud = cloudGate(dashboard);
  if (runner.error || !s || s.status === 'offline' || s.status === 'error') return { text: `OFFLINE · ${cloud}`, caption: 'runner OFFLINE', tone: runner.error ? 'warn' : 'off' };
  if (s.mode === 'first-user-v1' || s.mode === 'first-user-shared-v1') {
    const phase = s.completed ? `COMPLETE ${clock(s.completedAtMs)}` : s.status.toUpperCase();
    const result = s.result ? ` · ${journeyResult(s.result)}` : '';
    return { text: `Journey · ${s.mode === 'first-user-v1' ? 'emulator' : 'shared tester'} · ${phase}${result}`, caption: `runner JOURNEY · ${phase}`, tone: s.error ? 'warn' : s.status === 'live' ? 'live' : 'off' };
  }
  if (!s.enabled) return { text: `OFF · ${cloud}`, caption: 'runner OFF', tone: 'off' };
  const signedIn = signedInActors(s.actors);
  const posting = signedIn.reduce((total, actor) => total + actor.postsPublished, 0);
  const failed = Boolean(s.error) || s.actors.some(actor => actor.lastError);
  return {
    text: `${s.status === 'live' ? 'LIVE' : s.status.toUpperCase()} · ${s.mode === 'five-actor-live' ? 'live use' : 'read-only'} · ${signedIn.length}/${COHORT_SIZE} signed in · ${posting} pops this run · ${cloud}${failed ? ' · ERROR' : ''}`,
    caption: `runner ON · ${signedIn.length}/${COHORT_SIZE} signed in`,
    tone: failed ? 'warn' : s.status === 'live' ? 'live' : 'off',
  };
}

/** The cloud gate as the status line and the runner-control panel print it. */
const cloudGate = (dashboard: BetaDashboard | null) => dashboard ? (dashboard.runnerEnabled ? `cloud gate ARMED gen ${dashboard.runnerGeneration}` : 'cloud gate OFF') : 'cloud gate —';
const journeyResult = (result: NonNullable<SyntheticRunnerState['result']>) => `MAP ${result.mapVerified ? 'VERIFIED' : 'PENDING'} · FEED ${result.feedEligible ? result.feedVerified ? 'VERIFIED' : 'PENDING' : 'NOT RADIUS-ELIGIBLE'}`;
const signedInActors = (actors: SyntheticRunnerActor[]) => actors.filter(actor => Boolean(actor.sessionId) && (actor.status === 'live' || actor.status === 'starting'));

export const PERSONA_MARKS: Record<string, string> = { food: '🍜', sports: '⚽', music: '🎧', performance: '💻', tech: '💻', news: '📰' };
export function AnalyticsBars({ title, counts }: { title: string; counts: Record<string, number> }) {
  const entries = Object.entries(counts).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, 8);
  const maximum = Math.max(1, ...entries.map(([, count]) => count));
  return <View style={styles.analyticsGroup}><Text style={T.name}>{title}</Text>{!entries.length ? <Text style={T.body}>Waiting for recorded synthetic events.</Text> : entries.map(([label, count]) => <View key={label} style={styles.analyticsRow}><View style={styles.analyticsLabelRow}><Text style={[T.cell, styles.flex]}>{words(label)}</Text><Text style={T.cell}>{count}</Text></View><View style={styles.analyticsTrack}><View style={[styles.analyticsFill, { width: `${Math.max(5, (count / maximum) * 100)}%` } as never]} /></View></View>)}</View>;
}

export function SessionAnalytics({ analytics }: { analytics: BetaRunnerAnalytics }) {
  return <View style={styles.analyticsPanel}>
    <View style={styles.analyticsSummary}><View><Text style={T.metricValue}>{analytics.eventCount}</Text><Label>RECORDED EVENTS</Label></View><View><Text style={T.metricValue}>{analytics.sessionCount}</Text><Label>SESSIONS</Label></View><View><Text style={T.metricValue}>{duration(analytics.averageDwellMs)}</Text><Label>AVG DWELL</Label></View></View>
    {/* `eventTypeCounts` was normalised but never drawn; a third group costs nothing. */}
    <View style={styles.analyticsColumns}><AnalyticsBars title="Screens" counts={analytics.screenCounts} /><AnalyticsBars title="Actions" counts={analytics.actionCounts} /><AnalyticsBars title="Event types" counts={analytics.eventTypeCounts} /></View>
    <Text style={T.meta}>{analytics.windowStartMs && analytics.windowEndMs ? `${clock(analytics.windowStartMs)} – ${clock(analytics.windowEndMs)} runtime window` : 'Analytics will fill as synthetic journeys are recorded.'}</Text>
  </View>;
}

const pageIsVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';

/** The runner Switch stays the native control; on web its on-state thumb is
 *  RNW's Material teal unless `activeThumbColor` — a web-only prop, absent
 *  from RN's types — says otherwise. The thumb is ink in both states; the
 *  track is the clay fill on, the soft hairline off. */
const SWITCH_WEB_PROPS = { activeThumbColor: C.ink } as object;

export function ActualRunnerFrameImage({ actorId, frame, frameKey, actor, onUnavailable }: { actorId: string; frame: SyntheticRunnerFrame; frameKey: string; actor: string; onUnavailable: (key: string) => void }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let localUrl = '';
    const load = async () => {
      try {
        const image = await readSyntheticRunnerFrameImage(actorId, frame.sequence);
        if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') throw new Error('Object URLs are unavailable.');
        localUrl = URL.createObjectURL(image);
        if (cancelled) URL.revokeObjectURL(localUrl);
        else setObjectUrl(localUrl);
      } catch {
        if (!cancelled) onUnavailable(frameKey);
      }
    };
    void load();
    return () => { cancelled = true; if (localUrl) URL.revokeObjectURL(localUrl); };
  }, [actorId, frame.sequence, frameKey, onUnavailable]);
  if (!objectUrl) return <View style={styles.frameLoading}><ActivityIndicator color={C.sync} /><Text style={T.meta}>Loading actual local frame…</Text></View>;
  return <Image accessibilityLabel={`Actual local Poplur frame for ${actor} on ${frame.screen || 'unknown screen'}`} resizeMode="contain" source={{ uri: objectUrl }} style={styles.actualFrame} />;
}

/** The Simulation tab's panel (spec §0, §2, §5). The runner's state is the
 *  route's (`useSyntheticRunnerState`, polled whichever tab is shown); every
 *  control here writes back through `runner.apply` / `runner.fail`, so the
 *  strip and the tab caption move within one poll of a click. What lives
 *  here and unmounts with the tab: the mode choice, the chosen account, the
 *  frame replay and its poll. Sub-panel folds persist through `panels`. */
export function SimulationBody({ dashboard, runner, events, panels }: { dashboard: BetaDashboard | null; runner: Runner; events: SimEvent[]; panels: Panels }) {
  const s = runner.state;
  const [chosenActorId, setChosenActorId] = useState<string | null>(null);
  const [commandBusy, setCommandBusy] = useState(false);
  const [chosenMode, setModeChoice] = useState<SyntheticCohortMode>('five-actor-readonly');
  const activeCohortMode: SyntheticCohortMode | null = s?.enabled && isCohortMode(s.mode) ? s.mode : null;
  // Derived, not synced through an effect (react-hooks/set-state-in-effect is
  // an error here): while a cohort runs, its mode is the choice (spec §4.4).
  const modeChoice = activeCohortMode ?? chosenMode;
  const actors = s?.actors ?? [];
  const selected = actors.find(actor => actor.actorId === chosenActorId) ?? actors[0] ?? null;
  const isolatedFirstUserMode = s?.mode === 'first-user-v1';
  const sharedFirstUserMode = s?.mode === 'first-user-shared-v1';
  const firstUserMode = isolatedFirstUserMode || sharedFirstUserMode;
  const firstUserActive = firstUserMode && (s?.status === 'starting' || s?.status === 'live');
  const firstUserComplete = firstUserMode && s?.completed === true;
  // The old "clear the frames on stop" branches, inverted into a derivation:
  // frames show only while the runner is on or a journey runs, and a new
  // cohort run remounts the frame subtree through `key={runId}` (spec §4.4).
  const framesLive = !!s && (s.enabled || firstUserMode);
  const journeyLocked = commandBusy || !s || s.enabled || firstUserActive;
  const catalogueActivities = activeCohortMode && s?.activities.length ? s.activities : SYNTHETIC_ACTIVITY_FALLBACK[modeChoice];
  const liveAccounts = dashboard?.runnerActors.filter(profile => profile.state === 'live').length ?? 0;

  const toggleRunner = async (enabled: boolean) => {
    if (commandBusy) return;
    setCommandBusy(true);
    try {
      runner.apply(await setSyntheticRunnerEnabled(enabled, modeChoice));
    } catch {
      runner.fail('The local runner could not change state safely.');
    } finally {
      setCommandBusy(false);
    }
  };
  const startFirstUser = async () => {
    if (journeyLocked) return;
    setCommandBusy(true);
    try {
      const next = await runFirstUserOnboarding();
      runner.apply(next, next.error || null);
    } catch {
      runner.fail('The emulator-only first-user journey could not start safely.');
    } finally {
      setCommandBusy(false);
    }
  };
  const startSharedFirstUser = async () => {
    if (journeyLocked) return;
    setCommandBusy(true);
    try {
      const next = await runSharedFirstUserOnboarding();
      runner.apply(next, next.error || null);
    } catch {
      runner.fail('The shared-backend tester journey could not start safely.');
    } finally {
      setCommandBusy(false);
    }
  };

  return <View style={styles.body}>
    <View style={[S.card, styles.runnerControl]}><View style={styles.flex}><Label>{cohortModeLabel(modeChoice)}</Label><Text style={T.panelTitle}>{firstUserActive ? 'Unavailable while first-user journey runs' : commandBusy ? 'Changing runner state safely…' : s?.enabled ? (activeCohortMode === 'five-actor-live' ? 'Runner is on · the five users are using the app' : 'Runner is on') : 'Runner is off'}</Text><Text style={T.body}>{s?.enabled ? (activeCohortMode === 'five-actor-live' ? 'Live use: the five beta accounts are signed in to the real app, posting and liking. Turn this off before app maintenance; stopping clears every local frame.' : 'Turn this off before app maintenance. Stopping clears every local frame.') : modeChoice === 'five-actor-live' ? 'Live use signs the five beta accounts in to the real app shell, publishes real posts tagged synthetic, and views and likes other testers’ posts so radius grows toward you.' : firstUserMode ? 'Starting the original five-person cohort will replace the recorded first-user replay.' : 'The original five-person cohort is unchanged and cannot overlap the first-user journey.'}</Text><Text style={[T.meta, dashboard?.runnerEnabled ? styles.toneLive : styles.toneOff]}>{cloudGate(dashboard)}{dashboard ? dashboard.runnerEnabled ? ' · the local runner still reports its own state here' : ' · no synthetic browser events are accepted, so a local Start pauses' : ' · the desk is not connected'}</Text></View><View style={styles.modePicker}>{(['five-actor-readonly', 'five-actor-live'] as SyntheticCohortMode[]).map(mode => { const active = modeChoice === mode; return <Pressable key={mode} accessibilityRole="button" accessibilityState={{ selected: active, disabled: Boolean(activeCohortMode) || commandBusy }} disabled={Boolean(activeCohortMode) || commandBusy} onPress={() => setModeChoice(mode)} style={[S.button, active && S.chipOn]}><Label style={active && styles.buttonLabelOn}>{mode === 'five-actor-live' ? 'LIVE USE · POSTS' : 'READ-ONLY'}</Label></Pressable>; })}</View><Switch {...SWITCH_WEB_PROPS} accessibilityLabel="Start or stop the isolated synthetic runner" disabled={commandBusy || !s || firstUserActive} onValueChange={enabled => { void toggleRunner(enabled); }} thumbColor={C.ink} trackColor={{ false: C.hairlineSoft, true: C.clayFaceFill }} value={!firstUserMode && s?.enabled === true} /></View>
    <View style={S.card}>
      <View style={styles.panelHeading}><View><Label>JOURNEYS · ONE SHOT EACH</Label><Text style={T.panelTitle}>Journeys</Text></View><Text style={T.meta}>{firstUserMode ? `${isolatedFirstUserMode ? 'emulator' : 'shared tester'} · ${firstUserComplete ? 'complete' : s?.status ?? ''}` : 'none recorded this session'}</Text></View>
      <View style={[S.row, styles.journey]}>
        <View style={styles.flex}><Label>EMULATOR-ONLY · ONE SHOT</Label><Text style={T.panelTitle}>Watch Poplur’s first user</Text><Text style={T.body}>Creates one new synthetic account through the visible signup UI, adds its profile photo, posts through Camera and Composer, then verifies the same post on Map and Profile. The one-shot runner is quarantined from production Firebase.</Text>{isolatedFirstUserMode && <Text style={T.cell}>{s?.identity?.email || 'Generating first-user identity…'}</Text>}{isolatedFirstUserMode && !!s?.error && <Text style={[T.meta, styles.toneWarn]}>{s.error}</Text>}</View>
        <Pressable accessibilityRole="button" accessibilityLabel="Run the emulator-only first user journey once" disabled={journeyLocked} onPress={() => { void startFirstUser(); }} style={[S.buttonPrimary, styles.runButton, journeyLocked && S.disabled]}><Label style={styles.buttonLabelOn}>{isolatedFirstUserMode && firstUserComplete ? 'COMPLETE' : isolatedFirstUserMode ? 'RUN RECORDED' : commandBusy ? 'RUNNING…' : 'RUN ISOLATED ONCE'}</Label></Pressable>
      </View>
      <View style={[S.row, styles.journey]}>
        <View style={styles.flex}><Label>SHARED POPLUR BACKEND · ONE SHOT</Label><Text style={T.panelTitle}>Watch a separate real tester</Text><Text style={T.body}>Creates one new tester account and one public post through the visible app. Both remain live on Poplur. The post appears on Map and, only when its normal radius qualifies, in Feed. It is never injected into or checked against your personal Profile. This test does not validate username-login reservation.</Text>{sharedFirstUserMode && <Text style={T.cell}>{s?.identity?.email || 'Generating shared tester identity…'}</Text>}{sharedFirstUserMode && s?.result && <Text style={T.cell}>{journeyResult(s.result)} · PROFILE NOT CHECKED</Text>}{sharedFirstUserMode && !!s?.error && <Text style={[T.meta, styles.toneWarn]}>{s.error}</Text>}</View>
        <Pressable accessibilityRole="button" accessibilityLabel="Create one production tester account and public post" disabled={journeyLocked} onPress={() => { void startSharedFirstUser(); }} style={[S.buttonPrimary, styles.runButton, journeyLocked && S.disabled]}><Label style={styles.buttonLabelOn}>{sharedFirstUserMode && firstUserComplete ? 'COMPLETE' : sharedFirstUserMode ? 'RUN RECORDED' : commandBusy ? 'RUNNING…' : 'RUN SHARED TESTER ONCE'}</Label></Pressable>
      </View>
    </View>
    <SignedInRoster actors={actors} cohortMode={activeCohortMode} runnerOffline={Boolean(runner.error) || !s} runError={s && isCohortMode(s.mode) ? s.error : ''} />
    <View style={S.card}>
      <View style={styles.panelHeading}><View><Label>CLOUD MANIFEST</Label><Text style={T.panelTitle}>The five simulation accounts · {liveAccounts} of {COHORT_SIZE} live</Text></View><Text style={T.meta}>{dashboard ? `generation ${dashboard.runnerGeneration}` : 'desk not connected'}</Text></View>
      {!dashboard?.runnerActors.length ? <Empty text="Runner accounts not loaded." /> : dashboard.runnerActors.map(profile => <AccountRow key={profile.id} profile={profile} />)}
    </View>
    <FrameReplay key={s?.runId || 'none'} state={s} error={runner.error} actors={actors} selected={selected} onChoose={setChosenActorId} live={framesLive} firstUserMode={firstUserMode} firstUserComplete={firstUserComplete} />
    <Fold id="catalogue" title={`What the simulation does · ${catalogueActivities.length} steps`} status={`${modeChoice === 'five-actor-live' ? 'live use — browse, post, view, like' : 'read-only — browse only'} · ${activeCohortMode ? 'reported by the runner now' : 'planned for this mode'}`} tone={activeCohortMode ? 'live' : 'off'} open={panels.open.catalogue} onToggle={() => panels.toggle('catalogue')}>
      <ActivityCatalogue mode={modeChoice} activities={catalogueActivities} live={Boolean(activeCohortMode)} />
    </Fold>
    {!firstUserMode && dashboard && <Fold id="analytics" title="Session analytics" status={`${dashboard.runnerAnalytics.eventCount} recorded events · ${dashboard.runnerAnalytics.sessionCount} sessions · avg dwell ${duration(dashboard.runnerAnalytics.averageDwellMs)}`} tone="off" open={panels.open.analytics} onToggle={() => panels.toggle('analytics')}>
      <SessionAnalytics analytics={dashboard.runnerAnalytics} />
    </Fold>}
    <View style={S.card}>
      <View style={styles.panelHeading}><View><Label>RUNNER CLICKS AND COHORT EVENTS</Label><Text style={T.panelTitle}>Recent simulation events</Text></View><Text style={T.meta}>{events.length ? `newest ${events.length}` : 'none yet'}</Text></View>
      {!events.length ? <Empty text="No simulation events yet." /> : events.map(event => <View key={event.id} style={S.row}><SimTag /><View style={styles.flex}><Text style={T.name}>{event.actor} <Text style={T.label}>{event.kind.replace('-', ' ')}</Text></Text><Text style={T.meta}>{event.place} · {Math.round(event.radius)} km radius</Text></View><Text style={T.meta}>{ago(event.at)}</Text></View>)}
    </View>
    <View style={S.card}><Label>ACTUAL SYNTHETIC POPLUR SESSIONS · FRAMES STAY LOCAL</Label><Text style={T.body}>These are actual local app frames, never a reconstruction. Human account access and private capture are blocked; both first-user modes use a fixed synthetic profile image and browser fake camera. The shared tester’s account and post are real production data, while every recorded frame remains on this machine.</Text></View>
  </View>;
}

/** The account tabs, the session facts and the frame + replay columns. This
 *  subtree owns the frames, the replay position and the 2.5 s frame poll, so
 *  they stop the moment the tab is left; its host keys it by the run id, so
 *  a new cohort run mounts with empty frame state and never shows the
 *  previous run's frames (spec §4.4). The chosen account lives in the host,
 *  so a stop does not reset the tab; choosing one resets the replay here. */
export function FrameReplay({ state, error, actors, selected, onChoose, live, firstUserMode, firstUserComplete }: {
  state: SyntheticRunnerState | null;
  error: string | null;
  actors: SyntheticRunnerActor[];
  selected: SyntheticRunnerActor | null;
  onChoose: (actorId: string) => void;
  live: boolean;
  firstUserMode: boolean;
  firstUserComplete: boolean;
}) {
  const [framesByActor, setFramesByActor] = useState<Record<string, SyntheticRunnerFrame[]>>({});
  const [frameErrors, setFrameErrors] = useState<Record<string, string>>({});
  const [replayFrame, setReplayFrame] = useState<{ actorId: string; sequence: number } | null>(null);
  const [brokenFrame, setBrokenFrame] = useState<string | null>(null);

  useEffect(() => {
    const actorId = selected?.actorId;
    if (!actorId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (delay = RUNNER_REFRESH_MS) => { if (!cancelled) timer = setTimeout(read, delay); };
    const read = async () => {
      if (cancelled) return;
      if (!pageIsVisible()) { schedule(); return; }
      try {
        const frames = await readSyntheticRunnerFrames(actorId);
        if (!cancelled) {
          setFramesByActor(current => ({ ...current, [actorId]: frames }));
          setFrameErrors(current => { const next = { ...current }; delete next[actorId]; return next; });
        }
      } catch {
        if (!cancelled) setFrameErrors(current => ({ ...current, [actorId]: 'The local frame sequence is offline.' }));
      } finally { schedule(); }
    };
    const onVisibility = () => { if (pageIsVisible()) { if (timer) clearTimeout(timer); schedule(0); } };
    schedule(0);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
    return () => { cancelled = true; if (timer) clearTimeout(timer); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility); };
  }, [selected?.actorId]);

  // Blank by derivation while the runner is stopped: nothing is cleared, so
  // no setState runs outside a handler or a promise callback.
  const frames = live && selected ? framesByActor[selected.actorId] ?? [] : [];
  const replay = live ? replayFrame : null;
  const broken = live ? brokenFrame : null;
  const replayIndex = replay && selected?.actorId === replay.actorId
    ? frames.findIndex(frame => frame.sequence === replay.sequence)
    : -1;
  const isLiveView = replay === null || replayIndex < 0;
  const currentIndex = isLiveView ? 0 : replayIndex;
  const currentFrame = frames[currentIndex] ?? null;
  const currentKey = selected && currentFrame ? `${selected.actorId}:${currentFrame.sequence}` : '';
  const frameOffline = Boolean(selected && frameErrors[selected.actorId]) || broken === currentKey;
  const suppressed = Boolean(currentFrame?.frameSuppressed || (isLiveView && selected?.frameSuppressed));
  const runnerUnavailable = state?.status === 'offline' || state?.status === 'error' || selected?.status === 'offline' || selected?.status === 'error';
  const runnerPaused = !selected || !state?.enabled || state.status === 'paused'
    || state.status === 'starting' || selected.status === 'paused' || selected.status === 'starting';
  const status = error || frameOffline || !state || runnerUnavailable
    ? 'OFFLINE'
    : firstUserComplete
      ? 'JOURNEY COMPLETE'
    : runnerPaused
      ? 'PAUSED'
      : suppressed ? 'FRAME SUPPRESSED' : 'REAL APP SESSION';
  const visibleSession = status === 'REAL APP SESSION' || status === 'JOURNEY COMPLETE';
  const screen = visibleSession ? (currentFrame?.screen || selected?.currentScreen || '') : '';
  const action = visibleSession ? (currentFrame?.action || selected?.action || '') : '';
  const canShowFrame = Boolean(visibleSession && selected && currentFrame && !frameOffline && !suppressed);

  const choose = (actor: SyntheticRunnerActor) => { onChoose(actor.actorId); setReplayFrame(null); setBrokenFrame(null); };
  const previous = () => {
    if (!selected) return;
    const targetIndex = currentIndex + 1;
    if (targetIndex < frames.length) setReplayFrame({ actorId: selected.actorId, sequence: frames[targetIndex].sequence });
  };
  const next = () => {
    if (!selected || isLiveView) return;
    if (currentIndex <= 1) setReplayFrame(null);
    else setReplayFrame({ actorId: selected.actorId, sequence: frames[currentIndex - 1].sequence });
  };

  return <View style={S.card}>
    <View style={styles.panelHeading}><View><Label>ACTUAL LOCAL SESSION</Label><Text style={T.panelTitle}>{selected?.actor ?? 'No local actor running'}</Text></View><View style={[S.chip, styles.pill, visibleSession && S.chipOn]}><Label style={visibleSession ? styles.toneLive : status === 'FRAME SUPPRESSED' ? styles.toneSync : undefined}>{status}</Label></View></View>
    {!!actors.length && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.personaTabs}>{actors.map(actor => { const active = actor.actorId === selected?.actorId; return <Pressable key={actor.actorId} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => choose(actor)} style={[S.button, styles.personaTab, active && S.chipOn]}><Dot state={actor.status === 'live' ? 'online' : 'away'} /><View style={styles.flex}><Text numberOfLines={1} style={T.name}>{actor.actor}</Text><Text numberOfLines={1} style={T.meta}>{state?.enabled && actor.currentScreen ? words(actor.currentScreen) : words(actor.status)}</Text></View></Pressable>; })}</ScrollView>}
    <View style={styles.sessionMetaGrid}><Fact label="CURRENT SCREEN" value={screen ? words(screen) : 'No live session'} /><Fact label="CURRENT ACTION" value={action ? words(action) : 'No live action'} /><Fact label="SESSION" value={selected?.sessionId ? selected.sessionId.slice(-16) : 'Not running'} /><Fact label="LOCAL FRAMES" value={`${selected?.frameCount ?? frames.length}`} /></View>
    <View style={styles.monitorColumns}>
      <View style={[S.panel, styles.column]}><View style={styles.panelHeading}><View><Label>{isLiveView ? 'LATEST ACTUAL FRAME' : `ACTUAL FRAME ${currentFrame?.sequence ?? '—'}`}</Label><Text style={T.panelTitle}>{selected?.actor ?? 'No local actor running'}</Text></View><Text style={T.meta}>{currentFrame ? clock(currentFrame.capturedAtMs) : status}</Text></View>
        <View style={styles.frameViewport}>{canShowFrame && currentFrame && selected ? <ActualRunnerFrameImage key={currentKey} actor={selected.actor} actorId={selected.actorId} frame={currentFrame} frameKey={currentKey} onUnavailable={setBrokenFrame} /> : <View style={styles.framePlaceholder}><Text style={[T.panelTitle, styles.center]}>{status}</Text><Text style={[T.body, styles.placeholderCopy]}>{error || (frameOffline ? 'The local frame endpoint is unavailable.' : suppressed ? 'This protected step intentionally does not expose a frame.' : !selected ? 'The runner is off. No app session has started.' : 'Waiting for the first actual local frame.')}</Text></View>}</View>
      </View>
      <View style={[S.panel, styles.column]}><View style={styles.panelHeading}><View><Label>LOCAL FRAME REPLAY</Label><Text style={T.panelTitle}>{frames.length ? `${frames.length} actual frames` : 'No frame sequence'}</Text></View><Text style={T.meta}>{selected?.sessionId ? selected.sessionId.slice(-12) : 'runner off'}</Text></View><View style={styles.replayControls}><ReplayButton label="LIVE" active={isLiveView} onPress={() => setReplayFrame(null)} disabled={!frames.length} /><ReplayButton label="PREV" onPress={previous} disabled={frames.length < 2 || currentIndex >= frames.length - 1} /><ReplayButton label="NEXT" onPress={next} disabled={!frames.length || isLiveView} /></View><View>{!frames.length ? <Text style={T.body}>No frame recording is available. Nothing is inferred from legacy simulation events.</Text> : frames.slice(0, firstUserMode ? 14 : 8).map(frame => { const active = currentFrame?.sequence === frame.sequence; return <Pressable key={frame.sequence} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => { if (selected) setReplayFrame({ actorId: selected.actorId, sequence: frame.sequence }); }} style={[S.row, active && S.open]}><Text style={T.meta}>{clock(frame.capturedAtMs)}</Text><View style={styles.flex}><Text style={T.name}>{frame.frameSuppressed ? 'Frame Suppressed' : (frame.action ? words(frame.action) : 'Actual Frame')}</Text><Text style={T.meta}>{frame.screen ? words(frame.screen) : 'Unknown screen'} · sequence {frame.sequence}</Text></View><Label style={styles.frameType}>{frame.frameSuppressed ? 'PROTECTED' : 'LOCAL JPEG'}</Label></Pressable>; })}</View></View>
    </View>
  </View>;
}

export function cohortModeLabel(mode: SyntheticCohortMode) { return mode === 'five-actor-live' ? 'FIVE-ACTOR LIVE USE · REAL POSTS' : 'FIVE-ACTOR READ-ONLY MODE'; }

export const ACTIVITY_REPORT_LABEL: Record<SyntheticActivity['reported'], string> = { cloud: 'CLOUD EVENT', local: 'LOCAL FRAME', production: 'REAL DATA' };

/** The activity list is the runner's own vocabulary: nothing here is inferred from a screenshot. */
export function ActivityCatalogue({ mode, activities, live }: { mode: SyntheticCohortMode; activities: SyntheticActivity[]; live: boolean }) {
  return <View style={styles.activityPanel}>
    <View style={styles.panelHeading}><View><Label>{live ? 'WHAT THE SYNTHETIC USERS ARE DOING' : 'WHAT THE SYNTHETIC USERS WILL DO'}</Label><Text style={T.panelTitle}>{mode === 'five-actor-live' ? 'Live use — browse, post, view, like' : 'Read-only — browse only'}</Text></View><Text style={T.meta}>{activities.length} activities · {live ? 'reported by the runner now' : 'planned for this mode'}</Text></View>
    {/* The `REAL DATA` chip takes the open tint: real is the number, so a step that touches production stands out. */}
    <View>{activities.map((activity, index) => <View key={activity.id} style={S.row}><Text style={[T.cell, styles.activityIndex]}>{String(index + 1).padStart(2, '0')}</Text><View style={styles.flex}><Text style={T.name}>{activity.label}</Text><Text style={T.meta}>{activity.detail}</Text></View><View style={[S.chip, styles.activityChip, activity.reported === 'production' && S.chipOn]}><Label>{ACTIVITY_REPORT_LABEL[activity.reported]}</Label></View></View>)}</View>
    {mode === 'five-actor-live' && <Text style={T.meta}>Each actor posts from its own managed city — three from Toronto, one from London, one from New York. Views and likes from other accounts grow a post by about a kilometre each, so their posts reach your Map, then your Feed, only when their radius actually intercepts you — the same rule real testers get.</Text>}
  </View>;
}

/** Only accounts the local runner has actually signed in appear here; identity comes from the pinned beta cohort, never from a guess. */
export function SignedInRoster({ actors, cohortMode, runnerOffline, runError }: { actors: SyntheticRunnerActor[]; cohortMode: SyntheticCohortMode | null; runnerOffline: boolean; runError: string }) {
  const signedIn = cohortMode ? signedInActors(actors) : [];
  const posting = signedIn.reduce((total, actor) => total + actor.postsPublished, 0);
  const failed = cohortMode || runError ? actors.filter(actor => actor.lastError) : [];
  return <View style={S.card}>
    <View style={styles.panelHeading}><View><Label>SIGNED-IN SYNTHETIC USERS</Label><Text style={T.panelTitle}>{signedIn.length ? `${signedIn.length} of 5 accounts active` : runnerOffline ? 'Runner offline' : 'No account is signed in'}</Text></View><Text style={T.meta}>{signedIn.length ? `${posting} post${posting === 1 ? '' : 's'} published this run` : cohortMode ? 'signing in…' : 'runner off'}</Text></View>
    {!!runError && <Text style={[T.meta, styles.toneWarn]}>LAST RUN STOPPED · {runError}</Text>}
    {!signedIn.length ? <Text style={T.body}>{runnerOffline ? 'The local session runner is offline, so no synthetic account can be signed in.' : cohortMode ? 'Browser contexts are opening. Each account appears here the moment its sign-in completes.' : 'Turn the runner on to sign the five beta accounts in. They use isolated browser sessions on this machine only.'}</Text>
      : signedIn.map(actor => <View key={actor.actorId} style={S.row}><Dot state={actor.status === 'live' ? 'online' : 'away'} /><View style={styles.flex}><Text style={T.name}>{actor.handle || actor.actor} <Text style={T.meta}>{actor.persona}{actor.place ? ` · ${actor.place}` : ''}</Text></Text><Text style={T.meta}>{actor.email || actor.uid || actor.actorId} · session …{actor.sessionId.slice(-10)} · signed in {clock(actor.signedInAtMs)}</Text><Text style={T.meta}>{actor.currentScreen ? words(actor.currentScreen) : 'Starting'}{actor.action ? ` · ${words(actor.action)}` : ''}</Text></View><View style={styles.rosterStats}><Text style={T.cell}>{actor.postsPublished} POST{actor.postsPublished === 1 ? '' : 'S'}</Text><Text style={[T.meta, styles.right]}>{actor.lastPostId ? `last …${actor.lastPostId.slice(-8)} ${ago(actor.lastPostAtMs)}` : 'none yet'}</Text><Text style={[T.meta, styles.right]}>{actor.viewsGiven} views · {actor.likesGiven} likes · {actor.dmsSent} DM{actor.dmsSent === 1 ? '' : 's'}</Text></View></View>)}
    {!!failed.length && <View style={styles.rosterFailures}>{failed.map(actor => <Text key={actor.actorId} style={[T.meta, styles.toneWarn]}>{actor.handle || actor.actorId} · {actor.email} · {actor.lastError}</Text>)}</View>}
  </View>;
}

export function ReplayButton({ label, active = false, disabled = false, onPress }: { label: string; active?: boolean; disabled?: boolean; onPress: () => void }) { return <Pressable accessibilityRole="button" accessibilityState={{ selected: active, disabled }} disabled={disabled} onPress={onPress} style={[S.button, styles.replayButton, active && S.chipOn, disabled && S.disabled]}><Label style={active && styles.buttonLabelOn}>{label}</Label></Pressable>; }
/** One cloud-manifest account (the old PersonaCard, page:413): the mark and
 *  avatar tile letters, the label, persona · place, the state, and the
 *  enrolment line keyed on `active` — nothing the card printed is dropped. */
export function AccountRow({ profile }: { profile: BetaRunnerActor }) {
  const personaKey = Object.keys(PERSONA_MARKS).find(key => profile.persona.toLowerCase().includes(key));
  const mark = personaKey ? PERSONA_MARKS[personaKey] : '●';
  return <View style={S.row}>
    <View style={styles.personaAvatar}><Text style={styles.personaMark}>{mark}</Text><Label style={styles.personaTile}>{profile.avatarTile.toUpperCase()}</Label></View>
    <View style={styles.flex}><Text style={T.name}>{profile.label}</Text><Text style={T.meta}>{profile.persona} · {profile.place}</Text><Text style={T.meta}>{profile.active ? `Allowlisted for generation ${profile.generation}.` : 'Not allowlisted. This persona cannot create a session.'}</Text></View>
    <Label style={profile.state === 'live' ? styles.toneLive : styles.toneOff}>{profile.state.replace(/-/g, ' ').toUpperCase()}</Label>
  </View>;
}

const styles = StyleSheet.create({
  body: { gap: 12 },
  flex: { flex: 1, gap: 2 },
  right: { textAlign: 'right' },
  center: { textAlign: 'center' },
  toneLive: { color: C.pop },
  toneOff: { color: C.ink4 },
  toneWarn: { color: C.boost },
  toneSync: { color: C.sync },
  buttonLabelOn: { color: C.ink },
  // A column, sized for the longest tile word (`SPORTS`) at 10 px: the mark
  // above the avatar tile letters, nothing overlapping. Simulation fill: the
  // five accounts are the simulation.
  personaAvatar: { width: 60, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.simFill, borderWidth: 1, borderColor: C.sim },
  personaMark: { fontSize: 18, lineHeight: 22 },
  personaTile: { color: C.ink, lineHeight: 12 },
  pill: { minWidth: 140, alignItems: 'center' },
  journey: { flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, paddingVertical: 12 },
  runButton: { minWidth: 190 },
  runnerControl: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  personaTabs: { gap: 8, paddingRight: 4 },
  personaTab: { width: 190, minHeight: 58, flexDirection: 'row', gap: 9, paddingHorizontal: 11 },
  sessionMetaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  monitorColumns: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'stretch' },
  column: { flexGrow: 1, flexShrink: 1, flexBasis: 380, minWidth: 0, gap: 12 },
  panelHeading: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start', justifyContent: 'space-between' },
  // 300 wide (was 420): the 9:16 placeholder is 533 px tall instead of 747.
  // The phone's screen is the page black behind a hairline frame — the one
  // surface here that is not glass, because a frame is a picture of a phone.
  frameViewport: { width: '100%', maxWidth: 300, aspectRatio: 9 / 16, alignSelf: 'center', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: C.hairline, backgroundColor: C.ground },
  actualFrame: { width: '100%', height: '100%', backgroundColor: C.ground },
  frameLoading: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: C.ground },
  framePlaceholder: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24, backgroundColor: C.ground },
  placeholderCopy: { maxWidth: 280, textAlign: 'center' },
  replayControls: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  replayButton: { minWidth: 70 },
  frameType: { maxWidth: 88, textAlign: 'right' },
  analyticsPanel: { gap: 14 },
  analyticsSummary: { flexDirection: 'row', flexWrap: 'wrap', gap: 22 },
  analyticsColumns: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  analyticsGroup: { flexGrow: 1, flexShrink: 1, flexBasis: 300, minWidth: 0, gap: 8 },
  analyticsRow: { gap: 4 },
  analyticsLabelRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  analyticsTrack: { height: 7, overflow: 'hidden', borderRadius: 6, backgroundColor: C.ghost },
  analyticsFill: { height: '100%', borderRadius: 6, backgroundColor: C.simFill },
  modePicker: { flexDirection: 'row', gap: 6 },
  activityPanel: { gap: 12 },
  activityIndex: { width: 22, color: C.ink4 },
  activityChip: { minWidth: 76, alignItems: 'center', paddingVertical: 4 },
  rosterStats: { alignItems: 'flex-end', gap: 2, maxWidth: 170 },
  rosterFailures: { gap: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.hairlineSoft },
});
