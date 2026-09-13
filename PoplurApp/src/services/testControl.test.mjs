import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// The service imports the Firebase SDK only for `auth.currentUser`; the desk
// paths under test never touch it, so the module is stubbed at resolve time and
// Node's own type stripping loads the real `.ts` source.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === './firebase' && String(context.parentURL).endsWith('/services/testControl.ts')) {
      return { url: 'data:text/javascript,export const auth = { currentUser: null };', shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const {
  algorithmDigest,
  algorithmDigestRefusal,
  algorithmDigestVersion,
  algorithmReport,
  algorithmReportRefusal,
  algorithmReportVersion,
  compareReports,
  csvCell,
  csvFixed,
  digestDaysCsv,
  digestPostsCsv,
  estimateLedgerExport,
  estimateReportRange,
  readReport,
  readReportIndex,
  reportChips,
  reportChipsOf,
  reportCompareCsv,
  reportCompareFilename,
  reportCsvFilename,
  reportDaysCsv,
  reportIdentity,
  reportIndex,
  reportMetricsCsv,
  reportPostsCsv,
  reportsRangeCsv,
  reportsRangeFilename,
  reportsStatus,
  reportVerdictsCsv,
  ReportReadRefused,
  REPORT_CSV_IDENTITY_PREFIX,
  subscribeOwnerDashboard,
} = await import('./testControl.ts');

const NOW = Date.UTC(2026, 8, 11, 21, 30);
const DAY_MS = 24 * 60 * 60 * 1_000;
const WORLD = 6_371_000;

const actorGain = (scale = 1) => ({ view: 1_000 * scale, like: 1_000 * scale, comment: 2_000 * scale, dislike: -1_000 * scale, total: 3_000 * scale, n: 4 * scale, firstViews: scale, repeatViews: 0, repeatMeters: 0, clamped: 0, resync: 0 });
const bucket = () => ({ posts: 0, netPositive: 0, postDays: 0, gainRealMeters: 0, lossRealShareMeters: 0, perPostDay: null });
const net = () => ({ byAge: { lt7d: bucket(), d7to30: bucket(), gt30d: bucket() }, all: bucket() });
const windowStats = (days) => ({
  days,
  observedPolicySpanned: ['a1b2c3d4'],
  postsCreated: { real: 0, owner: 3, review: 0, synthetic: 64, official: 0, lab: 0 },
  entries: { real: 131, official: 2_600, unknownCause: 5 },
  realPostGain: { real: actorGain(0), owner: actorGain(1), review: actorGain(0), synthetic: actorGain(40), unknown: { total: 0, n: 0 } },
  realPostDecayLoss: { byMode: { normal: 0, trial: 120_000, stress: 0, undetermined: 0 }, trialMultiplierSeen: 5, byClass: { real: 0, owner: 2_400, review: 0, synthetic: 117_600, unknown: 0 }, inferred: true },
  realPostSeedLoss: 3_400,
  realPostBoostLoss: 0,
  netReal: net(),
  netOwner: net(),
  viewWorth: { metersPaid: 0, paidViews: 0, views: null, cleanPosts: 0, viewSampleDays: 3 },
  boosts: { n: 0, meters: 0 },
  unknownActorEntries: 0,
  distinctRealViewers: 0,
  distinctRealLikers: 0,
  distinctRealCommenters: 0,
  surfaces: { feed: 2, map: 1, profile: 0, unknown: 128 },
});
const dayStat = (index) => {
  const { days: _days, observedPolicySpanned: _spanned, ...stats } = windowStats(1);
  const at = new Date(NOW - (index * DAY_MS));
  return { day: at.toISOString().slice(0, 10), observedPolicy: 'a1b2c3d4', ...stats };
};
const postSummary = (index, overrides = {}) => ({
  postId: `post-${String(index).padStart(16, '0')}`,
  cls: index < 29 ? 'official' : 'real',
  ownerClass: index < 29 ? 'official' : 'owner',
  channelId: 'live',
  createdAtMillis: NOW - (index * DAY_MS),
  seedMeters: 5_000,
  currentMeters: index < 29 ? 46_697 : 209_000,
  organicMeters: 0,
  boostMeters: 46_697,
  peakMeters: WORLD,
  peakAtMillis: NOW - DAY_MS,
  entries: 131,
  realGain: 0,
  ownerGain: 0,
  reviewGain: 0,
  syntheticGain: 204_000,
  unknownGain: 0,
  decayLoss: 12_000,
  decayLossRealShare: 0,
  decayModeSeen: 'trial',
  clean: false,
  viewCount: 12,
  firstRealEngagementAtMillis: null,
  lastAtMillis: NOW - 3_600_000,
  lastCause: 'decay',
  atClaim: false,
  expired: false,
  deletedAtMillis: null,
  ...overrides,
});
const gate = (n, minN, basis) => ({ n, minN, sufficient: n >= minN, basis });
const curveLine = (multiplier) => ({ ratePerDay: 0.05, multiplier, halfLifeDays: 13.51, linearTailDays: 19, daysToFloorAt468m: 19, seedDaysToFloor: multiplier ? 19 : null, daysToFloor: { 1000: 34, 10000: 79, 100000: 124 } });

const digestFixture = () => ({
  version: 1,
  digestVersion: 41,
  generatedAtMillis: NOW - (12 * 60_000),
  runId: 'run-41',
  runMs: 8_400,
  headline: { trialOn: true, trialSinceMillis: 1788826046064, trialMultiplier: 5, boostedSinceMillis: 1788845178241, anchorsAtWorld: 0, anchorsEver: 29, worstAnchor: { postId: 'post-official-cartoon-drive-ad', radiusMeters: 46_697, ratePerPassSeen: 0.0115 } },
  cost: { reads: 150, writes: 2, entriesProcessed: 40, postsPolled: 32, postsWithEntries: 30, engagementJoins: 3, postLookups: 0, createFetches: 0, createSkipped: 0, sweepReads: 4, refreshReads: 0, userLookups: 0, authPages: 1, budgetHit: false, capInForce: 6_000, readsToday: 3_600, monthlyReadsProjected: 108_000, monthlyCadProjected: 0.054 },
  coverage: { entriesFolded: 2_650, complete: true, capped: false, registeredPosts: { real: 0, owner: 3, review: 0, official: 29 }, sweep: { cursorCreatedAtMillis: NOW - 3_600_000, sweptPosts: 412 }, horizonMillis: NOW - 1_800_000, postsBehindHorizon: 0, createFetched: 32, createMissing: 0, createSkipped: 0, unknownCauses: { growth: 5 }, unknownActorEntries: { real: 0 }, resync: { view: 1 }, undeterminedMode: 0, postsGone: 0, postsDeleted: 0, evicted: 0, trimmed: false, authPageFailedRuns: 0, timeZone: 'America/Toronto' },
  knobs: { firstViewMeters: 1_000, likeMeters: 1_000, dislikeMeters: -1_000, commentMeters: 2_000, repeatViewBaseMeters: 500, repeatViewMinMs: 30_000, repeatViewLifetimeMeters: 994, decayPerDay: 0.05, decayHalfLifeDays: 13.51, decayFloorMeters: 10, maxRadiusMeters: 40_075_000, syntheticStressHalfLifeHours: 4, seedMeters: 5_000, boostDefaultMeters: 1_000, boostDefaultHours: 24, sourcePolicyVersion: 'a1b2c3d4', policySha256: 'f'.repeat(64), syncedAtMillis: NOW - (3 * 3_600_000), source: 'functions-digest/src/shared/postEngagementPolicy.ts (synced copy) + sync-stamp.extracted' },
  observedPolicy: { version: 'a1b2c3d4', since: NOW - (5 * DAY_MS) },
  observedPolicyVersions: Array.from({ length: 12 }, (_, index) => ({ version: `v${index}`, fromMillis: NOW - ((12 - index) * DAY_MS) })),
  observed: { grants: { view: { n: 128, modeMeters: 1_000, min: 125, max: 1_000, byMeters: { 1000: 88, 500: 31, 250: 9 } }, like: { n: 40, modeMeters: 1_000, min: 1_000, max: 1_000, byMeters: { 1000: 40 } }, dislike: { n: 0, modeMeters: null, min: null, max: null, byMeters: {} }, comment: { n: 8, modeMeters: 2_000, min: 2_000, max: 2_000, byMeters: { 2000: 8 } } }, seedSeen: 5_000, boostSeen: { n: 0, modeMeters: null, modeHours: null }, sampleEntries: 176, clamped: 0, resync: { view: 1 } },
  switches: { simulationEnabled: false, runnerEnabled: true, dailySimulationEnabled: true, simulationOwnerUid: 'eoP2Z0ElxIa0Eua7xpFxNlr6tur1', decayTrial: { enabled: true, multiplier: 5, scope: 'all-users', effectiveAtMillis: 1788826046064, boostedEffectiveAtMillis: 1788845178241 }, dueDecayEnabled: true, sampledAtMillis: NOW - (12 * 60_000) },
  gates: { minEvents: 30, minPosts: 8, minChannelPosts: 5, minActors: 2 },
  windows: { d7: windowStats(7), d30: windowStats(30) },
  days: Array.from({ length: 35 }, (_, index) => dayStat(34 - index)),
  channels: Array.from({ length: 15 }, (_, index) => ({ channelId: index === 14 ? 'other' : `channel-${index}`, realPosts: 0, realGainMeters: 0, postDays: 0, gainPerPostDay: null, medianMinutesToFirstRealEngagement: null, n: 0, sufficient: false })),
  posts: Array.from({ length: 60 }, (_, index) => postSummary(index)),
  anchors: { worldMeters: WORLD, everAtWorld: 29, rows: Array.from({ length: 10 }, (_, index) => ({ postId: `post-official-${index}`, radiusMeters: 46_697, atWorld: false, belowSinceMillis: 1788845178241, lastAtMillis: NOW - 3_600_000, decayPathSeen: 'boost' })) },
  seedRest: { valid: false, livePosts: 0, atClaim: 0, everAboveClaim: 0, cleanPosts: 0, claimShareMedian: null, peakOverClaim: { n: 0, p50: null, p90: null }, timeToPeakHours: { n: 0, p50: null, p90: null }, owner: { livePosts: 3, atClaim: 0, everAboveClaim: 3, cleanPosts: 0 } },
  claims: { d30: { count: 0, atFloor: 0, medianMeters: null, maxMeters: 0, aboveFloorThatEarned: 0, owner: { count: 3, atFloor: 3, medianMeters: 5_000, maxMeters: 5_000, aboveFloorThatEarned: 0 } } },
  contamination: { d7: { syntheticMeters: 120_000, syntheticEntries: 160, ownerMeters: 3_000, ownerEntries: 4, reviewMeters: 0, reviewEntries: 0, posts: Array.from({ length: 25 }, (_, index) => ({ postId: `post-${index}`, syntheticMeters: 1_000, ownerMeters: 0, share: 0.98 })) } },
  intercept: { realized: { entries: 0, distinctPosts: 0, distinctActors: 0 }, opportunity: { pairs: 0, postsWithAnyPair: 0, realAccountsWithLocation: 0 } },
  curve: { passMinutes: 60, normal: curveLine(null), normal65: curveLine(null), trial: curveLine(5), stress: { halfLifeHours: 4 } },
  questions: { c: gate(0, 30, 'real posts × real actors · engagement entries · organicDelta'), d: gate(0, 8, 'tester-owned posts with a real engagement'), f: gate(0, 8, 'clean tester posts'), h: gate(0, 5, 'tester-owned posts per channel'), i: gate(0, 8, 'create entries on tester posts') },
  gaps: [{ id: 'decayMode', measured: true, since: NOW - (3 * DAY_MS), inferredEntries: 2_400, undeterminedEntries: 0 }, { id: 'ceilingMeters', measured: false }],
});

test('algorithmDigest() round-trips a fixture, bounds its arrays and clamps metres to the world', () => {
  const digest = algorithmDigest(digestFixture());
  assert.ok(digest);
  assert.equal(digest.version, 1);
  assert.equal(digest.digestVersion, 41);
  assert.deepEqual(digest.headline, digestFixture().headline);
  assert.deepEqual(digest.switches.decayTrial, digestFixture().switches.decayTrial);
  assert.deepEqual(digest.windows.d7.surfaces, { feed: 2, map: 1, profile: 0, unknown: 128 });
  assert.deepEqual(digest.windows.d30.realPostDecayLoss.byClass, { real: 0, owner: 2_400, review: 0, synthetic: 117_600, unknown: 0 });
  assert.equal(digest.windows.d7.viewWorth.views, null);
  assert.deepEqual(digest.questions.c, digestFixture().questions.c);
  assert.equal(digest.days.length, 30);
  assert.equal(digest.posts.length, 50);
  assert.equal(digest.channels.length, 13);
  assert.equal(digest.anchors.rows.length, 8);
  assert.equal(digest.contamination.d7.posts.length, 20);
  assert.equal(digest.observedPolicyVersions.length, 8);
  assert.equal(digest.knobs.maxRadiusMeters, WORLD);
  assert.equal(digest.posts[0].peakMeters, WORLD);
  assert.equal(digest.posts[0].ownerClass, 'official');
  assert.equal(digest.posts[29].ownerClass, 'owner');
  assert.deepEqual(digest.curve.normal.points, [{ startMeters: 1_000, days: 34 }, { startMeters: 10_000, days: 79 }, { startMeters: 100_000, days: 124 }]);
  assert.equal(digest.curve.trial.seedDaysToFloor, 19);
  assert.deepEqual(digest.observed.grants.view.byMeters, { 1000: 88, 500: 31, 250: 9 });
  assert.equal(digest.days[0].day, digestFixture().days[5].day);
  assert.equal(digest.days[0].observedPolicy, 'a1b2c3d4');
  assert.equal(digest.gaps[1].measured, false);
  assert.equal(digest.gaps[1].since, null);
});

test('algorithmDigest() nulls a foreign schema version and reports the version it refused', () => {
  assert.equal(algorithmDigest({ ...digestFixture(), version: 2 }), null);
  assert.equal(algorithmDigest({ ...digestFixture(), version: '1' }), null);
  assert.equal(algorithmDigest({ ...digestFixture(), version: undefined }), null);
  assert.equal(algorithmDigest(null), null);
  assert.equal(algorithmDigestVersion({ version: 2 }), 2);
  assert.equal(algorithmDigestVersion({}), 0);
  assert.equal(algorithmDigestVersion(null), null);
  // The proxy's own refusal shapes (scripts/algorithm-digest-policy.mjs).
  assert.deepEqual(algorithmDigestRefusal({ version: 2, unsupportedVersion: true }), { reason: 'unsupported-version', version: 2, digestVersion: null });
  assert.deepEqual(algorithmDigestRefusal({ version: null, unsupportedVersion: true }), { reason: 'unsupported-version', version: null, digestVersion: null });
  assert.deepEqual(algorithmDigestRefusal({ version: 1, digestVersion: 41, oversize: true }), { reason: 'oversize', version: 1, digestVersion: 41 });
  assert.equal(algorithmDigest({ version: 1, digestVersion: 41, oversize: true }), null);
  assert.equal(algorithmDigestRefusal(digestFixture()), null);
  assert.equal(algorithmDigestRefusal(null), null);
});

test('a missing gate is never sufficient and a sufficient gate survives as published', () => {
  const digest = algorithmDigest({ ...digestFixture(), questions: { c: { n: 31, minN: 30, sufficient: true, basis: 'x' } } });
  assert.equal(digest.questions.c.sufficient, true);
  assert.equal(digest.questions.d.sufficient, false);
  assert.equal(digest.questions.d.minN, 8);
  assert.equal(digest.questions.h.minN, 5);
});

test('estimateLedgerExport charges 1 + entries per known post and the cap for an unknown one', () => {
  const digest = algorithmDigest(digestFixture());
  const one = estimateLedgerExport(digest, [digest.posts[0].postId]);
  assert.equal(one.reads, 1 + 131);
  assert.equal(one.posts, 1);
  const all = estimateLedgerExport(digest, digest.posts.map(post => post.postId));
  assert.equal(all.posts, 50);
  assert.equal(all.reads, 50 * 132);
  assert.equal(all.leftToday, 25_000 - (50 * 132));
  assert.ok(Math.abs(all.cad - (50 * 132 * 0.05 / 100_000)) < 1e-9);
  assert.equal(estimateLedgerExport(digest, ['post-unknown-0000000000000000']).reads, 501);
  assert.equal(estimateLedgerExport(null, ['a', 'a']).posts, 1);
});

test('digest CSVs are built client-side with a policyVersion column and quoted cells', () => {
  const digest = algorithmDigest({ ...digestFixture(), posts: [postSummary(40, { channelId: 'live, "late"' })] });
  const days = digestDaysCsv(digest).split('\r\n');
  assert.equal(days.length, 31);
  assert.ok(days[0].startsWith('day,policyVersion,'));
  assert.ok(days[0].includes('realPostGain.real.total'));
  assert.ok(days[0].includes('surfaces.feed'));
  const posts = digestPostsCsv(digest).split('\r\n');
  assert.equal(posts.length, 2);
  assert.ok(posts[0].startsWith('postId,cls,ownerClass,channelId,'));
  assert.ok(posts[1].includes('"live, ""late"""'));
});

/** Drives the SSE reader with a scripted fetch and a timer recorder. */
const sseHarness = (script) => {
  const delays = [];
  const waiters = [];
  const realSetTimeout = globalThis.setTimeout;
  const realFetch = globalThis.fetch;
  let call = 0;
  globalThis.setTimeout = (handler, delay) => {
    delays.push(delay);
    for (const waiter of waiters.splice(0)) waiter();
    return realSetTimeout(handler, 0);
  };
  globalThis.fetch = async () => {
    const step = script[Math.min(call, script.length - 1)];
    call += 1;
    if (step.reject) throw new Error('offline');
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        for (const frame of step.frames) controller.enqueue(encoder.encode(frame));
        controller.close();
      },
    });
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
  const untilDelays = (count) => new Promise(resolve => {
    const check = () => { if (delays.length >= count) resolve(); else waiters.push(check); };
    check();
  });
  const restore = () => { globalThis.setTimeout = realSetTimeout; globalThis.fetch = realFetch; };
  return { delays, untilDelays, restore };
};

