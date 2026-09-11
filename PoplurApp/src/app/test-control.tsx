import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  readOwnerDashboard,
  subscribeOwnerDashboard,
  type BetaDashboard,
  type BetaMapCell,
  type BetaRunnerActor,
  type BetaRunnerAnalytics,
  type RealtimeFeedPost,
  type RealtimePublicPost,
} from '@/services/testControl';
import { readPostHistory, type BetaTesterPost, type BetaTesterRow, type PostHistory } from '@/services/testControl';
import {
  readSyntheticRunnerFrames,
  readSyntheticRunnerFrameImage,
  readSyntheticRunnerState,
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
import BetaDotWorld from '@/components/BetaDotWorld';
import RadiusLab from '@/components/radius-lab';
import { betaMapPoint } from '@/components/betaMapProjection';

const REFRESH_MS = 15_000;
const RUNNER_REFRESH_MS = 2_500;
const EMPTY_PUBLIC_POSTS: RealtimePublicPost[] = [];
const EMPTY_FEED_POSTS: RealtimeFeedPost[] = [];
const EMPTY_MAP_CELLS: BetaMapCell[] = [];
const PERSONA_MARKS: Record<string, string> = { food: '🍜', sports: '⚽', music: '🎧', performance: '💻', tech: '💻', news: '📰' };
const ago = (time: number) => !time ? '—' : Date.now() - time < 12_000 ? 'NOW' : Date.now() - time < 3_600_000 ? `${Math.round((Date.now() - time) / 60_000)}m ago` : `${Math.round((Date.now() - time) / 3_600_000)}h ago`;
const clock = (time: number) => time ? new Date(time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—';
const words = (value: string) => value.replace(/[-_]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
const duration = (milliseconds: number) => {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  return hours ? `${hours}h ${minutes}m` : minutes ? `${minutes}m ${remainder}s` : `${remainder}s`;
};

function WorldMap({ cells, realtimeState }: { cells: BetaMapCell[]; realtimeState: 'connecting' | 'live' | 'offline' }) {
  const positionedCells = cells.slice(0, 12).map(cell => ({ cell, point: betaMapPoint(cell.place) })).filter((item): item is { cell: BetaMapCell; point: readonly [number, number] } => item.point !== null);
  return <View style={styles.map} accessibilityLabel="Coarse closed-beta activity map">
    <View style={styles.mapGrid} />
    <View style={styles.mapHeading}><Text style={styles.kicker}>COARSE ACTIVITY MAP</Text><Text style={styles.mapTitle}>Where the beta is moving</Text><Text style={styles.mapRule}>City and regional buckets only — never coordinates.</Text></View>
    <View style={styles.mapViewport}><BetaDotWorld cells={cells} />
      {positionedCells.map(({ cell, point }) => { const [x, y] = point; const left = x * 100; const top = y * 100; const size = Math.min(33, 10 + cell.events * 3); const syntheticOnly = (cell.realEvents ?? 0) === 0 && (cell.syntheticEvents ?? 0) > 0; return <View key={cell.place} style={[styles.mapPoint, { left: `${left}%`, top: `${top}%` } as never]}><View style={[styles.pulse, syntheticOnly && styles.pulseSim, { width: size + 12, height: size + 12, borderRadius: size }]} /><View style={[styles.dot, syntheticOnly && styles.dotSim, { width: size, height: size, borderRadius: size }]} /><View style={styles.dotCopy}><Text style={styles.dotPlace}>{cell.place}</Text><Text style={styles.dotMeta}>{cell.realEvents ?? 0} beta · {cell.syntheticEvents ?? 0} sim · {Math.round(cell.peakRadiusKm)} km peak</Text></View></View>; })}
      {!cells.length && <View style={styles.mapEmpty}><Text style={styles.mapEmptyTitle}>NO PUBLIC POSTS ON THE MAP</Text><Text style={[styles.copy, styles.mapEmptyCopy]}>Published posts with an approximate public area will appear here the instant Firestore reports them.</Text></View>}
    </View>
    <View style={styles.mapFoot}><View style={[styles.liveDot, realtimeState === 'live' ? styles.statusLive : styles.statusAway]} /><Text style={styles.mapFootText}>FIRESTORE REALTIME · {realtimeState.toUpperCase()}</Text></View>
  </View>;
}

function AnalyticsBars({ title, counts }: { title: string; counts: Record<string, number> }) {
  const entries = Object.entries(counts).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, 8);
  const maximum = Math.max(1, ...entries.map(([, count]) => count));
  return <View style={styles.analyticsGroup}><Text style={styles.analyticsTitle}>{title}</Text>{!entries.length ? <Text style={styles.analyticsEmpty}>Waiting for recorded synthetic events.</Text> : entries.map(([label, count]) => <View key={label} style={styles.analyticsRow}><View style={styles.analyticsLabelRow}><Text style={styles.analyticsLabel}>{words(label)}</Text><Text style={styles.analyticsValue}>{count}</Text></View><View style={styles.analyticsTrack}><View style={[styles.analyticsFill, { width: `${Math.max(5, (count / maximum) * 100)}%` } as never]} /></View></View>)}</View>;
}

function SessionAnalytics({ analytics }: { analytics: BetaRunnerAnalytics }) {
  return <View style={styles.analyticsPanel}>
    <View style={styles.analyticsSummary}><View><Text style={styles.analyticsNumber}>{analytics.eventCount}</Text><Text style={styles.analyticsCaption}>RECORDED EVENTS</Text></View><View><Text style={styles.analyticsNumber}>{analytics.sessionCount}</Text><Text style={styles.analyticsCaption}>SESSIONS</Text></View><View><Text style={styles.analyticsNumber}>{duration(analytics.averageDwellMs)}</Text><Text style={styles.analyticsCaption}>AVG DWELL</Text></View></View>
    <View style={styles.analyticsColumns}><AnalyticsBars title="Screens" counts={analytics.screenCounts} /><AnalyticsBars title="Actions" counts={analytics.actionCounts} /></View>
    <Text style={styles.analyticsWindow}>{analytics.windowStartMs && analytics.windowEndMs ? `${clock(analytics.windowStartMs)} – ${clock(analytics.windowEndMs)} runtime window` : 'Analytics will fill as synthetic journeys are recorded.'}</Text>
  </View>;
}

function SurfaceSyncBoard({
  posts,
  feedPosts,
  rows,
  publicState,
  privateState,
}: {
  posts: RealtimePublicPost[];
  feedPosts: RealtimeFeedPost[];
  rows: BetaDashboard['rows'];
  publicState: 'connecting' | 'live' | 'offline';
  privateState: 'connecting' | 'live' | 'offline';
}) {
  const channels = new Set(feedPosts.map(post => post.channelId));
  const activeScreens = new Set(rows.filter(row => row.state === 'active').map(row => row.screen));
  const surfaces = [
    { name: 'MAP', state: publicState, detail: `${posts.length} Firestore posts · add/change/delete` },
    { name: 'FEED', state: publicState, detail: `${feedPosts.length} posts across ${channels.size} live channels` },
    { name: 'PROFILE', state: privateState, detail: 'Owner account posts only · never globally projected' },
    { name: 'PHONE + HOUSE', state: publicState, detail: 'Realtime radius discovery · coordinates remain in app' },
    { name: 'NOTIFICATIONS', state: privateState, detail: 'Account listener · private notification content excluded' },
    { name: 'DM + CALLS', state: privateState, detail: 'Realtime app state only · private content excluded' },
    { name: 'EVERY SCREEN', state: privateState, detail: `${activeScreens.size} opted-in routes active now · route name only` },
  ];
  return <View style={styles.surfaceBoard}>
    <Text style={styles.kicker}>APP ↔ FIREBASE ↔ CONTROL ROOM</Text>
    <Text style={styles.cardTitle}>Realtime surface matrix</Text>
    <Text style={styles.copy}>Map receives canonical public posts globally; Feed applies each post’s earned radius before showing it. Profile remains strictly account-owned, while notifications, DMs and calls retain their account-scoped listeners. Consenting test devices publish only their current route. Messages, media, coordinates, keystrokes, camera and microphone data never enter this desk.</Text>
    <View style={styles.surfaceGrid}>{surfaces.map(surface => <View key={surface.name} style={styles.surfaceCard}><View style={styles.row}><Text style={styles.surfaceName}>{surface.name}</Text><Text style={[styles.surfaceState, surface.state === 'live' ? styles.simLive : styles.simPaused]}>{surface.state.toUpperCase()}</Text></View><Text style={styles.surfaceDetail}>{surface.detail}</Text></View>)}</View>
  </View>;
}

const pageIsVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';

function ActualRunnerFrameImage({ actorId, frame, frameKey, actor, onUnavailable }: { actorId: string; frame: SyntheticRunnerFrame; frameKey: string; actor: string; onUnavailable: (key: string) => void }) {
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
  if (!objectUrl) return <View style={styles.frameLoading}><ActivityIndicator color="#ff4aa3" /><Text style={styles.frameLoadingText}>Loading actual local frame…</Text></View>;
  return <Image accessibilityLabel={`Actual local Poplur frame for ${actor} on ${frame.screen || 'unknown screen'}`} resizeMode="contain" source={{ uri: objectUrl }} style={styles.actualFrame} />;
}

function ActualSessionMonitor({ dashboard }: { dashboard: BetaDashboard | null }) {
  const [runnerState, setRunnerState] = useState<SyntheticRunnerState | null>(null);
  const [runnerError, setRunnerError] = useState<string | null>(null);
  const [chosenActorId, setChosenActorId] = useState<string | null>(null);
  const [framesByActor, setFramesByActor] = useState<Record<string, SyntheticRunnerFrame[]>>({});
  const [frameErrors, setFrameErrors] = useState<Record<string, string>>({});
  const [replayFrame, setReplayFrame] = useState<{ actorId: string; sequence: number } | null>(null);
  const [brokenFrame, setBrokenFrame] = useState<string | null>(null);
  const [commandBusy, setCommandBusy] = useState(false);
  const [modeChoice, setModeChoice] = useState<SyntheticCohortMode>('five-actor-readonly');
  const activeCohortMode: SyntheticCohortMode | null = runnerState?.enabled && isCohortMode(runnerState.mode) ? runnerState.mode : null;
  useEffect(() => { if (activeCohortMode) setModeChoice(activeCohortMode); }, [activeCohortMode]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (delay = RUNNER_REFRESH_MS) => { if (!cancelled) timer = setTimeout(read, delay); };
    const read = async () => {
      if (cancelled) return;
      if (!pageIsVisible()) { schedule(); return; }
      try {
        const next = await readSyntheticRunnerState();
        if (!cancelled) {
          setRunnerState(next);
          setRunnerError(null);
          if (!next.enabled && next.mode !== 'first-user-v1' && next.mode !== 'first-user-shared-v1') {
            setFramesByActor({});
            setReplayFrame(null);
            setBrokenFrame(null);
          }
        }
      } catch {
        if (!cancelled) { setRunnerState(null); setRunnerError('The local session runner is offline.'); }
      } finally { schedule(); }
    };
    const onVisibility = () => { if (pageIsVisible()) { if (timer) clearTimeout(timer); schedule(0); } };
    schedule(0);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
    return () => { cancelled = true; if (timer) clearTimeout(timer); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility); };
  }, []);

  const actors = runnerState?.actors ?? [];
  const selected = actors.find(actor => actor.actorId === chosenActorId) ?? actors[0] ?? null;

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

  const frames = selected ? framesByActor[selected.actorId] ?? [] : [];
  const isolatedFirstUserMode = runnerState?.mode === 'first-user-v1';
  const sharedFirstUserMode = runnerState?.mode === 'first-user-shared-v1';
  const firstUserMode = isolatedFirstUserMode || sharedFirstUserMode;
  const firstUserActive = firstUserMode
    && (runnerState?.status === 'starting' || runnerState?.status === 'live');
  const firstUserComplete = firstUserMode && runnerState?.completed === true;
  const replayIndex = replayFrame && selected?.actorId === replayFrame.actorId
    ? frames.findIndex(frame => frame.sequence === replayFrame.sequence)
    : -1;
  const isLiveView = replayFrame === null || replayIndex < 0;
  const currentIndex = isLiveView ? 0 : replayIndex;
  const currentFrame = frames[currentIndex] ?? null;
  const currentKey = selected && currentFrame ? `${selected.actorId}:${currentFrame.sequence}` : '';
  const frameOffline = Boolean(selected && frameErrors[selected.actorId]) || brokenFrame === currentKey;
  const suppressed = Boolean(currentFrame?.frameSuppressed || (isLiveView && selected?.frameSuppressed));
  const runnerUnavailable = runnerState?.status === 'offline' || runnerState?.status === 'error' || selected?.status === 'offline' || selected?.status === 'error';
  const runnerPaused = !selected || !runnerState?.enabled || runnerState.status === 'paused'
    || runnerState.status === 'starting' || selected.status === 'paused' || selected.status === 'starting';
  const status = runnerError || frameOffline || !runnerState || runnerUnavailable
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

  const choose = (actor: SyntheticRunnerActor) => { setChosenActorId(actor.actorId); setReplayFrame(null); setBrokenFrame(null); };
  const toggleRunner = async (enabled: boolean) => {
    if (commandBusy) return;
    setCommandBusy(true);
    try {
      const next = await setSyntheticRunnerEnabled(enabled, modeChoice);
      setRunnerState(next);
      setRunnerError(null);
      if (!next.enabled && next.mode !== 'first-user-v1' && next.mode !== 'first-user-shared-v1') {
        setFramesByActor({});
        setReplayFrame(null);
        setBrokenFrame(null);
      }
    } catch {
      setRunnerError('The local runner could not change state safely.');
    } finally {
      setCommandBusy(false);
    }
  };
  const startFirstUser = async () => {
    if (commandBusy || !runnerState || runnerState.enabled || firstUserActive) return;
    setCommandBusy(true);
    try {
      const next = await runFirstUserOnboarding();
      setRunnerState(next);
      setRunnerError(next.error || null);
    } catch {
      setRunnerError('The emulator-only first-user journey could not start safely.');
    } finally {
      setCommandBusy(false);
    }
  };
  const startSharedFirstUser = async () => {
    if (commandBusy || !runnerState || runnerState.enabled || firstUserActive) return;
    setCommandBusy(true);
    try {
      const next = await runSharedFirstUserOnboarding();
      setRunnerState(next);
      setRunnerError(next.error || null);
    } catch {
      setRunnerError('The shared-backend tester journey could not start safely.');
    } finally {
      setCommandBusy(false);
    }
  };
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

  return <View style={styles.monitorCard}>
    <View style={styles.monitorHeading}><View style={styles.flex}><Text style={styles.kicker}>LOCAL SYNTHETIC RUNNER</Text><Text style={styles.monitorTitle}>Live AI Session Monitor</Text><Text style={styles.copy}>Watch actual Poplur tester sessions and replay only the real frames held by this local runner.</Text></View><View style={[styles.monitorStatus, visibleSession ? styles.monitorLive : status === 'FRAME SUPPRESSED' ? styles.monitorReplay : styles.monitorPaused]}><Text style={styles.monitorStatusText}>{status}</Text></View></View>
    <View style={styles.privacyStrip}><Text style={styles.privacyTitle}>ACTUAL SYNTHETIC POPLUR SESSIONS · FRAMES STAY LOCAL</Text><Text style={styles.privacyCopy}>These are actual local app frames, never a reconstruction. Human account access and private capture are blocked; both first-user modes use a fixed synthetic profile image and browser fake camera. The shared tester’s account and post are real production data, while every recorded frame remains on this machine.</Text></View>
    <View style={styles.firstUserCard}>
      <View style={styles.flex}><Text style={styles.firstUserKicker}>EMULATOR-ONLY · ONE SHOT</Text><Text style={styles.firstUserTitle}>Watch Poplur’s first user</Text><Text style={styles.firstUserCopy}>Creates one new synthetic account through the visible signup UI, adds its profile photo, posts through Camera and Composer, then verifies the same post on Map and Profile. The one-shot runner is quarantined from production Firebase.</Text>{isolatedFirstUserMode && <Text style={styles.firstUserIdentity}>{runnerState?.identity?.email || 'Generating first-user identity…'}</Text>}{isolatedFirstUserMode && !!runnerState?.error && <Text style={styles.firstUserError}>{runnerState.error}</Text>}</View>
      <Pressable accessibilityRole="button" accessibilityLabel="Run the emulator-only first user journey once" disabled={commandBusy || !runnerState || runnerState.enabled || firstUserActive} onPress={() => { void startFirstUser(); }} style={[styles.firstUserButton, (commandBusy || !runnerState || runnerState.enabled || firstUserActive) && styles.replayButtonDisabled]}><Text style={styles.firstUserButtonText}>{isolatedFirstUserMode && firstUserComplete ? 'COMPLETE' : isolatedFirstUserMode ? 'RUN RECORDED' : commandBusy ? 'RUNNING…' : 'RUN ISOLATED ONCE'}</Text></Pressable>
    </View>
    <View style={[styles.firstUserCard, styles.sharedFirstUserCard]}>
      <View style={styles.flex}><Text style={styles.sharedFirstUserKicker}>SHARED POPLUR BACKEND · ONE SHOT</Text><Text style={styles.firstUserTitle}>Watch a separate real tester</Text><Text style={styles.sharedFirstUserCopy}>Creates one new tester account and one public post through the visible app. Both remain live on Poplur. The post appears on Map and, only when its normal radius qualifies, in Feed. It is never injected into or checked against your personal Profile. This test does not validate username-login reservation.</Text>{sharedFirstUserMode && <Text style={styles.firstUserIdentity}>{runnerState?.identity?.email || 'Generating shared tester identity…'}</Text>}{sharedFirstUserMode && runnerState?.result && <Text style={styles.sharedFirstUserResult}>MAP {runnerState.result.mapVerified ? 'VERIFIED' : 'PENDING'} · FEED {runnerState.result.feedEligible ? runnerState.result.feedVerified ? 'VERIFIED' : 'PENDING' : 'NOT RADIUS-ELIGIBLE'} · PROFILE NOT CHECKED</Text>}{sharedFirstUserMode && !!runnerState?.error && <Text style={styles.firstUserError}>{runnerState.error}</Text>}</View>
      <Pressable accessibilityRole="button" accessibilityLabel="Create one production tester account and public post" disabled={commandBusy || !runnerState || runnerState.enabled || firstUserActive} onPress={() => { void startSharedFirstUser(); }} style={[styles.firstUserButton, styles.sharedFirstUserButton, (commandBusy || !runnerState || runnerState.enabled || firstUserActive) && styles.replayButtonDisabled]}><Text style={styles.firstUserButtonText}>{sharedFirstUserMode && firstUserComplete ? 'COMPLETE' : sharedFirstUserMode ? 'RUN RECORDED' : commandBusy ? 'RUNNING…' : 'RUN SHARED TESTER ONCE'}</Text></Pressable>
    </View>
    <View style={styles.runnerControl}><View style={styles.flex}><Text style={styles.runnerControlLabel}>{cohortModeLabel(activeCohortMode ?? modeChoice)}</Text><Text style={styles.runnerControlTitle}>{firstUserActive ? 'Unavailable while first-user journey runs' : commandBusy ? 'Changing runner state safely…' : runnerState?.enabled ? (activeCohortMode === 'five-actor-live' ? 'Runner is on · the five users are using the app' : 'Runner is on') : 'Runner is off'}</Text><Text style={styles.runnerControlCopy}>{runnerState?.enabled ? (activeCohortMode === 'five-actor-live' ? 'Live use: the five beta accounts are signed in to the real app, posting and liking. Turn this off before app maintenance; stopping clears every local frame.' : 'Turn this off before app maintenance. Stopping clears every local frame.') : modeChoice === 'five-actor-live' ? 'Live use signs the five beta accounts in to the real app shell, publishes real posts tagged synthetic, and views and likes other testers’ posts so radius grows toward you.' : firstUserMode ? 'Starting the original five-person cohort will replace the recorded first-user replay.' : 'The original five-person cohort is unchanged and cannot overlap the first-user journey.'}</Text></View><View style={styles.modePicker}>{(['five-actor-readonly', 'five-actor-live'] as SyntheticCohortMode[]).map(mode => { const active = (activeCohortMode ?? modeChoice) === mode; return <Pressable key={mode} accessibilityRole="button" accessibilityState={{ selected: active, disabled: Boolean(activeCohortMode) || commandBusy }} disabled={Boolean(activeCohortMode) || commandBusy} onPress={() => setModeChoice(mode)} style={[styles.modeButton, active && (mode === 'five-actor-live' ? styles.modeButtonLive : styles.modeButtonActive)]}><Text style={[styles.modeButtonText, active && styles.modeButtonTextActive]}>{mode === 'five-actor-live' ? 'LIVE USE · POSTS' : 'READ-ONLY'}</Text></Pressable>; })}</View><Switch accessibilityLabel="Start or stop the isolated synthetic runner" disabled={commandBusy || !runnerState || firstUserActive} onValueChange={enabled => { void toggleRunner(enabled); }} thumbColor="#fff" trackColor={{ false: '#5c5260', true: '#e42254' }} value={!firstUserMode && runnerState?.enabled === true} /></View>
    <ActivityCatalogue mode={activeCohortMode ?? modeChoice} activities={activeCohortMode && runnerState?.activities.length ? runnerState.activities : SYNTHETIC_ACTIVITY_FALLBACK[activeCohortMode ?? modeChoice]} live={Boolean(activeCohortMode)} />
    <SignedInRoster actors={actors} cohortMode={activeCohortMode} runnerOffline={Boolean(runnerError) || !runnerState} runError={runnerState && isCohortMode(runnerState.mode) ? runnerState.error : ''} />
    {!!actors.length && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.personaTabs}>{actors.map(actor => { const active = actor.actorId === selected?.actorId; return <Pressable key={actor.actorId} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => choose(actor)} style={[styles.personaTab, active && styles.personaTabActive]}><View style={[styles.personaTabDot, actor.status === 'live' ? styles.statusLive : styles.statusAway]} /><View style={styles.flex}><Text numberOfLines={1} style={[styles.personaTabName, active && styles.personaTabNameActive]}>{actor.actor}</Text><Text numberOfLines={1} style={styles.personaTabMeta}>{runnerState?.enabled && actor.currentScreen ? words(actor.currentScreen) : words(actor.status)}</Text></View></Pressable>; })}</ScrollView>}
    <View style={styles.sessionMetaGrid}><SessionFact label="CURRENT SCREEN" value={screen ? words(screen) : 'No live session'} /><SessionFact label="CURRENT ACTION" value={action ? words(action) : 'No live action'} /><SessionFact label="SESSION" value={selected?.sessionId ? selected.sessionId.slice(-16) : 'Not running'} /><SessionFact label="LOCAL FRAMES" value={`${selected?.frameCount ?? frames.length}`} /></View>
    <View style={styles.monitorColumns}>
      <View style={styles.framePanel}><View style={styles.panelHeading}><View><Text style={styles.panelKicker}>{isLiveView ? 'LATEST ACTUAL FRAME' : `ACTUAL FRAME ${currentFrame?.sequence ?? '—'}`}</Text><Text style={styles.panelTitle}>{selected?.actor ?? 'No local actor running'}</Text></View><Text style={styles.panelPlace}>{currentFrame ? clock(currentFrame.capturedAtMs) : status}</Text></View>
        <View style={styles.frameViewport}>{canShowFrame && currentFrame && selected ? <ActualRunnerFrameImage key={currentKey} actor={selected.actor} actorId={selected.actorId} frame={currentFrame} frameKey={currentKey} onUnavailable={setBrokenFrame} /> : <View style={styles.framePlaceholder}><Text style={styles.framePlaceholderTitle}>{status}</Text><Text style={styles.framePlaceholderCopy}>{runnerError || (frameOffline ? 'The local frame endpoint is unavailable.' : suppressed ? 'This protected step intentionally does not expose a frame.' : !selected ? 'The runner is off. No app session has started.' : 'Waiting for the first actual local frame.')}</Text></View>}</View>
      </View>
      <View style={styles.replayPanel}><View style={styles.panelHeading}><View><Text style={styles.panelKicker}>LOCAL FRAME REPLAY</Text><Text style={styles.panelTitle}>{frames.length ? `${frames.length} actual frames` : 'No frame sequence'}</Text></View><Text style={styles.panelPlace}>{selected?.sessionId ? selected.sessionId.slice(-12) : 'runner off'}</Text></View><View style={styles.replayControls}><ReplayButton label="LIVE" active={isLiveView} onPress={() => setReplayFrame(null)} disabled={!frames.length} /><ReplayButton label="PREV" onPress={previous} disabled={frames.length < 2 || currentIndex >= frames.length - 1} /><ReplayButton label="NEXT" onPress={next} disabled={!frames.length || isLiveView} /></View><View style={styles.eventList}>{!frames.length ? <Text style={styles.analyticsEmpty}>No frame recording is available. Nothing is inferred from legacy simulation events.</Text> : frames.slice(0, firstUserMode ? 14 : 8).map(frame => { const active = currentFrame?.sequence === frame.sequence; return <Pressable key={frame.sequence} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => { if (selected) setReplayFrame({ actorId: selected.actorId, sequence: frame.sequence }); }} style={[styles.eventRow, active && styles.eventRowActive]}><Text style={styles.eventTime}>{clock(frame.capturedAtMs)}</Text><View style={styles.flex}><Text style={styles.eventAction}>{frame.frameSuppressed ? 'Frame Suppressed' : (frame.action ? words(frame.action) : 'Actual Frame')}</Text><Text style={styles.eventMeta}>{frame.screen ? words(frame.screen) : 'Unknown screen'} · sequence {frame.sequence}</Text></View><Text style={styles.eventType}>{frame.frameSuppressed ? 'PROTECTED' : 'LOCAL JPEG'}</Text></Pressable>; })}</View></View>
    </View>
    {!firstUserMode && dashboard && <SessionAnalytics analytics={dashboard.runnerAnalytics} />}
  </View>;
}

