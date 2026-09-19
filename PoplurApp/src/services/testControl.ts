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
  presenceSource: 'lease' | 'heartbeat' | 'runner' | 'none';
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
    /** `nearMissPairs`: pairs within 2 × reach on never-pumped posts (§2.3) — the seedReach finding's input, no rule reads it. */
    opportunity: { pairs: number; nearMissPairs: number; postsWithAnyPair: number; realAccountsWithLocation: number };
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

// ── Daily algorithm reports (algorithm-reports-design.md §1, §5.2) ─────────
// These mirror the generator's exported types in
// functions-digest/src/algorithmReportPolicy.ts / algorithmReportRules.ts —
// the wire contract. Every figure arrives gated from the document; the page
// never divides and never invents confidence (§1.7, §2.5).

export type BetaReportKnobId = 'K1' | 'K2' | 'K3' | 'K4' | 'K5' | 'K6' | 'K7' | 'K8' | 'K9' | 'K10' | 'K11' | 'K12' | 'K13' | 'K14' | 'K15' | 'K16' | 'K17';
export type BetaReportVerdictKind = 'insufficient' | 'hold' | 'suggest' | 'verify';
export type BetaReportInsufficientReason = 'gate' | 'trial' | 'mixed-policy' | 'source-ahead' | 'drift' | 'unmeasured' | 'partial' | 'backfilled' | 'epoch-young' | 'kind-split-unavailable';
export type BetaReportHoldReason = 'in-range' | 'invariant-capped' | 'concentration' | 'conflicting-evidence' | 'reversal-guard' | 'open' | 'cool-down'
  | 'production-unverified' | 'deferred' | 'changed-recently' | 'owner-fixed' | 'paid' | 'simulation' | 'ui' | 'finding' | 'experiment-switch' | 'rank-only';
export type BetaReportReason = BetaReportInsufficientReason | BetaReportHoldReason | 'farm-bound';
export type BetaReportOutcome = 'adopted-in-source' | 'adopted-in-production' | 'changed-differently' | 'withdrawn' | 'open';
export type BetaReportDecisionKind = 'suggest' | 'verify' | 'none';
export type BetaReportVerdictCounts = { suggest: number; verify: number; hold: number; insufficient: number; fixed: number };
export type BetaReportTrialClass = 'trial' | 'normal' | null;

/** One row of the index document's `days` array (§1.8); the frame carries ≤ 60. */
export type BetaReportIndexRow = {
  day: string;
  generatedAtMillis: number;
  digestVersion: number;
  revision: number;
  partial: boolean;
  backfilled: boolean;
  catchUp: boolean;
  trialOn: boolean;
  trialMultiplier: number | null;
  decision: BetaReportDecisionKind;
  knob: BetaReportKnobId | null;
  to: number | null;
  counts: BetaReportVerdictCounts;
  productionEpoch: string;
  sourcePolicyVersion: string;
  bytes: number;
  /** An amendment refused because the rules changed since the day was written (§2.4). */
  staleData: boolean;
};

export type BetaReportIndex = {
  version: number;
  lastReportedDay: string | null;
  updatedAtMillis: number;
  runId: string;
  /** Newest first. */
  days: BetaReportIndexRow[];
};

/** A named gate (`Gate` shape P:1195 with the label the row prints). */
export type BetaReportGate = BetaAlgorithmGate & { id: string; label: string; note: string | null };

export type BetaReportEvidenceCell = {
  id: string;
  value: number | string | boolean | null;
  unit: string | null;
  n: number | null;
  numerator: number | null;
  denominator: number | null;
  label: string | null;
};

export type BetaReportSuggestion = {
  from: number;
  to: number;
  step: number;
  direction: 'lower' | 'raise';
  ruleId: string;
  rationale: string;
  respects: string[];
};

/** The K7 curves (`curveBlock`) in the desk's own line shape, plus the two
 *  cells the memo quotes ("1 km → 29.8 d today, → N d at 0.04"). */
export type BetaReportCurve = BetaAlgorithmCurveLine & { medianTesterPeakDays: number | null; linearFloorMeters: number | null };

export type BetaReportVerdictSummary = { verdict: BetaReportVerdictKind; reason: BetaReportReason; to: number | null };

export type BetaReportVerdict = {
  knob: BetaReportKnobId;
  name: string;
  tunable: boolean;
  declaredValue: number | null;
  unit: string | null;
  seenValue: number | null;
  seenN: number;
  seenBasis: string;
  /** = seenValue when seenN ≥ 30, else null (§1.5). */
  productionPays: number | null;
  where: string;
  deploy: string[];
  gates: BetaReportGate[];
  evidence: BetaReportEvidenceCell[];
  verdict: BetaReportVerdictKind;
  reason: BetaReportReason;
  reasonText: string;
  rule: { id: string; text: string; inputs: Record<string, number | string | boolean | null> } | null;
  arithmetic: string | null;
  suggestion: BetaReportSuggestion | null;
  deferred: { to: number; ruleId: string } | null;
  curveAtSuggested: BetaReportCurve | null;
  curveCurrent: BetaReportCurve | null;
  frozenUntilDay: string | null;
  previous: BetaReportVerdictSummary | null;
  outcome: BetaReportOutcome | null;
  outcomeNote: string | null;
  openSinceDay: string | null;
  withdrawnDay: string | null;
};

/** The six evidence-only findings (§1.5). Their fields differ per id, so the
 *  shared scalars are typed and the rest is kept as bounded records. */
export type BetaReportCheck = {
  id: string;
  status: string;
  basis: string | null;
  detail: string | null;
  note: string | null;
  text: string | null;
  direction: string | null;
  asOfCommit: string | null;
  /** `drift` only: per kind seen vs declared, all actor classes. */
  rows: Record<string, { seen: number | null; declared: number | null; n: number; status: string }>;
  verify: string[];
  awaitingDeploy: string[];
  /** Every other numeric field of the check (ceilingMeters, violations, atWorld, labelledEntries, pairs, …). */
  numbers: Record<string, number | null>;
  worst: { postId: string; radiusMeters: number; ratePerPassSeen: number } | null;
  claimsD30: BetaAlgorithmClaimStats | null;
};

export type BetaReportMetric = {
  id: string;
  value: number | null;
  unit: string;
  n: number | null;
  gate: BetaReportGate | null;
  window: string;
  population: string;
  basis: string;
  numerator: number | null;
  denominator: number | null;
};

export type BetaReportEpoch = {
  id: string;
  fromDay: string;
  toDay: string;
  days: number;
  signature: { grants: Record<string, number>; trial: BetaReportTrialClass; trialMultiplier: number | null };
  boundaryCause: 'grant' | 'trial' | 'window-start';
  movedFields: string[];
};

export type BetaReportSignature = { view: number | null; like: number | null; comment: number | null; dislike: number | null; repeatBase: number | null; seedSeen: number | null };

export type BetaReportKnobs = Omit<BetaAlgorithmDigest['knobs'], 'sourcePolicyVersion' | 'policySha256' | 'syncedAtMillis' | 'source'>;

export type BetaReportHeadline = {
  trialOnDay: boolean;
  trialMultiplierOnDay: number | null;
  switchAtRun: { enabled: boolean; multiplier: number | null };
  trialSinceMillis: number | null;
  boostedSinceMillis: number | null;
  trialSeenOnDay: number | null;
  trialClassOnDay: BetaReportTrialClass;
  trialShareD30: number | null;
  anchorsAtWorld: number;
  anchorsEver: number;
  worstAnchor: { postId: string; radiusMeters: number; ratePerPassSeen: number } | null;
  coverage: {
    complete: boolean;
    postsBehindHorizon: number;
    evicted: number;
    entriesFoldedOnDay: number;
    registeredPosts: { real: number; owner: number; review: number; official: number } | null;
    nonLivePollLagRuns: number;
    kindSplitSinceMillis: number | null;
    trimmed: boolean;
  };
  cost: { readsOnDay: number | null; runsOnDay: number | null; cadOnDay: number | null; monthlyCadProjected: number | null };
};

export type BetaReportDecision = {
  kind: BetaReportDecisionKind;
  knob: BetaReportKnobId | null;
  /** The one line of the SUGGESTION card — always "suggest …", never an imperative. */
  sentence: string;
  /** Literal: nothing is ever applied by a report. */
  appliedByReport: false;
  productionPays: { knob: BetaReportKnobId; value: number | null; n: number; basis: string } | null;
  action: { where: string; from: number; to: number; unit: string | null; deploy: string[] } | null;
  deferred: { knob: BetaReportKnobId; to: number; ruleId: string }[];
  open: { knob: BetaReportKnobId; to: number; ruleId: string; openSinceDay: string; outcome: BetaReportOutcome | null; missedReports: number }[];
  counts: BetaReportVerdictCounts;
  ownerQuestion: string | null;
};

export type BetaReportPolicy = {
  reportSchemaVersion: number;
  digestSchema: number;
  ruleSetVersion: string;
  digestVersion: number;
  runId: string;
  source: {
    knobs: BetaReportKnobs;
    knobsHash: string;
    sourcePolicyVersion: string;
    sourceSignature: BetaReportSignature;
    policySha256: string;
    identitySha256: string;
    syncedAtMillis: number;
    knobsStale: boolean;
    knobChangedDays: Record<string, string | null>;
    lastSyncDay: string;
    lastSyncNote: string;
  };
  production: {
    observedPolicy: { version: string; since: number; complete: boolean | null } | null;
    dayObservedPolicy: { version: string | null; earned: boolean };
    dayObservedSignature: BetaReportSignature & { n: number };
    rolling7dSignature: BetaReportSignature;
    observedPolicySpanned: { d7: string[]; d30: string[]; after: string[] | null; note: string };
    /** null (not false) while any signature field is null (§1.6). */
    sourceMatchesObserved: boolean | null;
  };
  decay: {
    switch: BetaAlgorithmDigest['switches']['decayTrial'];
    dueDecayEnabled: boolean;
    seenOnDay: { trialMultiplierSeen: number | null; byMode: BetaAlgorithmDecayModes; trialClass: BetaReportTrialClass };
    declaredRatePerDay: number;
    /** Always null: state holds no observed decay rate (decision 9). */
    observedRatePerDay: null;
    observedRateNote: string;
  };
  simulation: { simulationEnabled: boolean; runnerEnabled: boolean; dailySimulationEnabled: boolean; simulationOwnerUid: 'set' | 'unset' };
  productionEpoch: string;
};

export type BetaReportPrevious = {
  day: string;
  runId: string;
  revision: number;
  productionEpoch: string;
  sameEpoch: boolean;
  gap: boolean;
  changed: { id: string; from: number | null; to: number | null; delta: number | null; gateFlip: 'gained' | 'lost' | null }[];
  verdictChanges: { knob: BetaReportKnobId; from: BetaReportVerdictSummary; to: BetaReportVerdictSummary }[];
};

export type BetaReportObservedGrant = BetaAlgorithmObservedGrant;
export type BetaReportObserved = {
  grants: { view: BetaReportObservedGrant; repeat: BetaReportObservedGrant; like: BetaReportObservedGrant; dislike: BetaReportObservedGrant; comment: BetaReportObservedGrant };
  seedSeen: BetaReportObservedGrant;
  boostSeen: { meters: BetaReportObservedGrant; hours: BetaReportObservedGrant };
  sampleEntries: number;
  clamped: number;
  resync: number;
};

export type BetaReportWindow = BetaAlgorithmWindow & { spanned: string[] };
export type BetaReportWindowName = 'd1' | 'd7' | 'd30' | 'before' | 'after';

export type BetaReportPost = BetaAlgorithmPost & {
  dayGain: { gr: number; go: number; gv: number; gs: number; gu: number; dl: number; dlr: number; vc: number } | null;
  rk: { v: number; l: number; c: number; d: number } | null;
  realGainD30: number;
  lastRealAtMillis: number | null;
  ageBucketAtD: 'lt7d' | 'd7to30' | 'gt30d' | null;
};

export type BetaReportChannel = BetaAlgorithmChannel & { dayGainMeters: number; d30GainMeters: number };

export type BetaReportSnapshots = {
  seedRest: BetaAlgorithmDigest['seedRest'];
  claims: BetaAlgorithmDigest['claims'];
  contamination: BetaAlgorithmDigest['contamination'] & { d7: { simulationOwnerUid: 'set' | 'unset' } };
  intercept: BetaAlgorithmDigest['intercept'];
  anchors: BetaAlgorithmDigest['anchors'] & { atWorld: number };
  curve: BetaAlgorithmDigest['curve'];
  questions: BetaAlgorithmDigest['questions'];
  gaps: BetaAlgorithmGap[];
};

export type BetaReportEvidence = {
  /** The raw published day row (uid map already stripped), kept faithful for the days CSV. */
  day: Record<string, unknown>;
  dayTyped: BetaAlgorithmDay;
  windows: Record<BetaReportWindowName, BetaReportWindow | null>;
  /** The raw window blocks in the same faithful form (window-only columns intact). */
  windowsRaw: Partial<Record<BetaReportWindowName, Record<string, unknown>>>;
  daysRaw: Record<string, unknown>[];
  days: BetaAlgorithmDay[];
  observedOnDay: BetaReportObserved;
  observed7d: BetaReportObserved;
  posts: BetaReportPost[];
  channels: BetaReportChannel[];
  /** null on a backfilled day (decision 12). */
  snapshots: BetaReportSnapshots | null;
  metrics: Record<string, BetaReportMetric>;
};

export type BetaReportCsvColumns = { verdicts: string[]; metrics: string[]; days: string[]; posts: string[]; identityPrefix: string[] };

