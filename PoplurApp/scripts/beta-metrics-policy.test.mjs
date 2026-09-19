import test from 'node:test';
import assert from 'node:assert/strict';
import { DESK_OWNER_UIDS, DESK_REVIEW_UIDS, torontoDayKey } from './algorithm-digest-policy.mjs';
import {
  BETA_DEFINITIONS,
  BETA_POPS_CSV_COLUMNS,
  BETA_RETENTION_DAYS,
  BETA_USERS_CSV_COLUMNS,
  anchorForAccount,
  betaAccountClass,
  betaCsvFilename,
  betaPopsCsv,
  betaUsersCsv,
  dayKeyOffset,
  dayKeyRange,
  emptySightings,
  engagementDaysToCount,
  foldBetaMetrics,
  haversineMeters,
  hiddenPostIdsForAnchor,
  humanUidChunks,
  isHumanPop,
  markCountedThrough,
  normalizeSightings,
  pruneSightings,
  recordSighting,
  recordSightingDay,
  splitPeakByClass,
  torontoDayBounds,
  torontoDayKeys,
  torontoMidnightMs,
} from './beta-metrics-policy.mjs';

// 15 Sep 2026, 14:00 Toronto (18:00Z): the student beta's eve.
const NOW = Date.UTC(2026, 8, 15, 18);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const TODAY = torontoDayKey(NOW);
const OWNER = DESK_OWNER_UIDS[1];
const REVIEW = DESK_REVIEW_UIDS[0];
// Toronto (the map's HOME) and 12 km east of it; Montréal is ≈ 500 km away.
const TORONTO = { latitude: 43.6487, longitude: -79.3811 };
const NEAR = { latitude: 43.6487, longitude: -79.2321 };
const MONTREAL = { latitude: 45.5017, longitude: -73.5673 };

const account = (uid, createdAtMs, overrides = {}) => ({ uid, email: `${uid}@example.com`, displayName: null, createdAtMs, lastSignInAtMs: createdAtMs, lastRefreshAtMs: createdAtMs, ...overrides });
const post = (id, userID, createdAtMs, coords = TORONTO, overrides = {}) => ({ id, data: { userID, createdAtMillis: createdAtMs, radiusMeters: 5_000, seedRadiusMeters: 5_000, organicRadiusMeters: 0, channelId: 'live', mediaType: 'photo', viewCount: 0, status: 'published', ...(coords ? coords : {}), ...overrides } });

test('account class reuses the desk\'s actorClass: real and owner are human, owner is flagged, the rest excluded', () => {
  assert.deepEqual(betaAccountClass('abcDEF123456', null, 'student@uni.ca'), { cls: 'real', human: true, owner: false });
  assert.deepEqual(betaAccountClass(OWNER, null, 'mark@apptist.ca'), { cls: 'owner', human: true, owner: true });
  assert.equal(betaAccountClass(REVIEW, null, 'appreview@poplur.com').human, false);
  assert.equal(betaAccountClass('sim-food-001', null, null).cls, 'synthetic');
  assert.equal(betaAccountClass('synthetic-conquer-blue', null, null).cls, 'synthetic');
  assert.equal(betaAccountClass('abcDEF123456', { syntheticBeta: true }, null).cls, 'synthetic');
  assert.equal(betaAccountClass('abcDEF123456', null, 'qa@synthetic.poplur.test').cls, 'synthetic');
  assert.equal(betaAccountClass('abcDEF123456', null, null, false).cls, 'unknown');
  assert.equal(isHumanPop('post-1', { userID: 'x' }), true);
  assert.equal(isHumanPop('post-1', { userID: 'x', officialContent: true }), false);
  assert.equal(isHumanPop('post-radius-lab-1', { userID: 'x' }), false);
  assert.equal(isHumanPop('post-1', { userID: 'x', syntheticBeta: true }), false);
  assert.equal(isHumanPop('post-sim-1', { userID: 'x' }), false);
});

test('day keys: Toronto days, oldest first, and calendar offsets across a month edge', () => {
  const keys = torontoDayKeys(NOW, 30);
  assert.equal(keys.length, 30);
  assert.equal(keys[29], '2026-09-15');
  assert.equal(keys[0], '2026-08-17');
  assert.equal(new Set(keys).size, 30);
  assert.equal(dayKeyOffset('2026-08-31', 1), '2026-09-01');
  assert.equal(dayKeyOffset('2026-09-01', -1), '2026-08-31');
  assert.equal(dayKeyOffset('2026-09-15', 14), '2026-09-29');
  assert.equal(dayKeyOffset('nonsense', 1), '');
  // 23:30 Toronto is still that day; 00:30 the next.
  assert.equal(torontoDayKey(Date.UTC(2026, 8, 16, 3, 30)), '2026-09-15');
  assert.equal(torontoDayKey(Date.UTC(2026, 8, 16, 4, 30)), '2026-09-16');
  // Day bounds: EDT midnight is 04:00Z, EST midnight 05:00Z; the DST day is 25 hours.
  assert.equal(torontoMidnightMs('2026-09-16'), Date.UTC(2026, 8, 16, 4));
  assert.deepEqual(torontoDayBounds('2026-09-16'), { startMs: Date.UTC(2026, 8, 16, 4), endMs: Date.UTC(2026, 8, 17, 4) });
  assert.deepEqual(torontoDayBounds('2026-11-01'), { startMs: Date.UTC(2026, 10, 1, 4), endMs: Date.UTC(2026, 10, 2, 5) });
  assert.equal(torontoMidnightMs('bad'), 0);
  assert.deepEqual(dayKeyRange('2026-08-30', '2026-09-02'), ['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02']);
  assert.deepEqual(dayKeyRange('2026-09-02', '2026-09-01'), []);
});

