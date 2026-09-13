import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  REPORT_BOUNDS,
  REPORT_CACHE_ENTRIES,
  REPORT_DAYS_COLLECTION,
  REPORT_INDEX_DOC,
  REPORT_VERSION,
  createReportCache,
  isReportRefusal,
  normalizeAlgorithmReport,
  normalizeReportIndex,
  parseReportDay,
  reportCacheKey,
  reportIndexFrame,
  reportRevisionListed,
} from './algorithm-report-policy.mjs';

const DAY = '2026-09-12';
const RUN = Date.UTC(2026, 8, 13, 4, 45); // 00:45 Toronto, 13 Sep: the run that writes 12 Sep
const OWNER_UID = 'eoP2Z0ElxIa0Eua7xpFxNlr6tur1';
const REAL_UID = 'RealActor0000000000000000001';
const dayKey = offset => new Date(Date.UTC(2026, 8, 12 - offset, 12)).toISOString().slice(0, 10);

const gain = (overrides = {}) => ({ view: 0, like: 0, comment: 0, dislike: 0, total: 0, n: 0, firstViews: 0, repeatViews: 0, repeatMeters: 0, clamped: 0, resync: 0, clampedDislikes: 0, clampedDislikeMeters: 0, ...overrides });
const gate = (id, n, minN, sufficient, extra = {}) => ({ id, label: `${id} · real events · 30 d ending ${DAY}`, n, minN, sufficient, basis: `real posts × real actors · d30`, ...extra });

/** A published day row (publishedDay shape: `people` counts, no uid map). */
const dayRow = (offset, overrides = {}) => ({
  day: dayKey(offset),
  observedPolicy: '03416b1f',
  postsCreated: { real: 0, owner: 0, review: 0, synthetic: 0, official: 0, lab: 0 },
  entries: { real: offset === 0 ? 3 : 0, official: 29, unknownCause: 0 },
  realPostGain: { real: gain(offset === 0 ? { view: 2_000, total: 2_000, n: 2, firstViews: 2 } : {}), owner: gain(), review: gain(), synthetic: gain(), unknown: gain() },
  realPostDecayLoss: { byClass: { real: 0, owner: 0, review: 0, synthetic: 0, unknown: 0 }, byMode: { normal: 0, trial: 0, stress: 0, undetermined: 0 }, n: 0 },
  realPostSeedLoss: 0,
  realPostBoostLoss: 0,
  boosts: { n: 0, meters: 0 },
  unknownActorEntries: { real: 0, official: 0 },
  distinctRealViewers: offset === 0 ? 2 : 0,
  distinctRealLikers: 0,
  distinctRealCommenters: 0,
  surfaces: {},
  realSurfaces: {},
  people: { actors: offset === 0 ? 2 : 0, viewers: offset === 0 ? 2 : 0, likers: 0, commenters: 0, maxShare: offset === 0 ? 0.5 : null },
  trialMultipliers: {},
  trialClass: null,
  earnedPolicy: true,
  productionEpoch: '293c52c9',
  ...overrides,
});

const postRow = (index, overrides = {}) => ({
  postId: `post-${String(index).padStart(16, '0')}`,
  cls: 'real', ownerClass: 'real', channelId: 'live', createdAtMillis: RUN - 20 * 86_400_000, seedMeters: 5_000, currentMeters: 7_000, organicMeters: 2_000,
  boostMeters: 0, peakMeters: 7_000, peakAtMillis: RUN - 19 * 86_400_000, entries: 4, realGain: 2_000, ownerGain: 0, reviewGain: 0, syntheticGain: 0, unknownGain: 0,
  decayLoss: 0, decayLossRealShare: 0, decayModeSeen: 'none', clean: true, viewCount: 2, firstRealEngagementAtMillis: RUN - 20 * 86_400_000, lastAtMillis: RUN - 19 * 86_400_000,
  lastCause: 'engagement', atClaim: false, expired: false, deletedAtMillis: null,
  dayGain: { gr: 0, go: 0, gv: 0, gs: 0, gu: 0, dl: 0, dlr: 0, vc: 0 }, realGainD30: 2_000, rk: { v: 2, l: 1, c: 0, d: 0 }, lastRealAtMillis: RUN - 19 * 86_400_000, ageBucketAtD: 'd7to30',
  ...overrides,
});

const metric = (id, value, unit, extra = {}) => ({ id, value, unit, n: 54, gate: null, window: 'd30', population: 'real', basis: 'real posts × real actors · d30', numerator: null, denominator: null, ...extra });

const GC = gate('Gc', 54, 30, true, { note: 'actors 7/2 · max share 0.33' });
const GD = gate('Gd', 10, 8, true);
const GPROD = gate('Gprod', 40, 30, true, { basis: 'observed7d' });

const verdict = (knob, overrides = {}) => ({
  knob, name: `${knob} grant`, tunable: true, declaredValue: 1_000, unit: 'm', seenValue: 1_000, seenN: 40,
  seenBasis: 'production · ALL actor classes incl. simulation · 7 d', productionPays: 1_000,
  where: 'functions/src/postEngagementPolicy.ts · radiusDelta · like literal',
  deploy: ['deploy recordPostEngagement', 'node scripts/syncShared.js (functions-digest)', '.codex/deploy-nearby-pops-digest.sh'],
  gates: [GC, GD, GPROD],
  evidence: [{ id: 'M1.gain.d30', value: 6_000, unit: 'm', n: 54 }, { id: 'share.like.d30', value: 1.6667, unit: 'ratio', numerator: 10_000, denominator: 6_000 }],
  verdict: 'hold', reason: 'in-range', reasonText: 'in range', rule: null, arithmetic: null, suggestion: null, deferred: null,
  curveAtSuggested: null, curveCurrent: null, frozenUntilDay: null, previous: null, outcome: null, outcomeNote: null, openSinceDay: null, withdrawnDay: null,
  ...overrides,
});

