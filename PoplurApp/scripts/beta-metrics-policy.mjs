import {
  DESK_TIME_ZONE,
  actorClass,
  csvDocument,
  postClass,
  readsToCad,
  torontoDayKey,
} from './algorithm-digest-policy.mjs';

/**
 * Pure policy for the Beta tab's proxy side: the human/simulation split
 * (reused, never re-invented — `actorClass` and `postClass` are the digest's
 * own rules, kept in step with fn/syntheticIdentity.ts), the sightings ledger
 * the proxy keeps on disk, and the folds that turn Auth rows, profiles, pops,
 * engagements and sightings into the per-user, per-pop and per-day tables.
 * No Firestore, no network, no clock of its own: every reader passes `now`.
 *
 * Two views ride every result: `students` (owner accounts excluded — the
 * student TestFlight numbers) and `everyone` (owner included). The owner's
 * accounts are human and stay in the tables, flagged `owner`, so the page's
 * toggle only chooses which view and which rows to show.
 */

export const BETA_VERSION = 1;
/** Per-day rows: the last N Toronto days; cumulative figures run since the first human sign-up. */
export const BETA_DAYS = 30;
export const BETA_RETENTION_DAYS = Object.freeze([1, 7, 14]);
/** A computed result is served from memory this long; `?refresh=1` bypasses it. */
export const BETA_CACHE_MS = 10 * 60_000;
/** The most reads one run may spend; past it the run stops and says so (`coverage.capped`). */
export const BETA_READ_CAP = 5_000;
/** The run refuses (429) rather than start when fewer reads than this are left in the ledger day. */
export const BETA_READ_RESERVE = 1_000;
export const BETA_POSTS_PER_USER = 200;
/** Human like documents read per pop (likes per pop is human-on-human; the cap is per `in` chunk). */
export const BETA_LIKES_PER_POP = 500;
/** Engagement days are counted (one aggregation read per human per day) this far back at most. */
export const BETA_ENGAGEMENT_WINDOW_DAYS = BETA_DAYS;
/** Firestore's `in` operator takes at most 30 values. */
export const BETA_IN_CHUNK = 30;
/** A hidden pop's protected location copy is read for the newest few only. */
export const BETA_ANCHOR_HIDDEN_POSTS = 3;
/** Sightings older than this leave the ledger. */
export const BETA_SIGHTINGS_KEEP_DAYS = 120;
/** What the ledger records per uid and day: the desk's sightings, and the
 *  engagement days the collection-group count found (so a day never has to
 *  be counted twice, and days older than the count window survive). */
export const BETA_SIGHTING_KINDS = Object.freeze(['lease', 'heartbeat', 'signin', 'refresh', 'engagement']);
export const BETA_ACTIVITY_KINDS = Object.freeze(['pop', ...BETA_SIGHTING_KINDS]);
export const BETA_SPLIT_BASES = Object.freeze(['digest-posts', 'digest-contamination', 'unavailable']);
export const FIRST_POP_WINDOW_MS = 24 * 3_600_000;
const DAY_MS = 24 * 3_600_000;

export const BETA_USERS_CSV_COLUMNS = Object.freeze([
  'uid', 'label', 'owner', 'signedUpAtIso', 'signedUpDay', 'lastSignInAtIso', 'pops', 'firstPopAtIso', 'firstPopHours',
  'firstPopWithin24h', 'likesGiven', 'likesReceived', 'activeDays', 'activeDayList', 'lastActiveDay', 'd1', 'd7', 'd14',
  'anchorBasis',
]);
export const BETA_POPS_CSV_COLUMNS = Object.freeze([
  'postId', 'ownerUid', 'ownerLabel', 'owner', 'channelId', 'mediaType', 'createdAtIso', 'day', 'deleted', 'startMeters',
  'currentMeters', 'peakMeters', 'peakAtIso', 'humanGrownMeters', 'syntheticGrownMeters', 'likesReal', 'likesOwner', 'views',
  'humansInReachAtPeakReal', 'humansInReachAtPeakOwner', 'humansInReachNowReal', 'humansInReachNowOwner', 'hasCoordinates',
]);