function cohortModeLabel(mode: SyntheticCohortMode) { return mode === 'five-actor-live' ? 'FIVE-ACTOR LIVE USE · REAL POSTS' : 'FIVE-ACTOR READ-ONLY MODE'; }

const ACTIVITY_REPORT_LABEL: Record<SyntheticActivity['reported'], string> = { cloud: 'CLOUD EVENT', local: 'LOCAL FRAME', production: 'REAL DATA' };

/** The activity list is the runner's own vocabulary: nothing here is inferred from a screenshot. */
function ActivityCatalogue({ mode, activities, live }: { mode: SyntheticCohortMode; activities: SyntheticActivity[]; live: boolean }) {
  return <View style={styles.activityPanel}>
    <View style={styles.panelHeading}><View><Text style={styles.panelKicker}>{live ? 'WHAT THE SYNTHETIC USERS ARE DOING' : 'WHAT THE SYNTHETIC USERS WILL DO'}</Text><Text style={styles.panelTitle}>{mode === 'five-actor-live' ? 'Live use — browse, post, view, like' : 'Read-only — browse only'}</Text></View><Text style={styles.panelPlace}>{activities.length} activities · {live ? 'reported by the runner now' : 'planned for this mode'}</Text></View>
    <View style={styles.activityList}>{activities.map((activity, index) => <View key={activity.id} style={styles.activityRow}><Text style={styles.activityIndex}>{String(index + 1).padStart(2, '0')}</Text><View style={styles.flex}><Text style={styles.activityLabel}>{activity.label}</Text><Text style={styles.activityDetail}>{activity.detail}</Text></View><View style={[styles.activityChip, activity.reported === 'production' ? styles.activityChipProduction : activity.reported === 'local' ? styles.activityChipLocal : styles.activityChipCloud]}><Text style={styles.activityChipText}>{ACTIVITY_REPORT_LABEL[activity.reported]}</Text></View></View>)}</View>
    {mode === 'five-actor-live' && <Text style={styles.activityFoot}>Each actor posts from its own managed city — three from Toronto, one from London, one from New York. Views and likes from other accounts grow a post by about a kilometre each, so their posts reach your Map, then your Feed, only when their radius actually intercepts you — the same rule real testers get.</Text>}
  </View>;
}