const K2_SUGGEST = verdict('K2', {
  name: 'Like grant', verdict: 'suggest',
  reasonText: 'raise 1,000 → 1,250 · rule K2-R · Gc 54/30 (actors 7/2 · max share 0.33) · Gd 10/8 · Gprod 40/30',
  rule: { id: 'K2-R', text: 'posts.liked = 10 ≥ 8 ∧ netPosLiked(d7to30) = 2 / 10 = 0.20 < 0.50 ∧ lossRatio(d7to30) = 0 / 6,000 = 0.00 ≤ 1.50', inputs: {} },
  arithmetic: 'posts.liked = 10 ≥ 8 ∧ netPosLiked(d7to30) = 2 / 10 = 0.20 < 0.50 ∧ lossRatio(d7to30) = 0 / 6,000 = 0.00 ≤ 1.50',
  suggestion: { from: 1_000, to: 1_250, step: 250, direction: 'raise', ruleId: 'K2-R', rationale: 'liked posts aged 7–30 d are mostly net-negative while decay is not the explanation', respects: ['view ≤ like ≤ comment'] },
  outcome: 'open', openSinceDay: DAY,
});
const FIXED = Object.entries({ K6: ['insufficient', 'unmeasured'], K8: ['hold', 'finding'], K9: ['hold', 'owner-fixed'], K10: ['hold', 'finding'], K11: ['hold', 'ui'], K12: ['hold', 'paid'], K13: ['hold', 'owner-fixed'], K14: ['hold', 'experiment-switch'], K15: ['hold', 'simulation'], K16: ['hold', 'rank-only'], K17: ['hold', 'simulation'] })
  .map(([knob, [kind, reason]]) => verdict(knob, { tunable: false, declaredValue: knob === 'K9' ? 5_000 : null, seenValue: null, seenN: 0, seenBasis: '—', productionPays: null, gates: [], evidence: [], verdict: kind, reason, reasonText: `${knob} never suggests`, deploy: [] }));

const SENTENCE = 'suggest raising the like grant 1,000 → 1,250 m · declared 1,000 · seen 1,000 (n 40, all classes) — to apply it you would edit functions/src/postEngagementPolicy.ts · radiusDelta · like literal, deploy recordPostEngagement, node scripts/syncShared.js (functions-digest), .codex/deploy-nearby-pops-digest.sh · nothing is applied by this report; production pays 1,000 m until you deploy';

const evidenceFixture = (overrides = {}) => ({
  day: dayRow(0),
  windows: {
    d1: { days: 1, spanned: ['293c52c9'], observedPolicySpanned: ['03416b1f'], realPostGain: { real: gain({ view: 2_000, total: 2_000, n: 2, firstViews: 2 }) }, netReal: { byAge: { lt7d: { posts: 2, netPositive: 2, postDays: 2, gainRealMeters: 2_000, lossRealShareMeters: 0, perPostDay: null } }, all: { posts: 2, perPostDay: null } }, viewWorth: { views: null, cleanPosts: 3 } },
    d7: { days: 7, spanned: ['293c52c9'] },
    d30: { days: 30, spanned: ['293c52c9'] },
  },
  days: Array.from({ length: 30 }, (_, index) => dayRow(29 - index)),
  observedOnDay: { view: { byMeters: { 1000: 2 }, min: 1_000, max: 1_000, n: 2 } },
  observed7d: { grants: { view: { n: 40, modeMeters: 1_000, min: 1_000, max: 1_000, byMeters: { 1000: 40 } }, like: { n: 40, modeMeters: 1_000, min: 1_000, max: 1_000, byMeters: { 1000: 40 } } }, sampleEntries: 200, clamped: 0, resync: 0 },
  posts: [postRow(1), postRow(2)],
  channels: [{ channelId: 'live', realPosts: 10, n: 54, sufficient: true, dayGainMeters: 0, d30GainMeters: 6_000 }],
  snapshots: { seedRest: { valid: true, livePosts: 10, atClaim: 0, cleanPosts: 10 }, claims: { d30: { count: 0, atFloor: 0, medianMeters: null, aboveFloorThatEarned: 0 } }, contamination: { d7: { syntheticMeters: 140_000, simulationOwnerUid: 'set', posts: [{ postId: 'post-official-pump', syntheticMeters: 140_000, ownerMeters: 0, share: 1 }] } }, intercept: { realized: { entries: 0, distinctPosts: 0, distinctActors: 0 }, opportunity: { pairs: 0, nearMissPairs: 0, realAccountsWithLocation: 0 } }, anchors: null, curve: null, questions: null, gaps: [] },
  metrics: {
    'M1.gain.d30': metric('M1.gain.d30', 6_000, 'm', { gate: GC }),
    'M1.like.d30': metric('M1.like.d30', 10_000, 'm', { gate: GC }),
    'share.like.d30': metric('share.like.d30', 1.6667, 'ratio', { gate: GC, numerator: 10_000, denominator: 6_000 }),
    'M6.lt7d.perPostDay.d30': metric('M6.lt7d.perPostDay.d30', 120, 'm/post-day', { n: 2, gate: gate('Gposts.lt7d', 2, 8, false) }),
    'maxShare.d30': metric('maxShare.d30', 0.3333, 'ratio', { gate: { ...GC, id: 'Gsplit' }, numerator: null, denominator: 54 }),
    'M9.synthShare.d7': metric('M9.synthShare.d7', 0.96, 'ratio', { window: 'd7', population: 'sim', numerator: 140_000, denominator: 146_000, n: null }),
    'M3.actors': metric('M3.actors', 7, 'count', { window: 'lifetime', n: null }),
  },
  ...overrides,
});