/** The definitions the page prints under the tables — one source, so the UI and the tests agree. */
export const BETA_DEFINITIONS = Object.freeze({
  human: 'A human account is one the desk classes real or owner (algorithm-digest-policy actorClass, the same rule as fn/syntheticIdentity.ts): not a sim-/synthetic- uid, no synthetic flag on users/{uid}, no poplur.test mailbox. The App Review demo account (review) and accounts known to neither Auth nor users/ (unknown) are excluded. Owner accounts are human, flagged, and left out of the student view.',
  signup: 'Sign-up day is the Auth account\'s creation time, in the Toronto day.',
  firstPop: 'First pop within 24 h: the account\'s first real-class pop (official, lab and synthetic-flagged posts never count) was created within 24 hours of the Auth creation time.',
  activity: 'Active on a day when any of these lands on that Toronto day: a pop created; an engagement (view, like, comment, dislike) by the account on ANY pop — human, simulation or official — counted per day through the engagements collection group (one aggregation read per account per day, days once counted are kept); a foreground presence lease seen by the desk (appPresenceSessions); a tester heartbeat (testActivity/{uid}.lastActivityAt); a sign-in or ID-token refresh recorded on the Auth account. Leases, heartbeats, sign-ins and refreshes are sightings the desk records as it sees them; engagement days are counted from the account\'s sign-up day, at most 30 days back on the first run.',
  retention: 'Retained on day N: the account was active (as above) on the Toronto day N days after its sign-up day. A cohort day is due once that day has passed; a day still in progress is pending, not lost.',
  popsPerActive: 'Pops per active human per day: human pops created that day ÷ human accounts active that day (blank when nobody was active).',
  likesPerPop: 'Likes per pop: distinct human accounts that liked a human pop, summed over all human pops, ÷ human pops (cumulative to that day). Simulation likes never count here, whatever they did to the radius.',
  contamination: 'Human-grown vs synthetic-grown: the radius ledger records no actor per entry (only an engagement id), so the split comes from the algorithm digest, which joins every entry to its engagement and folds each pop\'s lifetime organic gain by actor class (realGain, ownerGain, reviewGain, syntheticGain, unknownGain). The metres grown at peak (peak − start) are shared out in those proportions: human = real + owner + review, synthetic = the simulation, unknown = the rest. A pop off the digest\'s 50-post watchlist takes the share from its contamination list (20 posts, 7-day window); a pop on neither reads as unavailable, never as zero. Seed metres belong to nobody and sit in neither half.',
  reach: 'Reach: start = the pop\'s first radius ledger entry (its create point), current = the post\'s radius now, peak = the largest radius any ledger entry recorded. Humans in reach = other human accounts whose anchor lies within that radius by great-circle distance (the nearby-pops digest\'s rule: users/{uid}.nearbyAnchor when set, else the newest pop with coordinates, else the protected location copy of a hidden pop). Accounts store no location, so an account with no pop has no anchor and cannot be counted.',
});

const record = value => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const text = (value, maximum = 120) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maximum) : '');
const finite = value => {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const millis = value => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  const stamp = value && typeof value.toMillis === 'function' ? Number(value.toMillis()) : NaN;
  return Number.isFinite(stamp) && stamp > 0 ? stamp : 0;
};
const iso = ms => (ms > 0 ? new Date(ms).toISOString() : '');
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const UID = /^[A-Za-z0-9_.:-]{1,128}$/;

// ---------------------------------------------------------------------------
// Classes

/** The desk's five-valued class, reduced to the Beta tab's question: human? owner? */
export function betaAccountClass(uid, profile, email, known = true) {
  const cls = actorClass(uid, profile, email, known);
  return { cls, human: cls === 'real' || cls === 'owner', owner: cls === 'owner' };
}

/** A pop counts only when it is the desk's `real` class: official, lab and synthetic-flagged posts never do. */
export const isHumanPop = (postId, post) => postClass(postId, post, false) === 'real';

// ---------------------------------------------------------------------------
// Days

/** "YYYY-MM-DD" + N calendar days: keys are calendar labels, so UTC arithmetic on the label is exact. */
export function dayKeyOffset(dayKey, days) {
  if (!DAY_KEY.test(String(dayKey))) return '';
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** The last `count` Toronto days ending on the day that holds `now`, oldest first (half-day steps: DST-safe). */
export function torontoDayKeys(nowMs, count = BETA_DAYS) {
  const keys = [];
  for (let step = 0; keys.length < count && step < count * 4; step += 1) {
    const key = torontoDayKey(nowMs - step * (DAY_MS / 2));
    if (!keys.includes(key)) keys.push(key);
  }
  return keys.reverse();
}

/** The wall clock `timeZone` shows at `ms`, re-read as if it were UTC (fn/testActivity.ts wallClockAsUtcMs). */
function wallClockAsUtcMs(ms, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms));
  const field = type => Number(parts.find(part => part.type === type)?.value);
  return Date.UTC(field('year'), field('month') - 1, field('day'), field('hour'), field('minute'), field('second'));
}

/** The instant local midnight of a day key falls on in Toronto (fn/testActivity.ts zonedMidnightMs). */
export function torontoMidnightMs(dayKey, timeZone = DESK_TIME_ZONE) {
  if (!DAY_KEY.test(String(dayKey))) return 0;
  const [year, month, day] = dayKey.split('-').map(Number);
  const wanted = Date.UTC(year, month - 1, day);
  let guess = wanted;
  for (let pass = 0; pass < 2; pass += 1) guess += wanted - wallClockAsUtcMs(guess, timeZone);
  return guess;
}

/** The half-open [startMs, endMs) a Toronto day spans — what a per-day count() asks Firestore for. */
export function torontoDayBounds(dayKey) {
  return { startMs: torontoMidnightMs(dayKey), endMs: torontoMidnightMs(dayKeyOffset(dayKey, 1)) };
}