/** `testControl/algorithmReports/daily/{day}` (§1.2), normalised and bounded for the page. */
export type BetaAlgorithmReport = {
  version: 1;
  digestSchema: number;
  day: string;
  timeZone: string;
  dayStartMillis: number;
  dayEndMillis: number;
  runId: string;
  digestVersion: number;
  generatedAtMillis: number;
  revision: number;
  supersedes: { runId: string; generatedAtMillis: number; entriesOnDay: number } | null;
  partial: boolean;
  backfilled: boolean;
  catchUp: boolean;
  snapshotsAsOfMillis: number | null;
  productionEpoch: string;
  sourcePolicyVersion: string;
  knobsHash: string;
  ruleSetVersion: string;
  trialOnDay: boolean;
  trialMultiplierOnDay: number | null;
  primarySuggestion: BetaReportKnobId | null;
  verdictCounts: BetaReportVerdictCounts;
  bytes: number;
  firstLine: string;
  headline: BetaReportHeadline;
  decision: BetaReportDecision;
  policy: BetaReportPolicy;
  verdicts: BetaReportVerdict[];
  checks: BetaReportCheck[];
  previous: BetaReportPrevious | null;
  previousUnavailable: 'amendment' | 'reset' | 'first-report' | null;
  epochs: BetaReportEpoch[];
  csvColumns: BetaReportCsvColumns;
  evidence: BetaReportEvidence;
};

/** Why a report is null when a document exists: a foreign schema, the proxy's
 *  oversize marker, or an `evidence` string that does not parse. Never zeros. */
export type BetaReportRefusal = {
  reason: 'unsupported-version' | 'oversize' | 'evidence';
  version: number | null;
  digestVersion: number | null;
  day: string | null;
  revision: number | null;
};

export type BetaDashboard = {
  generatedAtMs: number;
  /** Null until the hourly digest has published, or when it was refused
   *  (then `algorithmRefusal` says why — the page never renders zeros). */
  algorithm: BetaAlgorithmDigest | null;
  algorithmRefusal: BetaAlgorithmRefusal | null;
  /** The report index the proxy watches (§5.1): ≤ 60 rows on the frame, never a body. */
  reports: BetaReportIndex | null;
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
    presenceSource: row.presenceSource === 'lease' || row.presenceSource === 'heartbeat' || row.presenceSource === 'runner' ? row.presenceSource : 'none',
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
const curveLine = (value: unknown, decayPerDay = 0): BetaAlgorithmCurveLine => {
  const line = record(value);
  // The digest publishes the line's multiplier, not its rate; derive the rate
  // from the knob so the page never prints "−0.0 %/day" for a real line.
  const multiplier = nullable(line.multiplier, 100);
  const ratePerDay = line.ratePerDay !== undefined ? fraction(line.ratePerDay) : Math.min(1, decayPerDay * (multiplier ?? 1));
  const raw = line.daysToFloor;
  const points = (Array.isArray(raw)
    ? raw.map(point => { const row = record(point); return [row.startMeters ?? row.meters ?? row.organic, row.days] as const; })
    : Object.entries(record(raw)))
    .map(([start, days]) => ({ startMeters: meters(start), days: metric(days, 100_000) }))
    .filter(point => point.startMeters > 0)
    .sort((left, right) => left.startMeters - right.startMeters)
    .slice(0, 8);
  return {
    ratePerDay,
    multiplier,
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

/** The 15 synced knob values (P:76-81); the digest adds its stamp fields, the report's policy prints them bare. */
const knobNumbers = (value: unknown): BetaReportKnobs => {
  const knobs = record(value);
  return {
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
  };
};

const decayTrialSwitch = (value: unknown): BetaAlgorithmDigest['switches']['decayTrial'] => {
  const trial = value && typeof value === 'object' ? record(value) : null;
  return trial ? {
    enabled: trial.enabled === true,
    multiplier: metric(trial.multiplier, 100),
    scope: text(trial.scope, 32),
    effectiveAtMillis: timeMs(trial.effectiveAtMillis),
    boostedEffectiveAtMillis: timeMs(trial.boostedEffectiveAtMillis),
  } : null;
};

// The snapshot blocks the digest publishes and the report copies as of its
// writing run (§1.7 `snapshots`): one normaliser each, shared by both.
const seedRestBlock = (value: unknown): BetaAlgorithmDigest['seedRest'] => {
  const seedRest = record(value);
  return {
    ...seedRestCounts(seedRest),
    valid: seedRest.valid === true,
    claimShareMedian: nullable(seedRest.claimShareMedian, 1_000_000),
    peakOverClaim: percentiles(seedRest.peakOverClaim, 1_000_000),
    timeToPeakHours: percentiles(seedRest.timeToPeakHours, 1_000_000),
    owner: seedRestCounts(seedRest.owner),
  };
};

const claimsBlock = (value: unknown): BetaAlgorithmDigest['claims'] => {
  const claims = record(record(value).d30);
  return { d30: { ...claimStats(claims), owner: claimStats(claims.owner) } };
};

const contaminationBlock = (value: unknown): BetaAlgorithmDigest['contamination'] => {
  const contamination = record(record(value).d7);
  return {
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
  };
};

const interceptBlock = (value: unknown): BetaAlgorithmDigest['intercept'] => {
  const intercept = record(value);
  const realized = record(intercept.realized);
  const opportunity = record(intercept.opportunity);
  return {
    realized: { entries: integer(realized.entries, 10_000_000), distinctPosts: integer(realized.distinctPosts), distinctActors: integer(realized.distinctActors) },
    opportunity: {
      pairs: integer(opportunity.pairs, 10_000_000),
      nearMissPairs: integer(opportunity.nearMissPairs, 10_000_000),
      postsWithAnyPair: integer(opportunity.postsWithAnyPair),
      realAccountsWithLocation: integer(opportunity.realAccountsWithLocation),
    },
  };
};

const anchorsBlock = (value: unknown): BetaAlgorithmDigest['anchors'] => {
  const anchors = record(value);
  return {
    worldMeters: meters(anchors.worldMeters) || WORLD_METERS,
    everAtWorld: integer(anchors.everAtWorld),
    rows: list(anchors.rows, anchorRow, DIGEST_BOUNDS.anchors),
  };
};

const curveStats = (value: unknown, decayPerDay: number): BetaAlgorithmDigest['curve'] => {
  const curve = record(value);
  return {
    passMinutes: integer(curve.passMinutes, 1_440) || 60,
    normal: curveLine(curve.normal, decayPerDay),
    normal65: curveLine(curve.normal65, decayPerDay),
    trial: curve.trial && typeof curve.trial === 'object' ? curveLine(curve.trial, decayPerDay) : null,
    stress: { halfLifeHours: metric(record(curve.stress).halfLifeHours, 100_000) },
  };
};

const questionsBlock = (value: unknown, gates: BetaAlgorithmDigest['gates']): BetaAlgorithmDigest['questions'] => {
  const questions = record(value);
  return {
    c: digestGate(questions.c, gates.minEvents),
    d: digestGate(questions.d, gates.minPosts),
    f: digestGate(questions.f, gates.minPosts),
    h: digestGate(questions.h, gates.minChannelPosts),
    i: digestGate(questions.i, gates.minPosts),
  };
};

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
  const decayPerDay = fraction(knobs.decayPerDay);
  const observedPolicy = record(digest.observedPolicy);
  const observed = record(digest.observed);
  const grants = record(observed.grants);
  const boostSeen = record(observed.boostSeen);
  const switches = record(digest.switches);
  const gates = record(digest.gates);
  const minEvents = integer(gates.minEvents, 10_000) || 30;
  const minPosts = integer(gates.minPosts, 10_000) || 8;
  const minChannelPosts = integer(gates.minChannelPosts, 10_000) || 5;
  const minActors = integer(gates.minActors, 10_000) || 2;
  const windows = record(digest.windows);
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
      ...knobNumbers(knobs),
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
      decayTrial: decayTrialSwitch(switches.decayTrial),
      dueDecayEnabled: switches.dueDecayEnabled === true,
      sampledAtMillis: timeMs(switches.sampledAtMillis),
    },
    gates: { minEvents, minPosts, minChannelPosts, minActors },
    windows: { d7: windowStats(windows.d7), d30: windowStats(windows.d30) },
    // Oldest first in the document; an over-long list keeps its newest days.
    days: list(digest.days, dayStat, 400).slice(-DIGEST_BOUNDS.days),
    channels: list(digest.channels, channelStat, DIGEST_BOUNDS.channels),
    posts: list(digest.posts, postSummary, DIGEST_BOUNDS.posts),
    anchors: anchorsBlock(digest.anchors),
    seedRest: seedRestBlock(digest.seedRest),
    claims: claimsBlock(digest.claims),
    contamination: contaminationBlock(digest.contamination),
    intercept: interceptBlock(digest.intercept),
    curve: curveStats(digest.curve, decayPerDay),
    questions: questionsBlock(digest.questions, { minEvents, minPosts, minChannelPosts, minActors }),
    gaps: list(digest.gaps, digestGap, DIGEST_BOUNDS.gaps),
  };
};

// ── Daily algorithm reports: normalisers (§5.2) ─────────────────────────────

export const REPORT_SCHEMA_VERSION = 1;
/** The brief's post gate (P:29): a rate over fewer tester posts is null on the page whatever the document says. */
const REPORT_MIN_POSTS = 8;
/** Gprod's floor (RULES.gates.minObserved): production is "seen paying" a grant only at n ≥ 30. */
const REPORT_MIN_OBSERVED = 30;
export const REPORT_BOUNDS = {
  indexRows: 120, frameRows: 60, verdicts: 24, checks: 8, days: 30, posts: 50, channels: 13, metrics: 200, epochs: 8,
  gates: 12, evidence: 32, deploy: 8, respects: 8, deferred: 8, open: 1, changed: 200, verdictChanges: 24, inputs: 32, columns: 400,
  /** An `evidence` string past this is refused, never zero-filled (the generator's own field limit). */
  evidenceBytes: 1_048_576,
} as const;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const KNOB_IDS: readonly BetaReportKnobId[] = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7', 'K8', 'K9', 'K10', 'K11', 'K12', 'K13', 'K14', 'K15', 'K16', 'K17'];
const KNOB_ID_SET = new Set<string>(KNOB_IDS);
const VERDICT_KINDS = new Set<string>(['insufficient', 'hold', 'suggest', 'verify']);
const REASONS = new Set<string>([
  'gate', 'trial', 'mixed-policy', 'source-ahead', 'drift', 'unmeasured', 'partial', 'backfilled', 'epoch-young', 'kind-split-unavailable',
  'in-range', 'invariant-capped', 'concentration', 'conflicting-evidence', 'reversal-guard', 'open', 'cool-down', 'production-unverified', 'deferred',
  'changed-recently', 'owner-fixed', 'paid', 'simulation', 'ui', 'finding', 'experiment-switch', 'rank-only', 'farm-bound',
]);
/** `fixed` in verdictCounts = hold rows with one of these reasons (§1.2, refuter 19). */
const FIXED_REASONS = new Set<string>(['owner-fixed', 'paid', 'ui', 'simulation', 'rank-only', 'finding', 'experiment-switch']);
const OUTCOMES = new Set<string>(['adopted-in-source', 'adopted-in-production', 'changed-differently', 'withdrawn', 'open']);
const WINDOW_NAMES: readonly BetaReportWindowName[] = ['d1', 'd7', 'd30', 'before', 'after'];

const dayKeyOrNull = (value: unknown): string | null => {
  const day = text(value, 10);
  return DAY_PATTERN.test(day) ? day : null;
};
const nullableInteger = (value: unknown, maximum = 1_000_000_000): number | null => {
  const parsed = nullable(value, maximum);
  return parsed === null ? null : Math.round(parsed);
};
/** A report value of any unit (metres, counts, ratios, CAD, days): signed, finite, bounded. */
const reportNumber = (value: unknown): number | null => nullable(value, 1e15, true);
const textList = (value: unknown, limit: number, maximum = 200): string[] => Array.isArray(value)
  ? value.map(item => text(item, maximum)).filter(Boolean).slice(0, limit)
  : [];
const knobId = (value: unknown): BetaReportKnobId | null => {
  const id = text(value, 4);
  return KNOB_ID_SET.has(id) ? id as BetaReportKnobId : null;
};
const trialClassOf = (value: unknown): BetaReportTrialClass => value === 'trial' || value === 'normal' ? value : null;

const RAW_BOUNDS = { depth: 6, keys: 160, items: 64, text: 160 } as const;
/** A raw block kept for the CSV path (§4.2 flattens the published day rows
 *  faithfully): bounded depth, keys and items, finite numbers, and the
 *  state-only uid map dropped at any level — the identity discipline of
 *  decision 8 holds on the page even if a document ever carried it. */
const rawValue = (value: unknown, depth = 0): unknown => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.slice(0, RAW_BOUNDS.text);
  if (depth >= RAW_BOUNDS.depth) return null;
  if (Array.isArray(value)) return value.slice(0, RAW_BOUNDS.items).map(item => rawValue(item, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>).slice(0, RAW_BOUNDS.keys)) {
      if (key === 'realActorEntries') continue;
      out[key] = key === 'simulationOwnerUid' ? (typeof child === 'string' && child && child !== 'unset' ? 'set' : 'unset') : rawValue(child, depth + 1);
    }
    return out;
  }
  return null;
};
const rawRecord = (value: unknown): Record<string, unknown> => rawValue(record(value)) as Record<string, unknown>;

const reportGate = (value: unknown): BetaReportGate | null => {
  const gate = record(value);
  const id = text(gate.id, 24);
  if (!id) return null;
  // `sufficient` comes from the document alone (digestGate: a missing gate is never sufficient).
  return { ...digestGate(gate, 0), id, label: text(gate.label, 240), note: text(gate.note, 200) || null };
};

const evidenceCell = (value: unknown): BetaReportEvidenceCell | null => {
  const cell = record(value);
  const id = text(cell.id, 64);
  if (!id) return null;
  const raw = cell.value;
  return {
    id,
    value: typeof raw === 'number' ? (Number.isFinite(raw) ? raw : null) : typeof raw === 'boolean' ? raw : typeof raw === 'string' ? text(raw, 160) : null,
    unit: text(cell.unit, 24) || null,
    n: nullableInteger(cell.n),
    numerator: reportNumber(cell.numerator),
    denominator: reportNumber(cell.denominator),
    label: text(cell.label, 200) || null,
  };
};

const reportCurve = (value: unknown, ratePerDay: number): BetaReportCurve | null => {
  if (!value || typeof value !== 'object') return null;
  const block = record(value);
  return {
    ...curveLine(block, ratePerDay),
    medianTesterPeakDays: nullable(record(block.daysToFloor).medianTesterPeak, 100_000),
    linearFloorMeters: nullableMeters(block.linearFloorMeters),
  };
};