test('engagement day planner: sign-up day to today inside the window, minus days already counted; counted-through never today', () => {
  const ledger = emptySightings();
  const humans = [
    { uid: 'oldUID00000001', signedUpAtMs: NOW - 300 * DAY },   // window-bound: 30 days
    { uid: 'newUID00000002', signedUpAtMs: NOW - 2 * DAY + HOUR }, // 13 Sep → 3 days
    { uid: 'bad uid', signedUpAtMs: NOW },
    null,
  ];
  const plan = engagementDaysToCount({ humans, ledger, now: NOW });
  assert.equal(plan.filter(entry => entry.uid === 'oldUID00000001').length, 30);
  assert.deepEqual(plan.filter(entry => entry.uid === 'newUID00000002').map(entry => entry.day), ['2026-09-13', '2026-09-14', '2026-09-15']);
  assert.equal(plan[0].day, '2026-08-17');
  assert.equal(markCountedThrough(ledger, 'oldUID00000001', '2026-09-14', NOW), true);
  assert.equal(markCountedThrough(ledger, 'oldUID00000001', '2026-09-15', NOW), false, 'today is never final');
  assert.equal(markCountedThrough(ledger, 'oldUID00000001', '2026-09-01', NOW), false, 'never backwards');
  assert.equal(markCountedThrough(ledger, 'newUID00000002', '2026-09-14', NOW), true);
  const next = engagementDaysToCount({ humans, ledger, now: NOW });
  assert.deepEqual(next, [{ uid: 'oldUID00000001', day: '2026-09-15' }, { uid: 'newUID00000002', day: '2026-09-15' }], 'the next run pays for today only');
  assert.equal(recordSightingDay(ledger, 'newUID00000002', '2026-09-14', 'engagement'), true);
  assert.equal(recordSightingDay(ledger, 'newUID00000002', 'not-a-day', 'engagement'), false);
  assert.equal(recordSightingDay(ledger, 'sim-food-001', '2026-09-14', 'engagement'), false);
  assert.deepEqual(normalizeSightings(JSON.parse(JSON.stringify(ledger))).countedThrough, { oldUID00000001: '2026-09-14', newUID00000002: '2026-09-14' });
  assert.deepEqual(normalizeSightings({ countedThrough: { 'bad uid': '2026-09-14', ok: 'nonsense', fine: '2026-09-01' } }).countedThrough, { fine: '2026-09-01' });
  ledger.countedThrough.stale = '2026-01-01';
  assert.equal(pruneSightings(ledger, NOW), true);
  assert.equal('stale' in ledger.countedThrough, false);
});

test('peak split: the digest\'s lifetime gains by class over the metres grown at peak; contamination share as the fallback; unavailable is null', () => {
  const digestPost = { postId: 'p', realGain: 3_000, ownerGain: 1_000, reviewGain: 0, syntheticGain: 12_000, unknownGain: 0 };
  assert.deepEqual(splitPeakByClass({ startMeters: 5_000, peakMeters: 21_000, digestPost }), { grownMeters: 16_000, humanGrownMeters: 4_000, syntheticGrownMeters: 12_000, unknownGrownMeters: 0, syntheticShare: 0.75, basis: 'digest-posts' });
  const withUnknown = splitPeakByClass({ startMeters: 5_000, peakMeters: 15_000, digestPost: { realGain: 500, syntheticGain: 500, unknownGain: 1_000 } });
  assert.deepEqual([withUnknown.humanGrownMeters, withUnknown.syntheticGrownMeters, withUnknown.unknownGrownMeters, withUnknown.syntheticShare], [2_500, 2_500, 5_000, 0.25]);
  assert.equal(withUnknown.humanGrownMeters + withUnknown.syntheticGrownMeters + withUnknown.unknownGrownMeters, withUnknown.grownMeters, 'the halves sum to the grown metres');
  assert.deepEqual(splitPeakByClass({ startMeters: 5_000, peakMeters: 25_000, contaminationRow: { postId: 'p', share: 0.9 } }), { grownMeters: 20_000, humanGrownMeters: 2_000, syntheticGrownMeters: 18_000, unknownGrownMeters: 0, syntheticShare: 0.9, basis: 'digest-contamination' });
  assert.deepEqual(splitPeakByClass({ startMeters: 5_000, peakMeters: 5_000, digestPost: { realGain: 0, syntheticGain: 0 } }), { grownMeters: 0, humanGrownMeters: 0, syntheticGrownMeters: 0, unknownGrownMeters: 0, syntheticShare: null, basis: 'digest-posts' });
  const unavailable = splitPeakByClass({ startMeters: 5_000, peakMeters: 30_000 });
  assert.deepEqual(unavailable, { grownMeters: 25_000, humanGrownMeters: null, syntheticGrownMeters: null, unknownGrownMeters: null, syntheticShare: null, basis: 'unavailable' });
  assert.equal(splitPeakByClass({ startMeters: 9_000, peakMeters: 5_000, digestPost }).grownMeters, 0, 'a peak below start grows nothing');
  assert.equal(splitPeakByClass({ startMeters: 5_000, peakMeters: 25_000, digestPost: { realGain: -5, syntheticGain: 'x' } }).basis, 'unavailable', 'negative or unreadable gains carry no share');
});