/** Only accounts the local runner has actually signed in appear here; identity comes from the pinned beta cohort, never from a guess. */
function SignedInRoster({ actors, cohortMode, runnerOffline, runError }: { actors: SyntheticRunnerActor[]; cohortMode: SyntheticCohortMode | null; runnerOffline: boolean; runError: string }) {
  const signedIn = cohortMode ? actors.filter(actor => Boolean(actor.sessionId) && (actor.status === 'live' || actor.status === 'starting')) : [];
  const posting = signedIn.reduce((total, actor) => total + actor.postsPublished, 0);
  const failed = cohortMode || runError ? actors.filter(actor => actor.lastError) : [];
  return <View style={styles.rosterPanel}>
    <View style={styles.panelHeading}><View><Text style={styles.panelKicker}>SIGNED-IN SYNTHETIC USERS</Text><Text style={styles.panelTitle}>{signedIn.length ? `${signedIn.length} of 5 accounts active` : runnerOffline ? 'Runner offline' : 'No account is signed in'}</Text></View><Text style={styles.panelPlace}>{signedIn.length ? `${posting} post${posting === 1 ? '' : 's'} published this run` : cohortMode ? 'signing in…' : 'runner off'}</Text></View>
    {!!runError && <Text style={styles.rosterError}>LAST RUN STOPPED · {runError}</Text>}
    {!signedIn.length ? <Text style={styles.analyticsEmpty}>{runnerOffline ? 'The local session runner is offline, so no synthetic account can be signed in.' : cohortMode ? 'Browser contexts are opening. Each account appears here the moment its sign-in completes.' : 'Turn the runner on to sign the five beta accounts in. They use isolated browser sessions on this machine only.'}</Text>
      : signedIn.map(actor => <View key={actor.actorId} style={styles.rosterRow}><View style={[styles.statusDot, actor.status === 'live' ? styles.statusLive : styles.statusAway]} /><View style={styles.flex}><Text style={styles.rosterName}>{actor.handle || actor.actor} <Text style={styles.rosterPersona}>{actor.persona}{actor.place ? ` · ${actor.place}` : ''}</Text></Text><Text style={styles.rosterMeta}>{actor.email || actor.uid || actor.actorId} · session …{actor.sessionId.slice(-10)} · signed in {clock(actor.signedInAtMs)}</Text><Text style={styles.rosterMeta}>{actor.currentScreen ? words(actor.currentScreen) : 'Starting'}{actor.action ? ` · ${words(actor.action)}` : ''}</Text></View><View style={styles.rosterStats}><Text style={styles.rosterStat}>{actor.postsPublished} POST{actor.postsPublished === 1 ? '' : 'S'}</Text><Text style={styles.rosterStatMeta}>{actor.lastPostId ? `last …${actor.lastPostId.slice(-8)} ${ago(actor.lastPostAtMs)}` : 'none yet'}</Text><Text style={styles.rosterStatMeta}>{actor.viewsGiven} views · {actor.likesGiven} likes · {actor.dmsSent} DM{actor.dmsSent === 1 ? '' : 's'}</Text></View></View>)}
    {!!failed.length && <View style={styles.rosterFailures}>{failed.map(actor => <Text key={actor.actorId} style={styles.rosterError}>{actor.handle || actor.actorId} · {actor.email} · {actor.lastError}</Text>)}</View>}
  </View>;
}

