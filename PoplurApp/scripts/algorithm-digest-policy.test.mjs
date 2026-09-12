import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTOR_CLASSES,
  DESK_OWNER_UIDS,
  DESK_REVIEW_UIDS,
  DIGEST_BOUNDS,
  LEDGER_CSV_COLUMNS,
  LEDGER_EXPORT_DAY_READ_BUDGET,
  LEDGER_EXPORT_POST_LIMIT,
  MAX_RADIUS_METERS,
  actorClass,
  createLedgerReadBudget,
  csvCell,
  decayModeForRate,
  digestDaysCsv,
  digestKnobs,
  digestPostsCsv,
  estimateLedgerExport,
  isSyntheticAccount,
  labelLedgerEntries,
  ledgerCsv,
  ledgerExportFilename,
  ledgerRowsForPost,
  normalizeAlgorithmDigest,
  ownerClassOf,
  postClass,
  readsToCad,
  torontoDayKey,
  validateLedgerExportRequest,
} from './algorithm-digest-policy.mjs';

const NOW = Date.UTC(2026, 8, 11, 20);
const HOUR = 3_600_000;

const day = (offset, overrides = {}) => ({
  day: `2026-09-${String(1 + offset).padStart(2, '0')}`,
  observedPolicy: 'abcd1234',
  postsCreated: { real: offset, owner: 0, review: 0, synthetic: 64, official: 0, lab: 0 },
  entries: { real: 3, official: 29, unknownCause: 0 },
  realPostGain: { real: { view: 1_000, like: 0, comment: 0, dislike: 0, total: 1_000, n: 1, firstViews: 1, repeatViews: 0, repeatMeters: 0, clamped: 0, resync: 0 } },
  ...overrides,
});

const post = (index, overrides = {}) => ({
  postId: `post-${String(index).padStart(16, '0')}`,
  cls: 'real',
  ownerClass: 'owner',
  channelId: 'live',
  createdAtMillis: NOW - index * HOUR,
  seedMeters: 5_000,
  currentMeters: 209_000,
  organicMeters: 204_000,
  boostMeters: 0,
  peakMeters: 209_000,
  peakAtMillis: NOW - HOUR,
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
  viewCount: 400,
  firstRealEngagementAtMillis: null,
  lastAtMillis: NOW - 600_000,
  lastCause: 'decay',
  atClaim: false,
  expired: false,
  deletedAtMillis: null,
  ...overrides,
});

const digestFixture = (overrides = {}) => ({
  version: 1,
  digestVersion: 41,
  generatedAtMillis: NOW,
  runId: 'run-41',
  runMs: 1_800,
  headline: { trialOn: true, trialSinceMillis: 1788826046064, trialMultiplier: 5, boostedSinceMillis: 1788845178241, anchorsAtWorld: 0, anchorsEver: 29, worstAnchor: { postId: 'post-official-cartoon-drive-ad', radiusMeters: 46_697, ratePerPassSeen: 0.0115 } },
  cost: { reads: 150, readsToday: 3_600, monthlyCadProjected: 0.05 },
  coverage: { entriesFolded: 2_600, complete: true, capped: false, registeredPosts: { real: 0, owner: 3, review: 0, official: 29 } },
  knobs: { firstViewMeters: 1_000, likeMeters: 1_000, dislikeMeters: -1_000, commentMeters: 2_000, repeatViewBaseMeters: 500, decayPerDay: 0.05, decayFloorMeters: 10, maxRadiusMeters: 6_371_000, syntheticStressHalfLifeHours: 4 },
  switches: { decayTrial: { enabled: true, multiplier: 5, scope: 'all-users', effectiveAtMillis: 1788826046064, boostedEffectiveAtMillis: 1788845178241 } },
  gates: { minEvents: 30, minPosts: 8, minChannelPosts: 5, minActors: 2 },
  windows: { d7: { days: 7 }, d30: { days: 30 } },
  days: [day(0), day(1)],
  channels: [{ channelId: 'live', realPosts: 0, n: 0, sufficient: false }],
  posts: [post(1), post(2)],
  anchors: { worldMeters: 6_371_000, everAtWorld: 29, rows: [{ postId: 'post-official-cartoon-drive-ad', radiusMeters: 46_697, atWorld: false, decayPathSeen: 'boost' }] },
  contamination: { d7: { syntheticMeters: 204_000, posts: [{ postId: post(1).postId, syntheticMeters: 204_000, ownerMeters: 0, share: 1 }] } },
  observedPolicyVersions: [{ version: 'abcd1234', fromMillis: NOW - 7 * 24 * HOUR }],
  gaps: [{ id: 'ceilingMeters', measured: false }],
  ...overrides,
});

