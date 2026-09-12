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
  digestDaysCsv,
  digestPostsCsv,
  estimateLedgerExport,
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
