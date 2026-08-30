import { auth } from './firebase';

const ENDPOINT = 'https://us-central1-poplur2025.cloudfunctions.net/testActivityControl';

/** Display convenience only. The server repeats this check before it returns a
 * dashboard, so changing client code cannot grant access. */
export const TEST_CONTROL_ADMIN_UIDS = new Set([
  'LiEG6SNtKEZN6eEGeybf0afZnHm1',
  'eoP2Z0ElxIa0Eua7xpFxNlr6tur1',
]);

export type TestActivityRow = {
  id: string;
  label: string;
  screen: string;
  platform: 'native' | 'browser';
  appVersion: string;
  status: 'foreground' | 'background';
  lastActivityAtMs: number;
  state: 'active' | 'away';
};

export type BetaPostRow = {
  id: string;
  label: string;
  place: string;
  postedAtMs: number;
  updatedAtMs: number;
  initialRadiusKm: number;
  radiusKm: number;
  radiusDeltaKm: number;
  viralScore: number;
  viralPerHour: number;
};

export type BetaMapCell = {
  place: string;
  events: number;
  realEvents?: number;
  syntheticEvents?: number;
  latestAtMs: number;
  peakRadiusKm: number;
  velocity: number;
};

export type BetaSimulationEvent = {
  id: string;
  eventId: string;
  actorId: string;
  actor: string;
  kind: 'posted' | 'like' | 'view' | 'comment' | 'radius-up' | 'radius-down';
  place: string;
  sessionId: string;
  previousScreen: string | null;
  screen: string;
  currentScreen: string;
  action: string;
  eventType: string;
  stepIndex: number;
  journeyLength: number;
  dwellMs: number;
  source: 'synthetic';
  cohortId: string;
  radiusKm: number;
  eventAtMs: number;
};

export type BetaRunnerActor = {
  id: string;
  actorId: string;
  label: string;
  handle: string;
  persona: string;
  place: string;
  avatarTile: string;
  active: boolean;
  state: 'paused' | 'live' | 'ready' | 'not-allowlisted';
  generation: number;
  source: 'synthetic-browser';
  cohortId: 'beta-browser-v1';
};

export type BetaFeedback = {
  id: string;
  label: string;
  finding: string;
  liked: string;
  improve: string;
  createdAtMs: number;
};

export type BetaDashboardCounts = {
  realTesters: number;
  realPosts: number;
  syntheticPersonas: number;
  syntheticEvents: number;
  syntheticRecentEvents: number;
  runnerActiveActors: number;
};

export type BetaRunnerEvent = {
  id: string;
  eventId: string;
  actorId: string;
  actor: string;
  sessionId: string;
  generation: number;
  sequence: number;
  priorScreen: string | null;
  screen: string;
  currentScreen: string;
  action: string;
  eventType: string;
  stepIndex: number;
  journeyLength: number;
  dwellMs: number;
  status: string;
  localFrameSequence: number;
  frameSuppressed: boolean;
  metrics: Record<string, number>;
  reason?: string;
  eventAtMs: number;
  place: string;
  source: 'synthetic-browser';
  cohortId: 'beta-browser-v1';
};

export type BetaRunnerSession = {
  id: string;
  actorId: string;
  actor: string;
  handle: string;
  persona: string;
  place: string;
  status: 'live' | 'paused';
  sessionId: string;
  generation: number;
  sequence: number;
  priorScreen: string | null;
  screen: string;
  currentScreen: string;
  action: string;
  eventType: string;
  stepIndex: number;
  journeyLength: number;
  dwellMs: number;
  startedAtMs: number;
  lastEventAtMs: number;
  eventId: string;
  source: 'synthetic-browser';
  cohortId: 'beta-browser-v1';
};

export type BetaRunnerAnalytics = {
  eventCount: number;
  sessionCount: number;
  averageDwellMs: number;
  screenCounts: Record<string, number>;
  actionCounts: Record<string, number>;
  eventTypeCounts: Record<string, number>;
  windowStartMs: number;
  windowEndMs: number;
};