const reportFixture = (overrides = {}, evidence = evidenceFixture()) => ({
  version: 1, digestSchema: 1, day: DAY, timeZone: 'America/Toronto',
  dayStartMillis: RUN - 45 * 60_000 - 86_400_000, dayEndMillis: RUN - 45 * 60_000,
  generatedAtMillis: RUN, runId: 'run-2026-09-13T04-45', digestVersion: 18, revision: 1, supersedes: null,
  partial: false, backfilled: false, catchUp: false, snapshotsAsOfMillis: RUN,
  productionEpoch: '293c52c9', sourcePolicyVersion: '07b43286', knobsHash: '9d2b6a10', ruleSetVersion: '8f5fe85e',
  trialOnDay: false, trialMultiplierOnDay: null, primarySuggestion: 'K2',
  verdictCounts: { suggest: 1, verify: 0, hold: 4, insufficient: 2, fixed: 10 }, bytes: 153_749,
  firstLine: 'Decay ×1 · no trial · no trial multiplier seen in 30 d (switch off at the writing run; no multiplier seen on 2026-09-12)',
  headline: { trialOnDay: false, trialMultiplierOnDay: null, switchAtRun: { enabled: false, multiplier: 5 }, trialSinceMillis: 1788826046064, boostedSinceMillis: 1788845178241, trialSeenOnDay: null, trialClassOnDay: null, trialShareD30: null, anchorsAtWorld: 0, anchorsEver: 22, worstAnchor: null,
    coverage: { complete: true, postsBehindHorizon: 0, evicted: 0, entriesFoldedOnDay: 3, registeredPosts: { real: 10, owner: 0, review: 0, official: 1 }, nonLivePollLagRuns: 3, kindSplitSinceMillis: 0, trimmed: false },
    cost: { readsOnDay: 2_400, runsOnDay: 24, cadOnDay: 0.0012, monthlyCadProjected: 0.0029 } },
  decision: { kind: 'suggest', knob: 'K2', sentence: SENTENCE, appliedByReport: false,
    productionPays: { knob: 'K2', value: 1_000, n: 40, basis: 'all actor classes incl. simulation · 7 d' },
    action: { where: 'functions/src/postEngagementPolicy.ts · radiusDelta · like literal', from: 1_000, to: 1_250, unit: 'm', deploy: ['deploy recordPostEngagement'] },
    deferred: [], open: [{ knob: 'K2', to: 1_250, ruleId: 'K2-R', openSinceDay: DAY, outcome: 'open', missedReports: 0 }], counts: { suggest: 1, verify: 0, hold: 4, insufficient: 2, fixed: 10 }, ownerQuestion: null },
  policy: { reportSchemaVersion: 1, digestSchema: 1, ruleSetVersion: '8f5fe85e', digestVersion: 18, runId: 'run-2026-09-13T04-45',
    source: { knobs: { firstViewMeters: 1_000, likeMeters: 1_000, commentMeters: 2_000, dislikeMeters: -1_000, repeatViewBaseMeters: 500, decayPerDay: 0.05 }, knobsHash: '9d2b6a10', sourcePolicyVersion: '07b43286', knobsStale: false, knobChangedDays: { likeMeters: null }, lastSyncDay: DAY },
    production: { sourceMatchesObserved: null, observedPolicySpanned: { d7: ['03416b1f'], d30: ['03416b1f'], after: null } },
    decay: { declaredRatePerDay: 0.05, observedRatePerDay: null, observedRateNote: 'unobservable from state; a K7 change shows as knobsHash/knobChangedDays only' },
    simulation: { simulationEnabled: false, runnerEnabled: true, dailySimulationEnabled: true, simulationOwnerUid: 'set' }, productionEpoch: '293c52c9' },
  verdicts: [
    verdict('K1', { name: 'First-view grant' }), K2_SUGGEST, verdict('K3', { name: 'Comment grant', declaredValue: 2_000, seenValue: 2_000, productionPays: 2_000 }),
    verdict('K4', { name: 'Dislike grant', declaredValue: -1_000, seenValue: -1_000, productionPays: -1_000, gates: [gate('Gdislike', 24, 30, false), GD, GPROD], verdict: 'insufficient', reason: 'gate', reasonText: 'n = 24 of 30' }),
    verdict('K5', { name: 'Repeat-view base', declaredValue: 500, seenValue: 500, productionPays: 500 }),
    verdict('K7', { name: 'Earned-reach decay', declaredValue: 0.05, unit: '/day', seenValue: null, seenN: 0, productionPays: null, gates: [gate('Gdecay', 54, 30, true)], verdict: 'hold', reason: 'in-range', reasonText: 'in range', curveCurrent: { horizonDays: 60, daysToFloor: { 1000: 29.8 } } }),
    ...FIXED,
  ],
  checks: [
    { id: 'drift', status: 'clear', basis: 'seen in production by ALL actor classes incl. simulation · 7 d ending D', rows: { like: { seen: 1_000, declared: 1_000, n: 40, status: 'clear' }, seed: { seen: null, declared: 5_000, n: 0, status: 'unseen' } }, verify: [], awaitingDeploy: [] },
    { id: 'farmBound', status: 'clear', detail: 'per-actor ceiling 4,994 m × 7 lifetime real actors = 34,958 m; 0 real post(s) above it', ceilingMeters: 4_994, lifetimeRealActors: 7, violations: 0 },
    { id: 'claimCeiling', status: 'finding', asOfCommit: 'ab6489ba', text: 'three definitions', claimsD30: null, direction: null },
    { id: 'anchors', status: 'watch', atWorld: 0, everAtWorld: 22, worst: null },
    { id: 'surface', status: 'unmeasured', labelledEntries: 0, note: 'no per-surface figure is claimed' },
    { id: 'seedReach', status: 'finding', basis: 'proxy: last post location', atClaimShare: 0, livePosts: 10, pairs: 0, nearMissPairs: 0, cleanPosts: 10, note: null },
  ],
  previous: null, previousUnavailable: 'first-report',
  epochs: [{ id: '293c52c9', fromDay: dayKey(20), toDay: DAY, days: 21, signature: { grants: { view: 1_000, like: 1_000, seedSeen: 5_000 }, trial: null, trialMultiplier: null }, boundaryCause: 'window-start', movedFields: [] }],
  csvColumns: { verdicts: ['knob', 'name', 'verdict', 'reason', 'to'], metrics: ['id', 'value', 'gate.sufficient'], days: ['row', 'day', 'people.actors', 'realPostGain.real.total', 'netReal.all.perPostDay'], posts: ['postId', 'gr', 'rkLike'], identityPrefix: ['reportDay', 'appliedByReport', 'firstLine'] },
  evidence: JSON.stringify(evidence),
  ...overrides,
});

const uidFree = value => {
  const serialized = JSON.stringify(value);
  return !serialized.includes(OWNER_UID) && !/RealActor0+\d+/.test(serialized) && !serialized.includes('realActorEntries');
};

test('parseReportDay accepts a real calendar day in YYYY-MM-DD and nothing else', () => {
  assert.equal(parseReportDay(DAY), DAY);
  assert.equal(parseReportDay('2026-02-28'), '2026-02-28');
  for (const bad of ['2026-9-1', '2026-02-30', '2026-13-01', '2026-00-10', 'today', '20260912', '2026-09-12T00:00', 20260912, null, undefined, ' 2026-09-12']) {
    assert.equal(parseReportDay(bad), null, `${String(bad)} is not a report day`);
  }
});

test('normaliser gates the schema version and never renders another major as zeros', () => {
  assert.equal(normalizeAlgorithmReport(null), null);
  assert.equal(normalizeAlgorithmReport('report'), null);
  assert.equal(normalizeAlgorithmReport([reportFixture()]), null);
  assert.deepEqual(normalizeAlgorithmReport(reportFixture({ version: 2 })), { version: 2, unsupportedVersion: true });
  assert.deepEqual(normalizeAlgorithmReport(reportFixture({ version: '1.5' })), { version: 1, unsupportedVersion: true });
  const missing = reportFixture(); delete missing.version;
  assert.deepEqual(normalizeAlgorithmReport(missing), { version: null, unsupportedVersion: true });
  for (const refused of [normalizeAlgorithmReport(reportFixture({ version: 2 })), normalizeAlgorithmReport(missing)]) {
    assert.equal(refused.verdicts, undefined, 'a refusal carries no zero-filled body');
    assert.equal(isReportRefusal(refused), true);
  }
  assert.equal(REPORT_VERSION, 1);
});

test('an unreadable evidence string is a refusal shape, never an empty evidence block', () => {
  for (const evidence of ['{not json', '', 42, null, undefined, JSON.stringify([1, 2]), JSON.stringify('text'), '{"day":1', JSON.stringify(null)]) {
    const refused = normalizeAlgorithmReport(reportFixture({ evidence }));
    assert.deepEqual(refused, { version: 1, day: DAY, revision: 1, digestVersion: 18, unreadableEvidence: true }, `evidence ${JSON.stringify(evidence)} refuses`);
    assert.equal(isReportRefusal(refused), true);
  }
  assert.equal(isReportRefusal(normalizeAlgorithmReport(reportFixture())), false);
  assert.equal(isReportRefusal(null), false);
});

