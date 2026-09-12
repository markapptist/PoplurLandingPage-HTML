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

/** Only these coarse/statistical fields may cross the loopback desk stream. */
export type RealtimePublicPost = BetaPostRow & {
  source: 'firestore';
  synthetic: boolean;
  channelId: string;
  mediaType: 'photo' | 'video' | 'unknown';
};

export type RealtimeFeedPost = {
  id: string;
  label: string;
  channelId: string;
  mediaType: 'photo' | 'video' | 'unknown';
  postedAtMs: number;
  updatedAtMs: number;
  synthetic: boolean;
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

export type BetaTesterPost = {
  id: string;
  createdAtMs: number;
  radiusMeters: number;
  mediaType: 'photo' | 'video';
  mediaCount: number;
  caption: string;
  channelId: string;
  coarse: { latitude: number; longitude: number } | null;
};

export type BetaTesterRow = {
  uid: string;
  label: string;
  username: string;
  accountType: string;
  signedUpAtMs: number;
  lastSignInAtMs: number;
  presence: 'online' | 'away' | 'unknown';
  presenceSource: 'lease' | 'heartbeat' | 'none';
  lastActivityAtMs: number;
  screen: string;
  platform: string;
  postCount: number;
  lastPostedAtMs: number;
  posts: BetaTesterPost[];
  synthetic: boolean;
};

export type BetaDailyCount = {
  day: string;
  signups: number;
  syntheticSignups: number;
  posts: number;
  syntheticPosts: number;
};

export type BetaDailySeries = {
  timeZone: string;
  days: BetaDailyCount[];
  postsComplete: boolean;
};

export type PostHistoryEntry = {
  id: string;
  atMs: number;
  cause: string;
  kind: string | null;
  radiusMeters: number;
  organicRadiusMeters: number;
  seedRadiusMeters: number;
  delta: number;
  writer: string;
};

export type PostHistory = {
  postId: string;
  ownerId: string;
  createdAtMs: number;
  caption: string;
  channelId: string;
  mediaType: 'photo' | 'video';
  mediaCount: number;
  radiusMeters: number;
  seedRadiusMeters: number;
  organicRadiusMeters: number;
  locationVisibility: string;
  coarse: { latitude: number; longitude: number } | null;
  exact: { latitude: number; longitude: number } | null;
  history: PostHistoryEntry[];
};

/** Confidence gate on a REAL figure: the page renders the number only when
 *  `sufficient` and never divides — every ratio arrives as numerator and
 *  denominator (spec §1.3, §4.4). */
export type BetaAlgorithmGate = { n: number; minN: number; sufficient: boolean; basis: string };

export type BetaAlgorithmActorGain = {
  view: number;
  like: number;
  comment: number;
  dislike: number;
  total: number;
  n: number;
  firstViews: number;
  repeatViews: number;
  repeatMeters: number;
  clamped: number;
  resync: number;
};

export type BetaAlgorithmNetBucket = {
  posts: number;
  netPositive: number;
  postDays: number;
  gainRealMeters: number;
  lossRealShareMeters: number;
  perPostDay: number | null;
};

export type BetaAlgorithmNet = {
  byAge: { lt7d: BetaAlgorithmNetBucket; d7to30: BetaAlgorithmNetBucket; gt30d: BetaAlgorithmNetBucket };
  all: BetaAlgorithmNetBucket;
};

export type BetaAlgorithmPostClassCounts = { real: number; owner: number; review: number; synthetic: number; official: number; lab: number };
export type BetaAlgorithmActorClassMeters = { real: number; owner: number; review: number; synthetic: number; unknown: number };
export type BetaAlgorithmDecayModes = { normal: number; trial: number; stress: number; undetermined: number };
/** Owner decision 11 Sep: the engagement wire carries a `surface` label that the
 *  digest counts per window — never on the ledger, never on the post. */
export type BetaAlgorithmSurfaces = { feed: number; map: number; profile: number; unknown: number };

export type BetaAlgorithmWindow = {
  days: number;
  observedPolicySpanned: string[];
  postsCreated: BetaAlgorithmPostClassCounts;
  entries: { real: number; official: number; unknownCause: number };
  realPostGain: {
    real: BetaAlgorithmActorGain;
    owner: BetaAlgorithmActorGain;
    review: BetaAlgorithmActorGain;
    synthetic: BetaAlgorithmActorGain;
    unknown: { total: number; n: number };
  };
  realPostDecayLoss: {
    byMode: BetaAlgorithmDecayModes;
    trialMultiplierSeen: number | null;
    byClass: BetaAlgorithmActorClassMeters;
    inferred: boolean;
  };
  realPostSeedLoss: number;
  realPostBoostLoss: number;
  netReal: BetaAlgorithmNet;
  netOwner: BetaAlgorithmNet;
  viewWorth: { metersPaid: number; paidViews: number; views: number | null; cleanPosts: number; viewSampleDays: number };
  boosts: { n: number; meters: number };
  unknownActorEntries: number;
  distinctRealViewers: number;
  distinctRealLikers: number;
  distinctRealCommenters: number;
  surfaces: BetaAlgorithmSurfaces;
};

export type BetaAlgorithmDay = Omit<BetaAlgorithmWindow, 'days' | 'observedPolicySpanned'> & { day: string; observedPolicy: string };

export type BetaAlgorithmChannel = {
  channelId: string;
  realPosts: number;
  realGainMeters: number;
  postDays: number;
  gainPerPostDay: number | null;
  medianMinutesToFirstRealEngagement: number | null;
  n: number;
  sufficient: boolean;
};

export type BetaAlgorithmPost = {
  postId: string;
  cls: 'real' | 'official';
  ownerClass: 'real' | 'owner' | 'review' | 'official';
  channelId: string;
  createdAtMillis: number;
  seedMeters: number;
  currentMeters: number;
  organicMeters: number;
  boostMeters: number;
  peakMeters: number;
  peakAtMillis: number;
  entries: number;
  realGain: number;
  ownerGain: number;
  reviewGain: number;
  syntheticGain: number;
  unknownGain: number;
  decayLoss: number;
  decayLossRealShare: number;
  decayModeSeen: string;
  clean: boolean;
  viewCount: number;
  firstRealEngagementAtMillis: number | null;
  lastAtMillis: number;
  lastCause: string;
  atClaim: boolean;
  expired: boolean;
  deletedAtMillis: number | null;
};

export type BetaAlgorithmAnchor = {
  postId: string;
  radiusMeters: number;
  atWorld: boolean;
  belowSinceMillis: number | null;
  lastAtMillis: number;
  decayPathSeen: 'organic' | 'boost' | 'seed' | 'none';
};

export type BetaAlgorithmGap = {
  id: string;
  measured: boolean;
  since: number | null;
  inferredEntries: number | null;
  undeterminedEntries: number | null;
};

export type BetaAlgorithmObservedGrant = {
  n: number;
  modeMeters: number | null;
  min: number | null;
  max: number | null;
  byMeters: Record<string, number>;
};

export type BetaAlgorithmPercentiles = { n: number; p50: number | null; p90: number | null };

/** One line of the stepped untouched-post curve (M7): `points` pairs a starting
 *  organic radius with the days until `calculateRadiusDecay` returns 0. */
export type BetaAlgorithmCurveLine = {
  ratePerDay: number;
  multiplier: number | null;
  halfLifeDays: number | null;
  linearTailDays: number | null;
  daysToFloorAt468m: number | null;
  seedDaysToFloor: number | null;
  points: { startMeters: number; days: number }[];
};

export type BetaAlgorithmClaimStats = {
  count: number;
  atFloor: number;
  medianMeters: number | null;
  maxMeters: number;
  aboveFloorThatEarned: number;
};

export type BetaAlgorithmSeedRestCounts = { livePosts: number; atClaim: number; everAboveClaim: number; cleanPosts: number };

/** `testControl/algorithmDigest` (spec §2.1), normalised and bounded for the page. */
export type BetaAlgorithmDigest = {
  version: 1;
  digestVersion: number;
  generatedAtMillis: number;
  runId: string;
  runMs: number;
  headline: {
    trialOn: boolean;
    trialSinceMillis: number | null;
    trialMultiplier: number | null;
    boostedSinceMillis: number | null;
    anchorsAtWorld: number;
    anchorsEver: number;
    worstAnchor: { postId: string; radiusMeters: number; ratePerPassSeen: number } | null;
  };
  cost: {
    reads: number;
    writes: number;
    entriesProcessed: number;
    postsPolled: number;
    postsWithEntries: number;
    engagementJoins: number;
    postLookups: number;
    createFetches: number;
    createSkipped: number;
    sweepReads: number;
    refreshReads: number;
    userLookups: number;
    authPages: number;
    budgetHit: boolean;
    capInForce: number;
    readsToday: number;
    monthlyReadsProjected: number;
    monthlyCadProjected: number;
  };
  coverage: {
    entriesFolded: number;
    complete: boolean;
    capped: boolean;
    registeredPosts: { real: number; owner: number; review: number; official: number };
    sweep: { cursorCreatedAtMillis: number; sweptPosts: number };
    horizonMillis: number;
    postsBehindHorizon: number;
    createFetched: number;
    createMissing: number;
    createSkipped: number;
    unknownCauses: Record<string, number>;
    unknownActorEntries: Record<string, number>;
    resync: Record<string, number>;
    undeterminedMode: number;
    postsGone: number;
    postsDeleted: number;
    evicted: number;
    trimmed: boolean;
    authPageFailedRuns: number;
    timeZone: string;
  };
  knobs: {
    firstViewMeters: number;
    likeMeters: number;
    dislikeMeters: number;
    commentMeters: number;
    repeatViewBaseMeters: number;
    repeatViewMinMs: number;
    repeatViewLifetimeMeters: number;
    decayPerDay: number;
    decayHalfLifeDays: number;
    decayFloorMeters: number;
    maxRadiusMeters: number;
    syntheticStressHalfLifeHours: number;
    seedMeters: number;
    boostDefaultMeters: number;
    boostDefaultHours: number;
    sourcePolicyVersion: string;
    policySha256: string;
    syncedAtMillis: number;
    source: string;
  };
  observedPolicy: { version: string; since: number };
  observedPolicyVersions: { version: string; fromMillis: number }[];
  observed: {
    grants: { view: BetaAlgorithmObservedGrant; like: BetaAlgorithmObservedGrant; dislike: BetaAlgorithmObservedGrant; comment: BetaAlgorithmObservedGrant };
    seedSeen: number | null;
    boostSeen: { n: number; modeMeters: number | null; modeHours: number | null };
    sampleEntries: number;
    clamped: number;
    resync: Record<string, number>;
  };
  switches: {
    simulationEnabled: boolean;
    runnerEnabled: boolean;
    dailySimulationEnabled: boolean;
    simulationOwnerUid: string;
    decayTrial: { enabled: boolean; multiplier: number; scope: string; effectiveAtMillis: number; boostedEffectiveAtMillis: number } | null;
    dueDecayEnabled: boolean;
    sampledAtMillis: number;
  };
  gates: { minEvents: number; minPosts: number; minChannelPosts: number; minActors: number };
  windows: { d7: BetaAlgorithmWindow; d30: BetaAlgorithmWindow };
  days: BetaAlgorithmDay[];
  channels: BetaAlgorithmChannel[];
  posts: BetaAlgorithmPost[];
  anchors: { worldMeters: number; everAtWorld: number; rows: BetaAlgorithmAnchor[] };
  seedRest: BetaAlgorithmSeedRestCounts & {
    valid: boolean;
    claimShareMedian: number | null;
    peakOverClaim: BetaAlgorithmPercentiles;
    timeToPeakHours: BetaAlgorithmPercentiles;
    owner: BetaAlgorithmSeedRestCounts;
  };
  claims: { d30: BetaAlgorithmClaimStats & { owner: BetaAlgorithmClaimStats } };
  contamination: {
    d7: {
      syntheticMeters: number;
      syntheticEntries: number;
      ownerMeters: number;
      ownerEntries: number;
      reviewMeters: number;
      reviewEntries: number;
      posts: { postId: string; syntheticMeters: number; ownerMeters: number; share: number }[];
    };
  };
  intercept: {
    realized: { entries: number; distinctPosts: number; distinctActors: number };
    opportunity: { pairs: number; postsWithAnyPair: number; realAccountsWithLocation: number };
  };
  curve: {
    passMinutes: number;
    normal: BetaAlgorithmCurveLine;
    normal65: BetaAlgorithmCurveLine;
    trial: BetaAlgorithmCurveLine | null;
    stress: { halfLifeHours: number };
  };
  questions: { c: BetaAlgorithmGate; d: BetaAlgorithmGate; f: BetaAlgorithmGate; h: BetaAlgorithmGate; i: BetaAlgorithmGate };
  gaps: BetaAlgorithmGap[];
};

/** Why the digest is null when a document was published: the proxy or this
 *  normaliser refused a foreign schema, or a document over the 512 KB guard. */
export type BetaAlgorithmRefusal = { reason: 'unsupported-version' | 'oversize'; version: number | null; digestVersion: number | null };

export type BetaDashboard = {
  generatedAtMs: number;
  /** Null until the hourly digest has published, or when it was refused
   *  (then `algorithmRefusal` says why — the page never renders zeros). */
  algorithm: BetaAlgorithmDigest | null;
  algorithmRefusal: BetaAlgorithmRefusal | null;
  testers: BetaTesterRow[];
  daily: BetaDailySeries;
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
  publicPosts: RealtimePublicPost[];
  publicMap: BetaMapCell[];
  publicFeed: RealtimeFeedPost[];
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

const signedMetric = (value: unknown, maximum = Number.MAX_SAFE_INTEGER): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(-maximum, Math.min(maximum, parsed)) : 0;
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

const realtimePublicPost = (value: unknown): RealtimePublicPost | null => {
  const row = record(value);
  const id = text(row.id, 160);
  const label = text(row.label, 80);
  const place = text(row.place, 80);
  const postedAtMs = timeMs(row.postedAtMs);
  if (!id || !label || !place || !postedAtMs || row.source !== 'firestore') return null;
  const mediaType = text(row.mediaType, 16);
  return {
    id,
    label,
    place,
    postedAtMs,
    updatedAtMs: timeMs(row.updatedAtMs) || postedAtMs,
    initialRadiusKm: metric(row.initialRadiusKm, 40_075),
    radiusKm: metric(row.radiusKm, 40_075),
    radiusDeltaKm: signedMetric(row.radiusDeltaKm, 40_075),
    viralScore: metric(row.viralScore, 1_000_000_000),
    viralPerHour: metric(row.viralPerHour, 1_000_000_000),
    source: 'firestore',
    synthetic: row.synthetic === true,
    channelId: text(row.channelId, 40) || 'live',
    mediaType: mediaType === 'photo' || mediaType === 'video' ? mediaType : 'unknown',
  };
};

const realtimeFeedPost = (value: unknown): RealtimeFeedPost | null => {
  const row = record(value);
  const id = text(row.id, 160);
  const label = text(row.label, 80);
  const postedAtMs = timeMs(row.postedAtMs);
  if (!id || !label || !postedAtMs) return null;
  const mediaType = text(row.mediaType, 16);
  return {
    id,
    label,
    channelId: text(row.channelId, 40) || 'live',
    mediaType: mediaType === 'photo' || mediaType === 'video' ? mediaType : 'unknown',
    postedAtMs,
    updatedAtMs: timeMs(row.updatedAtMs) || postedAtMs,
    synthetic: row.synthetic === true,
  };
};

const betaMapCell = (value: unknown): BetaMapCell | null => {
  const row = record(value);
  const place = text(row.place, 80);
  if (!place) return null;
  return {
    place,
    events: integer(row.events, 1_000_000),
    realEvents: integer(row.realEvents, 1_000_000),
    syntheticEvents: integer(row.syntheticEvents, 1_000_000),
    latestAtMs: timeMs(row.latestAtMs),
    peakRadiusKm: metric(row.peakRadiusKm, 40_075),
    velocity: metric(row.velocity, 1_000_000_000),
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

const coordinate = (value: unknown): { latitude: number; longitude: number } | null => {
  const point = record(value);
  const latitude = Number(point.latitude);
  const longitude = Number(point.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
};

const testerPost = (value: unknown): BetaTesterPost | null => {
  const post = record(value);
  const id = text(post.id, 120);
  if (!id) return null;
  return {
    id,
    createdAtMs: timeMs(post.createdAtMs),
    radiusMeters: metric(post.radiusMeters, 40_075_000),
    mediaType: post.mediaType === 'video' ? 'video' : 'photo',
    mediaCount: Math.max(1, integer(post.mediaCount, 10)),
    caption: text(post.caption, 120),
    channelId: text(post.channelId, 64),
    coarse: coordinate(post.coarse),
  };
};

const testerRow = (value: unknown): BetaTesterRow | null => {
  const row = record(value);
  const uid = text(row.uid, 128);
  if (!uid) return null;
  const presence = row.presence === 'online' || row.presence === 'away' ? row.presence : 'unknown';
  return {
    uid,
    label: text(row.label, 50) || `Tester ${uid.slice(-4)}`,
    username: text(row.username, 40),
    accountType: text(row.accountType, 16) || 'user',
    signedUpAtMs: timeMs(row.signedUpAtMs),
    lastSignInAtMs: timeMs(row.lastSignInAtMs),
    presence,
    presenceSource: row.presenceSource === 'lease' || row.presenceSource === 'heartbeat' ? row.presenceSource : 'none',
    lastActivityAtMs: timeMs(row.lastActivityAtMs),
    screen: text(row.screen, 40),
    platform: text(row.platform, 16),
    postCount: integer(row.postCount, 100_000),
    lastPostedAtMs: timeMs(row.lastPostedAtMs),
    synthetic: row.synthetic === true,
    posts: Array.isArray(row.posts) ? row.posts.map(testerPost).filter((post): post is BetaTesterPost => post !== null).slice(0, 24) : [],
  };
};

const postHistoryEntry = (value: unknown): PostHistoryEntry | null => {
  const entry = record(value);
  const atMs = timeMs(entry.atMs);
  if (!atMs) return null;
  return {
    id: text(entry.id, 120),
    atMs,
    cause: text(entry.cause, 24) || 'unknown',
    kind: text(entry.kind, 24) || null,
    radiusMeters: metric(entry.radiusMeters, 40_075_000),
    organicRadiusMeters: metric(entry.organicRadiusMeters, 40_075_000),
    seedRadiusMeters: metric(entry.seedRadiusMeters, 40_075_000),
    delta: (() => { const n = Number(entry.delta); return Number.isFinite(n) ? n : 0; })(),
    writer: text(entry.writer, 40),
  };
};

const postHistory = (value: unknown): PostHistory => {
  const result = record(value);
  return {
    postId: text(result.postId, 120),
    ownerId: text(result.ownerId, 128),
    createdAtMs: timeMs(result.createdAtMs),
    caption: text(result.caption, 280),
    channelId: text(result.channelId, 64),
    mediaType: result.mediaType === 'video' ? 'video' : 'photo',
    mediaCount: Math.max(1, integer(result.mediaCount, 10)),
    radiusMeters: metric(result.radiusMeters, 40_075_000),
    seedRadiusMeters: metric(result.seedRadiusMeters, 40_075_000),
    organicRadiusMeters: metric(result.organicRadiusMeters, 40_075_000),
    locationVisibility: text(result.locationVisibility, 16),
    coarse: coordinate(result.coarse),
    exact: coordinate(result.exact),
    history: Array.isArray(result.history)
      ? result.history.map(postHistoryEntry).filter((entry): entry is PostHistoryEntry => entry !== null).slice(0, 500)
      : [],
  };
};

const dailyCount = (value: unknown): BetaDailyCount | null => {
  const entry = record(value);
  const day = text(entry.day, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return {
    day,
    signups: integer(entry.signups, 100_000),
    syntheticSignups: integer(entry.syntheticSignups, 100_000),
    posts: integer(entry.posts, 1_000_000),
    syntheticPosts: integer(entry.syntheticPosts, 1_000_000),
  };
};

const dailySeries = (value: unknown): BetaDailySeries => {
  const series = record(value);
  return {
    timeZone: text(series.timeZone, 64),
    days: Array.isArray(series.days) ? series.days.map(dailyCount).filter((day): day is BetaDailyCount => day !== null).slice(0, 90) : [],
    postsComplete: series.postsComplete !== false,
  };
};

/** Every metre in the digest is clamped to the world ceiling (spec §4.3). */
const WORLD_METERS = 6_371_000;
const DIGEST_SCHEMA_VERSION = 1;
const DIGEST_BOUNDS = { days: 30, posts: 50, channels: 13, anchors: 8, contaminationPosts: 20, policyVersions: 8, gaps: 8 } as const;

const meters = (value: unknown): number => metric(value, WORLD_METERS);
const signedMeters = (value: unknown): number => signedMetric(value, WORLD_METERS);
const nullable = (value: unknown, maximum: number, signed = false): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  return signed ? signedMetric(parsed, maximum) : metric(parsed, maximum);
};
const nullableMeters = (value: unknown): number | null => nullable(value, WORLD_METERS, true);
const nullableTime = (value: unknown): number | null => {
  const parsed = timeMs(value);
  return parsed ? parsed : null;
};
const fraction = (value: unknown): number => metric(value, 1);

const digestGate = (value: unknown, minN: number): BetaAlgorithmGate => {
  const gate = record(value);
  return {
    n: integer(gate.n, 10_000_000),
    minN: integer(gate.minN, 10_000) || minN,
    // A missing gate is never sufficient: the page must not invent confidence.
    sufficient: gate.sufficient === true,
    basis: text(gate.basis, 160),
  };
};

const actorGain = (value: unknown): BetaAlgorithmActorGain => {
  const gain = record(value);
  return {
    view: signedMeters(gain.view),
    like: signedMeters(gain.like),
    comment: signedMeters(gain.comment),
    dislike: signedMeters(gain.dislike),
    total: signedMeters(gain.total),
    n: integer(gain.n, 10_000_000),
    firstViews: integer(gain.firstViews, 10_000_000),
    repeatViews: integer(gain.repeatViews, 10_000_000),
    repeatMeters: signedMeters(gain.repeatMeters),
    clamped: integer(gain.clamped, 10_000_000),
    resync: integer(gain.resync, 10_000_000),
  };
};

const netBucket = (value: unknown): BetaAlgorithmNetBucket => {
  const bucket = record(value);
  return {
    posts: integer(bucket.posts, 1_000_000),
    netPositive: integer(bucket.netPositive, 1_000_000),
    postDays: metric(bucket.postDays, 100_000_000),
    gainRealMeters: signedMeters(bucket.gainRealMeters),
    lossRealShareMeters: signedMeters(bucket.lossRealShareMeters),
    perPostDay: nullableMeters(bucket.perPostDay),
  };
};

const netStats = (value: unknown): BetaAlgorithmNet => {
  const net = record(value);
  const byAge = record(net.byAge);
  return {
    byAge: { lt7d: netBucket(byAge.lt7d), d7to30: netBucket(byAge.d7to30), gt30d: netBucket(byAge.gt30d) },
    all: netBucket(net.all),
  };
};

const actorClassMeters = (value: unknown): BetaAlgorithmActorClassMeters => {
  const row = record(value);
  return {
    real: signedMeters(row.real),
    owner: signedMeters(row.owner),
    review: signedMeters(row.review),
    synthetic: signedMeters(row.synthetic),
    unknown: signedMeters(row.unknown),
  };
};

const windowStats = (value: unknown): BetaAlgorithmWindow => {
  const stats = record(value);
  const postsCreated = record(stats.postsCreated);
  const entries = record(stats.entries);
  const gain = record(stats.realPostGain);
  const unknownGain = record(gain.unknown);
  const loss = record(stats.realPostDecayLoss);
  const byMode = record(loss.byMode);
  const worth = record(stats.viewWorth);
  const boosts = record(stats.boosts);
  const surfaces = record(stats.surfaces);
  return {
    days: integer(stats.days, 400),
    observedPolicySpanned: Array.isArray(stats.observedPolicySpanned)
      ? stats.observedPolicySpanned.map(version => text(version, 16)).filter(Boolean).slice(0, DIGEST_BOUNDS.policyVersions)
      : [],
    postsCreated: {
      real: integer(postsCreated.real),
      owner: integer(postsCreated.owner),
      review: integer(postsCreated.review),
      synthetic: integer(postsCreated.synthetic),
      official: integer(postsCreated.official),
      lab: integer(postsCreated.lab),
    },
    entries: { real: integer(entries.real, 10_000_000), official: integer(entries.official, 10_000_000), unknownCause: integer(entries.unknownCause, 10_000_000) },
    realPostGain: {
      real: actorGain(gain.real),
      owner: actorGain(gain.owner),
      review: actorGain(gain.review),
      synthetic: actorGain(gain.synthetic),
      unknown: { total: signedMeters(unknownGain.total), n: integer(unknownGain.n, 10_000_000) },
    },
    realPostDecayLoss: {
      byMode: {
        normal: meters(byMode.normal),
        trial: meters(byMode.trial),
        stress: meters(byMode.stress),
        undetermined: meters(byMode.undetermined),
      },
      trialMultiplierSeen: nullable(loss.trialMultiplierSeen, 100),
      byClass: actorClassMeters(loss.byClass),
      inferred: loss.inferred !== false,
    },
    realPostSeedLoss: meters(stats.realPostSeedLoss),
    realPostBoostLoss: meters(stats.realPostBoostLoss),
    netReal: netStats(stats.netReal),
    netOwner: netStats(stats.netOwner),
    viewWorth: {
      metersPaid: signedMeters(worth.metersPaid),
      paidViews: integer(worth.paidViews, 10_000_000),
      views: nullable(worth.views, 1_000_000_000),
      cleanPosts: integer(worth.cleanPosts),
      viewSampleDays: integer(worth.viewSampleDays, 400),
    },
    boosts: { n: integer(boosts.n), meters: meters(boosts.meters) },
    unknownActorEntries: integer(stats.unknownActorEntries, 10_000_000),
    distinctRealViewers: integer(stats.distinctRealViewers, 10_000_000),
    distinctRealLikers: integer(stats.distinctRealLikers, 10_000_000),
    distinctRealCommenters: integer(stats.distinctRealCommenters, 10_000_000),
    surfaces: {
      feed: integer(surfaces.feed, 10_000_000),
      map: integer(surfaces.map, 10_000_000),
      profile: integer(surfaces.profile, 10_000_000),
      unknown: integer(surfaces.unknown, 10_000_000),
    },
  };
};

const dayStat = (value: unknown): BetaAlgorithmDay | null => {
  const day = text(record(value).day, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const { days: _days, observedPolicySpanned: _spanned, ...stats } = windowStats(value);
  return { ...stats, day, observedPolicy: text(record(value).observedPolicy, 16) };
};

const channelStat = (value: unknown): BetaAlgorithmChannel | null => {
  const channel = record(value);
  const channelId = text(channel.channelId, 40);
  if (!channelId) return null;
  return {
    channelId,
    realPosts: integer(channel.realPosts),
    realGainMeters: signedMeters(channel.realGainMeters),
    postDays: metric(channel.postDays, 100_000_000),
    gainPerPostDay: nullableMeters(channel.gainPerPostDay),
    medianMinutesToFirstRealEngagement: nullable(channel.medianMinutesToFirstRealEngagement, 1_000_000_000),
    n: integer(channel.n, 10_000_000),
    sufficient: channel.sufficient === true,
  };
};

const postSummary = (value: unknown): BetaAlgorithmPost | null => {
  const post = record(value);
  const postId = text(post.postId, 120);
  if (!postId) return null;
  const ownerClass = text(post.ownerClass, 16);
  const cls = post.cls === 'official' || ownerClass === 'official' ? 'official' : 'real';
  return {
    postId,
    cls,
    ownerClass: cls === 'official' ? 'official' : ownerClass === 'owner' || ownerClass === 'review' ? ownerClass : 'real',
    channelId: text(post.channelId, 40),
    createdAtMillis: timeMs(post.createdAtMillis),
    seedMeters: meters(post.seedMeters),
    currentMeters: meters(post.currentMeters),
    organicMeters: meters(post.organicMeters),
    boostMeters: meters(post.boostMeters),
    peakMeters: meters(post.peakMeters),
    peakAtMillis: timeMs(post.peakAtMillis),
    entries: integer(post.entries, 10_000_000),
    realGain: signedMeters(post.realGain),
    ownerGain: signedMeters(post.ownerGain),
    reviewGain: signedMeters(post.reviewGain),
    syntheticGain: signedMeters(post.syntheticGain),
    unknownGain: signedMeters(post.unknownGain),
    decayLoss: meters(post.decayLoss),
    decayLossRealShare: meters(post.decayLossRealShare),
    decayModeSeen: text(post.decayModeSeen, 24) || 'none',
    clean: post.clean === true,
    viewCount: integer(post.viewCount, 1_000_000_000),
    firstRealEngagementAtMillis: nullableTime(post.firstRealEngagementAtMillis),
    lastAtMillis: timeMs(post.lastAtMillis),
    lastCause: text(post.lastCause, 24),
    atClaim: post.atClaim === true,
    expired: post.expired === true,
    deletedAtMillis: nullableTime(post.deletedAtMillis),
  };
};

const anchorRow = (value: unknown): BetaAlgorithmAnchor | null => {
  const row = record(value);
  const postId = text(row.postId, 120);
  if (!postId) return null;
  const path = text(row.decayPathSeen, 16);
  return {
    postId,
    radiusMeters: meters(row.radiusMeters),
    atWorld: row.atWorld === true,
    belowSinceMillis: nullableTime(row.belowSinceMillis),
    lastAtMillis: timeMs(row.lastAtMillis),
    decayPathSeen: path === 'organic' || path === 'boost' || path === 'seed' ? path : 'none',
  };
};

const observedGrant = (value: unknown): BetaAlgorithmObservedGrant => {
  const grant = record(value);
  return {
    n: integer(grant.n, 10_000_000),
    modeMeters: nullableMeters(grant.modeMeters),
    min: nullableMeters(grant.min),
    max: nullableMeters(grant.max),
    byMeters: countRecord(grant.byMeters),
  };
};

const percentiles = (value: unknown, maximum: number): BetaAlgorithmPercentiles => {
  const row = record(value);
  return { n: integer(row.n), p50: nullable(row.p50, maximum), p90: nullable(row.p90, maximum) };
};

const claimStats = (value: unknown): BetaAlgorithmClaimStats => {
  const row = record(value);
  return {
    count: integer(row.count),
    atFloor: integer(row.atFloor),
    medianMeters: nullableMeters(row.medianMeters),
    maxMeters: meters(row.maxMeters),
    aboveFloorThatEarned: integer(row.aboveFloorThatEarned),
  };
};

const seedRestCounts = (value: unknown): BetaAlgorithmSeedRestCounts => {
  const row = record(value);
  return {
    livePosts: integer(row.livePosts),
    atClaim: integer(row.atClaim),
    everAboveClaim: integer(row.everAboveClaim),
    cleanPosts: integer(row.cleanPosts),
  };
};

/** The stepped curve may publish `daysToFloor` keyed by start metres or as a
 *  list of `{startMeters, days}`; both fold to the same ordered points. */
const curveLine = (value: unknown): BetaAlgorithmCurveLine => {
  const line = record(value);
  const raw = line.daysToFloor;
  const points = (Array.isArray(raw)
    ? raw.map(point => { const row = record(point); return [row.startMeters ?? row.meters ?? row.organic, row.days] as const; })
    : Object.entries(record(raw)))
    .map(([start, days]) => ({ startMeters: meters(start), days: metric(days, 100_000) }))
    .filter(point => point.startMeters > 0)
    .sort((left, right) => left.startMeters - right.startMeters)
    .slice(0, 8);
  return {
    ratePerDay: fraction(line.ratePerDay),
    multiplier: nullable(line.multiplier, 100),
    halfLifeDays: nullable(line.halfLifeDays, 100_000),
    linearTailDays: nullable(line.linearTailDays, 100_000),
    daysToFloorAt468m: nullable(line.daysToFloorAt468m, 100_000),
    seedDaysToFloor: nullable(line.seedDaysToFloor, 100_000),
    points,
  };
};

const digestGap = (value: unknown): BetaAlgorithmGap | null => {
  const gap = record(value);
  const id = text(gap.id, 40);
  if (!id) return null;
  return {
    id,
    measured: gap.measured === true,
    since: nullableTime(gap.since),
    inferredEntries: nullable(gap.inferredEntries, 10_000_000),
    undeterminedEntries: nullable(gap.undeterminedEntries, 10_000_000),
  };
};

const list = <T>(value: unknown, map: (item: unknown) => T | null, limit: number): T[] => Array.isArray(value)
  ? value.map(map).filter((item): item is T => item !== null).slice(0, limit)
  : [];

/** The schema version the digest declares, or null when nothing is published. */
export const algorithmDigestVersion = (value: unknown): number | null => {
  if (!value || typeof value !== 'object') return null;
  const version = record(value).version;
  // Strictly a number: a stringly "1" is a foreign writer, not schema 1.
  return typeof version === 'number' && Number.isFinite(version) ? version : 0;
};

/** The proxy forwards a refused document as `{version, unsupportedVersion}` or
 *  `{version, digestVersion, oversize}`; both are refusals here as well. */
export const algorithmDigestRefusal = (value: unknown): BetaAlgorithmRefusal | null => {
  const version = algorithmDigestVersion(value);
  if (version === null) return null;
  const raw = record(value);
  const digestVersion = typeof raw.digestVersion === 'number' && Number.isFinite(raw.digestVersion) ? integer(raw.digestVersion, 1_000_000_000) : null;
  if (version !== DIGEST_SCHEMA_VERSION || raw.unsupportedVersion === true) return { reason: 'unsupported-version', version: version || null, digestVersion };
  if (raw.oversize === true) return { reason: 'oversize', version, digestVersion };
  return null;
};

/**
 * Normalises `testControl/algorithmDigest` for the page: a foreign schema
 * version or an oversize marker yields null (the page says why, never zeros),
 * arrays are sliced to the published bounds and every metre is clamped to
 * the world.
 */
export const algorithmDigest = (value: unknown): BetaAlgorithmDigest | null => {
  if (algorithmDigestVersion(value) !== DIGEST_SCHEMA_VERSION || algorithmDigestRefusal(value)) return null;
  const digest = record(value);
  const headline = record(digest.headline);
  const worst = record(headline.worstAnchor);
  const cost = record(digest.cost);
  const coverage = record(digest.coverage);
  const registered = record(coverage.registeredPosts);
  const sweep = record(coverage.sweep);
  const knobs = record(digest.knobs);
  const observedPolicy = record(digest.observedPolicy);
  const observed = record(digest.observed);
  const grants = record(observed.grants);
  const boostSeen = record(observed.boostSeen);
  const switches = record(digest.switches);
  const trial = switches.decayTrial && typeof switches.decayTrial === 'object' ? record(switches.decayTrial) : null;
  const gates = record(digest.gates);
  const minEvents = integer(gates.minEvents, 10_000) || 30;
  const minPosts = integer(gates.minPosts, 10_000) || 8;
  const minChannelPosts = integer(gates.minChannelPosts, 10_000) || 5;
  const minActors = integer(gates.minActors, 10_000) || 2;
  const windows = record(digest.windows);
  const anchors = record(digest.anchors);
  const seedRest = record(digest.seedRest);
  const claims = record(record(digest.claims).d30);
  const contamination = record(record(digest.contamination).d7);
  const intercept = record(digest.intercept);
  const realized = record(intercept.realized);
  const opportunity = record(intercept.opportunity);
  const curve = record(digest.curve);
  const questions = record(digest.questions);
  return {
    version: DIGEST_SCHEMA_VERSION,
    digestVersion: integer(digest.digestVersion, 1_000_000_000),
    generatedAtMillis: timeMs(digest.generatedAtMillis),
    runId: text(digest.runId, 80),
    runMs: integer(digest.runMs, 24 * 60 * 60 * 1_000),
    headline: {
      trialOn: headline.trialOn === true,
      trialSinceMillis: nullableTime(headline.trialSinceMillis),
      trialMultiplier: nullable(headline.trialMultiplier, 100),
      boostedSinceMillis: nullableTime(headline.boostedSinceMillis),
      anchorsAtWorld: integer(headline.anchorsAtWorld),
      anchorsEver: integer(headline.anchorsEver),
      worstAnchor: text(worst.postId, 120)
        ? { postId: text(worst.postId, 120), radiusMeters: meters(worst.radiusMeters), ratePerPassSeen: fraction(worst.ratePerPassSeen) }
        : null,
    },
    cost: {
      reads: integer(cost.reads, 1_000_000_000),
      writes: integer(cost.writes, 1_000_000_000),
      entriesProcessed: integer(cost.entriesProcessed, 1_000_000_000),
      postsPolled: integer(cost.postsPolled),
      postsWithEntries: integer(cost.postsWithEntries),
      engagementJoins: integer(cost.engagementJoins, 1_000_000_000),
      postLookups: integer(cost.postLookups, 1_000_000_000),
      createFetches: integer(cost.createFetches, 1_000_000_000),
      createSkipped: integer(cost.createSkipped, 1_000_000_000),
      sweepReads: integer(cost.sweepReads, 1_000_000_000),
      refreshReads: integer(cost.refreshReads, 1_000_000_000),
      userLookups: integer(cost.userLookups, 1_000_000_000),
      authPages: integer(cost.authPages, 1_000_000),
      budgetHit: cost.budgetHit === true,
      capInForce: integer(cost.capInForce, 1_000_000_000),
      readsToday: integer(cost.readsToday, 1_000_000_000),
      monthlyReadsProjected: integer(cost.monthlyReadsProjected, 1_000_000_000_000),
      monthlyCadProjected: metric(cost.monthlyCadProjected, 1_000_000),
    },
    coverage: {
      entriesFolded: integer(coverage.entriesFolded, 1_000_000_000),
      complete: coverage.complete === true,
      capped: coverage.capped === true,
      registeredPosts: { real: integer(registered.real), owner: integer(registered.owner), review: integer(registered.review), official: integer(registered.official) },
      sweep: { cursorCreatedAtMillis: timeMs(sweep.cursorCreatedAtMillis), sweptPosts: integer(sweep.sweptPosts) },
      horizonMillis: timeMs(coverage.horizonMillis),
      postsBehindHorizon: integer(coverage.postsBehindHorizon),
      createFetched: integer(coverage.createFetched, 1_000_000_000),
      createMissing: integer(coverage.createMissing, 1_000_000_000),
      createSkipped: integer(coverage.createSkipped, 1_000_000_000),
      unknownCauses: countRecord(coverage.unknownCauses),
      unknownActorEntries: countRecord(coverage.unknownActorEntries),
      resync: countRecord(coverage.resync),
      undeterminedMode: integer(coverage.undeterminedMode, 1_000_000_000),
      postsGone: integer(coverage.postsGone),
      postsDeleted: integer(coverage.postsDeleted),
      evicted: integer(coverage.evicted),
      trimmed: coverage.trimmed === true,
      authPageFailedRuns: integer(coverage.authPageFailedRuns, 1_000_000),
      timeZone: text(coverage.timeZone, 64) || 'America/Toronto',
    },
    knobs: {
      firstViewMeters: meters(knobs.firstViewMeters),
      likeMeters: meters(knobs.likeMeters),
      dislikeMeters: signedMeters(knobs.dislikeMeters),
      commentMeters: meters(knobs.commentMeters),
      repeatViewBaseMeters: meters(knobs.repeatViewBaseMeters),
      repeatViewMinMs: integer(knobs.repeatViewMinMs, 24 * 60 * 60 * 1_000),
      repeatViewLifetimeMeters: meters(knobs.repeatViewLifetimeMeters),
      decayPerDay: fraction(knobs.decayPerDay),
      decayHalfLifeDays: metric(knobs.decayHalfLifeDays, 100_000),
      decayFloorMeters: meters(knobs.decayFloorMeters),
      maxRadiusMeters: meters(knobs.maxRadiusMeters),
      syntheticStressHalfLifeHours: metric(knobs.syntheticStressHalfLifeHours, 100_000),
      seedMeters: meters(knobs.seedMeters),
      boostDefaultMeters: meters(knobs.boostDefaultMeters),
      boostDefaultHours: metric(knobs.boostDefaultHours, 100_000),
      sourcePolicyVersion: text(knobs.sourcePolicyVersion, 16),
      policySha256: text(knobs.policySha256, 64),
      syncedAtMillis: timeMs(knobs.syncedAtMillis),
      source: text(knobs.source, 160),
    },
    observedPolicy: { version: text(observedPolicy.version, 16), since: timeMs(observedPolicy.since) },
    observedPolicyVersions: list(digest.observedPolicyVersions, item => {
      const row = record(item);
      const version = text(row.version, 16);
      return version ? { version, fromMillis: timeMs(row.fromMillis) } : null;
    }, DIGEST_BOUNDS.policyVersions),
    observed: {
      grants: { view: observedGrant(grants.view), like: observedGrant(grants.like), dislike: observedGrant(grants.dislike), comment: observedGrant(grants.comment) },
      seedSeen: nullableMeters(observed.seedSeen),
      boostSeen: { n: integer(boostSeen.n), modeMeters: nullableMeters(boostSeen.modeMeters), modeHours: nullable(boostSeen.modeHours, 100_000) },
      sampleEntries: integer(observed.sampleEntries, 10_000_000),
      clamped: integer(observed.clamped, 10_000_000),
      resync: countRecord(observed.resync),
    },
    switches: {
      simulationEnabled: switches.simulationEnabled === true,
      runnerEnabled: switches.runnerEnabled === true,
      dailySimulationEnabled: switches.dailySimulationEnabled === true,
      simulationOwnerUid: text(switches.simulationOwnerUid, 128),
      decayTrial: trial ? {
        enabled: trial.enabled === true,
        multiplier: metric(trial.multiplier, 100),
        scope: text(trial.scope, 32),
        effectiveAtMillis: timeMs(trial.effectiveAtMillis),
        boostedEffectiveAtMillis: timeMs(trial.boostedEffectiveAtMillis),
      } : null,
      dueDecayEnabled: switches.dueDecayEnabled === true,
      sampledAtMillis: timeMs(switches.sampledAtMillis),
    },
    gates: { minEvents, minPosts, minChannelPosts, minActors },
    windows: { d7: windowStats(windows.d7), d30: windowStats(windows.d30) },
    // Oldest first in the document; an over-long list keeps its newest days.
    days: list(digest.days, dayStat, 400).slice(-DIGEST_BOUNDS.days),
    channels: list(digest.channels, channelStat, DIGEST_BOUNDS.channels),
    posts: list(digest.posts, postSummary, DIGEST_BOUNDS.posts),
    anchors: {
      worldMeters: meters(anchors.worldMeters) || WORLD_METERS,
      everAtWorld: integer(anchors.everAtWorld),
      rows: list(anchors.rows, anchorRow, DIGEST_BOUNDS.anchors),
    },
    seedRest: {
      ...seedRestCounts(seedRest),
      valid: seedRest.valid === true,
      claimShareMedian: nullable(seedRest.claimShareMedian, 1_000_000),
      peakOverClaim: percentiles(seedRest.peakOverClaim, 1_000_000),
      timeToPeakHours: percentiles(seedRest.timeToPeakHours, 1_000_000),
      owner: seedRestCounts(seedRest.owner),
    },
    claims: { d30: { ...claimStats(claims), owner: claimStats(claims.owner) } },
    contamination: {
      d7: {
        syntheticMeters: signedMeters(contamination.syntheticMeters),
        syntheticEntries: integer(contamination.syntheticEntries, 10_000_000),
        ownerMeters: signedMeters(contamination.ownerMeters),
        ownerEntries: integer(contamination.ownerEntries, 10_000_000),
        reviewMeters: signedMeters(contamination.reviewMeters),
        reviewEntries: integer(contamination.reviewEntries, 10_000_000),
        posts: list(contamination.posts, item => {
          const row = record(item);
          const postId = text(row.postId, 120);
          return postId ? { postId, syntheticMeters: signedMeters(row.syntheticMeters), ownerMeters: signedMeters(row.ownerMeters), share: fraction(row.share) } : null;
        }, DIGEST_BOUNDS.contaminationPosts),
      },
    },
    intercept: {
      realized: { entries: integer(realized.entries, 10_000_000), distinctPosts: integer(realized.distinctPosts), distinctActors: integer(realized.distinctActors) },
      opportunity: { pairs: integer(opportunity.pairs, 10_000_000), postsWithAnyPair: integer(opportunity.postsWithAnyPair), realAccountsWithLocation: integer(opportunity.realAccountsWithLocation) },
    },
    curve: {
      passMinutes: integer(curve.passMinutes, 1_440) || 60,
      normal: curveLine(curve.normal),
      normal65: curveLine(curve.normal65),
      trial: curve.trial && typeof curve.trial === 'object' ? curveLine(curve.trial) : null,
      stress: { halfLifeHours: metric(record(curve.stress).halfLifeHours, 100_000) },
    },
    questions: {
      c: digestGate(questions.c, minEvents),
      d: digestGate(questions.d, minPosts),
      f: digestGate(questions.f, minPosts),
      h: digestGate(questions.h, minChannelPosts),
      i: digestGate(questions.i, minPosts),
    },
    gaps: list(digest.gaps, digestGap, DIGEST_BOUNDS.gaps),
  };
};

const dashboard = (value: unknown): BetaDashboard => {
  const result = record(value) as Partial<BetaDashboard> & Record<string, unknown>;
  const algorithm = result.algorithm ? algorithmDigest(result.algorithm) : null;
  const actors = Array.isArray(result.runnerActors)
    ? result.runnerActors.map(runnerActor).filter((item): item is BetaRunnerActor => item !== null).slice(0, 5)
    : Array.isArray(result.syntheticProfiles)
      ? result.syntheticProfiles.map(runnerActor).filter((item): item is BetaRunnerActor => item !== null).slice(0, 5)
      : [];
  return {
    generatedAtMs: timeMs(result.generatedAtMs) || Date.now(),
    algorithm,
    algorithmRefusal: algorithm ? null : algorithmDigestRefusal(result.algorithm),
    daily: dailySeries(result.daily),
    testers: Array.isArray(result.testers)
      ? result.testers.map(testerRow).filter((row): row is BetaTesterRow => row !== null).slice(0, 1000)
      : [],
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
    publicPosts: Array.isArray(result.publicPosts)
      ? result.publicPosts.map(realtimePublicPost).filter((post): post is RealtimePublicPost => post !== null).slice(0, 160)
      : [],
    publicMap: Array.isArray(result.publicMap)
      ? result.publicMap.map(betaMapCell).filter((cell): cell is BetaMapCell => cell !== null).slice(0, 32)
      : [],
    publicFeed: Array.isArray(result.publicFeed)
      ? result.publicFeed.map(realtimeFeedPost).filter((post): post is RealtimeFeedPost => post !== null).slice(0, 160)
      : [],
  };
};

type CallableBody<T> = { result?: T; error?: { message?: string } };
const OWNER_PROXY = 'http://127.0.0.1:8096/api/control';
const OWNER_LIVE = 'http://127.0.0.1:8096/api/live';
const RECONNECT_BASE_MS = 1_500;
const RECONNECT_MAX_MS = 15_000;
/** A hint above a minute is treated as a proxy bug, not a request to wait. */
const RECONNECT_HINT_MAX_MS = 60_000;

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

/** One post's radius ledger, through the owner-only loopback proxy. */
export async function readPostHistory(postId: string): Promise<PostHistory> {
  return postHistory(await ownerCall<unknown>({ action: 'postHistory', postId }));
}

/** A tester's newest posts, loaded lazily when the row expands (spec §5.4):
 *  ≤ 24 reads, the same summary shape the tester table already renders. */
export async function readTesterPosts(uid: string): Promise<BetaTesterPost[]> {
  const result = await ownerCall<unknown>({ action: 'testerPosts', uid });
  const rows = Array.isArray(result) ? result : record(result).posts;
  return Array.isArray(rows) ? rows.map(testerPost).filter((post): post is BetaTesterPost => post !== null).slice(0, 24) : [];
}

const OWNER_EXPORT = 'http://127.0.0.1:8096/api/export/ledger';
/** Owner's rate: CA$0.05 per 100k Firestore reads; the proxy refuses a ledger
 *  export whose estimate exceeds what is left of its 25,000-reads day (§4.2). */
export const LEDGER_EXPORT_DAY_READS = 25_000;
export const LEDGER_EXPORT_POST_LIMIT = 50;
const LEDGER_EXPORT_UNKNOWN_POST_READS = 501;
const FIRESTORE_CAD_PER_READ = 0.05 / 100_000;

const csvCell = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const raw = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
};

/** Nested digest rows flatten to dotted columns so a spreadsheet keeps every
 *  numerator and denominator side by side. */
const flattenRow = (row: Record<string, unknown>, prefix = '', into: Record<string, unknown> = {}): Record<string, unknown> => {
  for (const [key, value] of Object.entries(row)) {
    const column = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) flattenRow(value as Record<string, unknown>, column, into);
    else into[column] = Array.isArray(value) ? value.join('|') : value;
  }
  return into;
};

const csv = (rows: Record<string, unknown>[]): string => {
  const columns: string[] = [];
  const flat = rows.map(row => flattenRow(row));
  for (const row of flat) for (const column of Object.keys(row)) if (!columns.includes(column)) columns.push(column);
  return [columns, ...flat.map(row => columns.map(column => row[column]))]
    .map(line => line.map(csvCell).join(','))
    .join('\r\n');
};

/** `poplur-algorithm-days.csv`: one row per published day, 0 reads (§4.5). */
export const digestDaysCsv = (digest: BetaAlgorithmDigest): string => csv(digest.days.map(({ day, observedPolicy, ...stats }) => ({
  day,
  policyVersion: observedPolicy,
  ...stats,
})));

/** `poplur-algorithm-posts.csv`: one row per post summary, 0 reads (§4.5). */
export const digestPostsCsv = (digest: BetaAlgorithmDigest): string => csv(digest.posts.map(post => ({ ...post })));

export type LedgerExportEstimate = { posts: number; reads: number; cad: number; leftToday: number };

/** The exact read estimate shown before the second press: `1 + entries` per
 *  post from the digest's watchlist; a post it does not know costs the cap. */
export const estimateLedgerExport = (digest: BetaAlgorithmDigest | null, postIds: string[]): LedgerExportEstimate => {
  const ids = Array.from(new Set(postIds)).slice(0, LEDGER_EXPORT_POST_LIMIT);
  const entriesById = new Map((digest?.posts ?? []).map(post => [post.postId, post.entries] as const));
  const reads = ids.reduce((sum, postId) => {
    const entries = entriesById.get(postId);
    return sum + (entries === undefined ? LEDGER_EXPORT_UNKNOWN_POST_READS : 1 + Math.min(500, entries));
  }, 0);
  return { posts: ids.length, reads, cad: reads * FIRESTORE_CAD_PER_READ, leftToday: Math.max(0, LEDGER_EXPORT_DAY_READS - reads) };
};

export class LedgerExportRefused extends Error {
  readonly remaining: number;
  constructor(remaining: number) {
    super(`The proxy refused the export: only ${remaining.toLocaleString()} reads are left in today's budget.`);
    this.remaining = remaining;
  }
}

/** Hands a Blob to the browser as a download. The page already guards object
 *  URLs the same way for runner frames. */
export const saveBlob = (blob: Blob, filename: string): void => {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function' || typeof document === 'undefined') {
    throw new Error('Downloads are unavailable in this environment.');
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
};

export const saveCsv = (filename: string, content: string): void => saveBlob(new Blob([content], { type: 'text/csv;charset=utf-8' }), filename);

const exportStamp = (now = new Date()): string => {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
};

/** POST + fetch + Blob only: a GET navigation carries no Origin header and
 *  the proxy 403s it. ≤ 50 post ids per request (§4.2). */
export async function readLedgerExport(postIds: string[]): Promise<{ filename: string; bytes: number }> {
  const ids = Array.from(new Set(postIds)).slice(0, LEDGER_EXPORT_POST_LIMIT);
  if (!ids.length) throw new Error('Choose at least one post to export.');
  const response = await fetch(OWNER_EXPORT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ postIds: ids }),
  });
  if (response.status === 429) {
    const body = record(await response.json().catch(() => ({})));
    throw new LedgerExportRefused(integer(body.remaining, LEDGER_EXPORT_DAY_READS));
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as CallableBody<unknown>;
    throw new Error(body.error?.message || 'The ledger export is unavailable.');
  }
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') ?? '';
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] || `poplur-ledger-${exportStamp()}.csv`;
  saveBlob(blob, filename);
  return { filename, bytes: blob.size };
}