test('geometry: haversine metres and the digest\'s anchor rule', () => {
  assert.ok(Math.abs(haversineMeters(TORONTO, NEAR) - 12_000) < 200);
  assert.ok(Math.abs(haversineMeters(TORONTO, MONTREAL) - 504_000) < 5_000);
  assert.deepEqual(anchorForAccount({ profile: { nearbyAnchor: { latitude: 1, longitude: 2 } }, posts: [post('p', 'u', NOW)] }), { latitude: 1, longitude: 2, basis: 'nearbyAnchor' });
  assert.deepEqual(anchorForAccount({ profile: {}, posts: [post('p1', 'u', NOW, null), post('p2', 'u', NOW - DAY, NEAR)] }), { ...NEAR, basis: 'newest-pop' });
  assert.deepEqual(anchorForAccount({ profile: {}, posts: [post('p1', 'u', NOW, null)], protectedLocations: { p1: MONTREAL } }), { ...MONTREAL, basis: 'protected-copy' });
  assert.equal(anchorForAccount({ profile: {}, posts: [post('p1', 'u', NOW, TORONTO, { status: 'deleted' })] }), null);
  assert.equal(anchorForAccount({ profile: {}, posts: [] }), null);
  assert.deepEqual(hiddenPostIdsForAnchor([post('a', 'u', NOW, null), post('b', 'u', NOW, null), post('c', 'u', NOW, null), post('d', 'u', NOW, null)]), ['a', 'b', 'c']);
  assert.deepEqual(hiddenPostIdsForAnchor([post('a', 'u', NOW, null), post('b', 'u', NOW, TORONTO)]), []);
  assert.deepEqual(humanUidChunks(Array.from({ length: 61 }, (_, i) => `u${i}`)).map(chunk => chunk.length), [30, 30, 1]);
});

test('sightings ledger: records by uid and Toronto day, dedupes, skips the simulation, prunes, survives a malformed file', () => {
  const ledger = emptySightings();
  assert.equal(recordSighting(ledger, 'human1', NOW, 'lease'), true);
  assert.equal(recordSighting(ledger, 'human1', NOW + HOUR, 'lease'), false);
  assert.equal(recordSighting(ledger, 'human1', NOW, 'heartbeat'), true);
  assert.equal(recordSighting(ledger, 'sim-food-001', NOW, 'lease'), false);
  assert.equal(recordSighting(ledger, 'synthetic-conquer-1', NOW, 'signin'), false);
  assert.equal(recordSighting(ledger, 'human2', NOW, 'lease', { synthetic: true }), false);
  assert.equal(recordSighting(ledger, 'human2', 0, 'lease'), false);
  assert.equal(recordSighting(ledger, 'human2', NOW, 'bogus'), false);
  assert.deepEqual(ledger.sightings, { human1: { [TODAY]: ['lease', 'heartbeat'] } });
  recordSighting(ledger, 'human1', NOW - 200 * DAY, 'signin');
  assert.equal(pruneSightings(ledger, NOW), true);
  assert.deepEqual(Object.keys(ledger.sightings.human1), [TODAY]);
  assert.equal(pruneSightings(ledger, NOW), false);
  assert.deepEqual(normalizeSightings(null), emptySightings());
  assert.deepEqual(normalizeSightings({ sightings: { 'bad uid!': { [TODAY]: ['lease'] }, ok: { 'not-a-day': ['lease'], [TODAY]: ['lease', 'nope', 'lease'] } } }).sightings, { ok: { [TODAY]: ['lease'] } });
});