test('the SSE reader backs off 1.5 → 3 → 6 → 12 → 15 s, resets on a result frame and honours retry:', async () => {
  const resultFrame = `retry: 4000\n\ndata: ${JSON.stringify({ result: { generatedAtMs: NOW, algorithm: digestFixture() } })}\n\n`;
  const harness = sseHarness([
    { reject: true }, { reject: true }, { reject: true }, { reject: true }, { reject: true },
    { frames: [resultFrame] },
    { reject: true },
    { reject: true },
    { frames: [`data: ${JSON.stringify({ result: null, upstream: 'down' })}\n\n`] },
  ]);
  const seen = [];
  const states = [];
  const stop = subscribeOwnerDashboard(value => seen.push(value), state => states.push(state));
  try {
    await harness.untilDelays(9);
  } finally {
    stop();
    harness.restore();
  }
  // five failures, then the stream that delivered a result closed (failures
  // reset to one, hint 4000 wins), then 4000 vs 3000, then 6000 beats the hint,
  // then a frame without `result` counts as a failure too (12000).
  assert.deepEqual(harness.delays.slice(0, 9), [1_500, 3_000, 6_000, 12_000, 15_000, 4_000, 4_000, 6_000, 12_000]);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].algorithm.digestVersion, 41);
  assert.equal(seen[0].algorithmRefusal, null);
  assert.ok(states.includes('live'));
});

test('a dashboard frame carrying a refused digest reports why, and an absent digest reports nothing', async () => {
  const harness = sseHarness([
    { frames: [
      `data: ${JSON.stringify({ result: { generatedAtMs: NOW, algorithm: { version: 2, digestVersion: 9 } } })}\n\n`,
      `data: ${JSON.stringify({ result: { generatedAtMs: NOW, algorithm: { version: 1, digestVersion: 41, oversize: true } } })}\n\n`,
      `data: ${JSON.stringify({ result: { generatedAtMs: NOW } })}\n\n`,
    ] },
  ]);
  const seen = [];
  const stop = subscribeOwnerDashboard(value => seen.push(value));
  try {
    await harness.untilDelays(1);
  } finally {
    stop();
    harness.restore();
  }
  assert.equal(seen.length, 3);
  assert.equal(seen[0].algorithm, null);
  assert.deepEqual(seen[0].algorithmRefusal, { reason: 'unsupported-version', version: 2, digestVersion: 9 });
  assert.equal(seen[1].algorithm, null);
  assert.deepEqual(seen[1].algorithmRefusal, { reason: 'oversize', version: 1, digestVersion: 41 });
  assert.equal(seen[2].algorithm, null);
  assert.equal(seen[2].algorithmRefusal, null);
});

// ── Daily algorithm reports (algorithm-reports-design.md §5.2, §6) ──────────