test('normaliser gates the schema version and never renders another major as zeros', () => {
  assert.equal(normalizeAlgorithmDigest(null), null);
  assert.equal(normalizeAlgorithmDigest('digest'), null);
  assert.deepEqual(normalizeAlgorithmDigest({ version: 2, days: [day(0)] }), { version: 2, unsupportedVersion: true });
  assert.deepEqual(normalizeAlgorithmDigest({ days: [day(0)] }), { version: null, unsupportedVersion: true });
  const digest = normalizeAlgorithmDigest(digestFixture());
  assert.equal(digest.version, 1);
  assert.equal(digest.digestVersion, 41);
  assert.equal(digest.headline.trialOn, true);
  assert.equal(digest.headline.trialMultiplier, 5);
  assert.equal(digest.posts.length, 2);
  assert.equal(digest.days[0].realPostGain.real.view, 1_000);
  assert.equal(digest.unsupportedVersion, undefined);
});

test('normaliser applies the §2.1 bounds and numeric clamps', () => {
  const oversized = digestFixture({
    days: Array.from({ length: 45 }, (_, index) => day(index % 28)),
    posts: Array.from({ length: 80 }, (_, index) => post(index + 1)),
    channels: Array.from({ length: 20 }, (_, index) => ({ channelId: `c${index}` })),
    anchors: { worldMeters: 6_371_000, everAtWorld: 29, rows: Array.from({ length: 12 }, (_, index) => ({ postId: `post-official-${index}` })) },
    contamination: { d7: { posts: Array.from({ length: 30 }, (_, index) => ({ postId: `post-${index}` })) } },
    observedPolicyVersions: Array.from({ length: 12 }, (_, index) => ({ version: `v${index}` })),
    gaps: Array.from({ length: 20 }, (_, index) => ({ id: `gap-${index}` })),
  });
  const digest = normalizeAlgorithmDigest(oversized);
  assert.equal(digest.days.length, DIGEST_BOUNDS.days);
  assert.equal(digest.posts.length, DIGEST_BOUNDS.posts);
  assert.equal(digest.channels.length, DIGEST_BOUNDS.channels);
  assert.equal(digest.anchors.rows.length, DIGEST_BOUNDS.anchors);
  assert.equal(digest.contamination.d7.posts.length, DIGEST_BOUNDS.contaminationPosts);
  assert.equal(digest.observedPolicyVersions.length, DIGEST_BOUNDS.policyVersions);
  assert.equal(digest.gaps.length, DIGEST_BOUNDS.gaps);

  const clamped = normalizeAlgorithmDigest(digestFixture({
    digestVersion: -4,
    generatedAtMillis: 'soon',
    posts: [post(1, { currentMeters: 40_075_000, realGain: -9e9, entries: Number.NaN, postId: '' }), post(2, { peakMeters: Number.POSITIVE_INFINITY, lastAtMillis: -5 })],
    headline: { worstAnchor: { radiusMeters: Number.NaN } },
  }));
  assert.equal(clamped.digestVersion, 0);
  assert.equal(clamped.generatedAtMillis, 0);
  assert.equal(clamped.posts.length, 1, 'a post without an id is dropped');
  assert.equal(clamped.posts[0].peakMeters, MAX_RADIUS_METERS);
  assert.equal(clamped.posts[0].lastAtMillis, 0);
  assert.equal(clamped.headline.worstAnchor.radiusMeters, 0);
  assert.equal(normalizeAlgorithmDigest(digestFixture({ posts: [post(1, { realGain: -9e9 })] })).posts[0].realGain, -MAX_RADIUS_METERS);
});