const verdictSummary = (value: unknown): BetaReportVerdictSummary | null => {
  const row = record(value);
  const verdict = text(row.verdict, 16);
  const reason = text(row.reason, 32);
  if (!VERDICT_KINDS.has(verdict) || !REASONS.has(reason)) return null;
  return { verdict: verdict as BetaReportVerdictKind, reason: reason as BetaReportReason, to: reportNumber(row.to) };
};

const reportSuggestion = (value: unknown): BetaReportSuggestion | null => {
  const row = record(value);
  const from = reportNumber(row.from);
  const to = reportNumber(row.to);
  const step = reportNumber(row.step);
  const direction = row.direction === 'lower' || row.direction === 'raise' ? row.direction : null;
  if (from === null || to === null || step === null || !direction) return null;
  return { from, to, step, direction, ruleId: text(row.ruleId, 16), rationale: text(row.rationale, 400), respects: textList(row.respects, REPORT_BOUNDS.respects) };
};

/**
 * One knob's verdict (§1.5). Defence in depth (§1.5, §5.2): `sufficient` is
 * taken only from the document's gates, and a suggestion arriving under an
 * insufficient gate — or on a row whose verdict is not `suggest`, or on a
 * knob the catalogue marks untunable (§2.6) — is normalised to
 * `insufficient/gate` with `suggestion: null`. The generator excludes
 * `Gprod` from its own check; the page reads every gate, the conservative
 * side (§2.5 `pre(K)` names `Gprod` in admissibility, and no generator path
 * emits a suggest with it insufficient).
 */
const reportVerdict = (value: unknown): BetaReportVerdict | null => {
  const row = record(value);
  const knob = knobId(row.knob);
  if (!knob) return null;
  const tunable = row.tunable === true;
  const gates = list(row.gates, reportGate, REPORT_BOUNDS.gates);
  const seenValue = reportNumber(row.seenValue);
  const seenN = integer(row.seenN, 10_000_000);
  const rule = record(row.rule);
  const declaredValue = reportNumber(row.declaredValue);
  let verdict = text(row.verdict, 16);
  let reason = text(row.reason, 32);
  let reasonText = text(row.reasonText, 400);
  let suggestion = reportSuggestion(row.suggestion);
  let deferred = row.deferred && typeof row.deferred === 'object' && reportNumber(record(row.deferred).to) !== null
    ? { to: reportNumber(record(row.deferred).to) as number, ruleId: text(record(row.deferred).ruleId, 16) }
    : null;
  const allSufficient = gates.every(gate => gate.sufficient);
  const failing = gates.find(gate => !gate.sufficient) ?? null;
  const demote = (why: string) => {
    suggestion = null;
    deferred = null;
    verdict = 'insufficient';
    reason = 'gate';
    reasonText = failing ? `insufficient evidence — n = ${failing.n} · needs ${failing.minN} (${failing.id}) · ${why}` : `insufficient evidence — ${why}`;
  };
  if (!VERDICT_KINDS.has(verdict) || !REASONS.has(reason)) demote('unknown verdict shape dropped by the desk');
  else if (suggestion && (verdict !== 'suggest' || !allSufficient || !tunable)) demote('a suggestion arrived under an insufficient gate and was dropped by the desk');
  else if (verdict === 'suggest' && !suggestion) demote('a suggest verdict without a suggestion was dropped by the desk');
  // A deferred value is a number of the knob's kind too: it stands only on a hold/deferred row whose gates all passed.
  if (deferred && !(verdict === 'hold' && reason === 'deferred' && allSufficient && tunable)) deferred = null;
  const inputs: Record<string, number | string | boolean | null> = {};
  for (const [key, input] of Object.entries(record(rule.inputs)).slice(0, REPORT_BOUNDS.inputs)) {
    const name = text(key, 64);
    if (name) inputs[name] = typeof input === 'number' ? (Number.isFinite(input) ? input : null) : typeof input === 'boolean' ? input : typeof input === 'string' ? text(input, 120) : null;
  }
  const previous = verdictSummary(row.previous);
  const outcome = text(row.outcome, 32);
  return {
    knob,
    name: text(row.name, 64),
    tunable,
    declaredValue,
    unit: text(row.unit, 12) || null,
    seenValue,
    seenN,
    seenBasis: text(row.seenBasis, 120),
    // Never "production pays X" below the observation floor, whatever the document printed.
    productionPays: seenN >= REPORT_MIN_OBSERVED ? seenValue : null,
    where: text(row.where, 300),
    deploy: textList(row.deploy, REPORT_BOUNDS.deploy, 120),
    gates,
    evidence: list(row.evidence, evidenceCell, REPORT_BOUNDS.evidence),
    verdict: verdict as BetaReportVerdictKind,
    reason: reason as BetaReportReason,
    reasonText,
    rule: text(rule.id, 16) ? { id: text(rule.id, 16), text: text(rule.text, 400), inputs } : null,
    arithmetic: text(row.arithmetic, 600) || null,
    suggestion,
    deferred,
    curveAtSuggested: suggestion ? reportCurve(row.curveAtSuggested, suggestion.to) : null,
    curveCurrent: reportCurve(row.curveCurrent, declaredValue ?? 0),
    frozenUntilDay: dayKeyOrNull(row.frozenUntilDay),
    previous,
    outcome: OUTCOMES.has(outcome) ? outcome as BetaReportOutcome : null,
    outcomeNote: text(row.outcomeNote, 200) || null,
    openSinceDay: dayKeyOrNull(row.openSinceDay),
    withdrawnDay: dayKeyOrNull(row.withdrawnDay),
  };
};

/** The five counts from the normalised rows — a document whose counts
 *  disagree with its verdicts is malformed, so the rows are the truth. */
const verdictCountsOf = (verdicts: BetaReportVerdict[]): BetaReportVerdictCounts => {
  const counts: BetaReportVerdictCounts = { suggest: 0, verify: 0, hold: 0, insufficient: 0, fixed: 0 };
  for (const row of verdicts) {
    if (row.verdict === 'hold') counts[FIXED_REASONS.has(row.reason) ? 'fixed' : 'hold'] += 1;
    else counts[row.verdict] += 1;
  }
  return counts;
};

const CHECK_TEXT_KEYS = new Set(['id', 'status', 'basis', 'detail', 'note', 'text', 'direction', 'asOfCommit', 'rows', 'verify', 'awaitingDeploy', 'worst', 'claimsD30']);
const reportCheck = (value: unknown): BetaReportCheck | null => {
  const check = record(value);
  const id = text(check.id, 24);
  if (!id) return null;
  const rows: BetaReportCheck['rows'] = {};
  for (const [kind, entry] of Object.entries(record(check.rows)).slice(0, 8)) {
    const row = record(entry);
    const key = text(kind, 16);
    if (key) rows[key] = { seen: nullableMeters(row.seen), declared: nullableMeters(row.declared), n: integer(row.n, 10_000_000), status: text(row.status, 24) };
  }
  const numbers: Record<string, number | null> = {};
  for (const [key, field] of Object.entries(check)) {
    if (CHECK_TEXT_KEYS.has(key) || (typeof field !== 'number' && field !== null)) continue;
    const name = text(key, 40);
    if (name) numbers[name] = reportNumber(field);
  }
  const worst = record(check.worst);
  const claims = check.claimsD30 && typeof check.claimsD30 === 'object' ? claimStats(check.claimsD30) : null;
  return {
    id,
    status: text(check.status, 24),
    basis: text(check.basis, 200) || null,
    detail: text(check.detail, 400) || null,
    note: text(check.note, 200) || null,
    text: text(check.text, 400) || null,
    direction: text(check.direction, 200) || null,
    asOfCommit: text(check.asOfCommit, 16) || null,
    rows,
    verify: textList(check.verify, 8, 120),
    awaitingDeploy: textList(check.awaitingDeploy, 8, 24),
    numbers,
    worst: text(worst.postId, 120) ? { postId: text(worst.postId, 120), radiusMeters: meters(worst.radiusMeters), ratePerPassSeen: fraction(worst.ratePerPassSeen) } : null,
    claimsD30: claims,
  };
};

/** A metric row (§1.7): counts and metre sums keep their value with `n`; a
 *  derived ratio or rate is null below its gate — in the document already,
 *  and again here so no ungated rate can reach the page or a CSV. */
const reportMetric = (value: unknown): BetaReportMetric | null => {
  const row = record(value);
  const id = text(row.id, 64);
  if (!id) return null;
  const gate = reportGate(row.gate);
  const unit = text(row.unit, 24);
  const derived = unit === 'ratio' || unit.includes('/');
  return {
    id,
    value: gate && !gate.sufficient && derived ? null : reportNumber(row.value),
    unit,
    n: nullableInteger(row.n),
    gate,
    window: text(row.window, 16),
    population: text(row.population, 24),
    basis: text(row.basis, 200),
    numerator: reportNumber(row.numerator),
    denominator: reportNumber(row.denominator),
  };
};

const reportEpoch = (value: unknown): BetaReportEpoch | null => {
  const epoch = record(value);
  const id = text(epoch.id, 16);
  const fromDay = dayKeyOrNull(epoch.fromDay);
  const toDay = dayKeyOrNull(epoch.toDay);
  if (!id || !fromDay || !toDay) return null;
  const signature = record(epoch.signature);
  const cause = text(epoch.boundaryCause, 16);
  return {
    id,
    fromDay,
    toDay,
    days: integer(epoch.days, 400),
    signature: { grants: metricRecord(signature.grants), trial: trialClassOf(signature.trial), trialMultiplier: nullable(signature.trialMultiplier, 100) },
    boundaryCause: cause === 'grant' || cause === 'trial' ? cause : 'window-start',
    movedFields: textList(epoch.movedFields, 8, 24),
  };
};

const signatureOf = (value: unknown): BetaReportSignature => {
  const sig = record(value);
  return { view: nullableMeters(sig.view), like: nullableMeters(sig.like), comment: nullableMeters(sig.comment), dislike: nullableMeters(sig.dislike), repeatBase: nullableMeters(sig.repeatBase), seedSeen: nullableMeters(sig.seedSeen) };
};

const observedBlock = (value: unknown): BetaReportObserved => {
  const block = record(value);
  const grants = record(block.grants);
  const boost = record(block.boostSeen);
  return {
    grants: { view: observedGrant(grants.view), repeat: observedGrant(grants.repeat), like: observedGrant(grants.like), dislike: observedGrant(grants.dislike), comment: observedGrant(grants.comment) },
    seedSeen: observedGrant(block.seedSeen),
    boostSeen: { meters: observedGrant(boost.meters), hours: observedGrant(boost.hours) },
    sampleEntries: integer(block.sampleEntries, 10_000_000),
    clamped: integer(block.clamped, 10_000_000),
    resync: integer(block.resync, 10_000_000),
  };
};

/** A report window: the digest's window shape plus the report's own epoch
 *  ids, with every rate re-gated on the page (refuter 21). */
const reportWindow = (value: unknown): BetaReportWindow => {
  const stats = windowStats(value);
  const gateRates = (net: BetaAlgorithmNet) => {
    for (const bucket of [net.byAge.lt7d, net.byAge.d7to30, net.byAge.gt30d, net.all]) if (bucket.posts < REPORT_MIN_POSTS) bucket.perPostDay = null;
  };
  gateRates(stats.netReal);
  gateRates(stats.netOwner);
  if (stats.viewWorth.cleanPosts < REPORT_MIN_POSTS) stats.viewWorth.views = null;
  return { ...stats, spanned: textList(record(value).spanned, 16, 16) };
};

const typedDay = (raw: Record<string, unknown>, fallbackDay: string): BetaAlgorithmDay => dayStat(raw) ?? dayStat({ ...raw, day: fallbackDay }) as BetaAlgorithmDay;

const reportPost = (value: unknown): BetaReportPost | null => {
  const post = postSummary(value);
  if (!post) return null;
  const row = record(value);
  const gain = row.dayGain && typeof row.dayGain === 'object' ? record(row.dayGain) : null;
  const kinds = row.rk && typeof row.rk === 'object' ? record(row.rk) : null;
  const bucket = text(row.ageBucketAtD, 8);
  return {
    ...post,
    dayGain: gain ? { gr: signedMeters(gain.gr), go: signedMeters(gain.go), gv: signedMeters(gain.gv), gs: signedMeters(gain.gs), gu: signedMeters(gain.gu), dl: signedMeters(gain.dl), dlr: signedMeters(gain.dlr), vc: integer(gain.vc, 1_000_000_000) } : null,
    rk: kinds ? { v: integer(kinds.v, 10_000_000), l: integer(kinds.l, 10_000_000), c: integer(kinds.c, 10_000_000), d: integer(kinds.d, 10_000_000) } : null,
    realGainD30: signedMeters(row.realGainD30),
    lastRealAtMillis: nullableTime(row.lastRealAtMillis),
    ageBucketAtD: bucket === 'lt7d' || bucket === 'd7to30' || bucket === 'gt30d' ? bucket : null,
  };
};

const reportChannel = (value: unknown): BetaReportChannel | null => {
  const channel = channelStat(value);
  if (!channel) return null;
  const row = record(value);
  return { ...channel, dayGainMeters: signedMeters(row.dayGainMeters), d30GainMeters: signedMeters(row.d30GainMeters) };
};

const reportSnapshots = (value: unknown, decayPerDay: number): BetaReportSnapshots | null => {
  if (!value || typeof value !== 'object') return null;
  const snapshots = record(value);
  const contamination = contaminationBlock(snapshots.contamination);
  const anchors = record(snapshots.anchors);
  const uid = record(record(snapshots.contamination).d7).simulationOwnerUid;
  return {
    seedRest: seedRestBlock(snapshots.seedRest),
    claims: claimsBlock(snapshots.claims),
    // The owner uid never reaches the page: the generator masks it (decision 8) and this repeats the mask.
    contamination: { d7: { ...contamination.d7, simulationOwnerUid: typeof uid === 'string' && uid && uid !== 'unset' ? 'set' : 'unset' } },
    intercept: interceptBlock(snapshots.intercept),
    anchors: { ...anchorsBlock(snapshots.anchors), atWorld: integer(anchors.atWorld) },
    curve: curveStats(snapshots.curve, decayPerDay),
    questions: questionsBlock(snapshots.questions, { minEvents: 30, minPosts: 8, minChannelPosts: 5, minActors: 2 }),
    gaps: list(snapshots.gaps, digestGap, DIGEST_BOUNDS.gaps),
  };
};