const REPORT_DAY = '2026-09-12';
/** Toronto is UTC−4 in September; a report for D is written at 00:45 of D+1. */
const TORONTO = (y, m, d, h = 0, min = 0) => Date.UTC(y, m - 1, d, h + 4, min);
const reportDayKey = (offset) => new Date(Date.UTC(2026, 8, 12 - offset, 12)).toISOString().slice(0, 10);
const people = (actors = 0) => ({ actors, viewers: actors, likers: Math.min(actors, 4), commenters: 0, maxShare: actors ? 0.33 : null });
/** A published day row (P:1221 shape after fold addition 3: `people` counts, never `realActorEntries`). */
const reportDayRow = (offset, overrides = {}) => {
  const { days: _days, observedPolicySpanned: _spanned, netReal: _net, netOwner: _owner, viewWorth: _worth, unknownActorEntries: _unknown, ...stats } = windowStats(1);
  return {
    day: reportDayKey(offset),
    observedPolicy: null,
    ...stats,
    unknownActorEntries: { real: 0, official: 0 },
    realSurfaces: { feed: 0, map: 0, profile: 0, unknown: 0 },
    people: people(),
    productionEpoch: 'e1e1e1e1',
    trialClass: offset < 5 ? 'trial' : null,
    ...overrides,
  };
};
const reportWindowRow = (days, overrides = {}) => ({ ...windowStats(days), observedPolicySpanned: [], spanned: ['e1e1e1e1'], ...overrides });
const reportGate = (id, n, minN, sufficient = n >= minN) => ({ id, label: `${id} · label`, n, minN, sufficient, basis: `${id} basis` });
const metricRow = (id, value, overrides = {}) => ({ id, value, unit: 'm', n: 0, gate: null, window: 'd30', population: 'real', basis: 'real posts × real actors · d30', numerator: null, denominator: null, ...overrides });
const observedGrantRow = (n, meters) => ({ n, modeMeters: n ? meters : null, min: n ? meters : null, max: n ? meters : null, byMeters: n ? { [meters]: n } : {} });
const observedBlockRow = (n) => ({
  grants: { view: observedGrantRow(n, 1_000), repeat: observedGrantRow(n, 500), like: observedGrantRow(n, 1_000), dislike: observedGrantRow(n, -1_000), comment: observedGrantRow(n, 2_000) },
  seedSeen: observedGrantRow(0, 5_000), boostSeen: { meters: observedGrantRow(0, 1_000), hours: observedGrantRow(0, 24) }, sampleEntries: n * 5, clamped: 0, resync: 0,
});
const KNOB_ROWS = [
  ['K1', 'First-view grant', true, 1_000, 'm'], ['K2', 'Like grant', true, 1_000, 'm'], ['K3', 'Comment grant', true, 2_000, 'm'], ['K4', 'Dislike grant', true, -1_000, 'm'],
  ['K5', 'Repeat-view base', true, 500, 'm'], ['K6', 'Repeat-view interval', false, 30_000, 'ms'], ['K7', 'Earned-reach decay', true, 0.05, '/day'], ['K8', 'Dust floor', false, 10, 'm'],
  ['K9', 'Seed floor', false, 5_000, 'm'], ['K10', 'Claim ceiling', false, null, null], ['K11', 'Slider step', false, null, 'm'], ['K12', 'Boost default', false, 1_000, 'm'],
  ['K13', 'World ceiling', false, 6_371_000, 'm'], ['K14', 'Decay trial switch', false, null, '×'], ['K15', 'Synthetic stress half-life', false, 4, 'h'], ['K16', 'Feed weights', false, null, null],
  ['K17', 'Simulation shape', false, null, null],
];
const FIXED_REASON = { K8: 'finding', K9: 'owner-fixed', K10: 'finding', K11: 'ui', K12: 'paid', K13: 'owner-fixed', K14: 'experiment-switch', K15: 'simulation', K16: 'rank-only', K17: 'simulation' };
const GRANT_DEPLOY = ['deploy recordPostEngagement', 'node scripts/syncShared.js (functions-digest)', '.codex/deploy-nearby-pops-digest.sh'];
/** The n = 0 memo's row for a knob (§0): every tunable `insufficient/gate`, K6 unmeasured, K7 trial, the ten fixed holds. */
const verdictRow = (knob, overrides = {}) => {
  const [id, name, tunable, declaredValue, unit] = KNOB_ROWS.find(row => row[0] === knob);
  const observed = tunable && knob !== 'K7';
  return {
    knob: id, name, tunable, declaredValue, unit,
    seenValue: observed ? declaredValue : null, seenN: observed ? 40 : 0, seenBasis: 'production · ALL actor classes incl. simulation · 7 d', productionPays: observed ? declaredValue : null,
    where: `functions/src/postEngagementPolicy.ts · ${knob} literal`, deploy: tunable ? GRANT_DEPLOY : [],
    gates: tunable ? [reportGate('Gc', 0, 30), reportGate('Gd', 0, 8), ...(observed ? [reportGate('Gprod', 40, 30)] : [])] : [],
    evidence: [{ id: 'M1.gain.d30', value: 0, unit: 'm', n: 0 }, { id: 'share.like.d30', value: null, unit: 'ratio', numerator: 0, denominator: 0 }],
    verdict: FIXED_REASON[knob] ? 'hold' : 'insufficient',
    reason: FIXED_REASON[knob] ?? (knob === 'K6' ? 'unmeasured' : knob === 'K7' ? 'trial' : 'gate'),
    reasonText: FIXED_REASON[knob] ? 'fixed by decision' : 'n = 0 of 30 · Gc 0/30 (actors 0/2) · Gd 0/8 — no real person has engaged yet',
    rule: null, arithmetic: null, suggestion: null, deferred: null, curveAtSuggested: null, curveCurrent: null, frozenUntilDay: null, previous: null,
    outcome: null, outcomeNote: null, openSinceDay: null, withdrawnDay: null,
    ...overrides,
  };
};
const K2_SUGGESTION = { from: 1_000, to: 1_250, step: 250, direction: 'raise', ruleId: 'K2-R', rationale: 'liked posts net-zero at 7–30 d while decay is not the explanation', respects: ['view ≤ like ≤ comment', '|dislike| ≤ like', 'range 500–3,000 m'] };
const K2_ARITHMETIC = 'posts.liked = 10 ≥ 8 ∧ netPosLiked(d7to30) = 2 / 10 = 0.20 < 0.50 ∧ lossRatio(d7to30) = 0 / 6,000 = 0.00 ≤ 1.50';
const suggestK2 = (overrides = {}) => verdictRow('K2', {
  gates: [reportGate('Gc', 54, 30), reportGate('Gd', 10, 8), reportGate('Gprod', 40, 30)],
  evidence: [{ id: 'M1.gain.d30', value: 6_000, unit: 'm', n: 54 }, { id: 'share.like.d30', value: 1.6667, unit: 'ratio', numerator: 10_000, denominator: 6_000 }, { id: 'M3.likers.d30', value: 4, unit: 'count' }],
  verdict: 'suggest', reason: 'in-range', reasonText: 'raise 1,000 → 1,250 · rule K2-R · Gc 54/30 (actors 7/2 · max share 0.33) · Gd 10/8 · Gprod 40/30',
  rule: { id: 'K2-R', text: 'posts.liked ≥ 8 ∧ netPosLiked(d7to30) < 0.5 ∧ lossRatio(d7to30) ≤ 1.5', inputs: { 'posts.liked': 10, 'netPosLiked.d7to30': 0.2, 'lossRatio.d7to30': 0 } },
  arithmetic: K2_ARITHMETIC, suggestion: { ...K2_SUGGESTION }, outcome: 'open', openSinceDay: REPORT_DAY,
  ...overrides,
});
const NONE_SENTENCE = 'NO SUGGESTION TODAY. 0 of 6 tunable knobs cleared a gate: 0/30 real events in the 30 d ending 12 Sep, 0/2 real actors in that window, 0/8 tester posts with a real engagement in it. K7 (decay) is in trial mode. Nothing is applied by this report: production pays what the SEEN column shows until you deploy.';
const SUGGEST_SENTENCE = 'suggest raising the like grant 1,000 → 1,250 m · declared 1,000 · seen 1,000 (n 40, all classes) — to apply it you would edit functions/src/postEngagementPolicy.ts · radiusDelta · like literal, deploy recordPostEngagement, node scripts/syncShared.js (functions-digest), .codex/deploy-nearby-pops-digest.sh · nothing is applied by this report; production pays 1,000 m until you deploy';
const VERDICTS_COLUMNS = ['knob', 'name', 'tunable', 'declaredValue', 'unit', 'seenValue', 'seenN', 'seenBasis', 'productionPays', 'verdict', 'reason', 'reasonText', 'ruleId', 'direction', 'from', 'to', 'step', 'arithmetic', 'gateIds', 'gateN', 'gateMinN', 'gateSufficient', 'evidenceIds', 'respects', 'where', 'deploy', 'previousVerdict', 'previousTo', 'outcome', 'openSinceDay', 'withdrawnDay', 'frozenUntilDay'];
const METRICS_COLUMNS = ['id', 'window', 'population', 'unit', 'value', 'n', 'numerator', 'denominator', 'gate.n', 'gate.minN', 'gate.sufficient', 'gate.basis', 'previous.from', 'previous.delta', 'previous.gateFlip'];
const DAYS_COLUMNS = ['row', 'day', 'observedPolicy', 'people.actors', 'people.maxShare', 'realPostGain.real.total', 'realPostGain.synthetic.total', 'realPostDecayLoss.byMode.trial', 'realPostDecayLoss.trialMultiplierSeen', 'trialClass', 'productionEpoch', 'netReal.byAge.lt7d.perPostDay', 'netReal.byAge.lt7d.posts', 'viewWorth.views', 'spanned', 'observedPolicySpanned', 'days'];
const POSTS_COLUMNS = ['postId', 'cls', 'ownerClass', 'channelId', 'createdAtMillis', 'seedMeters', 'currentMeters', 'organicMeters', 'boostMeters', 'peakMeters', 'peakAtMillis', 'entries', 'realGain', 'ownerGain', 'reviewGain', 'syntheticGain', 'unknownGain', 'decayLoss', 'decayLossRealShare', 'decayModeSeen', 'clean', 'viewCount', 'firstRealEngagementAtMillis', 'lastAtMillis', 'lastCause', 'atClaim', 'expired', 'deletedAtMillis', 'day', 'gr', 'go', 'gv', 'gs', 'gu', 'dl', 'dlr', 'vc', 'realGainD30', 'rkView', 'rkLike', 'rkComment', 'rkDislike', 'lastRealAtMillis', 'ageBucketAtD'];
const bucketRow = (posts, perPostDay) => ({ posts, netPositive: Math.min(posts, 2), postDays: posts * 20, gainRealMeters: posts * 600, lossRealShareMeters: 0, perPostDay });
const signature = (view = 1_000, like = 1_000) => ({ view, like, comment: 2_000, dislike: -1_000, repeatBase: 500, seedSeen: null });

/**
 * One report document as the generator writes it (§1.2). `suggest: true` is
 * the K2-R world (trial off, one suggestion); the default is the n = 0 memo
 * under the ×5 trial. `evidence` is the JSON string the document stores.
 */