test('normaliser trims in the digest order past the serialized cap and refuses what is still too large', () => {
  const padding = 'x'.repeat(150);
  const heavy = digestFixture({
    posts: Array.from({ length: 50 }, (_, index) => post(index + 1, { lastCause: padding, channelId: padding, decayModeSeen: padding })),
    days: Array.from({ length: 30 }, (_, index) => day(index, Object.fromEntries(Array.from({ length: 120 }, (_, k) => [`k${k}`, padding])))),
  });
  assert.ok(JSON.stringify(heavy).length > DIGEST_BOUNDS.serializedBytes, 'the fixture starts over the cap');
  const trimmed = normalizeAlgorithmDigest(heavy);
  assert.ok(trimmed && !trimmed.oversize, 'a 500 KB-ish document trims into the cap');
  assert.equal(trimmed.coverage.trimmed, true);
  assert.ok(trimmed.posts.length <= 25);
  const impossible = digestFixture({
    coverage: Object.fromEntries(Array.from({ length: 120 }, (_, k) => [`k${k}`, Object.fromEntries(Array.from({ length: 60 }, (_, j) => [`j${j}`, padding]))])),
  });
  const refused = normalizeAlgorithmDigest(impossible);
  assert.equal(refused.oversize, true);
  assert.equal(refused.version, 1);
  assert.equal(refused.days, undefined);
});

test('days and posts CSVs are built from the digest with every number and no reads', () => {
  const digest = normalizeAlgorithmDigest(digestFixture());
  const days = digestDaysCsv(digest).split('\r\n');
  assert.equal(days[0].startsWith('day,policyVersion,postsCreated.real,'), true, days[0]);
  assert.ok(days[0].includes('realPostGain.real.view'));
  assert.equal(days[1].startsWith('2026-09-01,abcd1234,0,0,0,64,0,0,3,29,0,1000'), true, days[1]);
  assert.equal(days.length, 4, 'header, two rows, trailing newline');
  const posts = digestPostsCsv(digest).split('\r\n');
  assert.equal(posts[0], 'postId,cls,ownerClass,channelId,createdAtMillis,seedMeters,currentMeters,organicMeters,boostMeters,peakMeters,peakAtMillis,entries,realGain,ownerGain,reviewGain,syntheticGain,unknownGain,decayLoss,decayLossRealShare,decayModeSeen,clean,viewCount,firstRealEngagementAtMillis,lastAtMillis,lastCause,atClaim,expired,deletedAtMillis');
  assert.equal(posts[1].startsWith('post-0000000000000001,real,owner,live,'), true);
  assert.ok(posts[1].endsWith(',trial,false,400,,' + (NOW - 600_000) + ',decay,false,false,'));
  assert.equal(digestDaysCsv(null), 'day,policyVersion\r\n');
});

test('CSV quoting is RFC 4180 and formula-safe', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('line\nbreak'), '"line\nbreak"');
  assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(csvCell('+1'), "'+1");
  assert.equal(csvCell('-cmd'), "'-cmd");
  assert.equal(csvCell(-1000), '-1000');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(undefined), '');
  assert.equal(csvCell(true), 'true');
  assert.equal(csvCell(Number.NaN), '');
});