function SessionFact({ label, value }: { label: string; value: string }) { return <View style={styles.sessionFact}><Text style={styles.sessionFactLabel}>{label}</Text><Text numberOfLines={2} style={styles.sessionFactValue}>{value}</Text></View>; }
function ReplayButton({ label, active = false, disabled = false, onPress }: { label: string; active?: boolean; disabled?: boolean; onPress: () => void }) { return <Pressable accessibilityRole="button" accessibilityState={{ selected: active, disabled }} disabled={disabled} onPress={onPress} style={[styles.replayButton, active && styles.replayButtonActive, disabled && styles.replayButtonDisabled]}><Text style={[styles.replayButtonText, active && styles.replayButtonTextActive]}>{label}</Text></Pressable>; }

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
  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}><ScrollView contentContainerStyle={styles.page}>
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
      <Section title="Every tester, live" kicker="TESTER TABLE">{!dashboard.testers.length ? <Empty text="No accounts yet." /> : <TesterTable rows={dashboard.testers} expandedUid={expandedTester} onToggle={uid => setExpandedTester(current => current === uid ? null : uid)} openPostId={openPostId} onOpenPost={openPost} />}{!!openPostId && <PostDrilldown postId={openPostId} history={postHistory} state={postHistoryState} />}</Section>
      <Section title="Who is testing right now" kicker="TESTER ACTIVITY">{!dashboard.rows.length ? <Empty text="No opted-in tester activity yet." /> : dashboard.rows.map(row => <View key={row.id} style={styles.listRow}><View style={[styles.statusDot, row.state === 'active' ? styles.statusLive : styles.statusAway]} /><View style={styles.flex}><Text style={styles.name}>{row.label}</Text><Text style={styles.meta}>{row.screen.replace(/-/g, ' ')} · {row.platform} · v{row.appVersion}</Text></View><Text style={styles.when}>{row.state === 'active' ? 'LIVE' : ago(row.lastActivityAtMs)}</Text></View>)}</Section>
      <Section title="Findings, wins and improvements" kicker="WHAT TESTERS ARE SAYING">{!dashboard.feedback.length ? <Empty text="Voluntary tester reports will land here." /> : dashboard.feedback.map(report => <View key={report.id} style={styles.report}><View style={styles.row}><Text style={styles.name}>{report.label}</Text><Text style={styles.when}>{ago(report.createdAtMs)}</Text></View>{!!report.finding && <Text style={styles.reportText}><Text style={styles.reportLabel}>FOUND </Text>{report.finding}</Text>}{!!report.liked && <Text style={styles.reportText}><Text style={styles.reportLabel}>LIKED </Text>{report.liked}</Text>}{!!report.improve && <Text style={styles.reportText}><Text style={styles.reportLabel}>IMPROVE </Text>{report.improve}</Text>}</View>)}</Section>
    </>}{!!notice && <Text style={styles.notice}>{notice}</Text>}
  </ScrollView></SafeAreaView>;
}
function Metric({ label, value, suffix, note }: { label: string; value: string; suffix?: string; note: string }) { return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}{suffix && <Text style={styles.metricSuffix}> {suffix}</Text>}</Text><Text style={styles.metricNote}>{note}</Text></View>; }
function PersonaCard({ profile }: { profile: BetaRunnerActor }) { const personaKey = Object.keys(PERSONA_MARKS).find(key => profile.persona.toLowerCase().includes(key)); const mark = personaKey ? PERSONA_MARKS[personaKey] : '●'; return <View style={styles.personaCard}><View style={styles.personaTop}><View style={styles.personaAvatar}><Text style={styles.personaMark}>{mark}</Text><Text style={styles.personaTile}>{profile.avatarTile.toUpperCase()}</Text></View><View style={styles.flex}><Text style={styles.personaFlag}>ISOLATED RUNNER ACTOR</Text><Text style={styles.name}>{profile.label}</Text><Text style={styles.meta}>{profile.persona} · {profile.place}</Text></View><Text style={[styles.personaStatus, profile.state === 'live' ? styles.simLive : styles.simPaused]}>{profile.state.replace(/-/g, ' ').toUpperCase()}</Text></View><Text style={styles.observationLabel}>RUNNER ENROLMENT</Text><Text style={styles.reportText}>{profile.active ? `Allowlisted for generation ${profile.generation}.` : 'Not allowlisted. This persona cannot create a session.'}</Text></View>; }
const km = (meters: number) => meters >= 100_000 ? `${Math.round(meters / 1000)} km` : meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
const stamp = (ms: number) => !ms ? '—' : new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const PRESENCE_LABEL: Record<BetaTesterRow['presence'], string> = { online: 'ONLINE', away: 'AWAY', unknown: 'NO SIGNAL' };
const CAUSE_COLOR: Record<string, string> = { create: '#8ec5ff', engagement: '#5af0a4', decay: '#ff8a6b', boost: '#ffd166', synthetic: '#c8a2ff', lab: '#c8a2ff', backfill: '#806476' };