/** Three students and the owner: a fixture every fold assertion below shares. */
function fixture() {
  const alice = 'aliceUID000001';
  const bob = 'bobUID00000002';
  const cara = 'caraUID0000003';
  const aliceSignup = NOW - 8 * DAY - 2 * HOUR;          // 7 Sep, 12:00 Toronto
  const bobSignup = NOW - 2 * DAY + HOUR;                // 13 Sep, 15:00 Toronto
  const caraSignup = NOW - HOUR;                         // today, 13:00 Toronto
  const sightings = emptySightings();
  recordSighting(sightings, alice, aliceSignup + DAY, 'lease');       // D1
  recordSighting(sightings, alice, aliceSignup + 7 * DAY, 'heartbeat'); // D7 (14 Sep)
  recordSighting(sightings, bob, NOW, 'lease');                       // today: bob's D2
  recordSighting(sightings, cara, caraSignup, 'signin');              // day 0 only: D1 is tomorrow
  recordSightingDay(sightings, bob, '2026-09-15', 'engagement');      // a counted day: a like or view anywhere, simulation pops included
  recordSighting(sightings, 'sim-food-001', NOW, 'lease');            // never enters
  return {
    now: NOW,
    accounts: [
      account(alice, aliceSignup, { displayName: 'Alice' }),
      account(bob, bobSignup),
      account(cara, caraSignup),
      account(OWNER, NOW - 300 * DAY, { email: 'mark@apptist.ca' }),
      account(REVIEW, NOW - 7 * DAY, { email: 'appreview@poplur.com' }),
      account('sim-food-001', NOW - 20 * DAY, { email: 'sim-food-001@poplur.test' }),
    ],
    profiles: [
      { uid: alice, profile: { username: 'alice' } },
      { uid: bob, profile: { username: 'bob' } },
      { uid: cara, profile: { username: 'cara' } },
      { uid: OWNER, profile: { username: 'mark' } },
      { uid: 'synthetic-conquer-blue', profile: { syntheticBeta: true } },
      { uid: 'ghostUID0000003', profile: { username: 'ghost' } },   // users/ only, no Auth: still known, real
    ],
    postsByUid: {
      // Alice: a pop 3 h after sign-up (within 24 h), plus an official post that must not count.
      [alice]: [post('post-alice-2', alice, aliceSignup + 2 * DAY, TORONTO, { radiusMeters: 20_000 }), post('post-alice-1', alice, aliceSignup + 3 * HOUR, TORONTO, { radiusMeters: 9_000 }), post('post-official', alice, aliceSignup + HOUR, TORONTO, { officialContent: true })],
      // Bob: a hidden pop 30 h after sign-up (misses the window; lands on his D1), located by its protected copy.
      [bob]: [post('post-bob-1', bob, bobSignup + 30 * HOUR, null, { radiusMeters: 3_000, locationVisibility: 'hidden' })],
      [OWNER]: [post('post-owner-1', OWNER, NOW - 2 * DAY, NEAR, { radiusMeters: 600_000 })],
    },
    popDetails: {
      'post-alice-1': { startMeters: 5_000, startAtMs: aliceSignup + 3 * HOUR, peakMeters: 15_000, peakAtMs: aliceSignup + 2 * DAY, engagements: [
        { actorUid: bob, kind: 'like', createdAtMs: bobSignup + 2 * HOUR },
        { actorUid: bob, kind: 'like', createdAtMs: bobSignup + 2 * HOUR + 1 },   // the double-tap's duplicate
        { actorUid: OWNER, kind: 'like', createdAtMs: NOW - HOUR },
        { actorUid: 'sim-food-001', kind: 'like', createdAtMs: NOW - HOUR },
        { actorUid: alice, kind: 'view', createdAtMs: aliceSignup + 3 * HOUR },
      ], exact: null },
      'post-alice-2': { startMeters: 5_000, startAtMs: aliceSignup + 2 * DAY, peakMeters: 20_000, peakAtMs: aliceSignup + 3 * DAY, engagements: [], exact: null },
      'post-bob-1': { startMeters: 5_000, startAtMs: bobSignup + 30 * HOUR, peakMeters: null, peakAtMs: null, engagements: [], exact: MONTREAL },
      'post-owner-1': { startMeters: 5_000, startAtMs: NOW - 2 * DAY, peakMeters: 600_000, peakAtMs: NOW - DAY, engagements: [{ actorUid: alice, kind: 'like', createdAtMs: NOW - DAY }], exact: null },
    },
    protectedLocations: { [bob]: { 'post-bob-1': MONTREAL } },
    sightings,
    digest: {
      posts: [
        { postId: 'post-alice-1', realGain: 1_000, ownerGain: 1_000, reviewGain: 0, syntheticGain: 8_000, unknownGain: 0 },
        { postId: 'post-owner-1', realGain: 0, ownerGain: 0, reviewGain: 0, syntheticGain: 595_000, unknownGain: 0 },
      ],
      contamination: { d7: { posts: [{ postId: 'post-alice-2', syntheticMeters: 12_000, ownerMeters: 0, share: 0.5 }] } },
    },
    coverage: { reads: 321, capped: false },
    alice, bob, cara, aliceSignup, bobSignup, caraSignup,
  };
}