const reportFixture = (options = {}) => {
  const suggest = options.suggest === true;
  const trialOn = !suggest;
  const verdicts = KNOB_ROWS.map(([knob]) => (knob === 'K2' && suggest ? suggestK2() : verdictRow(knob, knob === 'K7' && suggest ? { verdict: 'hold', reason: 'in-range', reasonText: 'no rule fired', gates: [reportGate('Gc', 54, 30), reportGate('Gd', 10, 8), reportGate('Gage', 10, 8)] } : {})));
  const days = Array.from({ length: 30 }, (_, index) => reportDayRow(29 - index));
  const windows = {
    d1: reportWindowRow(1),
    d7: reportWindowRow(7),
    d30: reportWindowRow(30, {
      // A rate over 2 posts and a per-view figure over 3 clean posts: the generator nulls these; a foreign document might not.
      netReal: { byAge: { lt7d: bucketRow(2, 25), d7to30: bucketRow(10, 29), gt30d: bucketRow(0, null) }, all: bucketRow(12, 28) },
      viewWorth: { metersPaid: 0, paidViews: 0, views: 4, cleanPosts: 3, viewSampleDays: 0 },
    }),
  };
  const metrics = {
    'M1.gain.d30': metricRow('M1.gain.d30', suggest ? 6_000 : 0, { n: suggest ? 54 : 0, gate: reportGate('Gc', suggest ? 54 : 0, 30) }),
    'share.like.d30': metricRow('share.like.d30', suggest ? 1.6667 : null, { unit: 'ratio', n: suggest ? 54 : 0, gate: reportGate('Gc', suggest ? 54 : 0, 30), numerator: suggest ? 10_000 : 0, denominator: suggest ? 6_000 : 0 }),
    'netPos.lt7d.d30': metricRow('netPos.lt7d.d30', 0.5, { unit: 'ratio', n: 2, gate: reportGate('Gposts.lt7d', 2, 8), numerator: 1, denominator: 2 }),
    'M6.lt7d.perPostDay.d30': metricRow('M6.lt7d.perPostDay.d30', 25, { unit: 'm/post-day', n: 2, gate: reportGate('Gposts.lt7d', 2, 8) }),
    'M6.lt7d.gainRealMeters.d30': metricRow('M6.lt7d.gainRealMeters.d30', 1_200, { n: 2 }),
    'M17.readsOnDay': metricRow('M17.readsOnDay', 1_234, { unit: 'count', n: null, window: 'd1', population: 'cost', basis: '' }),
    'M3.actors': metricRow('M3.actors', suggest ? 7 : 0, { unit: 'count', n: null, window: 'lifetime', basis: 'lifetime real actors (≤ 500) — printed as lifetime, gates nothing' }),
    ...(suggest ? { 'M5.trial.after': metricRow('M5.trial.after', 0, { window: 'after' }) } : {}),
  };
  const evidence = {
    day: { ...reportDayRow(0, { people: people(suggest ? 7 : 0) }), trialMultipliers: trialOn ? { 5: 12 } : {}, earnedPolicy: false },
    windows,
    days,
    observedOnDay: observedBlockRow(0),
    observed7d: observedBlockRow(40),
    posts: [
      { ...postSummary(40, { cls: 'real', ownerClass: 'real', channelId: 'live' }), dayGain: { gr: 1_000, go: 0, gv: 0, gs: 0, gu: 0, dl: 0, dlr: 0, vc: 3 }, realGainD30: 3_000, rk: { v: 2, l: 1, c: 0, d: 0 }, lastRealAtMillis: NOW, ageBucketAtD: 'd7to30' },
      { ...postSummary(1), dayGain: null, realGainD30: 0, rk: { v: 0, l: 0, c: 0, d: 0 }, lastRealAtMillis: null, ageBucketAtD: 'lt7d' },
    ],
    channels: [{ channelId: 'live', realPosts: 10, realGainMeters: 6_000, postDays: 205.31, gainPerPostDay: null, medianMinutesToFirstRealEngagement: null, n: 18, sufficient: false, dayGainMeters: 0, d30GainMeters: 6_000 }],
    snapshots: {
      seedRest: digestFixture().seedRest,
      claims: digestFixture().claims,
      contamination: { d7: { ...digestFixture().contamination.d7, simulationOwnerUid: 'set' } },
      intercept: { realized: { entries: 54, distinctPosts: 10, distinctActors: 7 }, opportunity: { pairs: 90, nearMissPairs: 2, postsWithAnyPair: 10, realAccountsWithLocation: 10 } },
      anchors: { worldMeters: WORLD, everAtWorld: 22, atWorld: 0, rows: [] },
      curve: digestFixture().curve,
      questions: digestFixture().questions,
      gaps: digestFixture().gaps,
    },
    metrics,
  };
  const decision = suggest ? {
    kind: 'suggest', knob: 'K2', sentence: SUGGEST_SENTENCE, appliedByReport: false,
    productionPays: { knob: 'K2', value: 1_000, n: 40, basis: 'all actor classes incl. simulation · 7 d' },
    action: { where: 'functions/src/postEngagementPolicy.ts · radiusDelta · like literal', from: 1_000, to: 1_250, unit: 'm', deploy: GRANT_DEPLOY },
    deferred: [], open: [{ knob: 'K2', to: 1_250, ruleId: 'K2-R', openSinceDay: REPORT_DAY, outcome: 'open', missedReports: 0 }],
    counts: { suggest: 1, verify: 0, hold: 1, insufficient: 5, fixed: 10 }, ownerQuestion: null,
  } : {
    kind: 'none', knob: null, sentence: NONE_SENTENCE, appliedByReport: false, productionPays: null, action: null, deferred: [], open: [],
    counts: { suggest: 0, verify: 0, hold: 0, insufficient: 7, fixed: 10 }, ownerQuestion: 'is the ×5 trial a decision or an incident? (K14)',
  };
  return {
    version: 1, digestSchema: 1, day: REPORT_DAY, timeZone: 'America/Toronto', dayStartMillis: TORONTO(2026, 9, 12), dayEndMillis: TORONTO(2026, 9, 13),
    generatedAtMillis: TORONTO(2026, 9, 13, 0, 45), runId: 'run-2026-09-13T04-45', digestVersion: 18, revision: 1, supersedes: null,
    partial: false, backfilled: false, catchUp: false, snapshotsAsOfMillis: TORONTO(2026, 9, 13, 0, 45),
    productionEpoch: 'e1e1e1e1', sourcePolicyVersion: '07b43286', knobsHash: '3aaffe1e', ruleSetVersion: '8f5fe85e',
    trialOnDay: trialOn, trialMultiplierOnDay: trialOn ? 5 : null,
    primarySuggestion: suggest ? 'K2' : null, verdictCounts: decision.counts, bytes: 95_000,
    firstLine: trialOn
      ? 'DECAY TRIAL ×5 ON since 8 Sep 00:07Z (boost path since 8 Sep 05:26Z) — every seed and every official anchor is decaying; the 5 km floor decision is not in force. Seen on 2026-09-12: ×5 on 20,933 m of real-post loss. Anchors 0/22 at world.'
      : 'Decay ×1 · no trial · no trial multiplier seen in 30 d (switch off at the writing run; no multiplier seen on 2026-09-12)',
    headline: {
      trialOnDay: trialOn, trialMultiplierOnDay: trialOn ? 5 : null, switchAtRun: { enabled: trialOn, multiplier: 5 }, trialSinceMillis: 1788826046064, boostedSinceMillis: 1788845178241,
      trialSeenOnDay: trialOn ? 5 : null, trialClassOnDay: trialOn ? 'trial' : null, trialShareD30: trialOn ? 1 : null, anchorsAtWorld: 0, anchorsEver: 22, worstAnchor: { postId: 'post-official-cartoon-drive-ad', radiusMeters: 29_061, ratePerPassSeen: 0.0115 },
      coverage: { complete: true, postsBehindHorizon: 0, evicted: 0, entriesFoldedOnDay: 460, registeredPosts: { real: 0, owner: 3, review: 0, official: 22 }, nonLivePollLagRuns: 3, kindSplitSinceMillis: 0, trimmed: false },
      cost: { readsOnDay: 1_234, runsOnDay: 24, cadOnDay: 0.000617, monthlyCadProjected: 0.054 },
    },
    decision,
    policy: {
      reportSchemaVersion: 1, digestSchema: 1, ruleSetVersion: '8f5fe85e', digestVersion: 18, runId: 'run-2026-09-13T04-45',
      source: { knobs: digestFixture().knobs, knobsHash: '3aaffe1e', sourcePolicyVersion: '07b43286', sourceSignature: signature(), policySha256: 'f'.repeat(64), identitySha256: 'e'.repeat(64), syncedAtMillis: NOW, knobsStale: false, knobChangedDays: { likeMeters: null, decayPerDay: '2026-09-01' }, lastSyncDay: '2026-09-11', lastSyncNote: 'last sync (every deploy) — gates nothing' },
      production: { observedPolicy: { version: '03416b1f', since: NOW - (5 * DAY_MS), complete: false }, dayObservedPolicy: { version: '03416b1f', earned: true }, dayObservedSignature: { ...signature(), n: 200 }, rolling7dSignature: signature(), observedPolicySpanned: { d7: ['03416b1f'], d30: ['03416b1f', 'a1b2c3d4'], after: null, note: 'digest, hash-based' }, sourceMatchesObserved: null },
      decay: { switch: { enabled: trialOn, multiplier: 5, scope: 'all-users', effectiveAtMillis: 1788826046064, boostedEffectiveAtMillis: 1788845178241 }, dueDecayEnabled: true, seenOnDay: { trialMultiplierSeen: trialOn ? 5 : null, byMode: { normal: 0, trial: trialOn ? 20_933 : 0, stress: 0, undetermined: 0 }, trialClass: trialOn ? 'trial' : null }, declaredRatePerDay: 0.05, observedRatePerDay: null, observedRateNote: 'unobservable from state' },
      simulation: { simulationEnabled: false, runnerEnabled: true, dailySimulationEnabled: true, simulationOwnerUid: 'set' },
      productionEpoch: 'e1e1e1e1',
    },
    verdicts,
    checks: [
      { id: 'drift', status: 'clear', basis: 'seen in production by ALL actor classes incl. simulation · 7 d ending D', rows: { view: { seen: 1_000, declared: 1_000, n: 40, status: 'clear' }, seed: { seen: null, declared: 5_000, n: 0, status: 'unseen' } }, verify: [], awaitingDeploy: [] },
      { id: 'farmBound', status: 'clear', detail: 'per-actor ceiling 4,994 m × 7 lifetime real actors', ceilingMeters: 4_994, lifetimeRealActors: 7, violations: 0 },
      { id: 'claimCeiling', status: 'finding', asOfCommit: 'ab6489ba', text: 'three definitions', claimsD30: { count: 10, atFloor: 10, medianMeters: 5_000, maxMeters: 5_000, aboveFloorThatEarned: 0 }, direction: null },
      { id: 'anchors', status: trialOn ? 'watch' : 'clear', atWorld: 0, everAtWorld: 22, worst: { postId: 'post-official-cartoon-drive-ad', radiusMeters: 29_061, ratePerPassSeen: 0.0115 } },
      { id: 'surface', status: 'unmeasured', labelledEntries: 0, note: 'no per-surface figure is claimed' },
      { id: 'seedReach', status: trialOn ? 'hidden' : 'finding', basis: 'proxy: last post location', atClaimShare: trialOn ? null : 0.8, livePosts: 10, pairs: 90, nearMissPairs: 2, cleanPosts: 10, note: null },
    ],
    previous: null, previousUnavailable: 'first-report',
    epochs: [{ id: 'e1e1e1e1', fromDay: reportDayKey(29), toDay: REPORT_DAY, days: 30, signature: { grants: { view: 1_000, like: 1_000 }, trial: trialOn ? 'trial' : null, trialMultiplier: trialOn ? 5 : null }, boundaryCause: 'window-start', movedFields: [] }],
    csvColumns: { verdicts: VERDICTS_COLUMNS, metrics: METRICS_COLUMNS, days: DAYS_COLUMNS, posts: POSTS_COLUMNS, identityPrefix: [...REPORT_CSV_IDENTITY_PREFIX] },
    evidence: JSON.stringify(evidence),
  };
};
/** The same document with one field deep inside `evidence` patched. */
const withEvidence = (doc, patch) => ({ ...doc, evidence: JSON.stringify(patch(JSON.parse(doc.evidence))) });
const rowsOf = (csv) => csv.split('\r\n');
const cellsOf = (line) => {
  // Enough of RFC 4180 to read the fixture's quoted cells back.
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') { cell += '"'; index += 1; } else if (char === '"') quoted = false; else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { cells.push(cell); cell = ''; } else cell += char;
  }
  cells.push(cell);
  return cells;
};
const column = (csv, name) => {
  const lines = rowsOf(csv).map(cellsOf);
  const index = lines[0].indexOf(name);
  assert.notEqual(index, -1, `column ${name}`);
  return lines.slice(1).map(cells => cells[index]);
};
const UID_PATTERN = /RealActor\d|realActorEntries|eoP2Z0ElxIa0Eua7xpFxNlr6tur1|LiEG6SNtKEZN6eEGeybf0afZnHm1/;

test('algorithmReport() round-trips the n = 0 memo: every figure gated, the trial first line per day, nothing applied', () => {
  const report = algorithmReport(reportFixture());
  assert.ok(report);
  assert.equal(report.version, 1);
  assert.equal(report.day, REPORT_DAY);
  assert.equal(report.revision, 1);
  assert.equal(report.trialOnDay, true);
  assert.equal(report.trialMultiplierOnDay, 5);
  assert.ok(report.firstLine.startsWith('DECAY TRIAL ×5 ON since'));
  assert.equal(report.decision.kind, 'none');
  assert.equal(report.decision.appliedByReport, false);
  assert.equal(report.decision.action, null);
  assert.equal(report.primarySuggestion, null);
  assert.ok(report.decision.sentence.startsWith('NO SUGGESTION TODAY.'));
  assert.deepEqual(report.verdictCounts, { suggest: 0, verify: 0, hold: 0, insufficient: 7, fixed: 10 });
  assert.equal(report.verdicts.length, 17);
  for (const row of report.verdicts) {
    assert.equal(row.suggestion, null);
    assert.notEqual(row.verdict, 'suggest');
    if (row.tunable) assert.equal(row.verdict, 'insufficient');
  }
  assert.equal(report.verdicts.find(row => row.knob === 'K7').reason, 'trial');
  assert.equal(report.verdicts.find(row => row.knob === 'K6').reason, 'unmeasured');
  assert.equal(report.verdicts.find(row => row.knob === 'K9').reason, 'owner-fixed');
  assert.deepEqual(report.verdicts.find(row => row.knob === 'K2').gates.map(gate => `${gate.id}:${gate.n}/${gate.minN}:${gate.sufficient}`), ['Gc:0/30:false', 'Gd:0/8:false', 'Gprod:40/30:true']);
  assert.equal(report.headline.cost.readsOnDay, 1_234);
  assert.equal(report.headline.anchorsEver, 22);
  assert.equal(report.headline.coverage.nonLivePollLagRuns, 3);
  assert.equal(report.policy.decay.observedRatePerDay, null);
  assert.equal(report.policy.production.sourceMatchesObserved, null);
  assert.deepEqual(report.policy.source.knobChangedDays, { likeMeters: null, decayPerDay: '2026-09-01' });
  assert.equal(report.policy.source.knobs.likeMeters, 1_000);
  assert.equal(report.policy.simulation.simulationOwnerUid, 'set');
  assert.equal(report.previous, null);
  assert.equal(report.previousUnavailable, 'first-report');
  assert.equal(report.epochs.length, 1);
  assert.equal(report.epochs[0].signature.trial, 'trial');
  assert.equal(report.checks.length, 6);
  assert.equal(report.checks.find(check => check.id === 'seedReach').status, 'hidden');
  assert.deepEqual(report.checks.find(check => check.id === 'farmBound').numbers, { ceilingMeters: 4_994, lifetimeRealActors: 7, violations: 0 });
  assert.equal(report.checks.find(check => check.id === 'drift').rows.seed.status, 'unseen');
  assert.equal(report.checks.find(check => check.id === 'claimCeiling').claimsD30.atFloor, 10);
  assert.equal(report.evidence.days.length, 30);
  assert.equal(report.evidence.daysRaw.length, 30);
  assert.equal(report.evidence.days[29].day, REPORT_DAY);
  assert.equal(report.evidence.dayTyped.day, REPORT_DAY);
  assert.deepEqual(Object.keys(report.evidence.windows), ['d1', 'd7', 'd30', 'before', 'after']);
  assert.equal(report.evidence.windows.before, null);
  assert.deepEqual(report.evidence.windows.d30.spanned, ['e1e1e1e1']);
  assert.equal(report.evidence.posts.length, 2);
  assert.deepEqual(report.evidence.posts[0].rk, { v: 2, l: 1, c: 0, d: 0 });
  assert.equal(report.evidence.posts[0].ageBucketAtD, 'd7to30');
  assert.equal(report.evidence.posts[1].dayGain, null);
  assert.equal(report.evidence.channels[0].d30GainMeters, 6_000);
  assert.equal(report.evidence.snapshots.intercept.opportunity.nearMissPairs, 2);
  assert.equal(report.evidence.snapshots.anchors.atWorld, 0);
  assert.equal(report.evidence.snapshots.contamination.d7.simulationOwnerUid, 'set');
  assert.equal(report.evidence.observed7d.grants.repeat.n, 40);
  assert.equal(report.evidence.metrics['M17.readsOnDay'].value, 1_234);
  assert.equal(report.csvColumns.verdicts.length, 32);
  assert.deepEqual(report.csvColumns.identityPrefix, [...REPORT_CSV_IDENTITY_PREFIX]);
  // `evidence` already parsed (the proxy may forward it so) normalises identically.
  const parsed = algorithmReport({ ...reportFixture(), evidence: JSON.parse(reportFixture().evidence) });
  assert.deepEqual(parsed, report);
});