const columnList = (value: unknown): string[] => textList(value, REPORT_BOUNDS.columns, 120)
  // No uid column can exist (publishedDay strips the map, test 20); refuse the key if a document ever carried it.
  .filter(column => !column.startsWith('realActorEntries'));

/** The schema version a report document declares, or null when nothing is published. */
export const algorithmReportVersion = (value: unknown): number | null => {
  if (!value || typeof value !== 'object') return null;
  const version = record(value).version;
  return typeof version === 'number' && Number.isFinite(version) ? version : 0;
};

/** The parsed `evidence` block: the document stores it as one JSON string
 *  (§1.7); the proxy may forward it parsed. Null when it does not parse or
 *  is over the field limit — a refusal, never zeros. */
const reportEvidenceRaw = (value: unknown): Record<string, unknown> | null => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string' || !value || value.length > REPORT_BOUNDS.evidenceBytes) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
};

/** The proxy forwards a refused report as `{version, unsupportedVersion}` or
 *  `{version, day, oversize}`; an `evidence` field that does not parse is a
 *  refusal here as well (`algorithmDigestRefusal` pattern). */
export const algorithmReportRefusal = (value: unknown): BetaReportRefusal | null => {
  const version = algorithmReportVersion(value);
  if (version === null) return null;
  const raw = record(value);
  const identity = {
    digestVersion: typeof raw.digestVersion === 'number' && Number.isFinite(raw.digestVersion) ? integer(raw.digestVersion, 1_000_000_000) : null,
    day: dayKeyOrNull(raw.day),
    revision: typeof raw.revision === 'number' && Number.isFinite(raw.revision) ? integer(raw.revision, 1_000_000) : null,
  };
  if (version !== REPORT_SCHEMA_VERSION || raw.unsupportedVersion === true) return { reason: 'unsupported-version', version: version || null, ...identity };
  if (raw.oversize === true) return { reason: 'oversize', version, ...identity };
  if (!reportEvidenceRaw(raw.evidence)) return { reason: 'evidence', version, ...identity };
  return null;
};

/**
 * Normalises one report document for the page: a foreign schema, the oversize
 * marker or an unparsable `evidence` yields null (the page says why, never
 * zeros); arrays are sliced to the published bounds; every metre is clamped
 * to the world; gates come only from the document; a suggestion under an
 * insufficient gate is dropped and the decision card reconciled with it —
 * while a card restating an EARLIER open suggestion (decision 15) keeps its
 * knob whatever the row's verdict says today.
 */
export const algorithmReport = (value: unknown): BetaAlgorithmReport | null => {
  if (algorithmReportVersion(value) !== REPORT_SCHEMA_VERSION || algorithmReportRefusal(value)) return null;
  const doc = record(value);
  const raw = reportEvidenceRaw(doc.evidence) as Record<string, unknown>;
  const day = dayKeyOrNull(doc.day);
  if (!day) return null;
  const verdicts = list(doc.verdicts, reportVerdict, REPORT_BOUNDS.verdicts);
  const counts = verdictCountsOf(verdicts);

  // Decision (§1.4), reconciled with the normalised rows. The card keeps its
  // knob in exactly two cases, the proxy normaliser's rule (§5.1
  // `restatedOpen`): (a) the row still carries the suggestion the action
  // names — the opening day; or (b) `open[]` restates a suggestion opened on
  // an EARLIER day for that knob at the same `to` — the sticky primary of
  // decision 15 / §2.5 R3, which the generator emits on every report until
  // adoption or withdrawal while the row itself is `hold/open`,
  // `insufficient/trial` (an open K7 under the trial) or `adopted-in-source`
  // with Gprod false (awaiting its deploy): restated, never re-derived, so
  // the card never alternates SUGGEST → NO SUGGESTION. Neither → a malformed
  // card, demoted to `none`.
  const decisionRaw = record(doc.decision);
  const pays = record(decisionRaw.productionPays);
  const action = record(decisionRaw.action);
  const paysKnob = knobId(pays.knob);
  const paysN = integer(pays.n, 10_000_000);
  let kind: BetaReportDecisionKind = decisionRaw.kind === 'suggest' || decisionRaw.kind === 'verify' ? decisionRaw.kind : 'none';
  let knob = kind === 'suggest' ? knobId(decisionRaw.knob) : null;
  let sentence = text(decisionRaw.sentence, 800);
  let open = list(decisionRaw.open, item => {
    const row = record(item);
    const id = knobId(row.knob);
    const to = reportNumber(row.to);
    const openSinceDay = dayKeyOrNull(row.openSinceDay);
    const outcome = text(row.outcome, 32);
    return id && to !== null && openSinceDay ? { knob: id, to, ruleId: text(row.ruleId, 16), openSinceDay, outcome: OUTCOMES.has(outcome) ? outcome as BetaReportOutcome : null, missedReports: integer(row.missedReports, 1_000) } : null;
  }, REPORT_BOUNDS.open);
  const primary = knob ? verdicts.find(row => row.knob === knob) ?? null : null;
  const suggestion = primary?.verdict === 'suggest' ? primary.suggestion : null;
  const actionFrom = reportNumber(action.from);
  const actionTo = reportNumber(action.to);
  const ownSuggestion = !!suggestion && actionFrom === suggestion.from && actionTo === suggestion.to;
  // An entry opened THIS day is the row's own suggestion listed on the card, never a restatement.
  const restatedOpen = !!primary && actionFrom !== null && actionTo !== null && open.some(item => item.knob === knob && item.openSinceDay < day && item.to === actionTo);
  if (kind === 'suggest' && !ownSuggestion && !restatedOpen) {
    const failing = primary?.gates.find(gate => !gate.sufficient) ?? null;
    sentence = failing
      ? `NO SUGGESTION TODAY. The document's suggestion${knob ? ` for ${knob}` : ''} arrived under an insufficient gate (${failing.id} ${failing.n}/${failing.minN}) and was dropped by the desk. Nothing is applied by this report.`
      : `NO SUGGESTION TODAY. The document named ${knob ?? 'no knob'} but that row carries no admissible suggestion and no earlier open suggestion restates it — dropped by the desk. Nothing is applied by this report.`;
    // The same-day open entry for the dropped knob is that row's suggestion and goes with it (the proxy's rule too).
    open = open.filter(item => !(item.knob === knob && item.openSinceDay === day));
    kind = 'none';
    knob = null;
  }
  const decision: BetaReportDecision = {
    kind,
    knob,
    sentence,
    appliedByReport: false,
    productionPays: paysKnob ? { knob: paysKnob, value: paysN >= REPORT_MIN_OBSERVED ? reportNumber(pays.value) : null, n: paysN, basis: text(pays.basis, 120) } : null,
    // A kept card always has both numbers: on the opening day they equal the row's suggestion, and when
    // restated they are the opening values (`declaredValue` has already moved once adopted in source).
    action: kind === 'suggest' && actionFrom !== null && actionTo !== null
      ? { where: text(action.where, 300), from: actionFrom, to: actionTo, unit: text(action.unit, 12) || null, deploy: textList(action.deploy, REPORT_BOUNDS.deploy, 120) }
      : null,
    deferred: list(decisionRaw.deferred, item => {
      const row = record(item);
      const id = knobId(row.knob);
      const to = reportNumber(row.to);
      const held = id ? verdicts.find(verdict => verdict.knob === id) : null;
      return id && to !== null && held?.verdict === 'hold' && held.reason === 'deferred' ? { knob: id, to, ruleId: text(row.ruleId, 16) } : null;
    }, REPORT_BOUNDS.deferred),
    open,
    counts,
    ownerQuestion: text(decisionRaw.ownerQuestion, 300) || null,
  };

  const headline = record(doc.headline);
  const switchAtRun = record(headline.switchAtRun);
  const worst = record(headline.worstAnchor);
  const coverage = record(headline.coverage);
  const registered = coverage.registeredPosts && typeof coverage.registeredPosts === 'object' ? record(coverage.registeredPosts) : null;
  const cost = record(headline.cost);
  const policy = record(doc.policy);
  const source = record(policy.source);
  const production = record(policy.production);
  const observedPolicy = production.observedPolicy && typeof production.observedPolicy === 'object' ? record(production.observedPolicy) : null;
  const dayObservedPolicy = record(production.dayObservedPolicy);
  const spanned = record(production.observedPolicySpanned);
  const decay = record(policy.decay);
  const seenOnDay = record(decay.seenOnDay);
  const byMode = record(seenOnDay.byMode);
  const simulation = record(policy.simulation);
  const knobs = knobNumbers(source.knobs);
  const knobChangedDays: Record<string, string | null> = {};
  for (const [key, changed] of Object.entries(record(source.knobChangedDays)).slice(0, 32)) {
    const name = text(key, 40);
    if (name) knobChangedDays[name] = dayKeyOrNull(changed);
  }
  const previousRaw = doc.previous && typeof doc.previous === 'object' ? record(doc.previous) : null;
  const previous: BetaReportPrevious | null = previousRaw && dayKeyOrNull(previousRaw.day) ? {
    day: dayKeyOrNull(previousRaw.day) as string,
    runId: text(previousRaw.runId, 80),
    revision: integer(previousRaw.revision, 1_000_000) || 1,
    productionEpoch: text(previousRaw.productionEpoch, 16),
    sameEpoch: previousRaw.sameEpoch === true,
    gap: previousRaw.gap === true,
    changed: list(previousRaw.changed, item => {
      const row = record(item);
      const id = text(row.id, 64);
      return id ? { id, from: reportNumber(row.from), to: reportNumber(row.to), delta: reportNumber(row.delta), gateFlip: row.gateFlip === 'gained' || row.gateFlip === 'lost' ? row.gateFlip : null } : null;
    }, REPORT_BOUNDS.changed),
    verdictChanges: list(previousRaw.verdictChanges, item => {
      const row = record(item);
      const id = knobId(row.knob);
      const from = verdictSummary(row.from);
      const to = verdictSummary(row.to);
      return id && from && to ? { knob: id, from, to } : null;
    }, REPORT_BOUNDS.verdictChanges),
  } : null;
  const unavailable = text(doc.previousUnavailable, 16);
  const supersedes = doc.supersedes && typeof doc.supersedes === 'object' ? record(doc.supersedes) : null;

  // Evidence (§1.7): raw day rows for the CSV, typed rows for rendering.
  const dayRaw = rawRecord(raw.day);
  const windowsRaw = record(raw.windows);
  const windows = {} as Record<BetaReportWindowName, BetaReportWindow | null>;
  const windowsKept: Partial<Record<BetaReportWindowName, Record<string, unknown>>> = {};
  for (const name of WINDOW_NAMES) {
    const block = windowsRaw[name];
    windows[name] = block && typeof block === 'object' ? reportWindow(block) : null;
    if (block && typeof block === 'object') windowsKept[name] = rawRecord(block);
  }
  const daysRaw = (Array.isArray(raw.days) ? raw.days : [])
    .map(row => rawRecord(row))
    .filter(row => dayKeyOrNull(row.day) !== null)
    .sort((left, right) => String(left.day).localeCompare(String(right.day)))
    .slice(-REPORT_BOUNDS.days);
  const metrics: Record<string, BetaReportMetric> = {};
  for (const entry of Object.values(record(raw.metrics)).slice(0, REPORT_BOUNDS.metrics)) {
    const row = reportMetric(entry);
    if (row) metrics[row.id] = row;
  }
  const columns = record(doc.csvColumns);

  return {
    version: REPORT_SCHEMA_VERSION,
    digestSchema: integer(doc.digestSchema, 1_000),
    day,
    timeZone: text(doc.timeZone, 64) || 'America/Toronto',
    dayStartMillis: timeMs(doc.dayStartMillis),
    dayEndMillis: timeMs(doc.dayEndMillis),
    runId: text(doc.runId, 80),
    digestVersion: integer(doc.digestVersion, 1_000_000_000),
    generatedAtMillis: timeMs(doc.generatedAtMillis),
    revision: integer(doc.revision, 1_000_000) || 1,
    supersedes: supersedes ? { runId: text(supersedes.runId, 80), generatedAtMillis: timeMs(supersedes.generatedAtMillis), entriesOnDay: integer(supersedes.entriesOnDay, 10_000_000) } : null,
    partial: doc.partial === true,
    backfilled: doc.backfilled === true,
    catchUp: doc.catchUp === true,
    snapshotsAsOfMillis: nullableTime(doc.snapshotsAsOfMillis),
    productionEpoch: text(doc.productionEpoch, 16),
    sourcePolicyVersion: text(doc.sourcePolicyVersion, 16),
    knobsHash: text(doc.knobsHash, 16),
    ruleSetVersion: text(doc.ruleSetVersion, 16),
    trialOnDay: doc.trialOnDay === true,
    trialMultiplierOnDay: nullable(doc.trialMultiplierOnDay, 100),
    primarySuggestion: decision.kind === 'suggest' ? decision.knob : null,
    verdictCounts: counts,
    bytes: integer(doc.bytes, 100_000_000),
    firstLine: text(doc.firstLine, 600),
    headline: {
      trialOnDay: headline.trialOnDay === true,
      trialMultiplierOnDay: nullable(headline.trialMultiplierOnDay, 100),
      switchAtRun: { enabled: switchAtRun.enabled === true, multiplier: nullable(switchAtRun.multiplier, 100) },
      trialSinceMillis: nullableTime(headline.trialSinceMillis),
      boostedSinceMillis: nullableTime(headline.boostedSinceMillis),
      trialSeenOnDay: nullable(headline.trialSeenOnDay, 100),
      trialClassOnDay: trialClassOf(headline.trialClassOnDay),
      trialShareD30: nullable(headline.trialShareD30, 1),
      anchorsAtWorld: integer(headline.anchorsAtWorld),
      anchorsEver: integer(headline.anchorsEver),
      worstAnchor: text(worst.postId, 120) ? { postId: text(worst.postId, 120), radiusMeters: meters(worst.radiusMeters), ratePerPassSeen: fraction(worst.ratePerPassSeen) } : null,
      coverage: {
        complete: coverage.complete === true,
        postsBehindHorizon: integer(coverage.postsBehindHorizon),
        evicted: integer(coverage.evicted),
        entriesFoldedOnDay: integer(coverage.entriesFoldedOnDay, 10_000_000),
        registeredPosts: registered ? { real: integer(registered.real), owner: integer(registered.owner), review: integer(registered.review), official: integer(registered.official) } : null,
        nonLivePollLagRuns: integer(coverage.nonLivePollLagRuns, 1_000),
        kindSplitSinceMillis: nullable(coverage.kindSplitSinceMillis, Number.MAX_SAFE_INTEGER),
        trimmed: coverage.trimmed === true,
      },
      cost: { readsOnDay: nullableInteger(cost.readsOnDay), runsOnDay: nullableInteger(cost.runsOnDay, 100_000), cadOnDay: nullable(cost.cadOnDay, 1_000_000), monthlyCadProjected: nullable(cost.monthlyCadProjected, 1_000_000) },
    },
    decision,
    policy: {
      reportSchemaVersion: integer(policy.reportSchemaVersion, 1_000),
      digestSchema: integer(policy.digestSchema, 1_000),
      ruleSetVersion: text(policy.ruleSetVersion, 16),
      digestVersion: integer(policy.digestVersion, 1_000_000_000),
      runId: text(policy.runId, 80),
      source: {
        knobs,
        knobsHash: text(source.knobsHash, 16),
        sourcePolicyVersion: text(source.sourcePolicyVersion, 16),
        sourceSignature: signatureOf(source.sourceSignature),
        policySha256: text(source.policySha256, 64),
        identitySha256: text(source.identitySha256, 64),
        syncedAtMillis: timeMs(source.syncedAtMillis),
        knobsStale: source.knobsStale === true,
        knobChangedDays,
        lastSyncDay: dayKeyOrNull(source.lastSyncDay) ?? '',
        lastSyncNote: text(source.lastSyncNote, 120),
      },
      production: {
        observedPolicy: observedPolicy ? { version: text(observedPolicy.version, 16), since: timeMs(observedPolicy.since), complete: typeof observedPolicy.complete === 'boolean' ? observedPolicy.complete : null } : null,
        dayObservedPolicy: { version: text(dayObservedPolicy.version, 16) || null, earned: dayObservedPolicy.earned === true },
        dayObservedSignature: { ...signatureOf(production.dayObservedSignature), n: integer(record(production.dayObservedSignature).n, 10_000_000) },
        rolling7dSignature: signatureOf(production.rolling7dSignature),
        observedPolicySpanned: {
          d7: textList(spanned.d7, DIGEST_BOUNDS.policyVersions, 16),
          d30: textList(spanned.d30, DIGEST_BOUNDS.policyVersions, 16),
          after: Array.isArray(spanned.after) ? textList(spanned.after, DIGEST_BOUNDS.policyVersions, 16) : null,
          note: text(spanned.note, 200),
        },
        sourceMatchesObserved: production.sourceMatchesObserved === true ? true : production.sourceMatchesObserved === false ? false : null,
      },
      decay: {
        switch: decayTrialSwitch(decay.switch),
        dueDecayEnabled: decay.dueDecayEnabled === true,
        seenOnDay: {
          trialMultiplierSeen: nullable(seenOnDay.trialMultiplierSeen, 100),
          byMode: { normal: meters(byMode.normal), trial: meters(byMode.trial), stress: meters(byMode.stress), undetermined: meters(byMode.undetermined) },
          trialClass: trialClassOf(seenOnDay.trialClass),
        },
        declaredRatePerDay: fraction(decay.declaredRatePerDay),
        observedRatePerDay: null,
        observedRateNote: text(decay.observedRateNote, 200),
      },
      simulation: {
        simulationEnabled: simulation.simulationEnabled === true,
        runnerEnabled: simulation.runnerEnabled === true,
        dailySimulationEnabled: simulation.dailySimulationEnabled === true,
        // Never the uid itself, whatever the document carries (decision 8).
        simulationOwnerUid: typeof simulation.simulationOwnerUid === 'string' && simulation.simulationOwnerUid && simulation.simulationOwnerUid !== 'unset' ? 'set' : 'unset',
      },
      productionEpoch: text(policy.productionEpoch, 16),
    },
    verdicts,
    checks: list(doc.checks, reportCheck, REPORT_BOUNDS.checks),
    previous,
    previousUnavailable: unavailable === 'amendment' || unavailable === 'reset' || unavailable === 'first-report' ? unavailable : null,
    epochs: list(doc.epochs, reportEpoch, REPORT_BOUNDS.epochs),
    csvColumns: {
      verdicts: columnList(columns.verdicts),
      metrics: columnList(columns.metrics),
      days: columnList(columns.days),
      posts: columnList(columns.posts),
      identityPrefix: columnList(columns.identityPrefix),
    },
    evidence: {
      day: dayRaw,
      dayTyped: typedDay(dayRaw, day),
      windows,
      windowsRaw: windowsKept,
      daysRaw,
      days: daysRaw.map(row => typedDay(row, day)),
      observedOnDay: observedBlock(raw.observedOnDay),
      observed7d: observedBlock(raw.observed7d),
      posts: list(raw.posts, reportPost, REPORT_BOUNDS.posts),
      channels: list(raw.channels, reportChannel, REPORT_BOUNDS.channels),
      snapshots: reportSnapshots(raw.snapshots, knobs.decayPerDay),
      metrics,
    },
  };
};