test('a well-formed report round-trips typed: evidence parsed, nulls kept, appliedByReport literal false', () => {
  const report = normalizeAlgorithmReport(reportFixture());
  assert.equal(report.version, 1);
  assert.equal(report.day, DAY);
  assert.equal(report.revision, 1);
  assert.equal(report.runId, 'run-2026-09-13T04-45');
  assert.equal(report.ruleSetVersion, '8f5fe85e');
  assert.equal(report.trialOnDay, false);
  assert.equal(report.trialMultiplierOnDay, null, 'a null multiplier stays null — never 0');
  assert.equal(report.firstLine.startsWith('Decay ×1 · no trial'), true);
  assert.equal(typeof report.evidence, 'object');
  assert.equal(report.evidence.days.length, 30);
  assert.equal(report.evidence.days[29].day, DAY);
  assert.equal(report.evidence.posts.length, 2);
  assert.equal(report.evidence.metrics['share.like.d30'].value, 1.6667);
  assert.equal(report.evidence.metrics['share.like.d30'].gate.sufficient, true);
  assert.equal(report.evidence.metrics['M9.synthShare.d7'].value, 0.96, 'a sim ratio with no gate keeps its value');
  assert.equal(report.evidence.metrics['M9.synthShare.d7'].n, null);
  assert.equal(report.decision.kind, 'suggest');
  assert.equal(report.decision.knob, 'K2');
  assert.equal(report.decision.sentence, SENTENCE);
  assert.equal(report.decision.action.to, 1_250);
  assert.equal(report.primarySuggestion, 'K2');
  assert.deepEqual(report.verdictCounts, { suggest: 1, verify: 0, hold: 4, insufficient: 2, fixed: 10 });
  const k2 = report.verdicts.find(row => row.knob === 'K2');
  assert.equal(k2.verdict, 'suggest');
  assert.deepEqual(k2.suggestion, K2_SUGGEST.suggestion);
  assert.equal(k2.arithmetic, K2_SUGGEST.arithmetic);
  assert.equal(k2.openSinceDay, DAY);
  assert.equal(k2.outcome, 'open');
  const k9 = report.verdicts.find(row => row.knob === 'K9');
  assert.equal(k9.seenValue, null);
  assert.equal(k9.declaredValue, 5_000);
  assert.equal(k9.tunable, false);
  assert.equal(k9.verdict, 'hold');
  assert.equal(k9.reason, 'owner-fixed');
  const k7 = report.verdicts.find(row => row.knob === 'K7');
  assert.equal(k7.declaredValue, 0.05);
  assert.equal(k7.unit, '/day');
  assert.equal(k7.productionPays, null);
  assert.deepEqual(k7.curveCurrent, { horizonDays: 60, daysToFloor: { 1000: 29.8 } });
  assert.equal(report.verdicts.length, 17);
  assert.equal(report.checks.length, 6);
  assert.equal(report.epochs.length, 1);
  assert.equal(report.headline.coverage.trimmed, false);
  assert.equal(report.headline.cost.cadOnDay, 0.0012);
  assert.deepEqual(report.csvColumns.identityPrefix, ['reportDay', 'appliedByReport', 'firstLine']);
  assert.equal(report.previous, null);
  assert.equal(report.previousUnavailable, 'first-report');
  assert.equal(report.decision.appliedByReport, false);
  assert.equal(normalizeAlgorithmReport(reportFixture({ decision: { ...reportFixture().decision, appliedByReport: true } })).decision.appliedByReport, false, 'the literal is never read from the document');
  assert.equal(uidFree(report), true);
});

test('the gate invariant is enforced a third time: a suggestion under an insufficient gate is dropped and the card says NO SUGGESTION', () => {
  const underGate = normalizeAlgorithmReport(reportFixture({
    verdicts: reportFixture().verdicts.map(row => (row.knob === 'K2' ? { ...row, gates: [GC, gate('Gd', 7, 8, false), GPROD] } : row)),
  }));
  const k2 = underGate.verdicts.find(row => row.knob === 'K2');
  assert.equal(k2.verdict, 'insufficient');
  assert.equal(k2.reason, 'gate');
  assert.equal(k2.suggestion, null);
  assert.deepEqual(k2.normaliserDropped, ['suggestion']);
  assert.match(k2.reasonText, /dropped by the proxy normaliser/);
  assert.equal(underGate.decision.kind, 'none');
  assert.equal(underGate.decision.knob, null);
  assert.equal(underGate.decision.action, null);
  assert.equal(underGate.decision.productionPays, null);
  assert.match(underGate.decision.sentence, /^NO SUGGESTION\./);
  assert.doesNotMatch(underGate.decision.sentence, /^(raise|lower|edit|deploy|apply)/i, 'never an imperative');
  assert.equal(underGate.primarySuggestion, null);
  assert.deepEqual(underGate.decision.open, [], 'the open entry this report itself opened goes with the dropped suggestion');
  assert.deepEqual(underGate.decision.normaliserDropped, ['K2']);
  assert.deepEqual(underGate.verdictCounts, { suggest: 0, verify: 0, hold: 4, insufficient: 3, fixed: 10 }, 'counts follow what is shown');
  assert.deepEqual(underGate.decision.counts, underGate.verdictCounts);

  // Only the document's flag is sufficient: a gate without one, a gate that says "yes", a row with no gate at all.
  for (const gates of [[{ ...GC, sufficient: undefined }, GD, GPROD], [{ ...GC, sufficient: 'yes' }, GD, GPROD], []]) {
    const doc = normalizeAlgorithmReport(reportFixture({ verdicts: reportFixture().verdicts.map(row => (row.knob === 'K2' ? { ...row, gates } : row)) }));
    const row = doc.verdicts.find(candidate => candidate.knob === 'K2');
    assert.equal(row.verdict, 'insufficient', `gates ${JSON.stringify(gates.map(g => g.sufficient))}`);
    assert.equal(row.suggestion, null);
    assert.equal(doc.decision.kind, 'none');
  }

  // A `suggest` row that lost its suggestion object is malformed: insufficient/gate, never a bare "suggest".
  const bare = normalizeAlgorithmReport(reportFixture({ verdicts: reportFixture().verdicts.map(row => (row.knob === 'K2' ? { ...row, suggestion: null } : row)) }));
  const bareRow = bare.verdicts.find(row => row.knob === 'K2');
  assert.equal(bareRow.verdict, 'insufficient');
  assert.equal(bareRow.reason, 'gate');
  assert.deepEqual(bareRow.normaliserDropped, ['suggest-without-suggestion']);

  // A suggestion on a non-suggest verdict (hold/in-range carrying a value) is dropped the same way.
  const holdWithValue = normalizeAlgorithmReport(reportFixture({ verdicts: reportFixture().verdicts.map(row => (row.knob === 'K1' ? { ...row, suggestion: { from: 1_000, to: 750, step: 250, direction: 'lower', ruleId: 'K1-L', rationale: '', respects: [] } } : row)) }));
  const k1 = holdWithValue.verdicts.find(row => row.knob === 'K1');
  assert.equal(k1.verdict, 'insufficient');
  assert.equal(k1.suggestion, null);
  assert.equal(holdWithValue.decision.kind, 'suggest', 'K2 still stands on its own gates');

  // A deferred `to` (an R3 loser) under an insufficient gate is dropped with its row.
  const deferredDoc = reportFixture();
  deferredDoc.verdicts = deferredDoc.verdicts.map(row => (row.knob === 'K3'
    ? { ...row, gates: [gate('Gc', 29, 30, false), GD, GPROD], verdict: 'hold', reason: 'deferred', deferred: { to: 2_500, ruleId: 'K3-R' } }
    : row));
  deferredDoc.decision = { ...deferredDoc.decision, deferred: [{ knob: 'K3', to: 2_500, ruleId: 'K3-R' }] };
  const deferred = normalizeAlgorithmReport(deferredDoc);
  const k3 = deferred.verdicts.find(row => row.knob === 'K3');
  assert.equal(k3.deferred, null);
  assert.equal(k3.verdict, 'insufficient');
  assert.equal(k3.reason, 'gate');
  assert.deepEqual(deferred.decision.deferred, [], 'the queue lists no value the row no longer carries');
  assert.equal(deferred.decision.kind, 'suggest', 'the primary K2 is untouched');
  // The same deferred row under sufficient gates stands, and its queue entry with it.
  const keptDoc = reportFixture();
  keptDoc.verdicts = keptDoc.verdicts.map(row => (row.knob === 'K3' ? { ...row, verdict: 'hold', reason: 'deferred', deferred: { to: 2_500, ruleId: 'K3-R' } } : row));
  keptDoc.decision = { ...keptDoc.decision, deferred: [{ knob: 'K3', to: 2_500, ruleId: 'K3-R' }] };
  const kept = normalizeAlgorithmReport(keptDoc);
  assert.deepEqual(kept.verdicts.find(row => row.knob === 'K3').deferred, { to: 2_500, ruleId: 'K3-R' });
  assert.deepEqual(kept.decision.deferred, [{ knob: 'K3', to: 2_500, ruleId: 'K3-R' }]);
});