test('fold: accounts are classed once, owner flagged, review/synthetic/unknown excluded and counted', () => {
  const result = foldBetaMetrics(fixture());
  assert.equal(result.version, 1);
  assert.equal(result.today, TODAY);
  assert.deepEqual(result.accounts, { human: 5, owner: 1, students: 4, excluded: { synthetic: 2, review: 1, unknown: 0 } });
  assert.deepEqual(result.users.map(user => [user.label, user.owner]).sort(), [['alice', false], ['bob', false], ['cara', false], ['ghost', false], ['mark', true]]);
  assert.equal(result.coverage.reads, 321);
  assert.equal(result.definitions, BETA_DEFINITIONS);
});

test('fold: per-user rows — first pop within 24 h, likes as distinct actors, activity days from every signal, retention statuses', () => {
  const input = fixture();
  const result = foldBetaMetrics(input);
  const alice = result.users.find(user => user.label === 'alice');
  const bob = result.users.find(user => user.label === 'bob');
  const cara = result.users.find(user => user.label === 'cara');
  const ghost = result.users.find(user => user.label === 'ghost');
  const owner = result.users.find(user => user.owner);
  assert.equal(alice.pops, 2, 'the official post never counts');
  assert.equal(alice.firstPopWithin24h, true);
  assert.equal(Math.round(alice.firstPopHours), 3);
  assert.equal(alice.likesReceived, 2, 'bob once (not twice) and the owner; the simulation never');
  assert.equal(alice.likesGiven, 1, 'her like on the owner\'s pop');
  assert.deepEqual(alice.retention, { d1: 'retained', d7: 'retained', d14: 'pending' });
  assert.deepEqual(alice.activeDayList, [
    torontoDayKey(input.aliceSignup + 3 * HOUR),   // pop + view (day 0)
    torontoDayKey(input.aliceSignup + DAY),        // lease (D1)
    torontoDayKey(input.aliceSignup + 2 * DAY),    // pop
    torontoDayKey(input.aliceSignup + 7 * DAY),    // heartbeat (D7) and the like on the owner's pop, the same Toronto day
  ]);
  assert.equal(torontoDayKey(input.aliceSignup + 7 * DAY), torontoDayKey(NOW - DAY));
  assert.deepEqual(alice.activeKinds[torontoDayKey(input.aliceSignup + 3 * HOUR)], ['engagement', 'pop', 'refresh', 'signin'], 'the Auth stamps (sign-up = last sign-in in the fixture) are sightings too');
  assert.deepEqual(alice.activeKinds[torontoDayKey(NOW - DAY)], ['engagement', 'heartbeat']);
  assert.equal(bob.firstPopWithin24h, false);
  assert.equal(bob.likesGiven, 1);
  assert.deepEqual(bob.activeKinds['2026-09-15'], ['engagement', 'lease'], 'the counted engagement day and the lease');
  assert.deepEqual(bob.retention, { d1: 'retained', d7: 'pending', d14: 'pending' }, 'his pop landed on D1; D7 is next week');
  assert.equal(bob.anchorBasis, 'protected-copy');
  assert.deepEqual(cara.retention, { d1: 'pending', d7: 'pending', d14: 'pending' }, 'signed up today: D1 has not begun');
  assert.equal(cara.activeDays, 1, 'the sign-in on day 0');
  assert.equal(cara.anchorBasis, null, 'no pop, no anchor');
  assert.equal(ghost.pops, 0);
  assert.equal(ghost.firstPopWithin24h, null);
  assert.equal(ghost.signedUpDay, '', 'no Auth row: no sign-up day');
  assert.deepEqual(ghost.retention, { d1: 'pending', d7: 'pending', d14: 'pending' });
  assert.equal(ghost.anchorBasis, null);
  assert.equal(owner.pops, 1);
  assert.equal(owner.likesReceived, 1);
});