/**
 * The owner-only loopback proxy listens to the private Firestore collections
 * with Admin credentials and emits only the callable's already-sanitized
 * dashboard shape. No credential or private document enters browser JS.
 */
export function subscribeOwnerDashboard(
  listener: (value: BetaDashboard) => void,
  onState: (state: 'connecting' | 'live' | 'offline') => void = () => {},
): () => void {
  let stopped = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  // The proxy's `retry:` hint is a floor under an exponential backoff
  // (1.5 → 3 → 6 → 12 → 15 s) that a frame carrying `result` resets, so a
  // proxy restart never turns every open desk into a reconnect storm.
  let retryHintMs = 0;
  let consecutiveFailures = 0;
  const reconnectDelay = () => Math.max(retryHintMs, Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** Math.max(0, consecutiveFailures - 1)));
  const connect = async () => {
    if (stopped) return;
    onState('connecting');
    controller = new AbortController();
    try {
      const response = await fetch(OWNER_LIVE, {
        headers: { accept: 'text/event-stream' },
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error('Live stream unavailable.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!stopped) {
        const { done, value } = await reader.read();
        if (done) throw new Error('Live stream closed.');
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          const lines = frame.split(/\r?\n/);
          for (const line of lines) {
            if (!line.startsWith('retry:')) continue;
            const hint = Number(line.slice(6).trim());
            if (Number.isFinite(hint) && hint >= 0) retryHintMs = Math.min(RECONNECT_HINT_MAX_MS, hint);
          }
          const data = lines
            .filter(line => line.startsWith('data:'))
            .map(line => line.slice(5).trim())
            .join('\n');
          if (!data) continue;
          const body = JSON.parse(data) as CallableBody<unknown>;
          if (!body.result) continue;
          consecutiveFailures = 0;
          listener(dashboard(body.result));
          onState('live');
        }
      }
    } catch {
      if (stopped) return;
      consecutiveFailures += 1;
      onState('offline');
      retryTimer = setTimeout(() => { void connect(); }, reconnectDelay());
    }
  };
  void connect();
  return () => {
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    controller?.abort();
  };
}

export async function submitBetaFeedback(input: { finding: string; liked: string; improve: string }): Promise<void> {
  await call<{ accepted?: boolean }>({ action: 'feedback', ...input });
}