function TesterTable({ rows, expandedUid, onToggle, openPostId, onOpenPost }: { rows: BetaTesterRow[]; expandedUid: string | null; onToggle: (uid: string) => void; openPostId: string | null; onOpenPost: (postId: string) => void }) {
  const online = rows.filter(row => row.presence === 'online').length;
  return <View>
    <Text style={styles.tableSummary}>{online} online · {rows.length} signed up · {rows.reduce((sum, row) => sum + row.postCount, 0)} posts</Text>
    <View style={[styles.tableRow, styles.tableHead]}><Text style={[styles.th, styles.colName]}>TESTER</Text><Text style={[styles.th, styles.colStatus]}>STATUS</Text><Text style={[styles.th, styles.colWhen]}>SIGNED UP</Text><Text style={[styles.th, styles.colNum]}>POSTS</Text><Text style={[styles.th, styles.colWhen]}>LAST POST</Text></View>
    {rows.map(row => {
      const expanded = expandedUid === row.uid;
      return <View key={row.uid}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => onToggle(row.uid)} style={[styles.tableRow, expanded && styles.tableRowOpen]}>
          <View style={styles.colName}><Text style={styles.name} numberOfLines={1}>{row.label}</Text><Text style={styles.meta} numberOfLines={1}>{row.username ? `@${row.username}` : row.uid.slice(0, 8)}{row.accountType !== 'user' ? ` · ${row.accountType}` : ''}{row.platform ? ` · ${row.platform}` : ''}</Text></View>
          <View style={[styles.colStatus, styles.row]}><View style={[styles.statusDot, row.presence === 'online' ? styles.statusLive : row.presence === 'away' ? styles.statusAway : styles.statusNone]} /><Text style={styles.cell}>{row.presence === 'online' ? (row.screen ? row.screen.replace(/-/g, ' ') : 'LIVE') : row.presence === 'away' ? ago(row.lastActivityAtMs) : PRESENCE_LABEL.unknown}</Text></View>
          <Text style={[styles.cell, styles.colWhen]}>{stamp(row.signedUpAtMs)}</Text>
          <Text style={[styles.cell, styles.colNum]}>{row.postCount}</Text>
          <Text style={[styles.cell, styles.colWhen]}>{row.lastPostedAtMs ? ago(row.lastPostedAtMs) : '—'}</Text>
        </Pressable>
        {expanded && (!row.posts.length
          ? <Text style={[styles.copy, styles.postList]}>No posts yet.</Text>
          : <View style={styles.postList}>{row.posts.map(post => <PostRow key={post.id} post={post} open={openPostId === post.id} onPress={() => onOpenPost(post.id)} />)}</View>)}
      </View>;
    })}
  </View>;
}

function PostRow({ post, open, onPress }: { post: BetaTesterPost; open: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: open }} onPress={onPress} style={[styles.postRow, open && styles.postRowOpen]}>
    <Text style={styles.postKind}>{post.mediaType === 'video' ? 'VIDEO' : post.mediaCount > 1 ? `CAROUSEL ×${post.mediaCount}` : 'PHOTO'}</Text>
    <View style={styles.flex}><Text style={styles.cell} numberOfLines={1}>{post.caption || post.id}</Text><Text style={styles.meta}>{stamp(post.createdAtMs)}{post.channelId ? ` · ${post.channelId}` : ''}{post.coarse ? ` · ${post.coarse.latitude.toFixed(3)}, ${post.coarse.longitude.toFixed(3)}` : ''}</Text></View>
    <Text style={styles.postRadius}>{km(post.radiusMeters)}</Text>
  </Pressable>;
}

/** Radius over time, drawn with plain views: no chart dependency in this app. */
function RadiusBars({ history }: { history: PostHistory['history'] }) {
  const peak = Math.max(1, ...history.map(entry => entry.radiusMeters));
  return <View style={styles.bars}>{history.map(entry => <View key={entry.id} style={styles.barCol}><View style={[styles.bar, { height: Math.max(3, Math.round((entry.radiusMeters / peak) * 72)), backgroundColor: CAUSE_COLOR[entry.cause] ?? '#806476' }]} /></View>)}</View>;
}