const reportIndexRow = (value: unknown): BetaReportIndexRow | null => {
  const row = record(value);
  const day = dayKeyOrNull(row.day);
  if (!day) return null;
  const counts = record(row.counts);
  return {
    day,
    generatedAtMillis: timeMs(row.generatedAtMillis),
    digestVersion: integer(row.digestVersion, 1_000_000_000),
    revision: integer(row.revision, 1_000_000) || 1,
    partial: row.partial === true,
    backfilled: row.backfilled === true,
    catchUp: row.catchUp === true,
    trialOn: row.trialOn === true,
    trialMultiplier: nullable(row.trialMultiplier, 100),
    decision: row.decision === 'suggest' || row.decision === 'verify' ? row.decision : 'none',
    knob: row.decision === 'suggest' ? knobId(row.knob) : null,
    to: row.decision === 'suggest' ? reportNumber(row.to) : null,
    counts: { suggest: integer(counts.suggest, 100), verify: integer(counts.verify, 100), hold: integer(counts.hold, 100), insufficient: integer(counts.insufficient, 100), fixed: integer(counts.fixed, 100) },
    productionEpoch: text(row.productionEpoch, 16),
    sourcePolicyVersion: text(row.sourcePolicyVersion, 16),
    bytes: integer(row.bytes, 100_000_000),
    staleData: row.staleData === true,
  };
};

/** The index document `testControl/algorithmReports` (§1.8) or the frame's
 *  copy of it: rows typed, deduplicated by day, newest first, ≤ 120. */
export const reportIndex = (value: unknown): BetaReportIndex | null => {
  if (!value || typeof value !== 'object') return null;
  const index = record(value);
  const seen = new Set<string>();
  const days = list(index.days, reportIndexRow, 10_000)
    .filter(row => !seen.has(row.day) && seen.add(row.day))
    .sort((left, right) => right.day.localeCompare(left.day))
    .slice(0, REPORT_BOUNDS.indexRows);
  return {
    version: integer(index.version, 1_000),
    lastReportedDay: dayKeyOrNull(index.lastReportedDay) ?? days[0]?.day ?? null,
    updatedAtMillis: timeMs(index.updatedAtMillis),
    runId: text(index.runId, 80),
    days,
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
    reports: result.reports ? reportIndex(result.reports) : null,
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

/** RFC 4180 quoting with the proxy's formula guard (scripts/algorithm-digest-policy.mjs
 *  `csvCell`): a text cell a spreadsheet would read as a formula — leading
 *  `= + @ TAB CR`, or a `-` that does not start a number — gets a leading
 *  apostrophe. Numbers and booleans are emitted bare (`true`/`false`). */
export const csvCell = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  let cell = typeof value === 'string' ? value : JSON.stringify(value) ?? '';
  if (/^[=+@\t\r]/.test(cell) || (/^-/.test(cell) && !/^-?\d/.test(cell))) cell = `'${cell}`;
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
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

// ── Daily algorithm reports: readers (§5.1–§5.2) ────────────────────────────

const OWNER_REPORTS = 'http://127.0.0.1:8096/api/reports';

/** The proxy's 429: a report body costs 1 read through the same 25k/day ledger budget as the export. */
export class ReportReadRefused extends Error {
  readonly remaining: number;
  constructor(remaining: number) {
    super(`The proxy refused the report: only ${remaining.toLocaleString()} reads are left in today's budget.`);
    this.remaining = remaining;
  }
}

export type ReportRead = {
  report: BetaAlgorithmReport | null;
  refusal: BetaReportRefusal | null;
  /** From `x-poplur-ledger-reads`: 0 when the proxy served its cache. */
  reads: number;
};

const unwrapResult = (body: unknown): unknown => {
  const wrapped = record(body);
  return wrapped.result && typeof wrapped.result === 'object' ? wrapped.result : body;
};

/** One report body by day: GET through `fetch` (which sends the Origin header
 *  the proxy's lock requires). 404 → null; 429 → `ReportReadRefused`. 1 read
 *  the first time a `day@revision` is opened, 0 thereafter (proxy cache). */
export async function readReport(day: string): Promise<ReportRead | null> {
  if (!DAY_PATTERN.test(day)) throw new Error('A report day is YYYY-MM-DD.');
  const response = await fetch(`${OWNER_REPORTS}/${day}`, { headers: { accept: 'application/json' } });
  if (response.status === 404) return null;
  if (response.status === 429) {
    const body = record(await response.json().catch(() => ({})));
    throw new ReportReadRefused(integer(body.remaining, LEDGER_EXPORT_DAY_READS));
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as CallableBody<unknown>;
    throw new Error(body.error?.message || 'The report is unavailable.');
  }
  const raw = unwrapResult(await response.json());
  const report = algorithmReport(raw);
  return { report, refusal: report ? null : algorithmReportRefusal(raw), reads: integer(response.headers.get('x-poplur-ledger-reads') ?? 0, 1_000) };
}

/** The index the proxy watches (0 reads once its watcher has delivered). */
export async function readReportIndex(): Promise<BetaReportIndex | null> {
  const response = await fetch(OWNER_REPORTS, { headers: { accept: 'application/json' } });
  if (response.status === 404) return null;
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as CallableBody<unknown>;
    throw new Error(body.error?.message || 'The report index is unavailable.');
  }
  return reportIndex(unwrapResult(await response.json()));
}

export type ReportRangeEstimate = { reports: number; reads: number; cad: number; leftToday: number };

/** `EXPORT RANGE · metrics`: each listed day not already in the route cache is one read (§4.2). */
export const estimateReportRange = (days: string[], cachedDays: Iterable<string>): ReportRangeEstimate => {
  const cached = new Set(cachedDays);
  const wanted = Array.from(new Set(days.filter(day => DAY_PATTERN.test(day))));
  const reads = wanted.filter(day => !cached.has(day)).length;
  return { reports: wanted.length, reads, cad: reads * FIRESTORE_CAD_PER_READ, leftToday: Math.max(0, LEDGER_EXPORT_DAY_READS - reads) };
};

// ── Daily algorithm reports: pure page helpers (§3.1, §3.3, §3.5) ───────────

export const REPORT_TIME_ZONE = 'America/Toronto';
/** The report for D lands at 00:45 Toronto of D+1 at the scheduler's phase (§2.1). */
export const REPORT_EXPECTED_AT = '00:45';
/** From this Toronto hour on, a missing report for yesterday is an alarm (decision 21). */
export const REPORT_STALE_AFTER_HOUR = 2;
const KNOB_SHORT: Record<BetaReportKnobId, string> = {
  K1: 'first view', K2: 'like', K3: 'comment', K4: 'dislike', K5: 'repeat base', K6: 'repeat interval', K7: 'decay', K8: 'dust floor', K9: 'seed floor',
  K10: 'claim ceiling', K11: 'slider step', K12: 'boost default', K13: 'world ceiling', K14: 'trial switch', K15: 'stress t½', K16: 'feed weights', K17: 'sim shape',
};

/** `Sep 12` from a `YYYY-MM-DD` key, zone-free (the key already is the Toronto day). */
export const reportDayLabel = (day: string): string => {
  const [, month, date] = day.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return month >= 1 && month <= 12 && date >= 1 ? `${months[month - 1]} ${date}` : day;
};

/** A knob value as the memo prints it: metres with a thousands separator, the decay rate per day. */
export const reportKnobValue = (knob: BetaReportKnobId | null, value: number | null): string => {
  if (value === null) return '—';
  if (knob === 'K7') return `${value} /day`;
  return `${value.toLocaleString('en-CA')} m`;
};

const dayPlus = (day: string, days: number): string => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10);
};

/** The zone's day key and hour for an instant (`en-CA` prints `YYYY-MM-DD`). */
const zonedParts = (now: number, timeZone: string): { day: string; hour: number } => {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now));
    const part = (type: string) => parts.find(item => item.type === type)?.value ?? '';
    const day = `${part('year')}-${part('month')}-${part('day')}`;
    return { day: DAY_PATTERN.test(day) ? day : new Date(now).toISOString().slice(0, 10), hour: Number(part('hour')) || 0 };
  } catch {
    const date = new Date(now);
    return { day: date.toISOString().slice(0, 10), hour: date.getUTCHours() };
  }
};

/** The chips no reader may miss (decision 20), identical in list, document, PDF and CSV. */
export const reportChips = (row: { revision: number; partial: boolean; backfilled: boolean; catchUp: boolean; trialOn: boolean; trialMultiplier: number | null; staleData?: boolean }): string[] => {
  const chips: string[] = [];
  if (row.trialOn) chips.push(`TRIAL ×${row.trialMultiplier ?? '?'}`);
  if (row.revision > 1) chips.push(`REV ${row.revision}`);
  if (row.backfilled) chips.push('BACKFILL');
  if (row.catchUp) chips.push('CATCH-UP');
  if (row.partial) chips.push('PARTIAL');
  if (row.staleData) chips.push('STALE DATA');
  return chips;
};