test('ledgerCsv emits exactly the §4.5 columns and never a uid beyond ownerClass', () => {
  const csv = ledgerCsv([{
    postId: 'post-0000000000000001', postClass: 'real', ownerClass: 'owner', clean: false, channelId: 'live',
    entryId: 'create', atMillis: NOW, cause: 'create', kind: '', actorClass: '—', bucket: '—', decayMode: '—',
    radiusMeters: 5_000, organicRadiusMeters: 0, seedRadiusMeters: 5_000, boostedRadiusMeters: 0, delta: 0, organicDelta: 0, writer: 'radiusHistoryOnPostCreated',
    actorUid: 'LiEG6SNtKEZN6eEGeybf0afZnHm1', uid: 'leak', latitude: 43.6, longitude: -79.4,
  }, {
    postId: 'post-0000000000000001', postClass: 'real', ownerClass: 'owner', clean: false, channelId: 'live',
    entryId: 'eng-1', atMillis: NOW + 1, cause: 'engagement', kind: 'view', actorClass: 'sim-food-scout', bucket: 'nope', decayMode: 'later',
    radiusMeters: 6_000, organicRadiusMeters: 1_000, seedRadiusMeters: 5_000, boostedRadiusMeters: 0, delta: 1_000, organicDelta: 1_000, writer: 'recordPostEngagement',
  }]);
  const [header, first, second] = csv.split('\r\n');
  assert.equal(header, LEDGER_CSV_COLUMNS.join(','));
  assert.ok(!header.includes('uid'), header);
  assert.ok(!csv.includes('LiEG6SNtKEZN6eEGeybf0afZnHm1'));
  assert.ok(!csv.includes('leak'));
  assert.ok(!csv.includes('43.6'));
  assert.ok(first.includes(`,${new Date(NOW).toISOString()},${NOW},create,,—,—,—,`), first);
  assert.ok(second.includes(',engagement,view,unknown,—,—,'), 'an unrecognised actor class reads unknown, never the value');
  for (const column of LEDGER_CSV_COLUMNS) assert.ok(!/uid/i.test(column) || column === 'ownerClass', column);
});

test('estimate is Σ (1 + entries) with unknown posts at the 501 cap, and cad at CA$0.05 per 100k', () => {
  const digest = normalizeAlgorithmDigest(digestFixture({ posts: [post(1, { entries: 131 }), post(2, { entries: 900 }), post(3, { entries: 0 })] }));
  const known = estimateLedgerExport(digest, [post(1).postId]);
  assert.deepEqual(known, { reads: 132, cad: readsToCad(132), posts: 1, unknownPosts: 0 });
  const capped = estimateLedgerExport(digest, [post(2).postId, post(3).postId]);
  assert.equal(capped.reads, 501 + 1, 'entries above 500 read at most 500; a post with no entries still costs its document read');
  const stranger = estimateLedgerExport(digest, ['post-aaaaaaaaaaaaaaaa', 'post-aaaaaaaaaaaaaaaa', post(1).postId]);
  assert.deepEqual(stranger, { reads: 501 + 132, cad: readsToCad(633), posts: 2, unknownPosts: 1 });
  assert.equal(estimateLedgerExport(null, ['post-aaaaaaaaaaaaaaaa']).reads, 501);
  assert.equal(readsToCad(100_000), 0.05);
  assert.equal(readsToCad(2_940), 0.00147);
  assert.equal(estimateLedgerExport(digest, 'not-an-array').reads, 0);
});