test('a restated OPEN suggestion is kept on the card even while its row is insufficient/trial (restated, never re-derived)', () => {
  const doc = reportFixture();
  doc.trialOnDay = true; doc.trialMultiplierOnDay = 5;
  doc.verdicts = doc.verdicts.map(row => {
    if (row.knob === 'K7') return { ...row, verdict: 'insufficient', reason: 'trial', reasonText: 'decay trial ×5 on 2026-09-12 — open suggestion since 2026-09-01 restated beneath', suggestion: null, outcome: 'open', openSinceDay: '2026-09-01' };
    if (row.knob === 'K2') return { ...row, verdict: 'hold', reason: 'in-range', suggestion: null, outcome: null, openSinceDay: null };
    return row;
  });
  doc.primarySuggestion = 'K7';
  doc.decision = { ...doc.decision, knob: 'K7', sentence: 'suggest lowering the earned-reach decay 0.05 → 0.04 (open since 2026-09-01) · declared 0.05 · seen unseen — nothing is applied by this report; production pays an unverified value (n < 30) until you deploy',
    productionPays: { knob: 'K7', value: null, n: 0, basis: 'all actor classes incl. simulation · 7 d' }, action: { where: 'functions/src/postEngagementPolicy.ts · RADIUS_DECAY_PER_DAY', from: 0.05, to: 0.04, unit: '/day', deploy: ['deploy radiusDecay'] },
    open: [{ knob: 'K7', to: 0.04, ruleId: 'K7-L', openSinceDay: '2026-09-01', outcome: 'open', missedReports: 0 }] };
  const report = normalizeAlgorithmReport(doc);
  assert.equal(report.decision.kind, 'suggest');
  assert.equal(report.decision.knob, 'K7');
  assert.equal(report.decision.action.to, 0.04);
  assert.equal(report.decision.productionPays.value, null);
  assert.equal(report.primarySuggestion, 'K7');
  assert.deepEqual(report.decision.open, [{ knob: 'K7', to: 0.04, ruleId: 'K7-L', openSinceDay: '2026-09-01', outcome: 'open', missedReports: 0 }]);
  const k7 = report.verdicts.find(row => row.knob === 'K7');
  assert.equal(k7.verdict, 'insufficient');
  assert.equal(k7.reason, 'trial');
  assert.equal(k7.suggestion, null);
  assert.equal(k7.normaliserDropped, undefined);
  // Without the open entry the same card names a knob whose row carries nothing: NO SUGGESTION.
  const closed = normalizeAlgorithmReport({ ...doc, decision: { ...doc.decision, open: [] } });
  assert.equal(closed.decision.kind, 'none');
  assert.equal(closed.primarySuggestion, null);
});

test('a rate keeps its value only under a sufficient gate; counts and metre sums keep theirs whatever the gate says', () => {
  const evidence = evidenceFixture();
  const insufficient = gate('Gc', 12, 30, false);
  evidence.metrics['share.like.d30'] = { ...evidence.metrics['share.like.d30'], value: 0.8, gate: insufficient };
  evidence.metrics['M1.like.d30'] = { ...evidence.metrics['M1.like.d30'], value: 4_000, gate: insufficient };
  evidence.metrics['maxShare.d30'] = { ...evidence.metrics['maxShare.d30'], value: 0.7, gate: { ...insufficient, id: 'Gsplit' } };
  const report = normalizeAlgorithmReport(reportFixture({}, evidence));
  const metrics = report.evidence.metrics;
  assert.equal(metrics['share.like.d30'].value, null, 'a derived ratio is null below its gate');
  assert.equal(metrics['share.like.d30'].numerator, 10_000, 'the numerator stays so the owner sees how far from the gate');
  assert.equal(metrics['share.like.d30'].denominator, 6_000);
  assert.equal(metrics['share.like.d30'].gate.sufficient, false);
  assert.equal(metrics['M1.like.d30'].value, 4_000, 'a metre sum is always published with its n');
  assert.equal(metrics['maxShare.d30'].value, null);
  assert.equal(metrics['maxShare.d30'].denominator, 54);
  assert.equal(metrics['M6.lt7d.perPostDay.d30'].value, null, 'a per-post-day rate over 2 posts never reaches the page');
  assert.equal(metrics['M6.lt7d.perPostDay.d30'].n, 2);
  assert.equal(metrics['M3.actors'].value, 7);
  const sufficient = normalizeAlgorithmReport(reportFixture()).evidence.metrics;
  assert.equal(sufficient['share.like.d30'].value, 1.6667);
  assert.equal(sufficient['maxShare.d30'].value, 0.3333);
});