export const reportChipsOf = (report: BetaAlgorithmReport): string[] => reportChips({
  revision: report.revision, partial: report.partial, backfilled: report.backfilled, catchUp: report.catchUp, trialOn: report.trialOnDay, trialMultiplier: report.trialMultiplierOnDay,
});

export type ReportsStatus = { text: string; caption: string; tone: 'live' | 'warn' | 'off' };

/**
 * The Reports tab's status in the `labStatus` shape (§3.1): the newest row's
 * day and its decision in the verb form (`suggests …`, never an imperative,
 * never "applied"), the trial chip while it ran, and the operational alarm
 * `stale — expected 00:45` when the newest day is behind what the hourly
 * digest should have written by now (yesterday from 02:00 Toronto on; the
 * day before that earlier in the night, when yesterday's is not yet due).
 */
export const reportsStatus = (index: BetaReportIndex | null, now = Date.now(), timeZone = REPORT_TIME_ZONE): ReportsStatus => {
  const newest = index?.days[0] ?? null;
  if (!newest) return { text: 'no reports yet · written by the hourly digest at the first complete run after Toronto midnight', caption: 'none yet', tone: 'off' };
  const { day: today, hour } = zonedParts(now, timeZone);
  const expected = dayPlus(today, hour >= REPORT_STALE_AFTER_HOUR ? -1 : -2);
  const stale = newest.day < expected;
  const label = reportDayLabel(newest.day);
  const head = newest.decision === 'verify' ? { text: 'VERIFY drift', tone: 'warn' as const }
    : newest.decision === 'suggest' && newest.knob ? { text: `suggests ${newest.knob} ${KNOB_SHORT[newest.knob]} → ${reportKnobValue(newest.knob, newest.to)}`, tone: 'warn' as const }
      : newest.trialOn ? { text: `TRIAL ×${newest.trialMultiplier ?? '?'}`, tone: 'warn' as const }
        : { text: 'no suggestion', tone: 'off' as const };
  const chips = reportChips(newest).filter(chip => !chip.startsWith('TRIAL'));
  const detail = [`${newest.counts.insufficient} insufficient`, `${newest.counts.fixed} fixed`, ...chips];
  const alarm = `stale — expected ${REPORT_EXPECTED_AT}`;
  return {
    text: `${label} · ${head.text} · ${detail.join(' · ')}${stale ? ` · ${alarm} (newest ${newest.day})` : ''}`,
    caption: stale ? alarm : `${label} · ${head.text}`,
    tone: stale ? 'warn' : head.tone,
  };
};

export type BetaReportStamp = {
  day: string; revision: number; digestVersion: number; generatedAtMillis: number; productionEpoch: string; sourcePolicyVersion: string;
  knobsHash: string; ruleSetVersion: string; trialOnDay: boolean; trialMultiplierOnDay: number | null; chips: string[];
};
export type BetaReportMetricCompare = {
  id: string; unit: string; window: string; population: string;
  a: BetaReportMetric | null; b: BetaReportMetric | null;
  /** b − a, null when either side is null (the page never invents a number). */
  delta: number | null;
  /** A gate flip renders as its own chip so a number appearing is never read as a number moving. */
  gateFlip: 'gained' | 'lost' | null;
  presence: 'both' | 'a' | 'b';
};
export type BetaReportVerdictCompare = { knob: BetaReportKnobId; name: string; a: (BetaReportVerdictSummary & { reasonText: string }) | null; b: (BetaReportVerdictSummary & { reasonText: string }) | null; changed: boolean };
export type BetaReportComparison = {
  /** Two schemas cannot be compared: the `algorithmDigestRefusal` grammar. */
  refusal: { reason: 'unsupported-version'; version: number | null; digestVersion: number | null } | null;
  a: BetaReportStamp; b: BetaReportStamp;
  /** The stamp fields that differ — non-empty means "a difference is a change of policy, not of behaviour; compare epochs, not days". */
  policyChanged: ('productionEpoch' | 'knobsHash' | 'ruleSetVersion')[];
  verdicts: BetaReportVerdictCompare[];
  metrics: BetaReportMetricCompare[];
};

const reportStamp = (report: BetaAlgorithmReport): BetaReportStamp => ({
  day: report.day, revision: report.revision, digestVersion: report.digestVersion, generatedAtMillis: report.generatedAtMillis, productionEpoch: report.productionEpoch,
  sourcePolicyVersion: report.sourcePolicyVersion, knobsHash: report.knobsHash, ruleSetVersion: report.ruleSetVersion, trialOnDay: report.trialOnDay,
  trialMultiplierOnDay: report.trialMultiplierOnDay, chips: reportChipsOf(report),
});
const verdictTo = (row: BetaReportVerdict): number | null => row.suggestion?.to ?? row.deferred?.to ?? null;

/** Two reports side by side (§3.5): the same metric ids with deltas and gate
 *  flips, the verdict table per knob, and the policy stamp differences.
 *  Pure and client-side; both inputs are already normalised. */
export const compareReports = (a: BetaAlgorithmReport, b: BetaAlgorithmReport): BetaReportComparison => {
  const stamps = { a: reportStamp(a), b: reportStamp(b) };
  if (a.version !== b.version || a.digestSchema !== b.digestSchema) {
    return { refusal: { reason: 'unsupported-version', version: b.version, digestVersion: b.digestSchema }, ...stamps, policyChanged: [], verdicts: [], metrics: [] };
  }
  const policyChanged = (['productionEpoch', 'knobsHash', 'ruleSetVersion'] as const).filter(key => a[key] !== b[key]);
  const summary = (row: BetaReportVerdict | undefined) => row ? { verdict: row.verdict, reason: row.reason, to: verdictTo(row), reasonText: row.reasonText } : null;
  const knobs = [...a.verdicts.map(row => row.knob), ...b.verdicts.map(row => row.knob)].filter((knob, index, all) => all.indexOf(knob) === index);
  const verdicts = knobs.map(knob => {
    const left = a.verdicts.find(row => row.knob === knob);
    const right = b.verdicts.find(row => row.knob === knob);
    const av = summary(left);
    const bv = summary(right);
    return { knob, name: right?.name ?? left?.name ?? '', a: av, b: bv, changed: !av || !bv || av.verdict !== bv.verdict || av.reason !== bv.reason || av.to !== bv.to };
  });
  const ids = [...Object.keys(a.evidence.metrics), ...Object.keys(b.evidence.metrics)].filter((id, index, all) => all.indexOf(id) === index);
  const metrics = ids.map((id): BetaReportMetricCompare => {
    const left = a.evidence.metrics[id] ?? null;
    const right = b.evidence.metrics[id] ?? null;
    const both = !!left && !!right;
    const flipped = both && left.gate && right.gate && left.gate.sufficient !== right.gate.sufficient;
    return {
      id,
      unit: right?.unit ?? left?.unit ?? '',
      window: right?.window ?? left?.window ?? '',
      population: right?.population ?? left?.population ?? '',
      a: left,
      b: right,
      delta: left?.value != null && right?.value != null ? Math.round((right.value - left.value) * 10_000) / 10_000 : null,
      gateFlip: flipped ? (right.gate?.sufficient ? 'gained' : 'lost') : null,
      presence: both ? 'both' : left ? 'a' : 'b',
    };
  });
  return { refusal: null, ...stamps, policyChanged, verdicts, metrics };
};

// ── Daily algorithm reports: fixed-column CSVs, client-side, 0 reads (§4.2) ─

/** The identity prefix every report CSV row begins with (the generator's `CSV_IDENTITY_PREFIX`). */
export const REPORT_CSV_IDENTITY_PREFIX: readonly string[] = Object.freeze([
  'reportDay', 'reportRunId', 'reportRevision', 'reportSchemaVersion', 'productionEpoch', 'sourcePolicyVersion', 'knobsHash', 'ruleSetVersion',
  'trialOnDay', 'trialMultiplierOnDay', 'trialSeenOnDay', 'sourceMatchesObserved', 'partial', 'backfilled', 'catchUp', 'coverageComplete', 'appliedByReport',
  'productionPaysKnob', 'productionPaysValue', 'firstLine',
]);
/** The generator's column lists, used only when a document ships none (the document's copy wins). */
const REPORT_VERDICTS_CSV_COLUMNS: readonly string[] = Object.freeze([
  'knob', 'name', 'tunable', 'declaredValue', 'unit', 'seenValue', 'seenN', 'seenBasis', 'productionPays', 'verdict', 'reason', 'reasonText', 'ruleId', 'direction',
  'from', 'to', 'step', 'arithmetic', 'gateIds', 'gateN', 'gateMinN', 'gateSufficient', 'evidenceIds', 'respects', 'where', 'deploy', 'previousVerdict', 'previousTo',
  'outcome', 'openSinceDay', 'withdrawnDay', 'frozenUntilDay',
]);
const REPORT_METRICS_CSV_COLUMNS: readonly string[] = Object.freeze([
  'id', 'window', 'population', 'unit', 'value', 'n', 'numerator', 'denominator', 'gate.n', 'gate.minN', 'gate.sufficient', 'gate.basis', 'previous.from', 'previous.delta', 'previous.gateFlip',
]);
const REPORT_POSTS_CSV_COLUMNS: readonly string[] = Object.freeze([
  'postId', 'cls', 'ownerClass', 'channelId', 'createdAtMillis', 'seedMeters', 'currentMeters', 'organicMeters', 'boostMeters', 'peakMeters', 'peakAtMillis', 'entries',
  'realGain', 'ownerGain', 'reviewGain', 'syntheticGain', 'unknownGain', 'decayLoss', 'decayLossRealShare', 'decayModeSeen', 'clean', 'viewCount', 'firstRealEngagementAtMillis',
  'lastAtMillis', 'lastCause', 'atClaim', 'expired', 'deletedAtMillis', 'day', 'gr', 'go', 'gv', 'gs', 'gu', 'dl', 'dlr', 'vc', 'realGainD30', 'rkView', 'rkLike', 'rkComment',
  'rkDislike', 'lastRealAtMillis', 'ageBucketAtD',
]);
const WINDOW_ONLY_COLUMNS = ['netReal.', 'netOwner.', 'viewWorth.', 'spanned', 'observedPolicySpanned', 'days'];

/** Exactly `columns`, in order, whatever the rows carry: no dynamic column
 *  discovery, so column order never depends on which report is exported first. */
export const csvFixed = (columns: readonly string[], rows: Record<string, unknown>[]): string => [
  columns.map(csvCell).join(','),
  ...rows.map(row => columns.map(column => csvCell(row[column])).join(',')),
].join('\r\n');

/** Dotted cells for a raw block: nested numbers become plain columns, arrays join with `|` (objects inside as JSON). */
const flattenCells = (value: unknown, prefix = '', into: Record<string, unknown> = {}): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) flattenCells(child, prefix ? `${prefix}.${key}` : key, into);
  } else if (Array.isArray(value)) {
    into[prefix] = value.map(item => (item && typeof item === 'object' ? JSON.stringify(item) : String(item))).join('|');
  } else {
    into[prefix] = value;
  }
  return into;
};
const joined = (values: unknown[]): string => values.map(item => (item === null || item === undefined ? '' : String(item))).join('|');

/** The identity cells of one report — `appliedByReport` is the literal false. */
export const reportIdentity = (report: BetaAlgorithmReport): Record<string, unknown> => ({
  reportDay: report.day,
  reportRunId: report.runId,
  reportRevision: report.revision,
  reportSchemaVersion: report.version,
  productionEpoch: report.productionEpoch,
  sourcePolicyVersion: report.sourcePolicyVersion,
  knobsHash: report.knobsHash,
  ruleSetVersion: report.ruleSetVersion,
  trialOnDay: report.trialOnDay,
  trialMultiplierOnDay: report.trialMultiplierOnDay,
  trialSeenOnDay: report.headline.trialSeenOnDay,
  sourceMatchesObserved: report.policy.production.sourceMatchesObserved,
  partial: report.partial,
  backfilled: report.backfilled,
  catchUp: report.catchUp,
  coverageComplete: report.headline.coverage.complete,
  appliedByReport: false,
  productionPaysKnob: report.decision.productionPays?.knob ?? null,
  productionPaysValue: report.decision.productionPays?.value ?? null,
  firstLine: report.firstLine,
});
const identityColumns = (report: BetaAlgorithmReport): string[] => report.csvColumns.identityPrefix.length ? report.csvColumns.identityPrefix : [...REPORT_CSV_IDENTITY_PREFIX];
const tableColumns = (report: BetaAlgorithmReport, table: 'verdicts' | 'metrics' | 'posts'): string[] => {
  const shipped = report.csvColumns[table];
  if (shipped.length) return shipped;
  return [...(table === 'verdicts' ? REPORT_VERDICTS_CSV_COLUMNS : table === 'metrics' ? REPORT_METRICS_CSV_COLUMNS : REPORT_POSTS_CSV_COLUMNS)];
};
const withIdentity = (report: BetaAlgorithmReport, columns: string[]): string[] => [...identityColumns(report), ...columns];

const verdictCells = (row: BetaReportVerdict): Record<string, unknown> => ({
  knob: row.knob,
  name: row.name,
  tunable: row.tunable,
  declaredValue: row.declaredValue,
  unit: row.unit,
  seenValue: row.seenValue,
  seenN: row.seenN,
  seenBasis: row.seenBasis,
  productionPays: row.productionPays,
  verdict: row.verdict,
  reason: row.reason,
  reasonText: row.reasonText,
  ruleId: row.suggestion?.ruleId ?? row.deferred?.ruleId ?? row.rule?.id ?? null,
  direction: row.suggestion?.direction ?? null,
  from: row.suggestion?.from ?? null,
  to: verdictTo(row),
  step: row.suggestion?.step ?? null,
  arithmetic: row.arithmetic,
  gateIds: joined(row.gates.map(gate => gate.id)),
  gateN: joined(row.gates.map(gate => gate.n)),
  gateMinN: joined(row.gates.map(gate => gate.minN)),
  gateSufficient: joined(row.gates.map(gate => gate.sufficient)),
  evidenceIds: joined(row.evidence.map(cell => cell.id)),
  respects: joined(row.suggestion?.respects ?? []),
  where: row.where,
  deploy: joined(row.deploy),
  previousVerdict: row.previous ? `${row.previous.verdict}/${row.previous.reason}` : null,
  previousTo: row.previous?.to ?? null,
  outcome: row.outcome,
  openSinceDay: row.openSinceDay,
  withdrawnDay: row.withdrawnDay,
  frozenUntilDay: row.frozenUntilDay,
});