test('fold: per-pop rows — start, current, peak, likes split real/owner, reach by anchor distance', () => {
  const input = fixture();
  const result = foldBetaMetrics(input);
  const pop = id => result.pops.find(row => row.postId === id);
  assert.deepEqual(result.pops.map(row => row.postId), ['post-bob-1', 'post-owner-1', 'post-alice-2', 'post-alice-1'], 'newest first, never the official post');
  const a1 = pop('post-alice-1');
  assert.equal(a1.startMeters, 5_000);
  assert.equal(a1.currentMeters, 9_000);
  assert.equal(a1.peakMeters, 15_000);
  assert.equal(a1.peakAtMs, input.aliceSignup + 2 * DAY);
  assert.deepEqual([a1.likesReal, a1.likesOwner], [1, 1]);
  // Alice's 15 km peak from Toronto reaches the owner (12 km east) but not bob (Montréal).
  assert.deepEqual(a1.humansInReachAtPeak, { real: 0, owner: 1 });
  assert.deepEqual(a1.humansInReachNow, { real: 0, owner: 0 }, '9 km now: the owner is 12 km away');
  assert.equal(a1.hasCoordinates, true);
  // 10 km grown at peak, 80 % of the lifetime gain synthetic: 2 km human, 8 km simulation.
  assert.deepEqual([a1.grownMeters, a1.humanGrownMeters, a1.syntheticGrownMeters, a1.unknownGrownMeters, a1.syntheticShare, a1.splitBasis], [10_000, 2_000, 8_000, 0, 0.8, 'digest-posts']);
  const a2 = pop('post-alice-2');
  assert.deepEqual([a2.grownMeters, a2.humanGrownMeters, a2.syntheticGrownMeters, a2.syntheticShare, a2.splitBasis], [15_000, 7_500, 7_500, 0.5, 'digest-contamination'], 'off the watchlist: the contamination row\'s share');
  const b1 = pop('post-bob-1');
  assert.equal(b1.hasCoordinates, true, 'located by the protected copy');
  assert.deepEqual([b1.humanGrownMeters, b1.syntheticGrownMeters, b1.splitBasis], [null, null, 'unavailable'], 'on neither digest list: unavailable, never zero');
  assert.equal(b1.peakMeters, 5_000, 'no ledger peak: the larger of start and current');
  assert.equal(b1.peakAtMs, b1.createdAtMs);
  assert.deepEqual(b1.humansInReachAtPeak, { real: 0, owner: 0 });
  const o1 = pop('post-owner-1');
  assert.equal(o1.owner, true);
  // 600 km from just east of Toronto reaches alice (Toronto) and bob (Montréal) — never itself.
  assert.deepEqual(o1.humansInReachAtPeak, { real: 2, owner: 0 });
  assert.deepEqual([o1.likesReal, o1.likesOwner], [1, 0]);
});

test('fold: the two views — students exclude the owner everywhere; per-day and headline arithmetic', () => {
  const input = fixture();
  const result = foldBetaMetrics(input);
  const { students, everyone } = result.views;
  assert.equal(students.headline.humanAccounts, 4);
  assert.equal(everyone.headline.humanAccounts, 5);
  assert.equal(students.headline.signups7d, 2, 'bob and cara');
  assert.equal(students.headline.signupsToday, 1, 'cara');
  assert.deepEqual(students.headline.firstPop24h, { n: 1, of: 4, withPop: 2 });
  assert.deepEqual(students.headline.retention, { d1: { n: 2, of: 2 }, d7: { n: 1, of: 1 }, d14: { n: 0, of: 0 } }, 'cara and ghost are pending, never due');
  assert.deepEqual(everyone.headline.retention.d1, { n: 2, of: 3 }, 'the owner\'s D1 was ten months ago and quiet');
  assert.deepEqual(students.headline.likesPerPop, { likes: 1, pops: 3 }, 'bob\'s like on alice-1; the owner\'s like leaves with the owner');
  assert.deepEqual(everyone.headline.likesPerPop, { likes: 3, pops: 4 });
  assert.equal(students.headline.activeToday, 2, 'bob\'s lease and cara\'s sign-in');
  assert.equal(students.headline.popsPerActiveUserToday, 0);
  assert.equal(students.headline.largestReach.postId, 'post-alice-2', 'nobody in reach without the owner: the tie breaks on human-grown metres (7.5 km beats alice-1\'s 2 km and bob\'s unsplit 5 km peak)');
  assert.equal(students.headline.largestReach.humansInReach, 0);
  assert.deepEqual([students.headline.largestReach.startMeters, students.headline.largestReach.humanGrownMeters, students.headline.largestReach.syntheticGrownMeters, students.headline.largestReach.syntheticShare, students.headline.largestReach.splitBasis], [5_000, 7_500, 7_500, 0.5, 'digest-contamination']);
  assert.equal(everyone.headline.largestReach.postId, 'post-owner-1');
  assert.equal(everyone.headline.largestReach.humansInReach, 2);
  assert.deepEqual([everyone.headline.largestReach.humanGrownMeters, everyone.headline.largestReach.syntheticShare], [0, 1], 'the owner\'s 600 km was grown entirely by the simulation');
  assert.equal(students.daily.length, 30);
  const aliceDay = students.daily.find(row => row.day === torontoDayKey(input.aliceSignup));
  assert.equal(aliceDay.signups, 1);
  assert.deepEqual(aliceDay.firstPop24h, { n: 1, of: 1 });
  assert.equal(aliceDay.pops, 1);
  assert.equal(aliceDay.activeUsers, 1);
  assert.equal(aliceDay.popsPerActiveUser, 1);
  assert.deepEqual(aliceDay.retention.d1, { retained: 1, due: 1, cohort: 1 });
  assert.deepEqual(aliceDay.retention.d14, { retained: 0, due: 0, cohort: 1 });
  const todayRow = students.daily[29];
  assert.equal(todayRow.day, TODAY);
  assert.equal(todayRow.cumulativeAccounts, 3, 'ghost has no sign-up day and is never cumulative');
  assert.equal(todayRow.cumulativePops, 3);
  assert.equal(todayRow.likesPerPop, 1 / 3);
  assert.equal(todayRow.signups, 1);
  assert.deepEqual(todayRow.retention.d1, { retained: 0, due: 0, cohort: 1 }, 'cara: pending is not due');
  const bobDay = students.daily.find(row => row.day === torontoDayKey(input.bobSignup));
  assert.deepEqual(bobDay.retention.d1, { retained: 1, due: 1, cohort: 1 });
  assert.deepEqual(bobDay.retention.d7, { retained: 0, due: 0, cohort: 1 });
  assert.deepEqual(bobDay.firstPop24h, { n: 0, of: 1 });
  for (const row of students.daily) assert.equal(row.popsPerActiveUser === null, row.activeUsers === 0);
});