test('export request validation: pattern, ≤ 50 ids, dedupe, classifyActors flag', () => {
  const ids = Array.from({ length: LEDGER_EXPORT_POST_LIMIT }, (_, index) => `post-${String(index).padStart(16, 'a')}`);
  assert.deepEqual(validateLedgerExportRequest({ postIds: ids }).postIds, ids);
  assert.equal(validateLedgerExportRequest({ postIds: ids }).classifyActors, true);
  assert.equal(validateLedgerExportRequest({ postIds: ids.slice(0, 1), classifyActors: false }).classifyActors, false);
  assert.deepEqual(validateLedgerExportRequest({ postIds: [ids[0], ids[0]] }).postIds, [ids[0]]);
  assert.throws(() => validateLedgerExportRequest({ postIds: [...ids, 'post-zzzzzzzzzzzzzzzzzz'] }), /At most 50/);
  assert.throws(() => validateLedgerExportRequest({ postIds: [] }), /non-empty/);
  assert.throws(() => validateLedgerExportRequest({ postIds: ['post-short'] }), /not one this desk/);
  assert.throws(() => validateLedgerExportRequest({ postIds: ['posts/x/../y-aaaaaaaaaaaaaaaa'] }));
  assert.throws(() => validateLedgerExportRequest({ postIds: [42] }));
  assert.throws(() => validateLedgerExportRequest({ postIds: ids.slice(0, 1), classifyActors: 'yes' }), /boolean/);
  assert.throws(() => validateLedgerExportRequest(null));
});

test('per-day budget refuses before any read and rolls at the Toronto midnight', () => {
  const budget = createLedgerReadBudget();
  assert.equal(budget.limit, LEDGER_EXPORT_DAY_READ_BUDGET);
  assert.equal(budget.remaining(NOW), 25_000);
  budget.charge(24_000, NOW);
  assert.equal(budget.remaining(NOW), 1_000);
  const estimate = estimateLedgerExport(null, ['post-aaaaaaaaaaaaaaaa', 'post-bbbbbbbbbbbbbbbb']);
  assert.ok(estimate.reads > budget.remaining(NOW), 'the guard compares the estimate to what is left');
  budget.charge(5_000, NOW);
  assert.equal(budget.remaining(NOW), 0, 'never negative');
  // 11 Sep 2026 20:00Z is 16:00 in Toronto; 04:00Z the next day is still 11 Sep there.
  assert.equal(torontoDayKey(NOW), '2026-09-11');
  assert.equal(torontoDayKey(Date.UTC(2026, 8, 12, 3, 59)), '2026-09-11');
  assert.equal(budget.remaining(Date.UTC(2026, 8, 12, 3, 59)), 0);
  assert.equal(budget.remaining(Date.UTC(2026, 8, 12, 4, 1)), 25_000, 'a new Toronto day resets the budget');
  assert.equal(ledgerExportFilename(NOW), 'poplur-ledger-20260911-1600.csv');
  assert.equal(ledgerExportFilename(Date.UTC(2026, 8, 12, 4, 1)), 'poplur-ledger-20260912-0001.csv');
});