test('algorithmReport() refuses a foreign schema, the oversize marker and an unparsable evidence — never zeros', () => {
  const doc = reportFixture();
  assert.equal(algorithmReport({ ...doc, version: 2 }), null);
  assert.equal(algorithmReport({ ...doc, version: '1' }), null);
  assert.equal(algorithmReport(null), null);
  assert.equal(algorithmReportVersion({ version: 2 }), 2);
  assert.equal(algorithmReportVersion({}), 0);
  assert.equal(algorithmReportVersion(null), null);
  assert.deepEqual(algorithmReportRefusal({ version: 2, unsupportedVersion: true, day: REPORT_DAY }), { reason: 'unsupported-version', version: 2, digestVersion: null, day: REPORT_DAY, revision: null });
  assert.deepEqual(algorithmReportRefusal({ ...doc, version: 2 }), { reason: 'unsupported-version', version: 2, digestVersion: 18, day: REPORT_DAY, revision: 1 });
  assert.deepEqual(algorithmReportRefusal({ version: 1, day: REPORT_DAY, oversize: true }), { reason: 'oversize', version: 1, digestVersion: null, day: REPORT_DAY, revision: null });
  assert.equal(algorithmReport({ version: 1, day: REPORT_DAY, oversize: true }), null);
  assert.deepEqual(algorithmReportRefusal({ ...doc, evidence: '{"day":' }), { reason: 'evidence', version: 1, digestVersion: 18, day: REPORT_DAY, revision: 1 });
  assert.equal(algorithmReport({ ...doc, evidence: '{"day":' }), null);
  assert.equal(algorithmReport({ ...doc, evidence: undefined }), null);
  assert.equal(algorithmReport({ ...doc, evidence: 'x'.repeat(1_048_577) }), null);
  assert.equal(algorithmReportRefusal(doc), null);
  assert.equal(algorithmReportRefusal(null), null);
});

test('gates come only from the document: a missing or stringly `sufficient` is never sufficient', () => {
  const doc = reportFixture({ suggest: true });
  doc.verdicts = doc.verdicts.map(row => (row.knob === 'K1'
    ? { ...row, gates: [{ id: 'Gc', label: 'Gc', n: 54, minN: 30 }, { id: 'Gd', label: 'Gd', n: 10, minN: 8, sufficient: 'true' }, { id: 'Gx', label: 'Gx', n: 1, minN: 0, sufficient: true }] }
    : row));
  const report = algorithmReport(doc);
  assert.deepEqual(report.verdicts.find(row => row.knob === 'K1').gates.map(gate => gate.sufficient), [false, false, true]);
  assert.deepEqual(report.verdicts.find(row => row.knob === 'K2').gates.map(gate => gate.sufficient), [true, true, true]);
  assert.equal(report.evidence.metrics['M1.gain.d30'].gate.sufficient, true);
  assert.equal(algorithmReport(reportFixture()).evidence.metrics['M1.gain.d30'].gate.sufficient, false);
});

test('a suggestion under an insufficient gate is dropped to insufficient/gate and the card is reconciled', () => {
  const good = algorithmReport(reportFixture({ suggest: true }));
  const k2 = good.verdicts.find(row => row.knob === 'K2');
  assert.equal(k2.verdict, 'suggest');
  assert.deepEqual(k2.suggestion, K2_SUGGESTION);
  assert.equal(k2.arithmetic, K2_ARITHMETIC);
  assert.equal(k2.productionPays, 1_000);
  assert.equal(good.decision.kind, 'suggest');
  assert.equal(good.decision.knob, 'K2');
  assert.equal(good.primarySuggestion, 'K2');
  assert.deepEqual(good.decision.action, { where: 'functions/src/postEngagementPolicy.ts · radiusDelta · like literal', from: 1_000, to: 1_250, unit: 'm', deploy: GRANT_DEPLOY });
  assert.equal(good.decision.open.length, 1);
  assert.deepEqual(good.verdictCounts, { suggest: 1, verify: 0, hold: 1, insufficient: 5, fixed: 10 });

  // Gd one post short: the same row must never show 1,250 anywhere.
  const doc = reportFixture({ suggest: true });
  doc.verdicts = doc.verdicts.map(row => (row.knob === 'K2' ? { ...row, gates: [reportGate('Gc', 54, 30), reportGate('Gd', 7, 8), reportGate('Gprod', 40, 30)] } : row));
  const dropped = algorithmReport(doc);
  const row = dropped.verdicts.find(verdict => verdict.knob === 'K2');
  assert.equal(row.verdict, 'insufficient');
  assert.equal(row.reason, 'gate');
  assert.equal(row.suggestion, null);
  assert.ok(row.reasonText.startsWith('insufficient evidence — n = 7 · needs 8 (Gd)'), row.reasonText);
  assert.equal(dropped.decision.kind, 'none');
  assert.equal(dropped.decision.knob, null);
  assert.equal(dropped.decision.action, null);
  assert.equal(dropped.primarySuggestion, null);
  assert.ok(dropped.decision.sentence.startsWith('NO SUGGESTION TODAY.'));
  assert.ok(!dropped.decision.sentence.includes('1,250'));
  assert.deepEqual(dropped.verdictCounts, { suggest: 0, verify: 0, hold: 1, insufficient: 6, fixed: 10 });
  assert.equal(column(reportVerdictsCsv(dropped), 'to')[1], '');
  assert.equal(column(reportVerdictsCsv(dropped), 'verdict')[1], 'insufficient');

  // Gprod counts too (the conservative reading of §2.5 pre(K)); a suggestion on a hold row, on an untunable
  // knob, or a suggest verdict without a suggestion, all fall the same way — the generator's own line 619 rule.
  const gprod = reportFixture({ suggest: true });
  gprod.verdicts = gprod.verdicts.map(verdict => (verdict.knob === 'K2' ? { ...verdict, gates: [reportGate('Gc', 54, 30), reportGate('Gd', 10, 8), reportGate('Gprod', 12, 30)] } : verdict));
  assert.equal(algorithmReport(gprod).verdicts.find(verdict => verdict.knob === 'K2').suggestion, null);
  const onHold = reportFixture({ suggest: true });
  onHold.verdicts = onHold.verdicts.map(verdict => (verdict.knob === 'K2' ? { ...verdict, verdict: 'hold', reason: 'in-range' } : verdict));
  const held = algorithmReport(onHold).verdicts.find(verdict => verdict.knob === 'K2');
  assert.equal(`${held.verdict}/${held.reason}`, 'insufficient/gate');
  assert.equal(held.suggestion, null);
  const untunable = reportFixture();
  untunable.verdicts = untunable.verdicts.map(verdict => (verdict.knob === 'K9' ? { ...verdict, verdict: 'suggest', reason: 'in-range', suggestion: { from: 5_000, to: 6_000, step: 1_000, direction: 'raise', ruleId: 'K9-R', rationale: 'x', respects: [] } } : verdict));
  const k9 = algorithmReport(untunable).verdicts.find(verdict => verdict.knob === 'K9');
  assert.equal(k9.suggestion, null);
  assert.notEqual(k9.verdict, 'suggest');
  const bare = reportFixture({ suggest: true });
  bare.verdicts = bare.verdicts.map(verdict => (verdict.knob === 'K2' ? { ...verdict, suggestion: null } : verdict));
  assert.equal(`${algorithmReport(bare).verdicts.find(verdict => verdict.knob === 'K2').verdict}`, 'insufficient');
  // The same-day drop above blames the gate it found; a card naming a knob whose row neither suggests nor is
  // restated by an earlier open entry is malformed and reads NO SUGGESTION without claiming a gate failed.
  assert.ok(dropped.decision.sentence.includes('arrived under an insufficient gate (Gd 7/8)'), dropped.decision.sentence);
  const stray = reportFixture({ suggest: true });
  stray.verdicts = stray.verdicts.map(verdict => (verdict.knob === 'K2' ? { ...verdict, verdict: 'hold', reason: 'in-range', suggestion: null, outcome: null, openSinceDay: null } : verdict));
  stray.decision = { ...stray.decision, open: [] };
  const strayReport = algorithmReport(stray);
  assert.equal(strayReport.decision.kind, 'none');
  assert.equal(strayReport.decision.action, null);
  assert.ok(strayReport.decision.sentence.startsWith('NO SUGGESTION TODAY. The document named K2 but that row carries no admissible suggestion'), strayReport.decision.sentence);
  assert.ok(!strayReport.decision.sentence.includes('insufficient gate'), strayReport.decision.sentence);
  // Below the observation floor the row never prints "production pays".
  const thin = reportFixture();
  thin.verdicts = thin.verdicts.map(verdict => (verdict.knob === 'K1' ? { ...verdict, seenN: 12, productionPays: 1_000 } : verdict));
  assert.equal(algorithmReport(thin).verdicts.find(verdict => verdict.knob === 'K1').productionPays, null);
});

/** The generator's day-2 shape (decision 15, §2.5 R3): the card restates the open suggestion while the row is
 *  `hold/open` (or `insufficient/trial` for an open K7, or `adopted-in-source` with Gprod false) — `open[]`
 *  carries the knob with an EARLIER `openSinceDay` and the same `to`; the row's own `suggestion` is null. */
const OPEN_SINCE = reportDayKey(1);
const stickyK2Fixture = (rowOverrides = {}, decisionOverrides = {}) => {
  const doc = reportFixture({ suggest: true });
  doc.verdicts = doc.verdicts.map(verdict => (verdict.knob === 'K2'
    ? { ...verdict, verdict: 'hold', reason: 'open', reasonText: `open suggestion since ${OPEN_SINCE} — restated, not re-derived: K2-R → 1,250`, suggestion: null, outcome: 'open', openSinceDay: OPEN_SINCE, ...rowOverrides }
    : verdict));
  doc.decision = {
    ...doc.decision,
    sentence: SUGGEST_SENTENCE.replace('1,250 m ·', `1,250 m (open since ${OPEN_SINCE}) ·`),
    open: [{ knob: 'K2', to: 1_250, ruleId: 'K2-R', openSinceDay: OPEN_SINCE, outcome: 'open', missedReports: 0 }],
    counts: { suggest: 0, verify: 0, hold: 2, insufficient: 5, fixed: 10 },
    ...decisionOverrides,
  };
  doc.verdictCounts = doc.decision.counts;
  return doc;
};