/** Every day key from `from` to `to` inclusive (empty when reversed or malformed). */
export function dayKeyRange(from, to) {
  if (!DAY_KEY.test(String(from)) || !DAY_KEY.test(String(to)) || from > to) return [];
  const keys = [];
  for (let key = from; key <= to && keys.length < 400; key = dayKeyOffset(key, 1)) keys.push(key);
  return keys;
}

/**
 * The (uid, day) pairs one run must count on the engagements collection group:
 * from the later of the account's sign-up day and the window's first day, to
 * today, skipping days the ledger has already counted (`countedThrough`, a
 * day that has ended and whose count is final). Today is always counted.
 */
export function engagementDaysToCount({ humans = [], ledger, now, windowDays = BETA_ENGAGEMENT_WINDOW_DAYS }) {
  const today = torontoDayKey(now);
  const windowStart = dayKeyOffset(today, -Math.max(0, windowDays - 1));
  const counted = record(record(ledger).countedThrough);
  const plan = [];
  for (const human of humans) {
    if (!human || !UID.test(String(human.uid ?? ''))) continue;
    const signedUp = millis(human.signedUpAtMs) ? torontoDayKey(millis(human.signedUpAtMs)) : '';
    let from = signedUp && signedUp > windowStart ? signedUp : windowStart;
    const through = typeof counted[human.uid] === 'string' && DAY_KEY.test(counted[human.uid]) ? counted[human.uid] : '';
    if (through && dayKeyOffset(through, 1) > from) from = dayKeyOffset(through, 1);
    for (const day of dayKeyRange(from, today)) plan.push({ uid: human.uid, day });
  }
  return plan;
}

/** Mark a uid's counts final through `day` (never today, never backwards). */
export function markCountedThrough(ledger, uid, day, now) {
  if (!ledger || typeof ledger !== 'object' || !UID.test(String(uid ?? '')) || !DAY_KEY.test(String(day))) return false;
  if (day >= torontoDayKey(now)) return false;
  const counted = ledger.countedThrough ?? (ledger.countedThrough = {});
  if (typeof counted[uid] === 'string' && counted[uid] >= day) return false;
  counted[uid] = day;
  return true;
}

// ---------------------------------------------------------------------------
// Geometry (nearbyPopsPolicy.haversineMeters, the same haversine as the web's reach.ts)

const EARTH_RADIUS_METERS = 6_371_000;

export function coordinatePair(latitude, longitude) {
  const lat = finite(latitude);
  const lng = finite(longitude);
  if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { latitude: lat, longitude: lng };
}