test('post class order and the five-valued actor class', () => {
  assert.equal(postClass('post-any', { officialContent: true, syntheticBeta: true }), 'official');
  assert.equal(postClass('post-radius-lab-1', { syntheticBeta: true }), 'lab');
  assert.equal(postClass('post-x', { syntheticSource: 'radius-lab-pulse' }), 'lab');
  assert.equal(postClass('post-x', { syntheticBeta: true }), 'synthetic');
  assert.equal(postClass('post-sim-1', {}), 'synthetic');
  assert.equal(postClass('post-x', { source: 'synthetic-browser' }), 'synthetic');
  assert.equal(postClass('post-x', {}, true), 'synthetic');
  assert.equal(postClass('post-x', { userID: 'someone' }), 'real');
  assert.deepEqual(ACTOR_CLASSES, ['real', 'owner', 'review', 'synthetic', 'unknown']);
  for (const uid of DESK_OWNER_UIDS) assert.equal(actorClass(uid, null, 'mark@poplur.com'), 'owner');
  for (const uid of DESK_REVIEW_UIDS) assert.equal(actorClass(uid, null, 'appreview@poplur.com'), 'review');
  assert.equal(actorClass('sim-food-scout', null, null), 'synthetic');
  assert.equal(actorClass('synthetic-conquer-1', null, null), 'synthetic');
  assert.equal(actorClass('n1BkpZPv4HcBKLAG7FXQTzYp7sF2', null, 'shared.first.user.mtive6bz@synthetic.poplur.test'), 'synthetic');
  assert.equal(actorClass('QAaaaaaaaaaaaaaaaaaaaaaaaaaa', null, 'radius.actor.1-abc@synthetic.poplur.test'), 'synthetic', 'the widened .poplur.test rule');
  assert.equal(actorClass('QAbbbbbbbbbbbbbbbbbbbbbbbbbb', null, 'beta-sim-food-001@poplur.test'), 'synthetic');
  assert.equal(actorClass('Rand0maaaaaaaaaaaaaaaaaaaaa', { accountType: 'user' }, 'someone@gmail.com'), 'real');
  assert.equal(actorClass('Rand0maaaaaaaaaaaaaaaaaaaaa', null, null, false), 'unknown');
  assert.equal(actorClass('', null, null), 'unknown');
  assert.equal(isSyntheticAccount('u', { syntheticBeta: true }, null), true);
  assert.equal(isSyntheticAccount('u', { accountType: 'SyntheticBusiness' }, null), true);
  assert.equal(isSyntheticAccount('u', {}, 'poplur.test@gmail.com'), false);
  assert.equal(ownerClassOf('post-official-cartoon-drive-ad', { officialContent: true, userID: 'PoplurTest' }), 'official');
  assert.equal(ownerClassOf('post-x', { userID: DESK_OWNER_UIDS[0] }), 'owner');
  assert.equal(ownerClassOf('post-x', { userID: DESK_REVIEW_UIDS[0] }), 'review');
  assert.equal(ownerClassOf('post-x', { userID: 'tester' }, 'tester@gmail.com'), 'real');
  assert.equal(ownerClassOf('post-x', { userID: 'tester' }, null, false), 'unknown');
});

const entry = (id, atMillis, overrides = {}) => ({
  id, atMillis, cause: 'engagement', kind: 'view', writer: 'recordPostEngagement',
  radiusMeters: 6_000, organicRadiusMeters: 1_000, seedRadiusMeters: 5_000, boostedRadiusMeters: 0, delta: 1_000, organicDelta: 1_000,
  ...overrides,
});

test('entry buckets: first, repeat, clamped, resync, and — for everything else', () => {
  const knobs = digestKnobs(null);
  const rows = labelLedgerEntries([
    entry('create', NOW, { cause: 'create', writer: 'radiusHistoryOnPostCreated', radiusMeters: 5_000, organicRadiusMeters: 0, delta: 0, organicDelta: 0 }),
    entry('v1', NOW + 1),
    entry('v2', NOW + 2, { organicDelta: 500, delta: 500, organicRadiusMeters: 1_500, radiusMeters: 6_500 }),
    entry('v3', NOW + 3, { organicDelta: 0, delta: -1_200, radiusMeters: 5_300 }),
    entry('l1', NOW + 4, { kind: 'like' }),
    entry('d1', NOW + 5, { kind: 'dislike', organicDelta: -400, delta: -400 }),
    entry('d2', NOW + 6, { kind: 'dislike', organicDelta: -1_000, delta: -1_000 }),
    entry('w1', NOW + 7, { radiusMeters: MAX_RADIUS_METERS, organicDelta: 12 }),
    entry('c1', NOW + 8, { kind: 'comment', radiusMeters: MAX_RADIUS_METERS - 500, organicDelta: 700, delta: 700 }),
    entry('b1', NOW + 9, { cause: 'boost', writer: 'boost', organicDelta: 0, delta: 1_000 }),
    entry('g1', NOW + 10, { cause: 'growth', writer: 'radius-lab' }),
  ], { knobs });
  const byId = Object.fromEntries(rows.map(row => [row.id, row]));
  assert.equal(byId.create.bucket, '—');
  assert.equal(byId.v1.bucket, 'first');
  assert.equal(byId.v2.bucket, 'repeat');
  assert.equal(byId.v3.bucket, 'resync');
  assert.equal(byId.l1.bucket, '—');
  assert.equal(byId.d1.bucket, 'clamped', 'a partial dislike is clamped');
  assert.equal(byId.d2.bucket, '—');
  assert.equal(byId.w1.bucket, 'clamped', 'at the ceiling');
  assert.equal(byId.c1.bucket, 'clamped', 'a short grant within 2 km of the ceiling');
  assert.equal(byId.b1.bucket, '—');
  assert.equal(byId.g1.bucket, '—');
  for (const row of rows) assert.equal(row.decayMode, '—');
});