test('the sticky open suggestion survives on the card day after day: hold/open, an open K7 under the trial, adopted-in-source awaiting its deploy', () => {
  // Day 2: the K2 row is hold/open with no suggestion of its own; the card keeps K2 with from → to and the deploy steps.
  const day2 = algorithmReport(stickyK2Fixture());
  const k2 = day2.verdicts.find(row => row.knob === 'K2');
  assert.equal(`${k2.verdict}/${k2.reason}`, 'hold/open');
  assert.equal(k2.suggestion, null, 'the row itself never re-derives a value');
  assert.equal(day2.decision.kind, 'suggest');
  assert.equal(day2.decision.knob, 'K2');
  assert.equal(day2.primarySuggestion, 'K2');
  assert.deepEqual(day2.decision.action, { where: 'functions/src/postEngagementPolicy.ts · radiusDelta · like literal', from: 1_000, to: 1_250, unit: 'm', deploy: GRANT_DEPLOY });
  assert.ok(day2.decision.sentence.startsWith('suggest raising the like grant 1,000 → 1,250 m (open since'), day2.decision.sentence);
  assert.deepEqual(day2.decision.open, [{ knob: 'K2', to: 1_250, ruleId: 'K2-R', openSinceDay: OPEN_SINCE, outcome: 'open', missedReports: 0 }]);
  assert.deepEqual(day2.verdictCounts, { suggest: 0, verify: 0, hold: 2, insufficient: 5, fixed: 10 });
  // The verdicts CSV still carries no value of the knob's kind on the row: the restatement lives on the card only.
  assert.equal(column(reportVerdictsCsv(day2), 'to')[1], '');
  assert.equal(column(reportVerdictsCsv(day2), 'verdict')[1], 'hold');
  // Adopted in source, awaiting its deploy: declared moved to 1,250, Gprod false by design, the card still restates 1,000 → 1,250.
  const adopted = algorithmReport(stickyK2Fixture(
    { declaredValue: 1_250, outcome: 'adopted-in-source', gates: [reportGate('Gc', 54, 30), reportGate('Gd', 10, 8), reportGate('Gprod', 40, 30, false)] },
    { open: [{ knob: 'K2', to: 1_250, ruleId: 'K2-R', openSinceDay: OPEN_SINCE, outcome: 'adopted-in-source', missedReports: 0 }] },
  ));
  assert.equal(adopted.decision.kind, 'suggest');
  assert.equal(adopted.decision.knob, 'K2');
  assert.deepEqual({ from: adopted.decision.action.from, to: adopted.decision.action.to }, { from: 1_000, to: 1_250 });
  assert.equal(adopted.decision.open[0].outcome, 'adopted-in-source');
  // An open K7 under the trial: the row is insufficient/trial (evaluated before hold/open, §2.5) and the card restates the open K7-L.
  const k7Doc = reportFixture();
  k7Doc.verdicts = k7Doc.verdicts.map(verdict => (verdict.knob === 'K7'
    ? { ...verdict, gates: [reportGate('Gc', 54, 30), reportGate('Gd', 10, 8), reportGate('Gage', 10, 8)], reasonText: `trial ×5 on 2026-09-12 — open since ${OPEN_SINCE} — held, not re-evaluated while the trial runs`, outcome: 'open', openSinceDay: OPEN_SINCE }
    : verdict));
  k7Doc.decision = {
    ...k7Doc.decision, kind: 'suggest', knob: 'K7',
    sentence: `suggest lowering the earned-reach decay 0.05 → 0.04 (open since ${OPEN_SINCE}) · declared 0.05 · seen unseen — to apply it you would edit functions/src/postEngagementPolicy.ts · decayPerDay literal · nothing is applied by this report; production pays an unverified value (n < 30) until you deploy`,
    productionPays: { knob: 'K7', value: null, n: 0, basis: 'all actor classes incl. simulation · 7 d' },
    action: { where: 'functions/src/postEngagementPolicy.ts · decayPerDay literal', from: 0.05, to: 0.04, unit: '/day', deploy: GRANT_DEPLOY },
    open: [{ knob: 'K7', to: 0.04, ruleId: 'K7-L', openSinceDay: OPEN_SINCE, outcome: 'open', missedReports: 0 }],
  };
  k7Doc.primarySuggestion = 'K7';
  const k7Report = algorithmReport(k7Doc);
  const k7 = k7Report.verdicts.find(row => row.knob === 'K7');
  assert.equal(`${k7.verdict}/${k7.reason}`, 'insufficient/trial');
  assert.equal(k7.suggestion, null);
  assert.equal(k7Report.decision.kind, 'suggest');
  assert.equal(k7Report.decision.knob, 'K7');
  assert.equal(k7Report.primarySuggestion, 'K7');
  assert.deepEqual({ from: k7Report.decision.action.from, to: k7Report.decision.action.to }, { from: 0.05, to: 0.04 });
  assert.ok(k7Report.decision.sentence.startsWith('suggest lowering the earned-reach decay 0.05 → 0.04 (open since'), k7Report.decision.sentence);
  // Only an EARLIER open entry restates: the same-day entry is the row's own suggestion, so once that row lost its
  // gate the card drops (the pin above) and the entry goes with it; and a restatement must name the open `to`.
  const sameDay = reportFixture({ suggest: true });
  sameDay.verdicts = sameDay.verdicts.map(row => (row.knob === 'K2' ? { ...row, gates: [reportGate('Gc', 54, 30), reportGate('Gd', 7, 8), reportGate('Gprod', 40, 30)] } : row));
  const sameDayReport = algorithmReport(sameDay);
  assert.equal(sameDayReport.decision.kind, 'none');
  assert.deepEqual(sameDayReport.decision.open, [], 'the same-day open entry for the dropped knob goes with it');
  const wrongTo = algorithmReport(stickyK2Fixture({}, { action: { where: 'x', from: 1_000, to: 1_500, unit: 'm', deploy: [] } }));
  assert.equal(wrongTo.decision.kind, 'none');
  assert.equal(wrongTo.decision.action, null);
  assert.equal(wrongTo.decision.open.length, 1, 'an earlier open entry is never dropped by the card');
  assert.ok(!wrongTo.decision.sentence.includes('insufficient gate'), wrongTo.decision.sentence);
  // The list caption built from the index row agrees with the opened body on a restated day.
  const index = reportIndex({ version: 1, lastReportedDay: REPORT_DAY, updatedAtMillis: NOW, runId: 'run', days: [{ day: REPORT_DAY, generatedAtMillis: NOW, digestVersion: 18, revision: 1, partial: false, backfilled: false, catchUp: false, trialOn: false, trialMultiplier: null, decision: 'suggest', knob: 'K2', to: 1_250, counts: day2.verdictCounts, productionEpoch: 'e1e1e1e1', sourcePolicyVersion: '07b43286', bytes: 95_000 }] });
  assert.equal(reportsStatus(index, TORONTO(2026, 9, 13, 1)).caption, 'Sep 12 · suggests K2 like → 1,250 m');
});

test('a derived ratio or rate is null below its gate on the page even when a document carried a value; raw sums stay', () => {
  const report = algorithmReport(reportFixture());
  assert.equal(report.evidence.metrics['netPos.lt7d.d30'].value, null);
  assert.equal(report.evidence.metrics['netPos.lt7d.d30'].numerator, 1);
  assert.equal(report.evidence.metrics['netPos.lt7d.d30'].denominator, 2);
  assert.equal(report.evidence.metrics['M6.lt7d.perPostDay.d30'].value, null);
  assert.equal(report.evidence.metrics['M6.lt7d.gainRealMeters.d30'].value, 1_200);
  assert.equal(report.evidence.metrics['M1.gain.d30'].value, 0);
  assert.equal(report.evidence.windows.d30.netReal.byAge.lt7d.perPostDay, null);
  assert.equal(report.evidence.windows.d30.netReal.byAge.lt7d.posts, 2);
  assert.equal(report.evidence.windows.d30.netReal.byAge.d7to30.perPostDay, 29);
  assert.equal(report.evidence.windows.d30.viewWorth.views, null);
  assert.equal(report.evidence.windows.d30.viewWorth.cleanPosts, 3);
  // The raw window keeps the document's cell for the faithful CSV row, which the days CSV emits as published.
  assert.equal(report.evidence.windowsRaw.d30.netReal.byAge.lt7d.perPostDay, 25);
});

test('no identity reaches the page or a CSV: the uid map, a uid column and the owner uid are all dropped', () => {
  const doc = withEvidence(reportFixture({ suggest: true }), evidence => ({
    ...evidence,
    day: { ...evidence.day, realActorEntries: { RealActor0000000000000000001: { v: 1, l: 0, c: 0, d: 0 } } },
    days: evidence.days.map(row => ({ ...row, realActorEntries: { RealActor0000000000000000001: { v: 1, l: 0, c: 0, d: 0 }, other: { v: 2, l: 0, c: 0, d: 0 } } })),
    snapshots: { ...evidence.snapshots, contamination: { d7: { ...evidence.snapshots.contamination.d7, simulationOwnerUid: 'eoP2Z0ElxIa0Eua7xpFxNlr6tur1' } } },
  }));
  doc.csvColumns = { ...doc.csvColumns, days: [...DAYS_COLUMNS, 'realActorEntries.RealActor0000000000000000001.v'] };
  doc.policy = { ...doc.policy, simulation: { ...doc.policy.simulation, simulationOwnerUid: 'eoP2Z0ElxIa0Eua7xpFxNlr6tur1' } };
  const report = algorithmReport(doc);
  assert.equal(report.policy.simulation.simulationOwnerUid, 'set');
  assert.equal(report.evidence.snapshots.contamination.d7.simulationOwnerUid, 'set');
  assert.ok(!('realActorEntries' in report.evidence.day));
  assert.ok(report.evidence.daysRaw.every(row => !('realActorEntries' in row)));
  assert.ok(!report.csvColumns.days.some(name => name.startsWith('realActorEntries')));
  assert.ok(!UID_PATTERN.test(JSON.stringify(report)));
  const csvs = [reportVerdictsCsv(report), reportMetricsCsv(report), reportDaysCsv(report), reportPostsCsv(report), reportCompareCsv(report, report), reportsRangeCsv([report])];
  for (const csv of csvs) assert.ok(!UID_PATTERN.test(csv));
  // The fallback column discovery (a document without csvColumns.days) excludes the key as well.
  const bare = algorithmReport({ ...doc, csvColumns: { ...doc.csvColumns, days: [] } });
  assert.ok(!rowsOf(reportDaysCsv(bare))[0].includes('realActorEntries'));
  assert.ok(rowsOf(reportDaysCsv(bare))[0].includes('people.actors'));
});