test('normaliser applies the §5.1 bounds, drops a post without an id and types the lists', () => {
  const evidence = evidenceFixture({
    days: Array.from({ length: 45 }, (_, index) => dayRow(44 - index)),
    posts: [...Array.from({ length: 80 }, (_, index) => postRow(index + 1)), postRow(99, { postId: '' }), 'post', null],
    channels: Array.from({ length: 20 }, (_, index) => ({ channelId: `c${index}` })),
    metrics: Object.fromEntries(Array.from({ length: 260 }, (_, index) => [`M0.k${index}.d30`, metric(`M0.k${index}.d30`, index, 'count')])),
  });
  const report = normalizeAlgorithmReport(reportFixture({
    verdicts: [...reportFixture().verdicts, ...Array.from({ length: 20 }, (_, index) => verdict('K1', { name: `extra ${index}` })), { knob: 'K99', verdict: 'suggest' }, 'row'],
    checks: Array.from({ length: 12 }, (_, index) => ({ id: `check-${index}`, status: 'clear' })),
    epochs: Array.from({ length: 10 }, (_, index) => ({ id: `e${index}`, fromDay: dayKey(index), toDay: dayKey(index), days: 1 })),
    decision: { ...reportFixture().decision, open: Array.from({ length: 6 }, (_, index) => ({ knob: 'K2', to: 1_250 + index, ruleId: 'K2-R', openSinceDay: DAY, outcome: 'open', missedReports: 0 })) },
  }, evidence));
  assert.equal(report.verdicts.length, REPORT_BOUNDS.verdicts);
  assert.ok(!report.verdicts.some(row => row.knob === 'K99'), 'an unknown knob id is not a row');
  assert.equal(report.checks.length, REPORT_BOUNDS.checks);
  assert.equal(report.epochs.length, REPORT_BOUNDS.epochs);
  assert.equal(report.evidence.days.length, REPORT_BOUNDS.days);
  assert.equal(report.evidence.posts.length, REPORT_BOUNDS.posts);
  assert.ok(report.evidence.posts.every(post => post.postId), 'every post row has an id');
  assert.equal(report.evidence.channels.length, REPORT_BOUNDS.channels);
  assert.equal(Object.keys(report.evidence.metrics).length, REPORT_BOUNDS.metrics);
  assert.equal(report.decision.open.length, 4);
  assert.deepEqual(REPORT_BOUNDS, { indexRows: 120, frameRows: 60, verdicts: 24, checks: 8, days: 30, posts: 50, channels: 13, metrics: 200, epochs: 8, gatesPerVerdict: 12, evidencePerVerdict: 48, serializedBytes: 1_048_576 });

  const clamped = normalizeAlgorithmReport(reportFixture({ revision: -3, generatedAtMillis: 'soon', bytes: Number.NaN, digestVersion: 2.9, trialMultiplierOnDay: 'five', decision: { kind: 'apply', knob: 'K2' } },
    evidenceFixture({ posts: [postRow(1, { currentMeters: 40_075_000, realGain: -9e9, lastAtMillis: -5 })] })));
  assert.equal(clamped.revision, 1);
  assert.equal(clamped.generatedAtMillis, 0);
  assert.equal(clamped.bytes, 0);
  assert.equal(clamped.digestVersion, 2);
  assert.equal(clamped.trialMultiplierOnDay, null);
  assert.equal(clamped.decision.kind, 'none', 'an unknown decision kind is none, never "apply"');
  assert.equal(clamped.evidence.posts[0].currentMeters, 6_371_000);
  assert.equal(clamped.evidence.posts[0].realGain, -6_371_000);
  assert.equal(clamped.evidence.posts[0].lastAtMillis, 0);
});

test('no identity leaves the proxy: uid maps are dropped, uid strings masked, uid lists counted, csv columns filtered', () => {
  const evidence = evidenceFixture();
  evidence.day = { ...evidence.day, realActorEntries: { [REAL_UID]: { v: 2, l: 0, c: 0, d: 0 } } };
  evidence.days[29] = { ...evidence.days[29], realActorEntries: { [REAL_UID]: { v: 2, l: 0, c: 0, d: 0 }, other: { v: 1, l: 0, c: 0, d: 0 } } };
  evidence.windows.d30 = { ...evidence.windows.d30, realActorUids: [REAL_UID, 'RealActor0000000000000000002'] };
  evidence.snapshots.contamination.d7.simulationOwnerUid = OWNER_UID;
  evidence.posts[0] = { ...evidence.posts[0], ownerUid: 'Tester1' };
  const doc = reportFixture({
    policy: { ...reportFixture().policy, simulation: { simulationEnabled: false, simulationOwnerUid: OWNER_UID } },
    csvColumns: { ...reportFixture().csvColumns, days: ['row', 'day', `realActorEntries.${REAL_UID}.v`, 'people.actors'] },
  }, evidence);
  const report = normalizeAlgorithmReport(doc);
  assert.equal(report.evidence.day.realActorEntries, undefined);
  assert.equal(report.evidence.days[29].realActorEntries, undefined);
  assert.equal(report.evidence.days[29].people.actors, 2, 'the counts stay');
  assert.equal(report.evidence.windows.d30.realActorUids, 2, 'a uid list is its count');
  assert.equal(report.evidence.snapshots.contamination.d7.simulationOwnerUid, 'set');
  assert.equal(report.policy.simulation.simulationOwnerUid, 'set');
  assert.equal(report.evidence.posts[0].ownerUid, 'set');
  assert.deepEqual(report.csvColumns.days, ['row', 'day', 'people.actors']);
  assert.equal(uidFree(report), true);
  assert.equal(normalizeAlgorithmReport(reportFixture()).policy.simulation.simulationOwnerUid, 'set', 'set/unset pass through');
  assert.equal(normalizeAlgorithmReport(reportFixture({ policy: { simulation: { simulationOwnerUid: 'unset' } } })).policy.simulation.simulationOwnerUid, 'unset');
});