function PostDrilldown({ postId, history, state }: { postId: string; history: PostHistory | null; state: 'idle' | 'loading' | 'error' }) {
  if (state === 'loading' || (!history && state === 'idle')) return <View style={styles.drill}><ActivityIndicator color="#5af0a4" /><Text style={styles.copy}>Loading the radius ledger for {postId}…</Text></View>;
  if (state === 'error' || !history) return <View style={styles.drill}><Text style={styles.copy}>That post's ledger could not be read.</Text></View>;
  const first = history.history[0];
  const last = history.history[history.history.length - 1];
  const peak = history.history.reduce((best, entry) => entry.radiusMeters > best.radiusMeters ? entry : best, first ?? { radiusMeters: 0, atMs: 0 });
  const where = history.exact ?? history.coarse;
  return <View style={styles.drill}>
    <Text style={styles.drillTitle}>{history.caption || history.postId}</Text>
    <Text style={styles.meta}>Posted {stamp(history.createdAtMs)}{history.channelId ? ` · ${history.channelId}` : ''} · {history.mediaType === 'video' ? 'video' : history.mediaCount > 1 ? `carousel ×${history.mediaCount}` : 'photo'}</Text>
    <Text style={styles.meta}>{where ? `${history.exact ? 'Dropped at' : 'Near'} ${where.latitude.toFixed(5)}, ${where.longitude.toFixed(5)}` : 'Location hidden'}{history.locationVisibility ? ` · ${history.locationVisibility}` : ''}</Text>
    <View style={styles.drillFacts}>
      <SessionFact label="STARTED" value={first ? km(first.radiusMeters) : km(history.seedRadiusMeters)} />
      <SessionFact label="NOW" value={km(history.radiusMeters)} />
      <SessionFact label="PEAK" value={peak.radiusMeters ? `${km(peak.radiusMeters)} · ${ago(peak.atMs)}` : '—'} />
      <SessionFact label="GROWTH" value={first && last ? `${last.radiusMeters >= first.radiusMeters ? '+' : '−'}${km(Math.abs(last.radiusMeters - first.radiusMeters))}` : '—'} />
    </View>
    {!history.history.length ? <Text style={styles.copy}>No radius changes recorded yet — the ledger starts with the post's first engagement.</Text> : <>
      <RadiusBars history={history.history} />
      {history.history.slice().reverse().map(entry => <View key={entry.id} style={styles.ledgerRow}>
        <View style={[styles.causeChip, { backgroundColor: CAUSE_COLOR[entry.cause] ?? '#806476' }]} />
        <Text style={[styles.cell, styles.ledgerCause]}>{entry.cause}{entry.kind ? ` · ${entry.kind}` : ''}</Text>
        <Text style={[styles.cell, styles.ledgerWhen]}>{stamp(entry.atMs)}</Text>
        <Text style={[styles.cell, styles.ledgerRadius]}>{km(entry.radiusMeters)}</Text>
        <Text style={[styles.delta, entry.delta > 0 ? styles.deltaUp : entry.delta < 0 ? styles.deltaDown : styles.deltaFlat]}>{entry.delta > 0 ? '▲' : entry.delta < 0 ? '▼' : '·'} {km(Math.abs(entry.delta))}</Text>
      </View>)}
    </>}
  </View>;
}

function Section({ title, kicker, children }: { title: string; kicker: string; children: React.ReactNode }) { return <View style={[styles.card, { flexGrow: 0, flexBasis: 'auto' }]}><Text style={styles.kicker}>{kicker}</Text><Text style={styles.cardTitle}>{title}</Text>{children}</View>; }
function Empty({ text }: { text: string }) { return <Text style={styles.copy}>{text}</Text>; }