const metricCells = (report: BetaAlgorithmReport, metric: BetaReportMetric): Record<string, unknown> => {
  const previous = report.previous?.changed.find(change => change.id === metric.id) ?? null;
  return {
    id: metric.id,
    window: metric.window,
    population: metric.population,
    unit: metric.unit,
    value: metric.value,
    n: metric.n,
    numerator: metric.numerator,
    denominator: metric.denominator,
    'gate.n': metric.gate?.n ?? null,
    'gate.minN': metric.gate?.minN ?? null,
    'gate.sufficient': metric.gate?.sufficient ?? null,
    'gate.basis': metric.gate?.basis ?? null,
    'previous.from': previous?.from ?? null,
    'previous.delta': previous?.delta ?? null,
    'previous.gateFlip': previous?.gateFlip ?? null,
  };
};

const postCells = (report: BetaAlgorithmReport, post: BetaReportPost): Record<string, unknown> => {
  const { dayGain, rk, realGainD30, lastRealAtMillis, ageBucketAtD, ...summary } = post;
  return {
    ...summary,
    day: report.day,
    gr: dayGain?.gr ?? null, go: dayGain?.go ?? null, gv: dayGain?.gv ?? null, gs: dayGain?.gs ?? null, gu: dayGain?.gu ?? null, dl: dayGain?.dl ?? null, dlr: dayGain?.dlr ?? null, vc: dayGain?.vc ?? null,
    realGainD30,
    rkView: rk?.v ?? null, rkLike: rk?.l ?? null, rkComment: rk?.c ?? null, rkDislike: rk?.d ?? null,
    lastRealAtMillis,
    ageBucketAtD,
  };
};

/** The days columns when a document ships none: the flattened raw rows plus the window-only columns, the generator's order. */
const daysColumnsOf = (report: BetaAlgorithmReport): string[] => {
  if (report.csvColumns.days.length) return report.csvColumns.days;
  const columns = new Set<string>(['row']);
  for (const row of report.evidence.daysRaw) for (const column of Object.keys(flattenCells(row))) columns.add(column);
  for (const block of Object.values(report.evidence.windowsRaw)) for (const column of Object.keys(flattenCells(block))) columns.add(column);
  return [...columns].filter(column => !column.startsWith('realActorEntries')).sort((left, right) => {
    const wl = WINDOW_ONLY_COLUMNS.some(prefix => left.startsWith(prefix)) ? 1 : 0;
    const wr = WINDOW_ONLY_COLUMNS.some(prefix => right.startsWith(prefix)) ? 1 : 0;
    return wl - wr || left.localeCompare(right);
  });
};

export type ReportCsvTable = 'verdicts' | 'metrics' | 'days' | 'posts';
export const reportCsvFilename = (report: BetaAlgorithmReport, table: ReportCsvTable): string => `poplur-report-${report.day}${report.revision > 1 ? `-r${report.revision}` : ''}-${table}.csv`;
export const reportCompareFilename = (a: BetaAlgorithmReport, b: BetaAlgorithmReport): string => `poplur-report-${a.day}-vs-${b.day}.csv`;
export const reportsRangeFilename = (reports: BetaAlgorithmReport[]): string => {
  const days = reports.map(report => report.day).sort();
  return `poplur-reports-${days[0] ?? 'none'}_${days[days.length - 1] ?? 'none'}-metrics.csv`;
};

/** `…-verdicts.csv`: one row per knob, the identity prefix first. */
export const reportVerdictsCsv = (report: BetaAlgorithmReport): string => {
  const identity = reportIdentity(report);
  return csvFixed(withIdentity(report, tableColumns(report, 'verdicts')), report.verdicts.map(row => ({ ...identity, ...verdictCells(row) })));
};

/** `…-metrics.csv`: one row per metric id, "since yesterday" beside it. */
export const reportMetricsCsv = (report: BetaAlgorithmReport): string => {
  const identity = reportIdentity(report);
  return csvFixed(withIdentity(report, tableColumns(report, 'metrics')), Object.values(report.evidence.metrics).map(metric => ({ ...identity, ...metricCells(report, metric) })));
};

/** `…-days.csv`: the 30 raw published day rows flattened faithfully (`row`
 *  = `day`), then the window rows in the same columns plus the window-only
 *  ones (`row` = `window`, the window's name in `day`) — never the typed
 *  `BetaAlgorithmDay`, whose window reuse zero-fills and collapses fields. */
export const reportDaysCsv = (report: BetaAlgorithmReport): string => {
  const identity = reportIdentity(report);
  const rows: Record<string, unknown>[] = report.evidence.daysRaw.map(row => ({ ...identity, ...flattenCells(row), row: 'day' }));
  for (const name of WINDOW_NAMES) {
    const block = report.evidence.windowsRaw[name];
    if (block) rows.push({ ...identity, ...flattenCells(block), row: 'window', day: name });
  }
  return csvFixed(withIdentity(report, daysColumnsOf(report)), rows);
};

/** `…-posts.csv`: one row per post on the day (the 28 summary columns + the day's fold cells). */
export const reportPostsCsv = (report: BetaAlgorithmReport): string => {
  const identity = reportIdentity(report);
  return csvFixed(withIdentity(report, tableColumns(report, 'posts')), report.evidence.posts.map(post => ({ ...identity, ...postCells(report, post) })));
};

const COMPARE_SIDE_COLUMNS = ['value', 'n', 'numerator', 'denominator', 'gate.n', 'gate.minN', 'gate.sufficient'];
/** `poplur-report-<A>-vs-<B>.csv`: the metrics file with `a.*`, `b.*`, `delta`, `gateFlip`; both identities prefixed. */
export const reportCompareCsv = (a: BetaAlgorithmReport, b: BetaAlgorithmReport): string => {
  const comparison = compareReports(a, b);
  const identity = { ...Object.fromEntries(Object.entries(reportIdentity(a)).map(([key, cell]) => [`a.${key}`, cell])), ...Object.fromEntries(Object.entries(reportIdentity(b)).map(([key, cell]) => [`b.${key}`, cell])) };
  const columns = [
    ...identityColumns(a).map(column => `a.${column}`), ...identityColumns(b).map(column => `b.${column}`),
    'id', 'window', 'population', 'unit', ...COMPARE_SIDE_COLUMNS.map(column => `a.${column}`), ...COMPARE_SIDE_COLUMNS.map(column => `b.${column}`), 'delta', 'gateFlip', 'presence',
  ];
  const side = (prefix: 'a' | 'b', metric: BetaReportMetric | null): Record<string, unknown> => ({
    [`${prefix}.value`]: metric?.value ?? null, [`${prefix}.n`]: metric?.n ?? null, [`${prefix}.numerator`]: metric?.numerator ?? null, [`${prefix}.denominator`]: metric?.denominator ?? null,
    [`${prefix}.gate.n`]: metric?.gate?.n ?? null, [`${prefix}.gate.minN`]: metric?.gate?.minN ?? null, [`${prefix}.gate.sufficient`]: metric?.gate?.sufficient ?? null,
  });
  return csvFixed(columns, comparison.metrics.map(metric => ({
    ...identity, id: metric.id, window: metric.window, population: metric.population, unit: metric.unit, ...side('a', metric.a), ...side('b', metric.b),
    delta: metric.delta, gateFlip: metric.gateFlip, presence: metric.presence,
  })));
};

/** `poplur-reports-<first>_<last>-metrics.csv`: every report's metric rows
 *  under one fixed header (the oldest report's columns), so the columns are
 *  stable whatever order the reports were fetched in. */
export const reportsRangeCsv = (reports: BetaAlgorithmReport[]): string => {
  const ordered = [...reports].sort((left, right) => left.day.localeCompare(right.day) || left.revision - right.revision);
  if (!ordered.length) return csvFixed([...REPORT_CSV_IDENTITY_PREFIX, ...REPORT_METRICS_CSV_COLUMNS], []);
  const columns = withIdentity(ordered[0], tableColumns(ordered[0], 'metrics'));
  const rows: Record<string, unknown>[] = [];
  for (const report of ordered) {
    const identity = reportIdentity(report);
    for (const metric of Object.values(report.evidence.metrics)) rows.push({ ...identity, ...metricCells(report, metric) });
  }
  return csvFixed(columns, rows);
};

// ── Beta metrics (human accounts only; scripts/beta-metrics-policy.mjs) ──────

export type BetaRetentionStatus = 'retained' | 'lost' | 'pending';
export type BetaRetentionKey = 'd1' | 'd7' | 'd14';
export const BETA_RETENTION_KEYS: readonly BetaRetentionKey[] = ['d1', 'd7', 'd14'];
export type BetaReachCounts = { real: number; owner: number };
export type BetaSplitBasis = 'digest-posts' | 'digest-contamination' | 'unavailable';

export type BetaMetricsUser = {
  uid: string;
  label: string;
  owner: boolean;
  signedUpAtMs: number;
  signedUpDay: string;
  lastSignInAtMs: number;
  pops: number;
  firstPopAtMs: number;
  firstPopHours: number | null;
  firstPopWithin24h: boolean | null;
  likesGiven: number;
  likesReceived: number;
  activeDays: number;
  activeDayList: string[];
  activeKinds: Record<string, string[]>;
  lastActiveDay: string;
  retention: Record<BetaRetentionKey, BetaRetentionStatus>;
  anchorBasis: string | null;
};

export type BetaMetricsPop = {
  postId: string;
  ownerUid: string;
  ownerLabel: string;
  owner: boolean;
  channelId: string;
  mediaType: 'photo' | 'video';
  createdAtMs: number;
  day: string;
  deleted: boolean;
  startMeters: number;
  currentMeters: number;
  peakMeters: number;
  peakAtMs: number;
  /** Metres grown at peak (peak − start), split by the digest's actor-class
   *  gains: `null` halves mean the digest has no row for the pop (never zero). */
  grownMeters: number;
  humanGrownMeters: number | null;
  syntheticGrownMeters: number | null;
  unknownGrownMeters: number | null;
  syntheticShare: number | null;
  splitBasis: BetaSplitBasis;
  likesReal: number;
  likesOwner: number;
  views: number;
  humansInReachAtPeak: BetaReachCounts;
  humansInReachNow: BetaReachCounts;
  hasCoordinates: boolean;
};

export type BetaMetricsRetentionCell = { retained: number; due: number; cohort: number };
export type BetaMetricsDaily = {
  day: string;
  signups: number;
  cumulativeAccounts: number;
  firstPop24h: { n: number; of: number };
  activeUsers: number;
  pops: number;
  popsPerActiveUser: number | null;
  likes: number;
  cumulativePops: number;
  cumulativeLikes: number;
  likesPerPop: number | null;
  retention: Record<BetaRetentionKey, BetaMetricsRetentionCell>;
};

export type BetaMetricsHeadline = {
  humanAccounts: number;
  signupsToday: number;
  signups7d: number;
  firstPop24h: { n: number; of: number; withPop: number };
  retention: Record<BetaRetentionKey, { n: number; of: number }>;
  activeToday: number;
  popsToday: number;
  popsPerActiveUserToday: number | null;
  likesPerPop: { likes: number; pops: number };
  largestReach: {
    postId: string; ownerLabel: string; owner: boolean; peakMeters: number; peakAtMs: number; startMeters: number;
    humanGrownMeters: number | null; syntheticGrownMeters: number | null; syntheticShare: number | null; splitBasis: BetaSplitBasis;
    humansInReach: number; hasCoordinates: boolean;
  } | null;
};

export type BetaMetricsView = { daily: BetaMetricsDaily[]; headline: BetaMetricsHeadline };

export type BetaMetrics = {
  version: number;
  generatedAtMs: number;
  timeZone: string;
  today: string;
  days: string[];
  accounts: { human: number; owner: number; students: number; excluded: { synthetic: number; review: number; unknown: number } };
  users: BetaMetricsUser[];
  pops: BetaMetricsPop[];
  views: { students: BetaMetricsView; everyone: BetaMetricsView };
  definitions: Record<string, string>;
  coverage: { reads: number; cad: number; capped: boolean; cappedAt: string | null; sightingsSince: string | null; engagementIndex: boolean; engagementDaysCounted: number; digestAtMs: number };
  cached: boolean;
  cachedAtMs: number;
};

export const BETA_METRICS_VERSION = 1;
export const BETA_USERS_CSV_COLUMNS: readonly string[] = Object.freeze([
  'uid', 'label', 'owner', 'signedUpAtIso', 'signedUpDay', 'lastSignInAtIso', 'pops', 'firstPopAtIso', 'firstPopHours',
  'firstPopWithin24h', 'likesGiven', 'likesReceived', 'activeDays', 'activeDayList', 'lastActiveDay', 'd1', 'd7', 'd14',
  'anchorBasis',
]);
export const BETA_POPS_CSV_COLUMNS: readonly string[] = Object.freeze([
  'postId', 'ownerUid', 'ownerLabel', 'owner', 'channelId', 'mediaType', 'createdAtIso', 'day', 'deleted', 'startMeters',
  'currentMeters', 'peakMeters', 'peakAtIso', 'humanGrownMeters', 'syntheticGrownMeters', 'likesReal', 'likesOwner', 'views',
  'humansInReachAtPeakReal', 'humansInReachAtPeakOwner', 'humansInReachNowReal', 'humansInReachNowOwner', 'hasCoordinates',
]);