const decayEntry = (id, atMillis, organic, before, overrides = {}) => ({
  id, atMillis, cause: 'decay', writer: 'radiusDecay', kind: undefined,
  radiusMeters: 5_000 + organic, organicRadiusMeters: organic, seedRadiusMeters: 5_000, boostedRadiusMeters: 0,
  delta: organic - before, organicDelta: organic - before,
  ...overrides,
});

test('decay mode per entry: component drops, the hourly rate, the projection tiebreak, else undetermined', () => {
  const start = 100_000;
  // Each pass is one hour on from the last: ×1, then ×5, then the 4-hour stress half-life.
  const factor = multiplier => 0.95 ** (multiplier / 24);
  const o1 = Math.floor(start * factor(1));
  const o2 = Math.floor(o1 * factor(5));
  const o3 = Math.floor(o2 * 0.5 ** (1 / 4));
  const rows = labelLedgerEntries([
    entry('create', NOW, { cause: 'create', writer: 'radiusHistoryOnPostCreated', radiusMeters: 5_000, organicRadiusMeters: 0, delta: 0, organicDelta: 0 }),
    entry('v1', NOW + 1, { organicDelta: start, delta: start, organicRadiusMeters: start, radiusMeters: 5_000 + start }),
    decayEntry('n1', NOW + HOUR, o1, start),
    decayEntry('t5', NOW + 2 * HOUR, o2, o1),
    decayEntry('s1', NOW + 3 * HOUR, o3, o2),
    decayEntry('seed', NOW + 4 * HOUR, o3, o3, { seedRadiusMeters: 3_870, delta: -1_130, organicDelta: 0 }),
    decayEntry('same', NOW + 5 * HOUR, o3, o3, { seedRadiusMeters: 3_870, boostedRadiusMeters: 0, delta: 0, organicDelta: 0 }),
    decayEntry('lab', NOW + 6 * HOUR, 100, 200, { writer: 'radius-lab' }),
    decayEntry('low', NOW + 7 * HOUR, 300, 301),
  ]);
  const byId = Object.fromEntries(rows.map(row => [row.id, row]));
  assert.equal(byId.n1.decayMode, 'normal');
  assert.equal(byId.t5.decayMode, 'trial');
  assert.equal(byId.t5.trialMultiplierSeen, 5);
  assert.equal(byId.s1.decayMode, 'stress');
  assert.equal(byId.seed.decayMode, 'trial', 'a seed drop exists only under a trial');
  assert.equal(byId.same.decayMode, 'undetermined', 'no drop, no rate, no projection: never a guess');
  assert.equal(byId.lab.decayMode, '—', 'a lab decay entry is other.unknown, never a mode');
  assert.equal(byId.low.decayMode, 'undetermined', 'below 468 m the rate is uninformative');
  assert.equal(byId.v1.decayMode, '—');

  const boostRows = labelLedgerEntries([
    decayEntry('b0', NOW, 0, 0, { boostedRadiusMeters: 6_371_000, radiusMeters: 6_371_000, delta: 0 }),
    decayEntry('b1', NOW + HOUR, 0, 0, { boostedRadiusMeters: 6_300_000, radiusMeters: 6_300_000, delta: -71_000 }),
  ]);
  assert.equal(boostRows[1].decayMode, 'trial', 'the official anchors decay through the boost path only under the boosted trial');

  const anchored = labelLedgerEntries([
    decayEntry('old', NOW, 300, 301),
    decayEntry('new', NOW + HOUR, 299, 300),
  ], { post: { radiusDecayAnchorMillis: NOW + HOUR, radiusDecayOrganicPerDay: 0.2262 } });
  assert.equal(anchored[0].decayMode, 'undetermined', 'older than the projection: counted, never guessed');
  assert.equal(anchored[1].decayMode, 'trial', 'the projection decides the entry it describes');
  const stress = labelLedgerEntries([decayEntry('x', NOW, 300, 301)], { post: { radiusDecayAnchorMillis: 0, radiusDecayOrganicPerDay: 0 } });
  assert.equal(stress[0].decayMode, 'stress');
  const normal = labelLedgerEntries([decayEntry('x', NOW, 300, 301)], { post: { radiusDecayAnchorMillis: NOW, radiusDecayOrganicPerDay: 0.05 } });
  assert.equal(normal[0].decayMode, 'normal');

  assert.deepEqual(decayModeForRate(1 - 0.95 ** (1 / 24)), { mode: 'normal', multiplier: 1 });
  assert.deepEqual(decayModeForRate(1 - 0.95 ** (5 / 24)), { mode: 'trial', multiplier: 5 });
  assert.deepEqual(decayModeForRate(0.16), { mode: 'stress', multiplier: null });
  assert.deepEqual(decayModeForRate(0), { mode: 'undetermined', multiplier: null });
  assert.deepEqual(decayModeForRate(Number.NaN), { mode: 'undetermined', multiplier: null });
});