test('fold: empty and malformed input yields zeros, never a throw', () => {
  const empty = foldBetaMetrics({ now: NOW });
  assert.deepEqual(empty.accounts, { human: 0, owner: 0, students: 0, excluded: { synthetic: 0, review: 0, unknown: 0 } });
  assert.deepEqual(empty.users, []);
  assert.deepEqual(empty.pops, []);
  assert.equal(empty.views.students.daily.length, 30);
  assert.equal(empty.views.students.headline.largestReach, null);
  assert.equal(empty.views.students.headline.popsPerActiveUserToday, null);
  assert.deepEqual(empty.views.everyone.headline.retention, { d1: { n: 0, of: 0 }, d7: { n: 0, of: 0 }, d14: { n: 0, of: 0 } });
  assert.deepEqual(empty.coverage, { reads: 0, cad: 0, capped: false, cappedAt: null, sightingsSince: null, engagementIndex: false, engagementDaysCounted: 0, digestAtMs: 0 });
  assert.doesNotThrow(() => foldBetaMetrics({ now: NOW, digest: { posts: 'x', contamination: null } }));
  assert.doesNotThrow(() => foldBetaMetrics(null));
  assert.doesNotThrow(() => foldBetaMetrics({ now: NOW, accounts: 'x', profiles: 4, postsByUid: [], popDetails: null, sightings: 'no', coverage: 'no' }));
  const odd = foldBetaMetrics({ now: NOW, accounts: [{ uid: 'okUID0001' }, { uid: 'bad uid' }, null], postsByUid: { okUID0001: [{ id: 'post-x', data: { userID: 'okUID0001', radiusMeters: 'abc', createdAtMillis: -5 } }, { id: '', data: {} }, null] } });
  assert.equal(odd.users.length, 1);
  assert.equal(odd.pops.length, 1);
  assert.equal(odd.pops[0].createdAtMs, 0);
  assert.equal(odd.pops[0].day, '');
  assert.equal(odd.pops[0].currentMeters, 0);
});

test('CSVs: fixed columns, yes/no flags, ISO stamps, retention statuses, and a Toronto-stamped filename', () => {
  const result = foldBetaMetrics(fixture());
  const users = betaUsersCsv(result.users);
  const [userHead, ...userRows] = users.trim().split('\r\n');
  assert.equal(userHead, BETA_USERS_CSV_COLUMNS.join(','));
  assert.equal(userRows.length, 5);
  const alice = userRows.find(row => row.includes(',alice,'));
  assert.match(alice, /,no,\d{4}-\d{2}-\d{2}T[^,]+Z,\d{4}-\d{2}-\d{2},/);
  assert.match(alice, /,yes,1,2,4,/, 'firstPopWithin24h yes · likesGiven 1 · likesReceived 2 · activeDays 4');
  assert.match(alice, /,retained,retained,pending,newest-pop$/);
  const pops = betaPopsCsv(result.pops);
  const [popHead, ...popRows] = pops.trim().split('\r\n');
  assert.equal(popHead, BETA_POPS_CSV_COLUMNS.join(','));
  assert.equal(popRows.length, 4);
  assert.match(popRows.find(row => row.startsWith('post-alice-1,')), /,5000,9000,15000,[^,]+Z,2000,8000,1,1,0,0,1,0,0,yes$/, 'peak then humanGrownMeters, syntheticGrownMeters');
  assert.match(popRows.find(row => row.startsWith('post-bob-1,')), /,5000,3000,5000,[^,]+Z,,,0,0,0,/, 'an unavailable split is two blank cells, never zeros');
  assert.equal(betaUsersCsv(null).trim(), BETA_USERS_CSV_COLUMNS.join(','));
  assert.equal(betaPopsCsv(undefined).trim(), BETA_POPS_CSV_COLUMNS.join(','));
  assert.equal(betaCsvFilename('users', NOW), 'poplur-beta-users-20260915.csv');
  assert.deepEqual(BETA_RETENTION_DAYS, [1, 7, 14]);
});