const nullableMetric = (value: unknown, maximum = Number.MAX_SAFE_INTEGER): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(maximum, parsed)) : null;
};
const dayKey = (value: unknown): string => (typeof value === 'string' && DAY_PATTERN.test(value) ? value : '');
const retentionStatus = (value: unknown): BetaRetentionStatus => (value === 'retained' || value === 'lost' ? value : 'pending');
const splitBasis = (value: unknown): BetaSplitBasis => (value === 'digest-posts' || value === 'digest-contamination' ? value : 'unavailable');
/** Grown metres are never negative (unlike the ledger's signed `nullableMeters`); absent stays null. */
const nullableGrown = (value: unknown): number | null => (value === null || value === undefined ? null : metric(value, WORLD_METERS));
const nullableShare = (value: unknown): number | null => nullableMetric(value, 1);
const reachCounts = (value: unknown): BetaReachCounts => ({ real: integer(record(value).real), owner: integer(record(value).owner) });
const retentionCell = (value: unknown): BetaMetricsRetentionCell => ({ retained: integer(record(value).retained), due: integer(record(value).due), cohort: integer(record(value).cohort) });
const retentionRecord = <T,>(value: unknown, cell: (raw: unknown) => T): Record<BetaRetentionKey, T> => {
  const raw = record(value);
  return { d1: cell(raw.d1), d7: cell(raw.d7), d14: cell(raw.d14) };
};

const betaUser = (value: unknown): BetaMetricsUser | null => {
  const raw = record(value);
  const uid = text(raw.uid, 128);
  if (!uid) return null;
  const activeDayList = (Array.isArray(raw.activeDayList) ? raw.activeDayList : []).map(dayKey).filter(Boolean).slice(0, 400);
  const kinds = record(raw.activeKinds);
  return {
    uid,
    label: text(raw.label, 40) || uid.slice(0, 6),
    owner: raw.owner === true,
    signedUpAtMs: integer(raw.signedUpAtMs, Number.MAX_SAFE_INTEGER),
    signedUpDay: dayKey(raw.signedUpDay),
    lastSignInAtMs: integer(raw.lastSignInAtMs, Number.MAX_SAFE_INTEGER),
    pops: integer(raw.pops),
    firstPopAtMs: integer(raw.firstPopAtMs, Number.MAX_SAFE_INTEGER),
    firstPopHours: nullableMetric(raw.firstPopHours),
    firstPopWithin24h: typeof raw.firstPopWithin24h === 'boolean' ? raw.firstPopWithin24h : null,
    likesGiven: integer(raw.likesGiven),
    likesReceived: integer(raw.likesReceived),
    activeDays: integer(raw.activeDays),
    activeDayList,
    activeKinds: Object.fromEntries(activeDayList.map(day => [day, (Array.isArray(kinds[day]) ? kinds[day] as unknown[] : []).map(kind => text(kind, 16)).filter(Boolean)])),
    lastActiveDay: dayKey(raw.lastActiveDay),
    retention: retentionRecord(raw.retention, retentionStatus),
    anchorBasis: text(raw.anchorBasis, 24) || null,
  };
};

const betaPop = (value: unknown): BetaMetricsPop | null => {
  const raw = record(value);
  const postId = text(raw.postId, 128);
  if (!postId) return null;
  return {
    postId,
    ownerUid: text(raw.ownerUid, 128),
    ownerLabel: text(raw.ownerLabel, 40),
    owner: raw.owner === true,
    channelId: text(raw.channelId, 64),
    mediaType: raw.mediaType === 'video' ? 'video' : 'photo',
    createdAtMs: integer(raw.createdAtMs, Number.MAX_SAFE_INTEGER),
    day: dayKey(raw.day),
    deleted: raw.deleted === true,
    startMeters: metric(raw.startMeters, WORLD_METERS),
    currentMeters: metric(raw.currentMeters, WORLD_METERS),
    peakMeters: metric(raw.peakMeters, WORLD_METERS),
    peakAtMs: integer(raw.peakAtMs, Number.MAX_SAFE_INTEGER),
    grownMeters: metric(raw.grownMeters, WORLD_METERS),
    humanGrownMeters: nullableGrown(raw.humanGrownMeters),
    syntheticGrownMeters: nullableGrown(raw.syntheticGrownMeters),
    unknownGrownMeters: nullableGrown(raw.unknownGrownMeters),
    syntheticShare: nullableShare(raw.syntheticShare),
    splitBasis: splitBasis(raw.splitBasis),
    likesReal: integer(raw.likesReal),
    likesOwner: integer(raw.likesOwner),
    views: integer(raw.views),
    humansInReachAtPeak: reachCounts(raw.humansInReachAtPeak),
    humansInReachNow: reachCounts(raw.humansInReachNow),
    hasCoordinates: raw.hasCoordinates === true,
  };
};

const betaDaily = (value: unknown): BetaMetricsDaily | null => {
  const raw = record(value);
  const day = dayKey(raw.day);
  if (!day) return null;
  return {
    day,
    signups: integer(raw.signups),
    cumulativeAccounts: integer(raw.cumulativeAccounts),
    firstPop24h: { n: integer(record(raw.firstPop24h).n), of: integer(record(raw.firstPop24h).of) },
    activeUsers: integer(raw.activeUsers),
    pops: integer(raw.pops),
    popsPerActiveUser: nullableMetric(raw.popsPerActiveUser),
    likes: integer(raw.likes),
    cumulativePops: integer(raw.cumulativePops),
    cumulativeLikes: integer(raw.cumulativeLikes),
    likesPerPop: nullableMetric(raw.likesPerPop),
    retention: retentionRecord(raw.retention, retentionCell),
  };
};

const betaView = (value: unknown): BetaMetricsView => {
  const raw = record(value);
  const head = record(raw.headline);
  const largest = head.largestReach && typeof head.largestReach === 'object' ? record(head.largestReach) : null;
  return {
    daily: (Array.isArray(raw.daily) ? raw.daily : []).map(betaDaily).filter((row): row is BetaMetricsDaily => row !== null).slice(0, 90),
    headline: {
      humanAccounts: integer(head.humanAccounts),
      signupsToday: integer(head.signupsToday),
      signups7d: integer(head.signups7d),
      firstPop24h: { n: integer(record(head.firstPop24h).n), of: integer(record(head.firstPop24h).of), withPop: integer(record(head.firstPop24h).withPop) },
      retention: retentionRecord(head.retention, cell => ({ n: integer(record(cell).n), of: integer(record(cell).of) })),
      activeToday: integer(head.activeToday),
      popsToday: integer(head.popsToday),
      popsPerActiveUserToday: nullableMetric(head.popsPerActiveUserToday),
      likesPerPop: { likes: integer(record(head.likesPerPop).likes), pops: integer(record(head.likesPerPop).pops) },
      largestReach: largest && text(largest.postId, 128) ? {
        postId: text(largest.postId, 128),
        ownerLabel: text(largest.ownerLabel, 40),
        owner: largest.owner === true,
        peakMeters: metric(largest.peakMeters, WORLD_METERS),
        peakAtMs: integer(largest.peakAtMs, Number.MAX_SAFE_INTEGER),
        startMeters: metric(largest.startMeters, WORLD_METERS),
        humanGrownMeters: nullableGrown(largest.humanGrownMeters),
        syntheticGrownMeters: nullableGrown(largest.syntheticGrownMeters),
        syntheticShare: nullableShare(largest.syntheticShare),
        splitBasis: splitBasis(largest.splitBasis),
        humansInReach: integer(largest.humansInReach),
        hasCoordinates: largest.hasCoordinates === true,
      } : null,
    },
  };
};

/** The proxy's `GET /api/beta` result. Another schema major is null (the page says so); every count is bounded, never zero-filled from nothing. */
export const betaMetrics = (value: unknown): BetaMetrics | null => {
  const raw = record(value);
  if (integer(raw.version, 1_000) !== BETA_METRICS_VERSION) return null;
  const accounts = record(raw.accounts);
  const excluded = record(accounts.excluded);
  const coverage = record(raw.coverage);
  const definitions = record(raw.definitions);
  return {
    version: BETA_METRICS_VERSION,
    generatedAtMs: integer(raw.generatedAtMs, Number.MAX_SAFE_INTEGER),
    timeZone: text(raw.timeZone, 40) || REPORT_TIME_ZONE,
    today: dayKey(raw.today),
    days: (Array.isArray(raw.days) ? raw.days : []).map(dayKey).filter(Boolean).slice(0, 90),
    accounts: {
      human: integer(accounts.human),
      owner: integer(accounts.owner),
      students: integer(accounts.students),
      excluded: { synthetic: integer(excluded.synthetic), review: integer(excluded.review), unknown: integer(excluded.unknown) },
    },
    users: (Array.isArray(raw.users) ? raw.users : []).map(betaUser).filter((row): row is BetaMetricsUser => row !== null).slice(0, 2_000),
    pops: (Array.isArray(raw.pops) ? raw.pops : []).map(betaPop).filter((row): row is BetaMetricsPop => row !== null).slice(0, 5_000),
    views: { students: betaView(record(raw.views).students), everyone: betaView(record(raw.views).everyone) },
    definitions: Object.fromEntries(Object.entries(definitions).filter(([, value]) => typeof value === 'string').map(([key, value]) => [key, text(value, 1_000)])),
    coverage: {
      reads: integer(coverage.reads, Number.MAX_SAFE_INTEGER),
      cad: metric(coverage.cad, 1_000),
      capped: coverage.capped === true,
      cappedAt: text(coverage.cappedAt, 80) || null,
      sightingsSince: dayKey(coverage.sightingsSince) || null,
      engagementIndex: coverage.engagementIndex === true,
      engagementDaysCounted: integer(coverage.engagementDaysCounted, Number.MAX_SAFE_INTEGER),
      digestAtMs: integer(coverage.digestAtMs, Number.MAX_SAFE_INTEGER),
    },
    cached: raw.cached === true,
    cachedAtMs: integer(raw.cachedAtMs, Number.MAX_SAFE_INTEGER),
  };
};

const OWNER_BETA = 'http://127.0.0.1:8096/api/beta';
const OWNER_SCORECARD = 'http://127.0.0.1:8096/api/scorecard';

/** The published beta scorecard (public/betaScorecard) — the landing page's numbers, unchanged. */
export async function fetchBetaScorecard(): Promise<unknown> {
  const response = await fetch(OWNER_SCORECARD, { headers: { accept: 'application/json' } });
  const body = (await response.json().catch(() => ({}))) as { scorecard?: unknown; error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message || `Scorecard request failed (${response.status}).`);
  return body.scorecard ?? null;
}

/** The proxy's 429: a Beta run is charged to the same 25k/day ledger budget as the export. */
export class BetaReadRefused extends Error {
  readonly remaining: number;
  constructor(remaining: number) {
    super(`The proxy refused the Beta run: only ${remaining.toLocaleString()} reads are left in today's budget.`);
    this.remaining = remaining;
  }
}

export type BetaRead = { metrics: BetaMetrics | null; reads: number };

/** GET through `fetch` (the Origin header the proxy's lock requires); `refresh` bypasses the proxy's run cache. */
export async function readBetaMetrics(refresh = false): Promise<BetaRead> {
  const response = await fetch(refresh ? `${OWNER_BETA}?refresh=1` : OWNER_BETA, { headers: { accept: 'application/json' } });
  if (response.status === 429) {
    const body = record(await response.json().catch(() => ({})));
    throw new BetaReadRefused(integer(body.remaining, LEDGER_EXPORT_DAY_READS));
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as CallableBody<unknown>;
    throw new Error(body.error?.message || 'The Beta metrics are unavailable.');
  }
  return { metrics: betaMetrics(unwrapResult(await response.json())), reads: integer(response.headers.get('x-poplur-ledger-reads') ?? 0, 1_000_000) };
}

const yesNo = (value: boolean | null | undefined): string => (value === null || value === undefined ? '' : value ? 'yes' : 'no');
const isoOf = (ms: number): string => (ms > 0 ? new Date(ms).toISOString() : '');

/** poplur-beta-users-YYYYMMDD.csv: exactly BETA_USERS_CSV_COLUMNS (the proxy's own list), built client-side: 0 reads. */
export const betaUsersCsv = (users: BetaMetricsUser[]): string => csvFixed(BETA_USERS_CSV_COLUMNS, users.map(user => ({
  uid: user.uid,
  label: user.label,
  owner: yesNo(user.owner),
  signedUpAtIso: isoOf(user.signedUpAtMs),
  signedUpDay: user.signedUpDay,
  lastSignInAtIso: isoOf(user.lastSignInAtMs),
  pops: user.pops,
  firstPopAtIso: isoOf(user.firstPopAtMs),
  firstPopHours: user.firstPopHours === null ? '' : Math.round(user.firstPopHours * 100) / 100,
  firstPopWithin24h: yesNo(user.firstPopWithin24h),
  likesGiven: user.likesGiven,
  likesReceived: user.likesReceived,
  activeDays: user.activeDays,
  activeDayList: user.activeDayList.join('|'),
  lastActiveDay: user.lastActiveDay,
  d1: user.retention.d1,
  d7: user.retention.d7,
  d14: user.retention.d14,
  anchorBasis: user.anchorBasis ?? '',
})));

/** poplur-beta-pops-YYYYMMDD.csv: exactly BETA_POPS_CSV_COLUMNS. */
export const betaPopsCsv = (pops: BetaMetricsPop[]): string => csvFixed(BETA_POPS_CSV_COLUMNS, pops.map(pop => ({
  postId: pop.postId,
  ownerUid: pop.ownerUid,
  ownerLabel: pop.ownerLabel,
  owner: yesNo(pop.owner),
  channelId: pop.channelId,
  mediaType: pop.mediaType,
  createdAtIso: isoOf(pop.createdAtMs),
  day: pop.day,
  deleted: yesNo(pop.deleted),
  startMeters: pop.startMeters,
  currentMeters: pop.currentMeters,
  peakMeters: pop.peakMeters,
  peakAtIso: isoOf(pop.peakAtMs),
  humanGrownMeters: pop.humanGrownMeters ?? '',
  syntheticGrownMeters: pop.syntheticGrownMeters ?? '',
  likesReal: pop.likesReal,
  likesOwner: pop.likesOwner,
  views: pop.views,
  humansInReachAtPeakReal: pop.humansInReachAtPeak.real,
  humansInReachAtPeakOwner: pop.humansInReachAtPeak.owner,
  humansInReachNowReal: pop.humansInReachNow.real,
  humansInReachNowOwner: pop.humansInReachNow.owner,
  hasCoordinates: yesNo(pop.hasCoordinates),
})));

export const betaCsvFilename = (table: 'users' | 'pops', today: string): string => `poplur-beta-${table}-${today.replace(/-/g, '')}.csv`;

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