export type BetaDashboard = {
  generatedAtMs: number;
  rows: TestActivityRow[];
  posts: BetaPostRow[];
  map: BetaMapCell[];
  simulation: BetaSimulationEvent[];
  syntheticProfiles: BetaRunnerActor[];
  runnerEnabled: boolean;
  runnerGeneration: number;
  runnerActors: BetaRunnerActor[];
  runnerEvents: BetaRunnerEvent[];
  runnerSessions: BetaRunnerSession[];
  runnerAnalytics: BetaRunnerAnalytics;
  counts: BetaDashboardCounts;
  feedback: BetaFeedback[];
};

const text = (value: unknown, maximum = 120): string => typeof value === 'string'
  ? value.trim().replace(/\s+/g, ' ').slice(0, maximum)
  : '';

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object'
  ? value as Record<string, unknown>
  : {};

const metric = (value: unknown, maximum = Number.MAX_SAFE_INTEGER): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(maximum, parsed)) : 0;
};

const integer = (value: unknown, maximum = 1_000_000): number => Math.round(metric(value, maximum));

const timeMs = (value: unknown): number => {
  const direct = metric(value);
  if (direct) return direct;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const source = record(value);
  const seconds = metric(source.seconds ?? source._seconds);
  return seconds ? seconds * 1_000 : 0;
};

const countRecord = (value: unknown): Record<string, number> => Object.fromEntries(
  Object.entries(record(value))
    .slice(0, 32)
    .map(([key, count]) => [text(key, 64), integer(count, 1_000_000)] as const)
    .filter(([key, count]) => Boolean(key) && count > 0),
);

const metricRecord = (value: unknown): Record<string, number> => Object.fromEntries(
  Object.entries(record(value))
    .slice(0, 32)
    .map(([key, count]) => [text(key, 64), metric(count, 1_000_000)] as const)
    .filter(([key]) => Boolean(key)),
);

const EVENT_KINDS = new Set<BetaSimulationEvent['kind']>([
  'posted', 'like', 'view', 'comment', 'radius-up', 'radius-down',
]);

const simulationEvent = (value: unknown): BetaSimulationEvent | null => {
  const row = record(value);
  const eventId = text(row.eventId ?? row.id, 160);
  const actorId = text(row.actorId, 80) || `legacy-${eventId.slice(-48)}`;
  const actor = text(row.actor ?? row.label, 80);
  const kindText = text(row.kind, 24) as BetaSimulationEvent['kind'];
  const eventAtMs = timeMs(row.eventAtMs ?? row.eventAt);
  if (!eventId || !actorId || !actor || !eventAtMs) return null;
  const screen = text(row.currentScreen ?? row.screen, 64) || 'home';
  return {
    id: text(row.id, 160) || eventId,
    eventId,
    actorId,
    actor,
    kind: EVENT_KINDS.has(kindText) ? kindText : 'view',
    place: text(row.place, 80) || 'Private beta region',
    sessionId: text(row.sessionId, 120),
    previousScreen: text(row.previousScreen ?? row.priorScreen, 64) || null,
    screen,
    currentScreen: screen,
    action: text(row.action, 80) || 'observing',
    eventType: text(row.eventType, 64) || 'journey-step',
    stepIndex: integer(row.stepIndex, 10_000),
    journeyLength: integer(row.journeyLength, 10_000),
    dwellMs: integer(row.dwellMs, 24 * 60 * 60 * 1_000),
    source: 'synthetic',
    cohortId: text(row.cohortId, 80) || 'legacy-local-demo',
    radiusKm: metric(row.radiusKm, 20_000),
    eventAtMs,
  };
};

const runnerActor = (value: unknown): BetaRunnerActor | null => {
  const row = record(value);
  const actorId = text(row.actorId ?? row.id, 80);
  const label = text(row.label ?? row.actor, 80);
  if (!actorId || !label) return null;
  const stateText = text(row.state, 24);
  return {
    id: text(row.id, 120) || actorId,
    actorId,
    label,
    handle: text(row.handle, 64),
    persona: text(row.persona, 80),
    place: text(row.place, 80) || 'Private beta region',
    avatarTile: text(row.avatarTile, 32),
    active: row.active === true,
    state: stateText === 'live' || stateText === 'ready' || stateText === 'not-allowlisted' ? stateText : 'paused',
    generation: integer(row.generation, 1_000_000_000),
    source: 'synthetic-browser',
    cohortId: 'beta-browser-v1',
  };
};