test('proxy source: GET /api/beta behind the origin lock, reads only, charged and capped, cached; sightings recorded by the watchers, kept outside the repo', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('./test-control-proxy.mjs', import.meta.url), 'utf8');
  const code = source.replace(/^\s*\/\/.*$/gm, '');
  assert.match(code, /const allowedActions = new Set\(\['dashboard', 'runner', 'postHistory', 'testerPosts'\]\);/, 'no new callable action: nothing to deploy');
  const originLock = code.indexOf("if (origin !== controlRoomOrigin) {");
  const betaRoute = code.indexOf("requestURL.pathname === '/api/beta'");
  const notFound = code.indexOf('Local beta desk route not found.');
  assert.ok(originLock > 0 && betaRoute > originLock && notFound > betaRoute, 'the route sits behind the origin lock and before the 404 gate');
  assert.match(code, /requestURL\.searchParams\.get\('refresh'\) === '1'/, 'refresh is the one query flag');
  const beta = code.slice(code.indexOf('function loadBetaSightings'), code.indexOf('const server = createServer'));
  assert.doesNotMatch(beta, /\.(set|update|delete|create|add)\(/, 'the Beta gather writes nothing to Firestore');
  assert.doesNotMatch(beta, /runTransaction|batch\(/);
  assert.doesNotMatch(beta, /startLiveWatchers\(/, 'a GET never attaches the ten watchers');
  assert.doesNotMatch(beta, /callCloudControl\(/, 'never the cloud callable: computed locally');
  assert.match(beta, /onboardingQuarantine/, 'refuses under quarantine');
  assert.match(beta, /ledgerReadBudget\.remaining\(now\)/, 'the same 25k/day budget');
  assert.match(beta, /ledgerReadBudget\.charge\(coverage\.reads, now\)/, 'every run is charged, even a failed one');
  assert.match(beta, /Math\.min\(BETA_READ_CAP, ledgerReadBudget\.remaining\(now\)\)/, 'capped per run and by what is left');
  assert.match(beta, /remaining < BETA_READ_RESERVE/, 'refuses before starting when too little is left');
  assert.match(beta, /sendJSON\(response, 429, origin, \{\s*error: \{ message: 'That Beta run would exceed today\\'s ledger read budget\.' \},\s*remaining,\s*estimate:/, 'the ledger export\'s 429 shape');
  assert.match(beta, /now - betaCache\.atMs < BETA_CACHE_MS/, 'the run cache');
  assert.match(beta, /'x-poplur-ledger-reads'|sendReportJSON\(response, 200, origin, \{ result: \{ \.\.\.betaCache\.result, cached: true/, 'a cache hit answers with 0 reads');
  assert.match(beta, /where\('kind', '==', 'like'\)\.where\('actorUid', 'in', chunk\)/, 'likes per pop: human like documents only, by `in` chunks');
  assert.match(beta, /collectionGroup\('engagements'\)\s*\.where\('actorUid', '==', uid\)\s*\.where\('createdAt', '>=', Timestamp\.fromMillis\(startMs\)\)\s*\.where\('createdAt', '<', Timestamp\.fromMillis\(endMs\)\)\s*\.orderBy\('createdAt', 'desc'\)\s*\.count\(\)\.get\(\)/, 'activity: one aggregation per human per day on the collection group, ordered like its index');
  assert.match(beta, /engagementDaysToCount\(\{ humans, ledger: betaSightings, now \}\)/, 'only uncounted days are counted');
  assert.match(beta, /markCountedThrough\(betaSightings, uid, yesterday, now\)/, 'a finished day is marked final');
  assert.match(beta, /if \(error\?\.code === 9\) \{ indexRefused = true; return; \}/, 'a missing index is reported on the frame, never thrown at the page');
  assert.match(beta, /let digest = liveState\.algorithm\(\);/, 'the digest comes from the watcher first');
  assert.match(beta, /doc\('algorithmDigest'\)\.get\(\)/, 'one read for it when the watcher has not spoken');
  assert.match(beta, /orderBy\('atMillis', 'asc'\)\.limit\(1\)/, 'the ledger\'s first entry: 1 read');
  assert.match(beta, /orderBy\('radiusMeters', 'desc'\)\.limit\(1\)/, 'the ledger\'s largest entry: 1 read');
  assert.match(beta, /where\('userID', '==', uid\)\s*\.orderBy\('createdAt', 'desc'\)\.limit\(BETA_POSTS_PER_USER\)/, 'the tester table\'s own posts query');
  // Sightings: the presence and heartbeat watchers record, the file lives beside the proxy log, never in the repo.
  assert.match(code, /recordSighting\(betaSightings, lease\.uid, lease\.activeUntilMs - PRESENCE_LEASE_MS, 'lease', \{ synthetic: lease\.synthetic \}\)/, 'a lease is a sighting at its renewal');
  assert.match(code, /recordSighting\(betaSightings, document\.id, atMs, 'heartbeat'\)/, 'a heartbeat is a sighting');
  assert.match(code, /collection\('testActivity'\)\.limit\(100\)\.onSnapshot\(activityChanged, failed\)/, 'the heartbeat watcher folds sightings before the dashboard refresh');
  assert.match(code, /join\(process\.env\.HOME \|\| homedir\(\), '\.poplur', 'beta-sightings\.json'\)/, 'the ledger lives under ~/.poplur');
  assert.match(code, /await rename\(temporary, betaSightingsPath\)/, 'written atomically');
});