test('compareReports() puts the same metrics side by side: delta null when either side is null, gate flips as their own signal', () => {
  const a = algorithmReport(reportFixture());
  const b = algorithmReport(reportFixture({ suggest: true }));
  const comparison = compareReports(a, b);
  assert.equal(comparison.refusal, null);
  assert.deepEqual(comparison.policyChanged, []);
  assert.equal(comparison.a.day, REPORT_DAY);
  assert.deepEqual(comparison.a.chips, ['TRIAL ×5']);
  assert.deepEqual(comparison.b.chips, []);
  const gain = comparison.metrics.find(metric => metric.id === 'M1.gain.d30');
  assert.equal(gain.delta, 6_000);
  assert.equal(gain.gateFlip, 'gained');
  assert.equal(gain.presence, 'both');
  const share = comparison.metrics.find(metric => metric.id === 'share.like.d30');
  assert.equal(share.a.value, null);
  assert.equal(share.b.value, 1.6667);
  assert.equal(share.delta, null, 'a number appearing is never a number moving');
  assert.equal(share.gateFlip, 'gained');
  const reads = comparison.metrics.find(metric => metric.id === 'M17.readsOnDay');
  assert.equal(reads.delta, 0);
  assert.equal(reads.gateFlip, null);
  const after = comparison.metrics.find(metric => metric.id === 'M5.trial.after');
  assert.equal(after.presence, 'b');
  assert.equal(after.delta, null);
  assert.equal(after.gateFlip, null);
  const k2 = comparison.verdicts.find(row => row.knob === 'K2');
  assert.equal(k2.changed, true);
  assert.deepEqual({ a: k2.a.verdict, b: k2.b.verdict, to: k2.b.to }, { a: 'insufficient', b: 'suggest', to: 1_250 });
  assert.equal(comparison.verdicts.find(row => row.knob === 'K9').changed, false);
  assert.equal(compareReports(b, a).metrics.find(metric => metric.id === 'M1.gain.d30').delta, -6_000);
  assert.equal(compareReports(b, a).metrics.find(metric => metric.id === 'M1.gain.d30').gateFlip, 'lost');
  // A changed stamp is a change of policy, not of behaviour.
  const moved = algorithmReport({ ...reportFixture({ suggest: true }), knobsHash: 'deadbeef', ruleSetVersion: '9c1e2a7b' });
  assert.deepEqual(compareReports(a, moved).policyChanged, ['knobsHash', 'ruleSetVersion']);
  // Two schemas cannot be compared: the refusal grammar, no rows.
  const foreign = { ...b, digestSchema: 2 };
  const refused = compareReports(a, foreign);
  assert.deepEqual(refused.refusal, { reason: 'unsupported-version', version: 1, digestVersion: 2 });
  assert.deepEqual(refused.metrics, []);
  assert.deepEqual(refused.verdicts, []);
});

test('reportsStatus() captions the newest row in the verb form, never an imperative, and alarms when the report is late', () => {
  const row = (overrides = {}) => ({ day: REPORT_DAY, generatedAtMillis: TORONTO(2026, 9, 13, 0, 45), digestVersion: 18, revision: 1, partial: false, backfilled: false, catchUp: false, trialOn: false, trialMultiplier: null, decision: 'none', knob: null, to: null, counts: { suggest: 0, verify: 0, hold: 0, insufficient: 7, fixed: 10 }, productionEpoch: 'e1e1e1e1', sourcePolicyVersion: '07b43286', bytes: 95_000, ...overrides });
  const index = (...days) => reportIndex({ version: 1, lastReportedDay: days[0]?.day ?? null, updatedAtMillis: NOW, runId: 'r', days });
  const noon13 = TORONTO(2026, 9, 13, 12);
  assert.deepEqual(reportsStatus(index(row()), noon13), { text: 'Sep 12 · no suggestion · 7 insufficient · 10 fixed', caption: 'Sep 12 · no suggestion', tone: 'off' });
  assert.deepEqual(reportsStatus(index(row({ trialOn: true, trialMultiplier: 5 })), noon13), { text: 'Sep 12 · TRIAL ×5 · 7 insufficient · 10 fixed', caption: 'Sep 12 · TRIAL ×5', tone: 'warn' });
  const suggests = reportsStatus(index(row({ decision: 'suggest', knob: 'K2', to: 1_250, counts: { suggest: 1, verify: 0, hold: 1, insufficient: 5, fixed: 10 } })), noon13);
  assert.deepEqual(suggests, { text: 'Sep 12 · suggests K2 like → 1,250 m · 5 insufficient · 10 fixed', caption: 'Sep 12 · suggests K2 like → 1,250 m', tone: 'warn' });
  assert.ok(!/\b(raise|lower|apply|applied|set)\b/i.test(suggests.caption));
  assert.equal(reportsStatus(index(row({ decision: 'suggest', knob: 'K7', to: 0.04 })), noon13).caption, 'Sep 12 · suggests K7 decay → 0.04 /day');
  assert.deepEqual(reportsStatus(index(row({ decision: 'verify' })), noon13).caption, 'Sep 12 · VERIFY drift');
  assert.equal(reportsStatus(index(row({ revision: 2, backfilled: true })), noon13).text, 'Sep 12 · no suggestion · 7 insufficient · 10 fixed · REV 2 · BACKFILL');
  assert.deepEqual(reportsStatus(null), { text: 'no reports yet · written by the hourly digest at the first complete run after Toronto midnight', caption: 'none yet', tone: 'off' });
  assert.equal(reportsStatus(index(), noon13).caption, 'none yet');
  // 13 Sep's report is due at 00:45 on 14 Sep: not late at 01:00, late from 02:00 Toronto on.
  assert.equal(reportsStatus(index(row()), TORONTO(2026, 9, 14, 1)).tone, 'off');
  const late = reportsStatus(index(row()), TORONTO(2026, 9, 14, 2));
  assert.deepEqual(late, { text: 'Sep 12 · no suggestion · 7 insufficient · 10 fixed · stale — expected 00:45 (newest 2026-09-12)', caption: 'stale — expected 00:45', tone: 'warn' });
  // A report two days behind is late at any hour.
  assert.equal(reportsStatus(index(row({ day: '2026-09-11' })), TORONTO(2026, 9, 14, 1)).caption, 'stale — expected 00:45');
  // The newest row wins whatever order the frame sent.
  assert.equal(reportsStatus(index(row({ day: '2026-09-10' }), row({ day: '2026-09-11', decision: 'verify' })), TORONTO(2026, 9, 12, 12)).caption, 'Sep 11 · VERIFY drift');
});

test('reportIndex() types, deduplicates and bounds the index newest first; the dashboard frame carries it', async () => {
  const days = Array.from({ length: 130 }, (_, index) => ({ day: new Date(Date.UTC(2026, 8, 12 - index, 12)).toISOString().slice(0, 10), generatedAtMillis: NOW, digestVersion: index, revision: 1, partial: false, backfilled: index > 120, catchUp: false, trialOn: true, trialMultiplier: 5, decision: 'none', knob: null, to: null, counts: { suggest: 0, verify: 0, hold: 0, insufficient: 7, fixed: 10 }, productionEpoch: 'e1e1e1e1', sourcePolicyVersion: '07b43286', bytes: 90_000 }));
  const index = reportIndex({ version: 1, lastReportedDay: REPORT_DAY, updatedAtMillis: NOW, runId: 'run-x', days: [...days].reverse().concat([{ day: REPORT_DAY, decision: 'suggest', knob: 'K2', to: 1_250 }, { day: 'nope' }]) });
  assert.equal(index.days.length, 120);
  assert.equal(index.days[0].day, REPORT_DAY);
  assert.equal(index.days[0].decision, 'none', 'the first row for a day wins');
  assert.equal(index.days[119].day, days[119].day);
  assert.equal(index.lastReportedDay, REPORT_DAY);
  assert.equal(index.days[0].staleData, false);
  // A knob or a value rides only a suggest row; an index without lastReportedDay infers it.
  const one = reportIndex({ days: [{ day: REPORT_DAY, decision: 'none', knob: 'K2', to: 1_250, staleData: true }] });
  assert.equal(one.days[0].knob, null);
  assert.equal(one.days[0].to, null);
  assert.equal(one.days[0].staleData, true);
  assert.equal(one.lastReportedDay, REPORT_DAY);
  assert.equal(reportIndex(null), null);
  const harness = sseHarness([{ frames: [`data: ${JSON.stringify({ result: { generatedAtMs: NOW, reports: { lastReportedDay: REPORT_DAY, updatedAtMillis: NOW, days: days.slice(0, 60) } } })}\n\n`, `data: ${JSON.stringify({ result: { generatedAtMs: NOW } })}\n\n`] }]);
  const seen = [];
  const stop = subscribeOwnerDashboard(value => seen.push(value));
  try { await harness.untilDelays(1); } finally { stop(); harness.restore(); }
  assert.equal(seen[0].reports.days.length, 60);
  assert.equal(seen[0].reports.days[0].trialMultiplier, 5);
  assert.equal(seen[1].reports, null);
});

test('reportChips() are the same in list and document: TRIAL, REV, BACKFILL, CATCH-UP, PARTIAL', () => {
  assert.deepEqual(reportChips({ revision: 2, partial: true, backfilled: true, catchUp: true, trialOn: true, trialMultiplier: 5, staleData: true }), ['TRIAL ×5', 'REV 2', 'BACKFILL', 'CATCH-UP', 'PARTIAL', 'STALE DATA']);
  assert.deepEqual(reportChips({ revision: 1, partial: false, backfilled: false, catchUp: false, trialOn: false, trialMultiplier: null }), []);
  assert.deepEqual(reportChipsOf(algorithmReport({ ...reportFixture(), revision: 3, catchUp: true })), ['TRIAL ×5', 'REV 3', 'CATCH-UP']);
});

test('csvCell() ports the proxy formula guard: leading = + @ TAB CR or a non-numeric − gets an apostrophe', () => {
  assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(csvCell('+1'), "'+1");
  assert.equal(csvCell('@import'), "'@import");
  assert.equal(csvCell('\tx'), "'\tx");
  assert.equal(csvCell('-abc'), "'-abc");
  assert.equal(csvCell('-1000'), '-1000');
  assert.equal(csvCell(-1_000), '-1000');
  assert.equal(csvCell(true), 'true');
  assert.equal(csvCell(false), 'false');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(undefined), '');
  assert.equal(csvCell(Number.NaN), '');
  assert.equal(csvCell('a, "b"'), '"a, ""b"""');
  assert.equal(csvCell('=1,2'), '"\'=1,2"');
  assert.equal(csvCell({ a: 1 }), '"{""a"":1}"');
});

test('csvFixed() emits exactly csvColumns in order with the identity prefix on every row; appliedByReport is always false', () => {
  assert.equal(csvFixed(['b', 'a'], [{ a: 1, b: 2, c: 3 }, { a: null }]), 'b,a\r\n2,1\r\n,');
  const report = algorithmReport(reportFixture({ suggest: true }));
  const verdicts = rowsOf(reportVerdictsCsv(report));
  assert.equal(verdicts.length, 18);
  assert.deepEqual(cellsOf(verdicts[0]), [...REPORT_CSV_IDENTITY_PREFIX, ...VERDICTS_COLUMNS]);
  assert.deepEqual(new Set(column(reportVerdictsCsv(report), 'appliedByReport')), new Set(['false']));
  assert.deepEqual(new Set(column(reportVerdictsCsv(report), 'reportDay')), new Set([REPORT_DAY]));
  assert.deepEqual(new Set(column(reportVerdictsCsv(report), 'trialOnDay')), new Set(['false']));
  assert.deepEqual(new Set(column(reportVerdictsCsv(report), 'productionPaysValue')), new Set(['1000']));
  assert.deepEqual(new Set(column(reportVerdictsCsv(report), 'firstLine')), new Set([report.firstLine]));
  const k2 = cellsOf(verdicts[2]);
  const at = (name) => k2[[...REPORT_CSV_IDENTITY_PREFIX, ...VERDICTS_COLUMNS].indexOf(name)];
  assert.equal(at('knob'), 'K2');
  assert.equal(at('verdict'), 'suggest');
  assert.equal(at('to'), '1250');
  assert.equal(at('ruleId'), 'K2-R');
  assert.equal(at('direction'), 'raise');
  assert.equal(at('gateIds'), 'Gc|Gd|Gprod');
  assert.equal(at('gateN'), '54|10|40');
  assert.equal(at('gateSufficient'), 'true|true|true');
  assert.equal(at('respects'), 'view ≤ like ≤ comment||dislike| ≤ like|range 500–3,000 m');
  assert.equal(at('deploy'), GRANT_DEPLOY.join('|'));
  assert.equal(at('outcome'), 'open');
  assert.equal(at('arithmetic'), K2_ARITHMETIC);
  // The document's column list wins over any module constant — including a deliberately different one.
  const custom = algorithmReport({ ...reportFixture(), csvColumns: { verdicts: ['knob', 'verdict', 'to'], metrics: ['id', 'value'], days: ['row', 'day'], posts: ['postId'], identityPrefix: ['reportDay', 'appliedByReport'] } });
  assert.equal(rowsOf(reportVerdictsCsv(custom))[0], 'reportDay,appliedByReport,knob,verdict,to');
  assert.equal(rowsOf(reportVerdictsCsv(custom))[1], `${REPORT_DAY},false,K1,insufficient,`);
  assert.equal(rowsOf(reportMetricsCsv(custom))[0], 'reportDay,appliedByReport,id,value');
  assert.equal(rowsOf(reportDaysCsv(custom))[0], 'reportDay,appliedByReport,row,day');
  assert.equal(rowsOf(reportPostsCsv(custom))[0], 'reportDay,appliedByReport,postId');
  // A document that ships no column lists falls back to the generator's fixed lists — never dotted discovery.
  const bare = algorithmReport({ ...reportFixture(), csvColumns: undefined });
  assert.deepEqual(cellsOf(rowsOf(reportVerdictsCsv(bare))[0]), [...REPORT_CSV_IDENTITY_PREFIX, ...VERDICTS_COLUMNS]);
  assert.deepEqual(cellsOf(rowsOf(reportMetricsCsv(bare))[0]), [...REPORT_CSV_IDENTITY_PREFIX, ...METRICS_COLUMNS]);
  assert.deepEqual(cellsOf(rowsOf(reportPostsCsv(bare))[0]), [...REPORT_CSV_IDENTITY_PREFIX, ...POSTS_COLUMNS]);
  // The trial identity follows the day, so a backfilled day under the switch prints its own trial state.
  const trialDay = algorithmReport({ ...reportFixture(), backfilled: true, revision: 2 });
  assert.deepEqual(new Set(column(reportVerdictsCsv(trialDay), 'trialOnDay')), new Set(['true']));
  assert.deepEqual(new Set(column(reportVerdictsCsv(trialDay), 'trialMultiplierOnDay')), new Set(['5']));
  assert.deepEqual(new Set(column(reportVerdictsCsv(trialDay), 'backfilled')), new Set(['true']));
  assert.deepEqual(new Set(column(reportVerdictsCsv(trialDay), 'reportRevision')), new Set(['2']));
  assert.deepEqual(new Set(column(reportVerdictsCsv(trialDay), 'productionPaysValue')), new Set(['']));
  assert.equal(reportCsvFilename(trialDay, 'verdicts'), 'poplur-report-2026-09-12-r2-verdicts.csv');
  assert.equal(reportCsvFilename(report, 'days'), 'poplur-report-2026-09-12-days.csv');
});