const styles = StyleSheet.create<Record<string, any>>({
  tableSummary: { color: '#f4d7e6', fontSize: 13, fontWeight: '700', marginBottom: 8 },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#57203d' },
  tableHead: { borderTopWidth: 0, paddingVertical: 4 },
  tableRowOpen: { backgroundColor: 'rgba(90, 240, 164, 0.06)' },
  th: { color: '#b98aa6', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  cell: { color: '#f4d7e6', fontSize: 12 },
  colName: { flex: 2.2, minWidth: 0 },
  colStatus: { flex: 1.4, minWidth: 0, gap: 6 },
  colWhen: { flex: 1.2, minWidth: 0 },
  colNum: { flex: 0.6, textAlign: 'right' },
  statusNone: { backgroundColor: '#3d2130', borderWidth: 1, borderColor: '#806476' },
  postList: { paddingLeft: 12, paddingBottom: 6 },
  postRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#3d2130' },
  postRowOpen: { backgroundColor: 'rgba(142, 197, 255, 0.08)' },
  postKind: { color: '#b98aa6', fontSize: 10, fontWeight: '800', letterSpacing: 1, width: 92 },
  postRadius: { color: '#5af0a4', fontSize: 12, fontWeight: '700' },
  drill: { marginTop: 10, padding: 12, borderRadius: 12, backgroundColor: '#2a1120', gap: 6 },
  drillTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  drillFacts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginVertical: 6 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 76, marginVertical: 6 },
  barCol: { flex: 1, minWidth: 3, maxWidth: 14, justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 2 },
  ledgerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, borderTopWidth: 1, borderTopColor: '#3d2130' },
  causeChip: { width: 8, height: 8, borderRadius: 4 },
  ledgerCause: { flex: 1.6 },
  ledgerWhen: { flex: 1.4 },
  ledgerRadius: { flex: 1, textAlign: 'right' },
  delta: { flex: 1, textAlign: 'right', fontSize: 12, fontWeight: '800' },
  deltaUp: { color: '#5af0a4' },
  deltaDown: { color: '#ff8a6b' },
  deltaFlat: { color: '#806476' },
  safe: { flex: 1, backgroundColor: '#12020c' }, page: { flexGrow: 1, width: '100%', maxWidth: 1120, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 48, gap: 16, backgroundImage: 'radial-gradient(circle at 50% 0%, #501032 0%, #18030f 38%, #080409 76%)' }, broadcast: { minHeight: 42, marginHorizontal: -20, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f20b69', borderBottomWidth: 3, borderBottomColor: '#8d0642' }, broadcastLeft: { flexDirection: 'row', gap: 8, alignItems: 'center' }, liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' }, liveText: { color: '#fff', fontWeight: '900', fontSize: 11, letterSpacing: 1.2 }, broadcastRight: { color: '#ffe1ef', fontWeight: '800', fontSize: 10, letterSpacing: 1 }, header: { paddingTop: 28, gap: 5 }, brand: { color: '#ff4aa3', fontWeight: '900', fontSize: 13, letterSpacing: 4, textShadowColor: '#ff1680', textShadowRadius: 12 }, title: { color: '#fff7fb', fontSize: 42, fontWeight: '900', letterSpacing: -1.6 }, subtitle: { color: '#e0b8cc', fontSize: 15, lineHeight: 21, maxWidth: 700 }, connecting: { flexDirection: 'row', gap: 12, padding: 18, alignItems: 'center', borderWidth: 1, borderColor: '#78204b', borderRadius: 18, backgroundColor: '#210914' }, headline: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 8 }, kicker: { color: '#ff4aa3', fontSize: 10, fontWeight: '900', letterSpacing: 1.6 }, roomTitle: { color: '#fff7fb', fontSize: 27, fontWeight: '900' }, refresh: { backgroundColor: '#ff2f91', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 2, borderColor: '#ff8ac5' }, refreshText: { color: '#fff', fontWeight: '900', fontSize: 10, letterSpacing: 1 }, stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, metric: { flexGrow: 1, flexBasis: 190, minHeight: 112, padding: 15, justifyContent: 'space-between', borderWidth: 1, borderTopWidth: 3, borderColor: '#6b2548', borderTopColor: '#ff2f91', borderRadius: 18, backgroundColor: 'rgba(39,9,25,.93)', boxShadow: '0 10px 28px rgba(0,0,0,.25)' }, metricLabel: { color: '#d29ab7', fontWeight: '900', fontSize: 10, letterSpacing: 1.1 }, metricValue: { color: '#fff9fc', fontSize: 31, fontWeight: '900' }, metricSuffix: { color: '#edbfd6', fontSize: 14 }, metricNote: { color: '#b7859f', fontSize: 11 }, map: { height: 470, position: 'relative', overflow: 'hidden', padding: 22, borderWidth: 2, borderColor: '#ff4aa3', borderRadius: 28, backgroundColor: '#130711', boxShadow: '0 22px 55px rgba(255,19,126,.18)' }, mapGrid: { ...StyleSheet.absoluteFill, backgroundImage: 'linear-gradient(rgba(255,72,161,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,72,161,.045) 1px, transparent 1px)', backgroundSize: '32px 32px', backgroundColor: '#130711' }, mapViewport: { position: 'absolute', left: '3%', right: '3%', top: 84, bottom: 54 }, mapHeading: { gap: 1, zIndex: 2 }, mapTitle: { color: '#fff7fb', fontSize: 26, fontWeight: '900' }, mapRule: { color: '#d5a7bf', fontSize: 12 }, mapPoint: { position: 'absolute', width: 0, height: 0, alignItems: 'center', justifyContent: 'center', zIndex: 3 }, pulse: { position: 'absolute', backgroundColor: 'rgba(255,39,141,.24)', borderWidth: 2, borderColor: '#fff' }, pulseSim: { backgroundColor: 'rgba(143,88,255,.28)', borderColor: '#c9afff' }, dot: { backgroundColor: '#ff1580', borderWidth: 3, borderColor: '#fff', boxShadow: '0 0 22px #ff1680' }, dotSim: { backgroundColor: '#8d5cff', borderColor: '#f1e9ff', boxShadow: '0 0 22px #8d5cff' }, dotCopy: { position: 'absolute', top: 21, left: 10, width: 160, padding: 9, borderRadius: 10, backgroundColor: 'rgba(31,5,20,.95)', borderWidth: 1, borderColor: '#ff4aa3' }, dotPlace: { color: '#fff', fontSize: 10, fontWeight: '800' }, dotMeta: { color: '#e2b4cb', fontSize: 9 }, mapEmpty: { position: 'absolute', top: '47%', left: '15%', right: '15%', alignItems: 'center', gap: 4, zIndex: 3, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,74,163,.55)', backgroundColor: 'rgba(20,4,14,.88)' }, mapEmptyTitle: { color: '#fff', fontSize: 12, fontWeight: '900', letterSpacing: 1.3, textAlign: 'center', textShadowColor: '#ff1680', textShadowRadius: 8 }, mapEmptyCopy: { textAlign: 'center', fontSize: 11, lineHeight: 16 }, mapFoot: { position: 'absolute', left: 22, bottom: 18, flexDirection: 'row', gap: 7, alignItems: 'center', zIndex: 3 }, mapFootText: { color: '#d4a1bc', fontSize: 9, fontWeight: '900', letterSpacing: 1 }, split: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, card: { flexGrow: 1, flexBasis: 340, gap: 12, padding: 18, borderWidth: 1, borderColor: '#6b2548', borderRadius: 20, backgroundColor: 'rgba(37,8,23,.94)', boxShadow: '0 12px 30px rgba(0,0,0,.24)' }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, cardTitle: { color: '#fff8fc', fontSize: 19, fontWeight: '800' }, copy: { color: '#d5a7bf', fontSize: 13, lineHeight: 19 }, simState: { fontSize: 11, fontWeight: '900', letterSpacing: 1.1 }, simLive: { color: '#6ff5b0' }, simPaused: { color: '#d1a0b9' }, time: { color: '#fff7fb', fontSize: 27, fontWeight: '900' }, listRow: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#57203d' }, flex: { flex: 1, gap: 2 }, badge: { minWidth: 34, paddingVertical: 4, alignItems: 'center', borderRadius: 8 }, betaBadge: { backgroundColor: '#ed176f' }, simBadge: { backgroundColor: '#493547' }, badgeText: { color: '#fff', fontSize: 8, fontWeight: '900' }, name: { color: '#fff8fc', fontSize: 13, fontWeight: '800' }, verb: { color: '#ff6caf', textTransform: 'uppercase', fontSize: 10 }, meta: { color: '#d0a2b9', fontSize: 11 }, when: { color: '#8fddff', fontSize: 10, fontWeight: '900' }, rate: { width: 42, alignItems: 'center', borderLeftWidth: 3, borderLeftColor: '#ff2f91' }, rateValue: { color: '#fff8fc', fontSize: 18, fontWeight: '900' }, rateLabel: { color: '#c890ac', fontSize: 8, fontWeight: '900' }, statusDot: { width: 9, height: 9, borderRadius: 5 }, statusLive: { backgroundColor: '#5af0a4' }, statusAway: { backgroundColor: '#806476' }, report: { gap: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#57203d' }, reportText: { color: '#dec0cf', fontSize: 12, lineHeight: 18 }, reportLabel: { color: '#ff6caf', fontSize: 10, fontWeight: '900', letterSpacing: .8 }, personaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, personaCard: { flexGrow: 1, flexBasis: 290, gap: 7, minWidth: 0, padding: 13, borderRadius: 16, borderWidth: 1, borderColor: '#70304f', backgroundColor: 'rgba(20,5,14,.86)' }, personaTop: { flexDirection: 'row', alignItems: 'center', gap: 10 }, personaAvatar: { width: 54, height: 54, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f22e88', borderWidth: 2, borderColor: '#ff9aca', boxShadow: '0 6px 18px rgba(255,28,132,.28)' }, personaMark: { fontSize: 24 }, personaTile: { position: 'absolute', right: 3, bottom: 2, color: '#fff', fontSize: 7, fontWeight: '900' }, personaFlag: { color: '#ff65ab', fontSize: 8, fontWeight: '900', letterSpacing: 1 }, personaStatus: { alignSelf: 'flex-start', fontSize: 9, fontWeight: '900', letterSpacing: .8 }, observationLabel: { color: '#8fddff', fontSize: 8, fontWeight: '900', letterSpacing: 1, marginTop: 3 },
  monitorCard: { gap: 16, padding: 18, borderWidth: 2, borderColor: '#ff4aa3', borderRadius: 24, backgroundColor: 'rgba(18,4,13,.97)', boxShadow: '0 18px 48px rgba(255,19,126,.18)' },
  monitorHeading: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between' }, monitorTitle: { color: '#fff8fc', fontSize: 25, fontWeight: '900' }, monitorStatus: { minWidth: 140, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', borderRadius: 999, borderWidth: 1 }, monitorLive: { backgroundColor: 'rgba(28,119,79,.35)', borderColor: '#62f1aa' }, monitorReplay: { backgroundColor: 'rgba(39,102,135,.38)', borderColor: '#8fddff' }, monitorPaused: { backgroundColor: 'rgba(99,72,91,.38)', borderColor: '#aa8097' }, monitorStatusText: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 1, textAlign: 'center' },
  privacyStrip: { gap: 3, padding: 12, borderRadius: 13, borderLeftWidth: 4, borderLeftColor: '#8fddff', backgroundColor: 'rgba(40,20,54,.75)' }, privacyTitle: { color: '#b9ecff', fontSize: 10, fontWeight: '900', letterSpacing: 1 }, privacyCopy: { color: '#d9bdd0', fontSize: 11, lineHeight: 16 },
  firstUserCard: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: 16, borderRadius: 17, borderWidth: 2, borderColor: '#66e6bd', backgroundColor: 'rgba(7,42,39,.9)', boxShadow: '0 12px 32px rgba(58,239,188,.12)' }, firstUserKicker: { color: '#79f6cf', fontSize: 8, fontWeight: '900', letterSpacing: 1.2 }, firstUserTitle: { color: '#fff', fontSize: 18, fontWeight: '900' }, firstUserCopy: { maxWidth: 700, color: '#bde4d8', fontSize: 11, lineHeight: 17 }, firstUserIdentity: { color: '#93e6ff', fontSize: 10, fontWeight: '800' }, firstUserError: { color: '#ff9ebf', fontSize: 10, fontWeight: '800' }, firstUserButton: { minWidth: 190, alignItems: 'center', paddingHorizontal: 18, paddingVertical: 13, borderRadius: 13, borderWidth: 2, borderColor: '#d9fff3', backgroundColor: '#17a97e' }, firstUserButtonText: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  sharedFirstUserCard: { borderColor: '#ff82be', backgroundColor: 'rgba(57,8,38,.93)', boxShadow: '0 12px 32px rgba(255,65,151,.14)' }, sharedFirstUserKicker: { color: '#ff8fc7', fontSize: 8, fontWeight: '900', letterSpacing: 1.2 }, sharedFirstUserCopy: { maxWidth: 700, color: '#ecc3d7', fontSize: 11, lineHeight: 17 }, sharedFirstUserResult: { color: '#8fddff', fontSize: 9, fontWeight: '900', letterSpacing: .6 }, sharedFirstUserButton: { borderColor: '#ffd2e8', backgroundColor: '#df247e' },
  runnerControl: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: 13, borderRadius: 14, borderWidth: 1, borderColor: '#783050', backgroundColor: '#260b1a' }, runnerControlLabel: { color: '#ff65ab', fontSize: 8, fontWeight: '900', letterSpacing: 1 }, runnerControlTitle: { color: '#fff', fontSize: 14, fontWeight: '900' }, runnerControlCopy: { color: '#c493ac', fontSize: 10, lineHeight: 15 },
  personaTabs: { gap: 8, paddingRight: 4 }, personaTab: { width: 190, minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 14, borderWidth: 1, borderColor: '#5f2846', backgroundColor: '#210914' }, personaTabActive: { borderColor: '#ff72b6', backgroundColor: '#4b1231' }, personaTabDot: { width: 8, height: 8, borderRadius: 4 }, personaTabName: { color: '#cba2b7', fontSize: 12, fontWeight: '800' }, personaTabNameActive: { color: '#fff' }, personaTabMeta: { color: '#a77891', fontSize: 9 },
  sessionMetaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, sessionFact: { flexGrow: 1, flexBasis: 170, minHeight: 70, gap: 5, padding: 11, borderRadius: 13, borderWidth: 1, borderColor: '#612542', backgroundColor: '#1d0814' }, sessionFactLabel: { color: '#bf829f', fontSize: 8, fontWeight: '900', letterSpacing: .9 }, sessionFactValue: { color: '#fff', fontSize: 14, fontWeight: '800' },
  monitorColumns: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'stretch' }, framePanel: { flexGrow: 1, flexShrink: 1, flexBasis: 380, minWidth: 0, gap: 12, padding: 14, borderRadius: 18, backgroundColor: '#210a19', borderWidth: 1, borderColor: '#652944' }, replayPanel: { flexGrow: 1, flexShrink: 1, flexBasis: 380, minWidth: 0, gap: 12, padding: 14, borderRadius: 18, backgroundColor: '#140b15', borderWidth: 1, borderColor: '#4b3148' }, panelHeading: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start', justifyContent: 'space-between' }, panelKicker: { color: '#ff62aa', fontSize: 8, fontWeight: '900', letterSpacing: .9 }, panelTitle: { color: '#fff', fontSize: 16, fontWeight: '900' }, panelPlace: { color: '#94defe', fontSize: 9, fontWeight: '800' },
  frameViewport: { width: '100%', maxWidth: 420, aspectRatio: 9 / 16, alignSelf: 'center', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderRadius: 26, borderWidth: 3, borderColor: '#ef338a', backgroundColor: '#070407', boxShadow: '0 18px 36px rgba(0,0,0,.35)' }, actualFrame: { width: '100%', height: '100%', backgroundColor: '#070407' }, frameLoading: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: '#070407' }, frameLoadingText: { color: '#cfa3ba', fontSize: 10, fontWeight: '800' }, framePlaceholder: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24, backgroundColor: 'radial-gradient(circle at 50% 35%, #46122f 0%, #12070f 64%, #070407 100%)' }, framePlaceholderTitle: { color: '#fff', fontSize: 19, fontWeight: '900', letterSpacing: 1.1, textAlign: 'center' }, framePlaceholderCopy: { maxWidth: 280, color: '#cfa3ba', fontSize: 11, lineHeight: 17, textAlign: 'center' },
  replayControls: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, replayButton: { minWidth: 70, alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 11, borderWidth: 1, borderColor: '#79506c', backgroundColor: '#2a1725' }, replayButtonActive: { borderColor: '#8fddff', backgroundColor: '#174760' }, replayButtonDisabled: { opacity: .38 }, replayButtonText: { color: '#d8b8c8', fontSize: 9, fontWeight: '900', letterSpacing: .8 }, replayButtonTextActive: { color: '#dff7ff' }, eventList: { gap: 6 }, eventRow: { minHeight: 51, flexDirection: 'row', gap: 9, alignItems: 'center', padding: 9, borderRadius: 11, borderWidth: 1, borderColor: '#44263b', backgroundColor: '#1d111b' }, eventRowActive: { borderColor: '#ff65ab', backgroundColor: '#3e142e' }, eventTime: { color: '#8fddff', fontSize: 8, fontWeight: '900' }, eventAction: { color: '#fff', fontSize: 10, fontWeight: '900' }, eventMeta: { color: '#b98ca4', fontSize: 8 }, eventType: { maxWidth: 88, color: '#eab4ce', fontSize: 7, fontWeight: '900', textAlign: 'right' },
  analyticsPanel: { gap: 14, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: '#59364f', backgroundColor: '#100a10' }, analyticsSummary: { flexDirection: 'row', flexWrap: 'wrap', gap: 22 }, analyticsNumber: { color: '#fff', fontSize: 20, fontWeight: '900' }, analyticsCaption: { color: '#b7849e', fontSize: 7, fontWeight: '900', letterSpacing: .8 }, analyticsColumns: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 }, analyticsGroup: { flexGrow: 1, flexShrink: 1, flexBasis: 300, minWidth: 0, gap: 8 }, analyticsTitle: { color: '#ff65ab', fontSize: 11, fontWeight: '900' }, analyticsEmpty: { color: '#9e788d', fontSize: 10, lineHeight: 15 }, analyticsRow: { gap: 4 }, analyticsLabelRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 }, analyticsLabel: { flex: 1, color: '#e7c7d7', fontSize: 9, fontWeight: '800' }, analyticsValue: { color: '#8fddff', fontSize: 9, fontWeight: '900' }, analyticsTrack: { height: 7, overflow: 'hidden', borderRadius: 6, backgroundColor: '#30202b' }, analyticsFill: { height: '100%', borderRadius: 6, backgroundColor: '#f12784' }, analyticsWindow: { color: '#8f7181', fontSize: 8 },
  surfaceBoard: { gap: 12, padding: 18, borderRadius: 22, borderWidth: 2, borderColor: '#8fddff', backgroundColor: 'rgba(8,22,31,.9)', boxShadow: '0 16px 42px rgba(73,193,241,.12)' }, surfaceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, surfaceCard: { flexGrow: 1, flexBasis: 190, minHeight: 84, gap: 8, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#34687d', backgroundColor: 'rgba(8,31,43,.85)' }, surfaceName: { color: '#fff', fontSize: 12, fontWeight: '900', letterSpacing: .9 }, surfaceState: { fontSize: 9, fontWeight: '900', letterSpacing: .8 }, surfaceDetail: { color: '#b7dce9', fontSize: 10, lineHeight: 15 },
  notice: { color: '#ffe8f3', backgroundColor: '#59132f', borderRadius: 12, padding: 12, fontSize: 12 },
  modePicker: { flexDirection: 'row', gap: 6 }, modeButton: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 11, borderWidth: 1, borderColor: '#79506c', backgroundColor: '#2a1725' }, modeButtonActive: { borderColor: '#8fddff', backgroundColor: '#174760' }, modeButtonLive: { borderColor: '#ff8ac5', backgroundColor: '#b0134f' }, modeButtonText: { color: '#d8b8c8', fontSize: 9, fontWeight: '900', letterSpacing: .8 }, modeButtonTextActive: { color: '#fff' },
  activityPanel: { gap: 12, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: '#652944', backgroundColor: '#1b0a16' }, activityList: { gap: 6 }, activityRow: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 9, borderRadius: 11, borderWidth: 1, borderColor: '#44263b', backgroundColor: '#1d111b' }, activityIndex: { width: 22, color: '#8fddff', fontSize: 10, fontWeight: '900' }, activityLabel: { color: '#fff', fontSize: 11, fontWeight: '900' }, activityDetail: { color: '#b98ca4', fontSize: 9, lineHeight: 13 }, activityChip: { minWidth: 76, paddingHorizontal: 7, paddingVertical: 4, alignItems: 'center', borderRadius: 7 }, activityChipCloud: { backgroundColor: '#174760' }, activityChipLocal: { backgroundColor: '#493547' }, activityChipProduction: { backgroundColor: '#b0134f' }, activityChipText: { color: '#fff', fontSize: 7, fontWeight: '900', letterSpacing: .6 }, activityFoot: { color: '#8f7181', fontSize: 9, lineHeight: 14 },
  rosterPanel: { gap: 10, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: '#4b3148', backgroundColor: '#140b15' }, rosterRow: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#3a2334' }, rosterName: { color: '#fff8fc', fontSize: 12, fontWeight: '900' }, rosterPersona: { color: '#d0a2b9', fontSize: 10, fontWeight: '600' }, rosterMeta: { color: '#a77891', fontSize: 9 }, rosterStats: { alignItems: 'flex-end', gap: 2, maxWidth: 170 }, rosterStat: { color: '#8fddff', fontSize: 10, fontWeight: '900' }, rosterStatMeta: { color: '#8f7181', fontSize: 8, textAlign: 'right' }, rosterFailures: { gap: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#3a2334' }, rosterError: { color: '#ff9ebf', fontSize: 9, fontWeight: '800', lineHeight: 13 },
});