test('ledger rows carry the digest labels, the joined class and clean, never a uid', () => {
  const rows = ledgerRowsForPost({
    postId: 'post-0000000000000001',
    post: { channelId: 'live', userID: DESK_OWNER_UIDS[1] },
    postClass: 'real',
    ownerClass: 'owner',
    entries: [
      entry('create', NOW, { cause: 'create', writer: 'radiusHistoryOnPostCreated', radiusMeters: 5_000, organicRadiusMeters: 0, delta: 0, organicDelta: 0 }),
      entry('v1', NOW + 1, { engagementId: 'e1' }),
      entry('v2', NOW + 2, { engagementId: 'e2', organicDelta: 500, delta: 500 }),
    ],
    actorClassByEntryId: new Map([['v1', 'real'], ['v2', 'synthetic']]),
  });
  assert.equal(rows.length, 3);
  assert.deepEqual(Object.keys(rows[0]), [...LEDGER_CSV_COLUMNS]);
  assert.equal(rows[0].actorClass, '—');
  assert.equal(rows[1].actorClass, 'real');
  assert.equal(rows[2].actorClass, 'synthetic');
  assert.equal(rows[1].bucket, 'first');
  assert.equal(rows[2].bucket, 'repeat');
  assert.equal(rows[0].clean, false, 'synthetic gain makes the post pumped');
  const clean = ledgerRowsForPost({ postId: 'post-0000000000000002', post: {}, postClass: 'real', ownerClass: 'real', entries: [entry('v1', NOW + 1)], actorClassByEntryId: new Map([['v1', 'real']]) });
  assert.equal(clean[0].clean, true);
  const fromDigest = ledgerRowsForPost({ postId: 'post-0000000000000002', post: {}, postClass: 'real', ownerClass: 'real', clean: false, entries: [entry('v1', NOW + 1)], actorClassByEntryId: new Map([['v1', 'real']]) });
  assert.equal(fromDigest[0].clean, false, 'the digest flag wins when it has one');
  const unjoined = ledgerRowsForPost({ postId: 'post-0000000000000002', post: {}, postClass: 'real', ownerClass: 'real', entries: [entry('v1', NOW + 1)] });
  assert.equal(unjoined[0].actorClass, 'unknown');
  assert.ok(!JSON.stringify(rows).includes(DESK_OWNER_UIDS[1]));
});