export function haversineMeters(a, b) {
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Where an account "is" (nearbyPopsDigest.anchorFor): the declared
 * users/{uid}.nearbyAnchor, else the newest non-deleted post with public
 * coordinates, else the protected postLocations copy of a hidden post the
 * proxy read. `posts` are newest first, as the query returns them.
 */
export function anchorForAccount({ profile, posts = [], protectedLocations = {} }) {
  const declared = record(record(profile).nearbyAnchor);
  const override = coordinatePair(declared.latitude, declared.longitude);
  if (override) return { ...override, basis: 'nearbyAnchor' };
  for (const post of posts) {
    const data = record(post?.data);
    if (data.status === 'deleted') continue;
    const pair = coordinatePair(data.latitude, data.longitude);
    if (pair) return { ...pair, basis: 'newest-pop' };
  }
  for (const post of posts) {
    const copy = record(protectedLocations[post?.id]);
    const pair = coordinatePair(copy.latitude, copy.longitude);
    if (pair) return { ...pair, basis: 'protected-copy' };
  }
  return null;
}

/** The hidden posts whose protected copy is worth one read each: the newest few without public coordinates. */
export function hiddenPostIdsForAnchor(posts = [], limit = BETA_ANCHOR_HIDDEN_POSTS) {
  const ids = [];
  for (const post of posts) {
    const data = record(post?.data);
    if (data.status === 'deleted') continue;
    if (coordinatePair(data.latitude, data.longitude)) return [];
    if (typeof post?.id === 'string' && post.id) ids.push(post.id);
    if (ids.length >= limit) break;
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Sightings ledger — { version: 1, sightings: { [uid]: { [day]: [kind, …] } } }

export const emptySightings = () => ({ version: 1, sightings: {}, countedThrough: {} });

/** A ledger read from disk: anything malformed reads as empty; kinds and keys are bounded. */
export function normalizeSightings(raw) {
  const ledger = emptySightings();
  for (const [uid, day] of Object.entries(record(record(raw).countedThrough)).slice(0, 5_000)) {
    if (UID.test(uid) && DAY_KEY.test(String(day))) ledger.countedThrough[uid] = day;
  }
  const source = record(record(raw).sightings);
  for (const [uid, days] of Object.entries(source).slice(0, 5_000)) {
    if (!UID.test(uid)) continue;
    const out = {};
    for (const [day, kinds] of Object.entries(record(days)).slice(0, 400)) {
      if (!DAY_KEY.test(day) || !Array.isArray(kinds)) continue;
      const kept = [...new Set(kinds.filter(kind => BETA_SIGHTING_KINDS.includes(kind)))];
      if (kept.length) out[day] = kept;
    }
    if (Object.keys(out).length) ledger.sightings[uid] = out;
  }
  return ledger;
}

/** The uids no ledger should grow for: the simulation's own (their prefix says so) and a lease that says `synthetic`. */
export const skipSighting = (uid, synthetic = false) => synthetic === true || !UID.test(String(uid ?? '')) || /^(synthetic-|sim-)/.test(String(uid));

/** Record one sighting in place; true when the ledger changed. */
export function recordSighting(ledger, uid, atMs, kind, { synthetic = false } = {}) {
  if (!(atMs > 0)) return false;
  return recordSightingDay(ledger, uid, torontoDayKey(atMs), kind, { synthetic });
}

/** The same, for a day already known (an engagement count that came back > 0). */
export function recordSightingDay(ledger, uid, day, kind, { synthetic = false } = {}) {
  if (!ledger || typeof ledger !== 'object') return false;
  if (!BETA_SIGHTING_KINDS.includes(kind) || !DAY_KEY.test(String(day)) || skipSighting(uid, synthetic)) return false;
  const sightings = ledger.sightings ?? (ledger.sightings = {});
  const days = sightings[uid] ?? (sightings[uid] = {});
  const kinds = days[day] ?? (days[day] = []);
  if (kinds.includes(kind)) return false;
  kinds.push(kind);
  return true;
}

/** Drop days older than the keep window; true when anything left. */
export function pruneSightings(ledger, nowMs, keepDays = BETA_SIGHTINGS_KEEP_DAYS) {
  const floor = dayKeyOffset(torontoDayKey(nowMs), -keepDays);
  let changed = false;
  for (const [uid, days] of Object.entries(record(record(ledger).sightings))) {
    for (const day of Object.keys(record(days))) {
      if (day < floor) { delete days[day]; changed = true; }
    }
    if (!Object.keys(record(days)).length) { delete ledger.sightings[uid]; changed = true; }
  }
  for (const [uid, day] of Object.entries(record(record(ledger).countedThrough))) {
    if (typeof day !== 'string' || day < floor) { delete ledger.countedThrough[uid]; changed = true; }
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Contamination: human-grown vs synthetic-grown metres at peak

const share = (part, total) => (total > 0 ? Math.max(0, Math.min(1, part / total)) : null);

/**
 * The digest's per-post lifetime gains by actor class, or its contamination
 * row's share, spread over the metres grown at peak (peak − start). The
 * ledger records no actor per entry (only an engagement id); the digest did
 * the join. `null` metres mean unavailable — never zero.
 */
export function splitPeakByClass({ startMeters, peakMeters, digestPost = null, contaminationRow = null }) {
  const grown = Math.max(0, (finite(peakMeters) ?? 0) - (finite(startMeters) ?? 0));
  const post = record(digestPost);
  const gains = {
    human: Math.max(0, finite(post.realGain) ?? 0) + Math.max(0, finite(post.ownerGain) ?? 0) + Math.max(0, finite(post.reviewGain) ?? 0),
    synthetic: Math.max(0, finite(post.syntheticGain) ?? 0),
    unknown: Math.max(0, finite(post.unknownGain) ?? 0),
  };
  const total = gains.human + gains.synthetic + gains.unknown;
  if (digestPost && total > 0) {
    const synthetic = Math.round(grown * gains.synthetic / total);
    const unknown = Math.round(grown * gains.unknown / total);
    return { grownMeters: grown, humanGrownMeters: Math.max(0, grown - synthetic - unknown), syntheticGrownMeters: synthetic, unknownGrownMeters: unknown, syntheticShare: share(gains.synthetic, total), basis: 'digest-posts' };
  }
  const rowShare = finite(record(contaminationRow).share);
  if (contaminationRow && rowShare != null) {
    const synthetic = Math.round(grown * Math.max(0, Math.min(1, rowShare)));
    return { grownMeters: grown, humanGrownMeters: grown - synthetic, syntheticGrownMeters: synthetic, unknownGrownMeters: 0, syntheticShare: Math.max(0, Math.min(1, rowShare)), basis: 'digest-contamination' };
  }
  if (digestPost && grown === 0) {
    return { grownMeters: 0, humanGrownMeters: 0, syntheticGrownMeters: 0, unknownGrownMeters: 0, syntheticShare: null, basis: 'digest-posts' };
  }
  return { grownMeters: grown, humanGrownMeters: null, syntheticGrownMeters: null, unknownGrownMeters: null, syntheticShare: null, basis: 'unavailable' };
}

// ---------------------------------------------------------------------------
// The fold

const label = (uid, profile, displayName) => text(record(profile).username, 40) || text(displayName, 40) || `${String(uid).slice(0, 6)}…`;
const chunk = (items, size) => { const out = []; for (let at = 0; at < items.length; at += size) out.push(items.slice(at, at + size)); return out; };
/** Human uids in `in`-sized chunks, for the proxy's engagement queries. */
export const humanUidChunks = uids => chunk([...new Set(uids)], BETA_IN_CHUNK);

const retentionStatus = ({ active, cohortDay, offset, today }) => {
  const target = dayKeyOffset(cohortDay, offset);
  if (active.has(target)) return 'retained';
  return today > target ? 'lost' : 'pending';
};

const emptyReach = () => ({ real: 0, owner: 0 });

/**
 * Everything the proxy gathered, folded into the tables and the two views.
 *
 * input:
 *   now                      ms
 *   accounts                 Auth page: [{ uid, email, displayName, createdAtMs, lastSignInAtMs, lastRefreshAtMs }]
 *   profiles                 users/: [{ uid, profile }]
 *   postsByUid               { uid: [{ id, data }] } newest first, every class (filtered here)
 *   popDetails               { postId: { startMeters, startAtMs, peakMeters, peakAtMs, engagements: [{ actorUid, kind, createdAtMs }], exact } }
 *   protectedLocations       { uid: { postId: { latitude, longitude } } }
 *   sightings                the ledger (already updated with this run's Auth stamps, live leases and engagement days)
 *   digest                   the normalised algorithm digest (posts[] gains by class, contamination.d7.posts[]) or null
 *   coverage                 { reads, capped, cappedAt, ... } from the gather
 */
export function foldBetaMetrics(input) {
  const now = finite(input?.now) ?? Date.now();
  const today = torontoDayKey(now);
  const dayKeys = torontoDayKeys(now, BETA_DAYS);
  const accounts = Array.isArray(input?.accounts) ? input.accounts.filter(row => row && UID.test(String(row.uid ?? ''))) : [];
  const profileByUid = new Map((Array.isArray(input?.profiles) ? input.profiles : []).filter(row => row && UID.test(String(row.uid ?? ''))).map(row => [row.uid, record(row.profile)]));
  const postsByUid = record(input?.postsByUid);
  const popDetails = record(input?.popDetails);
  const protectedLocations = record(input?.protectedLocations);
  const sightings = record(record(input?.sightings).sightings);
  const coverage = { ...record(input?.coverage) };
  const digest = record(input?.digest);
  const digestPostById = new Map((Array.isArray(digest.posts) ? digest.posts : []).filter(row => row && typeof row.postId === 'string').map(row => [row.postId, row]));
  const contaminationById = new Map((Array.isArray(record(record(digest.contamination).d7).posts) ? digest.contamination.d7.posts : []).filter(row => row && typeof row.postId === 'string').map(row => [row.postId, row]));

  // 1. Classes. Every uid Auth or users/ has seen; Auth first so the sign-up date leads.
  const accountByUid = new Map(accounts.map(row => [row.uid, row]));
  const uids = [...new Set([...accountByUid.keys(), ...profileByUid.keys()])];
  const excluded = { synthetic: 0, review: 0, unknown: 0 };
  const humans = [];
  for (const uid of uids) {
    const account = accountByUid.get(uid) ?? null;
    const profile = profileByUid.get(uid) ?? null;
    const cls = betaAccountClass(uid, profile, account?.email ?? profile?.email ?? null, !!account || !!profile);
    if (!cls.human) { excluded[cls.cls] = (excluded[cls.cls] ?? 0) + 1; continue; }
    humans.push({ uid, owner: cls.owner, account, profile });
  }
  const humanUids = new Set(humans.map(row => row.uid));
  const ownerUids = new Set(humans.filter(row => row.owner).map(row => row.uid));

  // 2. Pops: each human's real-class posts, with the ledger facts the proxy read.
  const popsByUid = new Map();
  for (const { uid } of humans) {
    const rows = (Array.isArray(postsByUid[uid]) ? postsByUid[uid] : [])
      .filter(post => post && typeof post.id === 'string' && post.id && isHumanPop(post.id, record(post.data)));
    popsByUid.set(uid, rows);
  }

  // 3. Anchors, for reach: an account with no pop has no anchor.
  const anchorByUid = new Map();
  for (const { uid, profile } of humans) {
    const anchor = anchorForAccount({ profile, posts: Array.isArray(postsByUid[uid]) ? postsByUid[uid] : [], protectedLocations: record(protectedLocations[uid]) });
    anchorByUid.set(uid, anchor);
  }

  // 4. Activity days per human: pops, engagements on human pops, sightings.
  const activeDays = new Map(humans.map(row => [row.uid, new Map()]));
  const mark = (uid, day, kind) => {
    const days = activeDays.get(uid);
    if (!days || !DAY_KEY.test(day)) return;
    const kinds = days.get(day) ?? new Set();
    kinds.add(kind);
    days.set(day, kinds);
  };
  for (const [uid, days] of Object.entries(sightings)) {
    if (!humanUids.has(uid)) continue;
    for (const [day, kinds] of Object.entries(record(days))) for (const kind of (Array.isArray(kinds) ? kinds : [])) if (BETA_SIGHTING_KINDS.includes(kind)) mark(uid, day, kind);
  }
  // The Auth stamps are sightings whether or not the ledger has them yet
  // (the proxy records them there for the days after they move on).
  for (const { uid, account } of humans) {
    const signIn = millis(account?.lastSignInAtMs);
    const refresh = millis(account?.lastRefreshAtMs);
    if (signIn) mark(uid, torontoDayKey(signIn), 'signin');
    if (refresh) mark(uid, torontoDayKey(refresh), 'refresh');
  }

  // 5. Pop rows.
  const pops = [];
  const likesGiven = new Map();
  for (const { uid, owner, profile, account } of humans) {
    for (const post of popsByUid.get(uid)) {
      const data = record(post.data);
      const detail = record(popDetails[post.id]);
      const createdAtMs = millis(data.createdAtMillis) || millis(data.createdAt);
      if (createdAtMs) mark(uid, torontoDayKey(createdAtMs), 'pop');
      const currentMeters = Math.max(0, finite(data.radiusMeters) ?? finite(data.radius) ?? finite(data.organicRadiusMeters) ?? 0);
      const startMeters = finite(detail.startMeters) ?? Math.max(0, (finite(data.seedRadiusMeters) ?? 0) + (finite(data.boostedRadiusMeters) ?? 0));
      // Peak: the ledger's largest entry when it is the largest figure known;
      // else the post now (at `now`), else its start (at creation).
      const peakFromLedger = finite(detail.peakMeters);
      const peakMeters = Math.max(currentMeters, startMeters, peakFromLedger ?? 0);
      const peakAtMs = peakFromLedger != null && peakFromLedger >= peakMeters ? (millis(detail.peakAtMs) || createdAtMs)
        : currentMeters >= peakMeters ? now : createdAtMs;
      const likers = { real: new Set(), owner: new Set() };
      for (const engagement of (Array.isArray(detail.engagements) ? detail.engagements : [])) {
        const actor = text(engagement?.actorUid, 128);
        if (!humanUids.has(actor)) continue;
        const atMs = millis(engagement.createdAtMs);
        if (atMs) mark(actor, torontoDayKey(atMs), 'engagement');
        // A like is one actor on one pop, however many like documents a
        // double-tap left (the second is `applied: false`): distinct actors.
        if (engagement.kind === 'like' && actor !== uid) {
          const bucket = likers[ownerUids.has(actor) ? 'owner' : 'real'];
          if (!bucket.has(actor)) likesGiven.set(actor, (likesGiven.get(actor) ?? 0) + 1);
          bucket.add(actor);
        }
      }
      const split = splitPeakByClass({ startMeters, peakMeters, digestPost: digestPostById.get(post.id) ?? null, contaminationRow: contaminationById.get(post.id) ?? null });
      const coords = coordinatePair(data.latitude, data.longitude) ?? coordinatePair(record(detail.exact).latitude, record(detail.exact).longitude);
      const reach = (radius, exclude) => {
        const counts = emptyReach();
        if (!coords || !(radius > 0)) return counts;
        for (const [other, anchor] of anchorByUid) {
          if (other === exclude || !anchor) continue;
          if (haversineMeters(coords, anchor) <= radius) counts[ownerUids.has(other) ? 'owner' : 'real'] += 1;
        }
        return counts;
      };
      pops.push({
        postId: post.id,
        ownerUid: uid,
        ownerLabel: label(uid, profile, account?.displayName),
        owner,
        channelId: text(data.channelId, 64),
        mediaType: data.mediaType === 'video' ? 'video' : 'photo',
        createdAtMs,
        day: createdAtMs ? torontoDayKey(createdAtMs) : '',
        deleted: data.status === 'deleted',
        startMeters,
        currentMeters,
        peakMeters,
        peakAtMs,
        grownMeters: split.grownMeters,
        humanGrownMeters: split.humanGrownMeters,
        syntheticGrownMeters: split.syntheticGrownMeters,
        unknownGrownMeters: split.unknownGrownMeters,
        syntheticShare: split.syntheticShare,
        splitBasis: split.basis,
        likesReal: likers.real.size,
        likesOwner: likers.owner.size,
        views: Math.max(0, Math.trunc(finite(data.viewCount) ?? 0)),
        humansInReachAtPeak: reach(peakMeters, uid),
        humansInReachNow: reach(currentMeters, uid),
        hasCoordinates: !!coords,
      });
    }
  }
  pops.sort((a, b) => b.createdAtMs - a.createdAtMs);

  // 6. User rows.
  const users = humans.map(({ uid, owner, profile, account }) => {
    const signedUpAtMs = millis(account?.createdAtMs);
    const signedUpDay = signedUpAtMs ? torontoDayKey(signedUpAtMs) : '';
    const own = pops.filter(pop => pop.ownerUid === uid).sort((a, b) => a.createdAtMs - b.createdAtMs);
    const firstPopAtMs = own.find(pop => pop.createdAtMs > 0)?.createdAtMs ?? 0;
    const firstPopHours = firstPopAtMs && signedUpAtMs ? Math.max(0, (firstPopAtMs - signedUpAtMs) / 3_600_000) : null;
    const days = activeDays.get(uid);
    const active = new Set(days.keys());
    const activeDayList = [...active].sort();
    const retention = {};
    for (const offset of BETA_RETENTION_DAYS) retention[`d${offset}`] = signedUpDay ? retentionStatus({ active, cohortDay: signedUpDay, offset, today }) : 'pending';
    return {
      uid,
      label: label(uid, profile, account?.displayName),
      owner,
      signedUpAtMs,
      signedUpDay,
      lastSignInAtMs: millis(account?.lastSignInAtMs),
      pops: own.length,
      firstPopAtMs,
      firstPopHours,
      firstPopWithin24h: firstPopAtMs && signedUpAtMs ? firstPopAtMs - signedUpAtMs <= FIRST_POP_WINDOW_MS : null,
      likesGiven: likesGiven.get(uid) ?? 0,
      likesReceived: own.reduce((sum, pop) => sum + pop.likesReal + pop.likesOwner, 0),
      activeDays: activeDayList.length,
      activeDayList,
      activeKinds: Object.fromEntries(activeDayList.map(day => [day, [...days.get(day)].sort()])),
      lastActiveDay: activeDayList[activeDayList.length - 1] ?? '',
      retention,
      anchorBasis: anchorByUid.get(uid)?.basis ?? null,
    };
  }).sort((a, b) => b.signedUpAtMs - a.signedUpAtMs || a.uid.localeCompare(b.uid));

  // 7. The two views.
  const view = includeOwner => {
    const rows = users.filter(user => includeOwner || !user.owner);
    const popRows = pops.filter(pop => includeOwner || !pop.owner);
    const likesOf = pop => pop.likesReal + (includeOwner ? pop.likesOwner : 0);
    const reachOf = counts => counts.real + (includeOwner ? counts.owner : 0);
    const activeOn = day => rows.filter(user => user.activeKinds[day]).length;
    const daily = [];
    let cumulativeAccounts = rows.filter(user => user.signedUpDay && user.signedUpDay < dayKeys[0]).length;
    let cumulativePops = popRows.filter(pop => pop.day && pop.day < dayKeys[0]).length;
    let cumulativeLikes = 0;
    for (const day of dayKeys) {
      const cohort = rows.filter(user => user.signedUpDay === day);
      const popsOn = popRows.filter(pop => pop.day === day);
      cumulativeAccounts += cohort.length;
      cumulativePops += popsOn.length;
      // Likes are folded by the pop's day (a like's own day is not carried on the pop row).
      cumulativeLikes = popRows.filter(pop => pop.day && pop.day <= day).reduce((sum, pop) => sum + likesOf(pop), 0);
      const activeUsers = activeOn(day);
      const retention = {};
      for (const offset of BETA_RETENTION_DAYS) {
        const key = `d${offset}`;
        const due = cohort.filter(user => user.retention[key] !== 'pending');
        retention[key] = { retained: due.filter(user => user.retention[key] === 'retained').length, due: due.length, cohort: cohort.length };
      }
      daily.push({
        day,
        signups: cohort.length,
        cumulativeAccounts,
        firstPop24h: { n: cohort.filter(user => user.firstPopWithin24h === true).length, of: cohort.length },
        activeUsers,
        pops: popsOn.length,
        popsPerActiveUser: activeUsers > 0 ? popsOn.length / activeUsers : null,
        likes: popsOn.reduce((sum, pop) => sum + likesOf(pop), 0),
        cumulativePops,
        cumulativeLikes,
        likesPerPop: cumulativePops > 0 ? cumulativeLikes / cumulativePops : null,
        retention,
      });
    }
    const retention = {};
    for (const offset of BETA_RETENTION_DAYS) {
      const key = `d${offset}`;
      const due = rows.filter(user => user.retention[key] !== 'pending');
      retention[key] = { n: due.filter(user => user.retention[key] === 'retained').length, of: due.length };
    }
    const last7 = dayKeys.slice(-7);
    const withPop = rows.filter(user => user.firstPopWithin24h !== null);
    // "Largest reach achieved": the most humans inside at peak, then the
    // most human-grown metres (a pop with no split yet ranks on its peak).
    const humanReach = pop => (pop.humanGrownMeters === null ? pop.peakMeters : pop.startMeters + pop.humanGrownMeters);
    const largest = popRows.reduce((best, pop) => (!best || reachOf(pop.humansInReachAtPeak) > reachOf(best.humansInReachAtPeak)
      || (reachOf(pop.humansInReachAtPeak) === reachOf(best.humansInReachAtPeak) && humanReach(pop) > humanReach(best)) ? pop : best), null);
    const totalLikes = popRows.reduce((sum, pop) => sum + likesOf(pop), 0);
    return {
      daily,
      headline: {
        humanAccounts: rows.length,
        signupsToday: rows.filter(user => user.signedUpDay === today).length,
        signups7d: rows.filter(user => last7.includes(user.signedUpDay)).length,
        firstPop24h: { n: rows.filter(user => user.firstPopWithin24h === true).length, of: rows.length, withPop: withPop.length },
        retention,
        activeToday: activeOn(today),
        popsToday: popRows.filter(pop => pop.day === today).length,
        popsPerActiveUserToday: activeOn(today) > 0 ? popRows.filter(pop => pop.day === today).length / activeOn(today) : null,
        likesPerPop: { likes: totalLikes, pops: popRows.length },
        largestReach: largest ? {
          postId: largest.postId,
          ownerLabel: largest.ownerLabel,
          owner: largest.owner,
          peakMeters: largest.peakMeters,
          peakAtMs: largest.peakAtMs,
          startMeters: largest.startMeters,
          humanGrownMeters: largest.humanGrownMeters,
          syntheticGrownMeters: largest.syntheticGrownMeters,
          syntheticShare: largest.syntheticShare,
          splitBasis: largest.splitBasis,
          humansInReach: reachOf(largest.humansInReachAtPeak),
          hasCoordinates: largest.hasCoordinates,
        } : null,
      },
    };
  };

  return {
    version: BETA_VERSION,
    generatedAtMs: now,
    timeZone: DESK_TIME_ZONE,
    today,
    days: dayKeys,
    accounts: { human: humans.length, owner: ownerUids.size, students: humans.length - ownerUids.size, excluded },
    users,
    pops,
    views: { students: view(false), everyone: view(true) },
    definitions: BETA_DEFINITIONS,
    coverage: {
      reads: Math.max(0, Math.trunc(finite(coverage.reads) ?? 0)),
      cad: readsToCad(finite(coverage.reads) ?? 0),
      capped: coverage.capped === true,
      cappedAt: text(coverage.cappedAt, 80) || null,
      sightingsSince: text(coverage.sightingsSince, 10) || null,
      engagementIndex: coverage.engagementIndex === true,
      engagementDaysCounted: Math.max(0, Math.trunc(finite(coverage.engagementDaysCounted) ?? 0)),
      digestAtMs: Math.max(0, Math.trunc(finite(coverage.digestAtMs) ?? 0)),
    },
  };
}

// ---------------------------------------------------------------------------
// CSV (the algorithm report's mechanism: fixed columns, built from the tables)

const yesNo = value => (value === null || value === undefined ? '' : value ? 'yes' : 'no');

export function betaUsersCsv(users) {
  return csvDocument(BETA_USERS_CSV_COLUMNS, (Array.isArray(users) ? users : []).map(user => ({
    uid: user.uid,
    label: user.label,
    owner: yesNo(user.owner),
    signedUpAtIso: iso(user.signedUpAtMs),
    signedUpDay: user.signedUpDay,
    lastSignInAtIso: iso(user.lastSignInAtMs),
    pops: user.pops,
    firstPopAtIso: iso(user.firstPopAtMs),
    firstPopHours: user.firstPopHours == null ? '' : Math.round(user.firstPopHours * 100) / 100,
    firstPopWithin24h: yesNo(user.firstPopWithin24h),
    likesGiven: user.likesGiven,
    likesReceived: user.likesReceived,
    activeDays: user.activeDays,
    activeDayList: (user.activeDayList ?? []).join('|'),
    lastActiveDay: user.lastActiveDay,
    d1: user.retention?.d1 ?? '',
    d7: user.retention?.d7 ?? '',
    d14: user.retention?.d14 ?? '',
    anchorBasis: user.anchorBasis ?? '',
  })));
}

export function betaPopsCsv(pops) {
  return csvDocument(BETA_POPS_CSV_COLUMNS, (Array.isArray(pops) ? pops : []).map(pop => ({
    postId: pop.postId,
    ownerUid: pop.ownerUid,
    ownerLabel: pop.ownerLabel,
    owner: yesNo(pop.owner),
    channelId: pop.channelId,
    mediaType: pop.mediaType,
    createdAtIso: iso(pop.createdAtMs),
    day: pop.day,
    deleted: yesNo(pop.deleted),
    startMeters: pop.startMeters,
    currentMeters: pop.currentMeters,
    peakMeters: pop.peakMeters,
    peakAtIso: iso(pop.peakAtMs),
    humanGrownMeters: pop.humanGrownMeters ?? '',
    syntheticGrownMeters: pop.syntheticGrownMeters ?? '',
    likesReal: pop.likesReal,
    likesOwner: pop.likesOwner,
    views: pop.views,
    humansInReachAtPeakReal: pop.humansInReachAtPeak?.real ?? 0,
    humansInReachAtPeakOwner: pop.humansInReachAtPeak?.owner ?? 0,
    humansInReachNowReal: pop.humansInReachNow?.real ?? 0,
    humansInReachNowOwner: pop.humansInReachNow?.owner ?? 0,
    hasCoordinates: yesNo(pop.hasCoordinates),
  })));
}

/** poplur-beta-<table>-YYYYMMDD.csv, stamped in the owner's day. */
export const betaCsvFilename = (table, nowMs) => `poplur-beta-${table}-${torontoDayKey(nowMs).replace(/-/g, '')}.csv`;