test('normaliser trims in guardReport\'s order past 1 MiB and refuses what is still too large — never zero-filled', () => {
  // Under the 2,000-character text cap, so the size survives sanitising: 50 posts × 12 × 1,900 ≈ 1.14 MB.
  const padding = 'x'.repeat(1_900);
  const heavyPosts = Array.from({ length: 50 }, (_, index) => postRow(index + 1, { lastCause: padding, channelId: padding, decayModeSeen: padding, ageBucketAtD: padding, cls: padding, ownerClass: padding, dayGain: { a: padding, b: padding, c: padding, d: padding, e: padding, f: padding } }));
  const heavy = reportFixture({}, evidenceFixture({ posts: heavyPosts }));
  assert.ok(Buffer.byteLength(JSON.stringify(heavy)) > REPORT_BOUNDS.serializedBytes, 'the fixture starts over the cap');
  const trimmed = normalizeAlgorithmReport(heavy);
  assert.equal(isReportRefusal(trimmed), false, 'halving posts brings it under');
  assert.equal(trimmed.headline.coverage.trimmed, true);
  assert.equal(trimmed.evidence.posts.length, 25, 'posts halved first');
  assert.equal(trimmed.evidence.days.length, 30, 'days untouched when halving suffices');
  assert.equal(trimmed.evidence.snapshots.contamination.d7.posts.length, 1);
  assert.ok(trimmed.evidence.posts[0].dayGain, 'per-post day rows survive when not needed');

  const heavier = reportFixture({}, evidenceFixture({
    posts: heavyPosts,
    days: Array.from({ length: 30 }, (_, index) => dayRow(29 - index, { surfaces: Object.fromEntries(Array.from({ length: 40 }, (_, k) => [`s${k}`, 'y'.repeat(600)])) })),
  }));
  const deeper = normalizeAlgorithmReport(heavier);
  assert.equal(isReportRefusal(deeper), false);
  assert.equal(deeper.evidence.posts.length, 25);
  assert.equal(deeper.evidence.days.length, 14, 'then days to 14');
  assert.equal(deeper.evidence.days[13].day, DAY, 'the newest days are the ones kept');

  const impossible = reportFixture({ policy: Object.fromEntries(Array.from({ length: 120 }, (_, k) => [`k${k}`, Object.fromEntries(Array.from({ length: 60 }, (_, j) => [`j${j}`, 'z'.repeat(1_500)]))])) });
  const refused = normalizeAlgorithmReport(impossible);
  assert.deepEqual(refused, { version: 1, day: DAY, revision: 1, digestVersion: 18, oversize: true });
  assert.equal(isReportRefusal(refused), true);
});

test('index normaliser: version gate, typed rows, one per day at the highest revision, newest first, ≤ 120', () => {
  assert.equal(normalizeReportIndex(null), null);
  assert.equal(normalizeReportIndex('index'), null);
  assert.deepEqual(normalizeReportIndex({ version: 2, days: [] }), { version: 2, unsupportedVersion: true });
  assert.deepEqual(normalizeReportIndex({ days: [] }), { version: null, unsupportedVersion: true });
  const row = (offset, overrides = {}) => ({
    day: dayKey(offset), generatedAtMillis: RUN - offset * 86_400_000, digestVersion: 18 - offset, revision: 1, partial: false, backfilled: offset > 100, catchUp: false,
    trialOn: true, trialMultiplier: 5, decision: 'none', knob: null, to: null, counts: { suggest: 0, verify: 0, hold: 0, insufficient: 7, fixed: 10 },
    productionEpoch: '293c52c9', sourcePolicyVersion: '07b43286', bytes: 145_351, ...overrides,
  });
  const index = normalizeReportIndex({
    version: 1, lastReportedDay: DAY, updatedAtMillis: RUN, runId: 'run-2026-09-13T04-45',
    days: [
      ...Array.from({ length: 150 }, (_, offset) => row(offset)).reverse(),
      row(0, { revision: 2, decision: 'suggest', knob: 'K2', to: 1_250, counts: { suggest: 1, hold: 4, insufficient: 2, fixed: 10 } }),
      row(3, { revision: 2, decision: 'suggest', knob: null, to: 1_250 }),
      row(4, { revision: 2, decision: 'suggest', knob: 'K2', to: null }),
      row(5, { revision: 2, decision: 'apply', knob: 'K2', to: 1_250, staleData: true, partial: 'yes' }),
      row(5, { revision: 1, decision: 'verify' }),
      row(6, { day: '2026-09-31' }),
      { day: 'yesterday' },
      'row',
      null,
    ],
  });
  assert.equal(index.version, 1);
  assert.equal(index.lastReportedDay, DAY);
  assert.equal(index.updatedAtMillis, RUN);
  assert.equal(index.runId, 'run-2026-09-13T04-45');
  assert.equal(index.days.length, REPORT_BOUNDS.indexRows);
  assert.equal(index.days[0].day, DAY);
  assert.equal(index.days[0].revision, 2, 'the higher revision wins the day');
  assert.equal(index.days[0].decision, 'suggest');
  assert.equal(index.days[0].knob, 'K2');
  assert.equal(index.days[0].to, 1_250);
  assert.deepEqual(index.days[0].counts, { suggest: 1, verify: 0, hold: 4, insufficient: 2, fixed: 10 });
  assert.equal(index.days[1].day, dayKey(1));
  assert.equal(index.days[119].day, dayKey(119), 'newest 120 kept');
  assert.equal(new Set(index.days.map(item => item.day)).size, 120, 'one row per day');
  assert.equal(index.days[3].decision, 'none', 'suggest without a knob is none');
  assert.equal(index.days[3].knob, null);
  assert.equal(index.days[3].to, null);
  assert.equal(index.days[4].decision, 'none', 'suggest without a value is none');
  assert.equal(index.days[5].decision, 'none', 'an unknown decision is none, never "apply"');
  assert.equal(index.days[5].revision, 2, 'a later revision 1 row never displaces revision 2');
  assert.equal(index.days[5].staleData, true);
  assert.equal(index.days[5].partial, false);
  assert.equal(index.days[6].day, dayKey(6), 'a row with an impossible day was dropped, the real one stands');
  assert.equal(index.days[6].revision, 1);
  assert.equal(index.days[0].trialMultiplier, 5);
  assert.equal(index.days[0].bytes, 145_351);
  assert.equal(normalizeReportIndex({ version: 1, days: 'none' }).days.length, 0);
  assert.equal(normalizeReportIndex({ version: 1, lastReportedDay: 'never' }).lastReportedDay, null);
  assert.equal(uidFree(index), true);
});

test('the frame carries ≤ 60 index rows and never a body; a refusal passes through; the listed revision is read from the index', () => {
  const index = normalizeReportIndex({ version: 1, lastReportedDay: DAY, updatedAtMillis: RUN, runId: 'r', days: Array.from({ length: 120 }, (_, offset) => ({ day: dayKey(offset), revision: offset === 2 ? 3 : 1, decision: 'none', counts: {} })) });
  const frame = reportIndexFrame(index);
  assert.equal(frame.days.length, REPORT_BOUNDS.frameRows);
  assert.equal(frame.days[0].day, DAY);
  assert.equal(frame.days[59].day, dayKey(59));
  assert.deepEqual(Object.keys(frame), ['version', 'lastReportedDay', 'updatedAtMillis', 'runId', 'days']);
  assert.ok(!JSON.stringify(frame).includes('evidence') && !JSON.stringify(frame).includes('verdicts'), 'no body rides the frame');
  assert.equal(reportIndexFrame(null), null);
  assert.equal(reportIndexFrame('index'), null);
  assert.deepEqual(reportIndexFrame({ version: 2, unsupportedVersion: true }), { version: 2, unsupportedVersion: true });
  assert.equal(reportRevisionListed(index, dayKey(2)), 3);
  assert.equal(reportRevisionListed(index, dayKey(0)), 1);
  assert.equal(reportRevisionListed(index, '2025-01-01'), null, 'a day the index does not list');
  assert.equal(reportRevisionListed(null, DAY), null);
  assert.equal(reportRevisionListed({ version: 2, unsupportedVersion: true }, DAY), null);
});