const runnerEvent = (value: unknown): BetaRunnerEvent | null => {
  const row = record(value);
  const eventId = text(row.eventId ?? row.id, 160);
  const actorId = text(row.actorId, 80);
  const actor = text(row.actor, 80);
  const sessionId = text(row.sessionId, 120);
  const eventAtMs = timeMs(row.eventAtMs);
  if (!eventId || !actorId || !actor || !sessionId || !eventAtMs) return null;
  const screen = text(row.currentScreen ?? row.screen, 64);
  return {
    id: text(row.id, 160) || eventId,
    eventId,
    actorId,
    actor,
    sessionId: text(row.sessionId, 120),
    generation: integer(row.generation, 1_000_000_000),
    sequence: integer(row.sequence, 10_000_000),
    priorScreen: text(row.priorScreen ?? row.previousScreen, 64) || null,
    screen,
    currentScreen: screen,
    action: text(row.action, 80),
    eventType: text(row.eventType, 64),
    stepIndex: integer(row.stepIndex, 10_000),
    journeyLength: integer(row.journeyLength, 10_000),
    dwellMs: integer(row.dwellMs, 24 * 60 * 60 * 1_000),
    status: text(row.status, 32),
    localFrameSequence: integer(row.localFrameSequence, 10_000_000),
    frameSuppressed: row.frameSuppressed === true,
    metrics: metricRecord(row.metrics),
    ...(text(row.reason, 120) ? { reason: text(row.reason, 120) } : {}),
    eventAtMs,
    place: text(row.place, 80) || 'Private beta region',
    source: 'synthetic-browser',
    cohortId: 'beta-browser-v1',
  };
};

const runnerSession = (value: unknown): BetaRunnerSession | null => {
  const row = record(value);
  const actorId = text(row.actorId ?? row.id, 80);
  const actor = text(row.actor, 80);
  const sessionId = text(row.sessionId, 120);
  if (!actorId || !actor || !sessionId) return null;
  const screen = text(row.currentScreen ?? row.screen, 64);
  return {
    id: text(row.id, 120) || actorId,
    actorId,
    actor,
    handle: text(row.handle, 64),
    persona: text(row.persona, 80),
    place: text(row.place, 80) || 'Private beta region',
    status: row.status === 'live' ? 'live' : 'paused',
    sessionId,
    generation: integer(row.generation, 1_000_000_000),
    sequence: integer(row.sequence, 10_000_000),
    priorScreen: text(row.priorScreen ?? row.previousScreen, 64) || null,
    screen,
    currentScreen: screen,
    action: text(row.action, 80),
    eventType: text(row.eventType, 64),
    stepIndex: integer(row.stepIndex, 10_000),
    journeyLength: integer(row.journeyLength, 10_000),
    dwellMs: integer(row.dwellMs, 24 * 60 * 60 * 1_000),
    startedAtMs: timeMs(row.startedAtMs),
    lastEventAtMs: timeMs(row.lastEventAtMs),
    eventId: text(row.eventId, 160),
    source: 'synthetic-browser',
    cohortId: 'beta-browser-v1',
  };
};

const emptyRunnerAnalytics = (): BetaRunnerAnalytics => ({
  eventCount: 0,
  sessionCount: 0,
  averageDwellMs: 0,
  screenCounts: {},
  actionCounts: {},
  eventTypeCounts: {},
  windowStartMs: 0,
  windowEndMs: 0,
});

const runnerAnalytics = (value: unknown): BetaRunnerAnalytics => {
  const row = record(value);
  return {
    eventCount: integer(row.eventCount, 1_000_000),
    sessionCount: integer(row.sessionCount, 100_000),
    averageDwellMs: integer(row.averageDwellMs, 24 * 60 * 60 * 1_000),
    screenCounts: countRecord(row.screenCounts),
    actionCounts: countRecord(row.actionCounts),
    eventTypeCounts: countRecord(row.eventTypeCounts),
    windowStartMs: timeMs(row.windowStartMs),
    windowEndMs: timeMs(row.windowEndMs),
  };
};