test('the metrics, days and posts CSVs are fixed-column, faithful to the raw rows, and null below a gate', () => {
  const report = algorithmReport(reportFixture({ suggest: true }));
  const metrics = reportMetricsCsv(report);
  assert.equal(rowsOf(metrics).length, 1 + Object.keys(report.evidence.metrics).length);
  assert.deepEqual(cellsOf(rowsOf(metrics)[0]), [...REPORT_CSV_IDENTITY_PREFIX, ...METRICS_COLUMNS]);
  const byId = Object.fromEntries(rowsOf(metrics).slice(1).map(cellsOf).map(cells => [cells[REPORT_CSV_IDENTITY_PREFIX.length], cells]));
  const idx = (name) => REPORT_CSV_IDENTITY_PREFIX.length + METRICS_COLUMNS.indexOf(name);
  assert.equal(byId['netPos.lt7d.d30'][idx('value')], '', 'a rate over 2 posts never lands in the spreadsheet');
  assert.equal(byId['netPos.lt7d.d30'][idx('numerator')], '1');
  assert.equal(byId['netPos.lt7d.d30'][idx('gate.sufficient')], 'false');
  assert.equal(byId['M1.gain.d30'][idx('value')], '6000');
  assert.equal(byId['M1.gain.d30'][idx('gate.n')], '54');
  assert.equal(byId['M17.readsOnDay'][idx('gate.n')], '');

  const days = rowsOf(reportDaysCsv(report));
  assert.equal(days.length, 1 + 30 + 3, '30 day rows then d1, d7, d30');
  assert.deepEqual(cellsOf(days[0]), [...REPORT_CSV_IDENTITY_PREFIX, ...DAYS_COLUMNS]);
  const dayCells = cellsOf(days[1]);
  const dIdx = (name) => REPORT_CSV_IDENTITY_PREFIX.length + DAYS_COLUMNS.indexOf(name);
  assert.equal(dayCells[dIdx('row')], 'day');
  assert.equal(dayCells[dIdx('day')], reportDayKey(29));
  assert.equal(dayCells[dIdx('realPostGain.synthetic.total')], '120000', 'the raw row, never the typed day');
  assert.equal(dayCells[dIdx('people.maxShare')], '');
  assert.equal(dayCells[dIdx('netReal.byAge.lt7d.posts')], '', 'window-only columns are empty on a day row');
  assert.equal(cellsOf(days[30])[dIdx('trialClass')], 'trial');
  const d30 = cellsOf(days[33]);
  assert.equal(d30[dIdx('row')], 'window');
  assert.equal(d30[dIdx('day')], 'd30');
  assert.equal(d30[dIdx('days')], '30');
  assert.equal(d30[dIdx('spanned')], 'e1e1e1e1');
  assert.equal(d30[dIdx('netReal.byAge.lt7d.posts')], '2');
  assert.equal(d30[dIdx('netReal.byAge.lt7d.perPostDay')], '25', 'the window row is the document as published (the generator nulls it, §1.7)');
  assert.equal(d30[dIdx('realPostDecayLoss.trialMultiplierSeen')], '5');

  const posts = rowsOf(reportPostsCsv(report));
  assert.equal(posts.length, 3);
  assert.deepEqual(cellsOf(posts[0]), [...REPORT_CSV_IDENTITY_PREFIX, ...POSTS_COLUMNS]);
  const pIdx = (name) => REPORT_CSV_IDENTITY_PREFIX.length + POSTS_COLUMNS.indexOf(name);
  assert.equal(cellsOf(posts[1])[pIdx('day')], REPORT_DAY);
  assert.equal(cellsOf(posts[1])[pIdx('gr')], '1000');
  assert.equal(cellsOf(posts[1])[pIdx('rkLike')], '1');
  assert.equal(cellsOf(posts[1])[pIdx('ageBucketAtD')], 'd7to30');
  assert.equal(cellsOf(posts[2])[pIdx('gr')], '');
  assert.equal(cellsOf(posts[2])[pIdx('ageBucketAtD')], 'lt7d');
});

test('reportsRangeCsv() keeps one header whatever order the reports arrive; the compare CSV carries both identities', () => {
  const a = algorithmReport(reportFixture());
  const b = algorithmReport({ ...reportFixture({ suggest: true }), day: '2026-09-13', runId: 'run-b' });
  const ab = reportsRangeCsv([a, b]);
  const ba = reportsRangeCsv([b, a]);
  assert.equal(rowsOf(ab)[0], rowsOf(ba)[0]);
  assert.equal(ab, ba, 'ordered by day, not by fetch order');
  assert.equal(rowsOf(ab).length, 1 + Object.keys(a.evidence.metrics).length + Object.keys(b.evidence.metrics).length);
  assert.deepEqual(new Set(column(ab, 'reportDay')), new Set([REPORT_DAY, '2026-09-13']));
  assert.deepEqual(new Set(column(ab, 'appliedByReport')), new Set(['false']));
  // A later report with a wider column list still lands under the first report's header (fixed columns).
  const wider = algorithmReport({ ...reportFixture({ suggest: true }), day: '2026-09-14', csvColumns: { ...reportFixture().csvColumns, metrics: [...METRICS_COLUMNS, 'extra'] } });
  assert.equal(rowsOf(reportsRangeCsv([wider, a]))[0], rowsOf(ab)[0]);
  assert.equal(reportsRangeFilename([b, a]), 'poplur-reports-2026-09-12_2026-09-13-metrics.csv');
  const compare = reportCompareCsv(a, b);
  const header = cellsOf(rowsOf(compare)[0]);
  assert.ok(header.includes('a.reportDay') && header.includes('b.reportDay') && header.includes('a.appliedByReport') && header.includes('b.appliedByReport'));
  assert.deepEqual(header.slice(-3), ['delta', 'gateFlip', 'presence']);
  assert.equal(rowsOf(compare).length, 1 + new Set([...Object.keys(a.evidence.metrics), ...Object.keys(b.evidence.metrics)]).size);
  assert.deepEqual(new Set(column(compare, 'a.appliedByReport')), new Set(['false']));
  const gain = rowsOf(compare).map(cellsOf).find(cells => cells[header.indexOf('id')] === 'M1.gain.d30');
  assert.equal(gain[header.indexOf('delta')], '6000');
  assert.equal(gain[header.indexOf('gateFlip')], 'gained');
  assert.equal(reportCompareFilename(a, b), 'poplur-report-2026-09-12-vs-2026-09-13.csv');
  assert.deepEqual(estimateReportRange([REPORT_DAY, '2026-09-13', '2026-09-13', 'nope'], [REPORT_DAY]), { reports: 2, reads: 1, cad: 0.05 / 100_000, leftToday: 24_999 });
});

/** A scripted fetch for the report routes. */
const fetchHarness = (handler) => {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return handler(String(url)); };
  return { calls, restore: () => { globalThis.fetch = realFetch; } };
};

test('readReport() reads one body through the proxy: 404 → null, 429 → ReportReadRefused, a foreign schema → refusal, never zeros', async () => {
  const doc = reportFixture({ suggest: true });
  const harness = fetchHarness((url) => {
    if (url.endsWith('/2026-09-12')) return new Response(JSON.stringify(doc), { status: 200, headers: { 'content-type': 'application/json', 'x-poplur-ledger-reads': '1' } });
    if (url.endsWith('/2026-09-11')) return new Response(JSON.stringify({ result: doc }), { status: 200, headers: { 'content-type': 'application/json', 'x-poplur-ledger-reads': '0' } });
    if (url.endsWith('/2026-09-10')) return new Response(JSON.stringify({ version: 2, day: '2026-09-10', unsupportedVersion: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (url.endsWith('/2026-09-09')) return new Response(JSON.stringify({ error: { message: 'budget' }, remaining: 3 }), { status: 429, headers: { 'content-type': 'application/json' } });
    if (url.endsWith('/api/reports')) return new Response(JSON.stringify({ version: 1, lastReportedDay: REPORT_DAY, updatedAtMillis: NOW, runId: 'r', days: [{ day: REPORT_DAY, decision: 'none' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response('{}', { status: 404 });
  });
  try {
    const first = await readReport('2026-09-12');
    assert.equal(first.reads, 1);
    assert.equal(first.refusal, null);
    assert.equal(first.report.decision.knob, 'K2');
    assert.equal(harness.calls[0].url, 'http://127.0.0.1:8096/api/reports/2026-09-12');
    assert.equal(harness.calls[0].init?.method, undefined, 'a GET through fetch, so the Origin header rides');
    const cached = await readReport('2026-09-11');
    assert.equal(cached.reads, 0);
    assert.equal(cached.report.day, REPORT_DAY, 'a {result} wrapper is unwrapped');
    const foreign = await readReport('2026-09-10');
    assert.equal(foreign.report, null);
    assert.deepEqual(foreign.refusal, { reason: 'unsupported-version', version: 2, digestVersion: null, day: '2026-09-10', revision: null });
    await assert.rejects(readReport('2026-09-09'), (error) => error instanceof ReportReadRefused && error.remaining === 3);
    assert.equal(await readReport('2026-09-08'), null);
    await assert.rejects(readReport('12 Sep'), /YYYY-MM-DD/);
    const index = await readReportIndex();
    assert.equal(index.days.length, 1);
    assert.equal(index.lastReportedDay, REPORT_DAY);
  } finally {
    harness.restore();
  }
});

test('reportIdentity() prints the identity prefix from the report itself', () => {
  const identity = reportIdentity(algorithmReport(reportFixture({ suggest: true })));
  assert.deepEqual(Object.keys(identity), [...REPORT_CSV_IDENTITY_PREFIX]);
  assert.equal(identity.appliedByReport, false);
  assert.equal(identity.productionPaysKnob, 'K2');
  assert.equal(identity.productionPaysValue, 1_000);
  assert.equal(identity.coverageComplete, true);
  assert.equal(identity.sourceMatchesObserved, null);
  assert.equal(identity.trialSeenOnDay, null);
});