test('body cache is keyed by day@revision, evicted by a higher listed revision, serves an unlisted day from what it holds', () => {
  const cache = createReportCache();
  assert.equal(cache.limit, REPORT_CACHE_ENTRIES);
  const rev1 = { version: 1, day: DAY, revision: 1 };
  const rev2 = { version: 1, day: DAY, revision: 2 };
  assert.equal(cache.lookup(DAY, 1), null);
  assert.equal(cache.store(DAY, 1, rev1), true);
  assert.equal(reportCacheKey(DAY, 1), '2026-09-12@1');
  assert.deepEqual(cache.keys(), ['2026-09-12@1']);
  assert.equal(cache.has(DAY, 1), true);
  assert.equal(cache.has(DAY, 2), false);
  assert.equal(cache.lookup(DAY, 1), rev1, 'the listed revision hits');
  assert.equal(cache.lookup(DAY, null), rev1, 'an unlisted day serves what is cached');
  assert.equal(cache.lookup(DAY, 2), null, 'a higher revision in the index evicts');
  assert.equal(cache.size(), 0);
  assert.equal(cache.store(DAY, 2, rev2), true);
  assert.equal(cache.store(DAY, 1, rev1), false, 'an older revision never replaces a newer one');
  assert.equal(cache.lookup(DAY, 2), rev2);
  assert.equal(cache.lookup(DAY, 1), rev2, 'a body newer than the index copy knows is still the right body');
  assert.equal(cache.revision(DAY), 2);
  assert.equal(cache.store('2026-9-1', 1, rev1), false, 'a malformed day is never a key');
  assert.equal(cache.store(DAY, 3, 'body'), false);
  assert.equal(cache.store(DAY, 3, null), false);
  cache.clear();
  assert.equal(cache.size(), 0);

  const small = createReportCache({ limit: 3 });
  for (let offset = 5; offset >= 0; offset -= 1) small.store(dayKey(offset), 1, { day: dayKey(offset) });
  assert.equal(small.size(), 3);
  assert.equal(small.lookup(dayKey(5), null), null, 'the oldest entry stored is evicted first');
  assert.deepEqual(small.keys().sort(), [`${dayKey(2)}@1`, `${dayKey(1)}@1`, `${dayKey(0)}@1`]);
});

// The proxy is a user-started process with module-level side effects, so its
// routes are pinned at the source: the tenth watcher on the index document,
// the two GET routes behind the origin lock and before the 404 gate, the
// ledger-reads header, the untouched action set, and no Firestore writer.
test('proxy source: tenth watcher on the index, read-only report routes behind the origin lock, allowedActions untouched', async () => {
  const source = await readFile(new URL('./test-control-proxy.mjs', import.meta.url), 'utf8');
  const code = source.replace(/^\s*\/\/.*$/gm, '');
  assert.equal(REPORT_INDEX_DOC, 'testControl/algorithmReports');
  assert.equal(REPORT_DAYS_COLLECTION, 'testControl/algorithmReports/daily');
  assert.match(code, /collection\('testControl'\)\.doc\('algorithmReports'\)\.onSnapshot\(reportsChanged, failed\)/, 'the tenth watcher watches the index document');
  assert.match(code, /liveState\.acceptReports\(normalizeReportIndex\(snapshot\.data\(\) \?\? null\)\)/, 'an absent index reads as null');
  assert.doesNotMatch(code, /doc\('algorithmReports'\)\.collection/, 'the bodies are never watched');
  assert.match(code, /const allowedActions = new Set\(\['dashboard', 'runner', 'postHistory', 'testerPosts'\]\);/, 'no new callable action');
  const originLock = code.indexOf("if (origin !== controlRoomOrigin) {");
  const indexRoute = code.indexOf("requestURL.pathname === '/api/reports'");
  const dayRoute = code.indexOf("/^\\/api\\/reports\\/([^/]+)$/");
  const notFound = code.indexOf("Local beta desk route not found.");
  assert.ok(originLock > 0 && indexRoute > originLock && dayRoute > indexRoute && notFound > dayRoute, 'routes sit behind the origin lock and before the 404 gate');
  assert.match(code, /parseReportDay\(decodeURIComponent\(reportMatch\[1\]\)\)/, 'the day is validated, not trusted');
  assert.match(code, /Report day must be YYYY-MM-DD\./, 'a malformed day is 400');
  assert.match(code, /'x-poplur-ledger-reads': String\(reads\)/, 'the read count is exposed like the ledger export');
  assert.match(code, /reportCache\.lookup\(day, listed\)/, 'the cache is consulted with the index copy\'s revision');
  assert.match(code, /ledgerReadBudget\.remaining\(Date\.now\(\)\)/, 'the same 25k/day budget');
  assert.match(code, /refuseReportRead\(response, origin, remaining\)/);
  assert.match(code, /sendJSON\(response, 429, origin, \{\s*error: \{ message: 'That report read would exceed today\\'s ledger read budget\.' \},\s*remaining,\s*estimate:/, 'the ledger export\'s 429 shape');
  assert.match(code, /doc\(`\$\{REPORT_DAYS_COLLECTION\}\/\$\{day\}`\)\.get\(\)/, 'one document get per uncached day');
  assert.match(code, /doc\(REPORT_INDEX_DOC\)\.get\(\)/, 'one document get when the watcher has not delivered');
  assert.match(code, /if \(liveState\.hasReports\(\)\)/, 'no read once the watcher has spoken');
  const reportRoutes = code.slice(code.indexOf('function sendReportJSON'), code.indexOf('async function relayControl'));
  assert.doesNotMatch(reportRoutes, /\.(set|update|delete|create|add)\(/, 'the report routes write nothing');
  assert.doesNotMatch(reportRoutes, /runTransaction|batch\(/, 'no transaction either');
  assert.doesNotMatch(reportRoutes, /startLiveWatchers\(/, 'a GET never attaches the ten watchers');
  assert.match(reportRoutes, /onboardingQuarantine/, 'both routes refuse under quarantine');
  assert.equal((reportRoutes.match(/sendJSON\(response, 503, origin/g) ?? []).length, 2);
});