const dashboardCounts = (result: Partial<BetaDashboard>): BetaDashboardCounts => ({
  realTesters: Number(result.counts?.realTesters) || 0,
  realPosts: Number(result.counts?.realPosts) || 0,
  syntheticPersonas: Number(result.counts?.syntheticPersonas) || 0,
  syntheticEvents: Number(result.counts?.syntheticEvents) || 0,
  syntheticRecentEvents: Number(result.counts?.syntheticRecentEvents) || 0,
  runnerActiveActors: Number(result.counts?.runnerActiveActors) || 0,
});

const dashboard = (value: unknown): BetaDashboard => {
  const result = record(value) as Partial<BetaDashboard> & Record<string, unknown>;
  const actors = Array.isArray(result.runnerActors)
    ? result.runnerActors.map(runnerActor).filter((item): item is BetaRunnerActor => item !== null).slice(0, 5)
    : Array.isArray(result.syntheticProfiles)
      ? result.syntheticProfiles.map(runnerActor).filter((item): item is BetaRunnerActor => item !== null).slice(0, 5)
      : [];
  return {
    generatedAtMs: timeMs(result.generatedAtMs) || Date.now(),
    rows: Array.isArray(result.rows) ? result.rows : [],
    posts: Array.isArray(result.posts) ? result.posts : [],
    map: Array.isArray(result.map) ? result.map : [],
    simulation: Array.isArray(result.simulation)
      ? result.simulation.map(simulationEvent).filter((event): event is BetaSimulationEvent => event !== null)
      : [],
    syntheticProfiles: actors,
    runnerEnabled: result.runnerEnabled === true,
    runnerGeneration: integer(result.runnerGeneration, 1_000_000_000),
    runnerActors: actors,
    runnerEvents: Array.isArray(result.runnerEvents)
      ? result.runnerEvents.map(runnerEvent).filter((event): event is BetaRunnerEvent => event !== null).slice(0, 80)
      : [],
    runnerSessions: Array.isArray(result.runnerSessions)
      ? result.runnerSessions.map(runnerSession).filter((session): session is BetaRunnerSession => session !== null).slice(0, 5)
      : [],
    runnerAnalytics: result.runnerAnalytics ? runnerAnalytics(result.runnerAnalytics) : emptyRunnerAnalytics(),
    counts: dashboardCounts(result),
    feedback: Array.isArray(result.feedback) ? result.feedback : [],
  };
};

type CallableBody<T> = { result?: T; error?: { message?: string } };
const OWNER_PROXY = 'http://127.0.0.1:8096/api/control';

async function call<T>(data: Record<string, unknown>): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to use Test Control Center.');
  const token = await user.getIdToken();
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ data }),
  });
  const body = await response.json().catch(() => ({})) as CallableBody<T>;
  if (!response.ok || body.error) throw new Error(body.error?.message || 'Test Control Center is unavailable.');
  if (!body.result) throw new Error('Test Control Center returned no result.');
  return body.result;
}

/** The local-only owner proxy holds the credential outside the browser bundle. */
async function ownerCall<T>(data: Record<string, unknown>): Promise<T> {
  const response = await fetch(OWNER_PROXY, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data }),
  });
  const body = await response.json().catch(() => ({})) as CallableBody<T>;
  if (!response.ok || body.error || !body.result) {
    throw new Error(body.error?.message || 'The local beta desk connection is unavailable.');
  }
  return body.result;
}

export async function readActivityConsent(): Promise<boolean> {
  const result = await call<{ enabled?: boolean }>({ action: 'getConsent' });
  return result.enabled === true;
}

export async function writeActivityConsent(enabled: boolean): Promise<boolean> {
  const result = await call<{ enabled?: boolean }>({ action: 'setConsent', enabled });
  return result.enabled === true;
}

export async function readActivityDashboard(): Promise<BetaDashboard> {
  return dashboard(await call<unknown>({ action: 'dashboard' }));
}

export async function readOwnerDashboard(): Promise<BetaDashboard> {
  return dashboard(await ownerCall<unknown>({ action: 'dashboard' }));
}

export async function submitBetaFeedback(input: { finding: string; liked: string; improve: string }): Promise<void> {
  await call<{ accepted?: boolean }>({ action: 'feedback', ...input });
}
