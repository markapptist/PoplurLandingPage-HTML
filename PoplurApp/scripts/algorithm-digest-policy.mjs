import { Buffer } from 'node:buffer';

/**
 * Pure policy for the algorithm desk's proxy side (.codex/algorithm-desk-design.md §4.2):
 * the normaliser for testControl/algorithmDigest, the three CSV shapes (§4.5),
 * the ledger-export estimate and day budget, and the entry labels the export
 * shares with the digest (§1.2). No Firestore, no network, no uid ever leaves.
 */

export const DIGEST_VERSION = 1;
/** The top of the radius scale: the Earth's radius (worldRadius.ts in the clay map). */
export const MAX_RADIUS_METERS = 6_371_000;
/** Owner's rate: CA$0.05 per 100k Firestore reads. */
export const READ_CAD_PER_100K = 0.05;
export const DIGEST_BOUNDS = Object.freeze({
  days: 30,
  posts: 50,
  channels: 13,
  anchors: 8,
  contaminationPosts: 20,
  policyVersions: 8,
  gaps: 16,
  /** The digest rides inside every SSE frame; a frame past this is refused, never zeroed. */
  serializedBytes: 512 * 1024,
});
/** = postLimit: the whole panel-K list in one request. */
export const LEDGER_EXPORT_POST_LIMIT = 50;
/** The drill-down's own cap on one post's history (fn/testActivity.ts:695). */
export const LEDGER_EXPORT_ENTRY_LIMIT = 500;
export const LEDGER_EXPORT_DAY_READ_BUDGET = 25_000;
/** The callable's pattern (fn/testActivity.ts:689). */
export const LEDGER_POST_ID_PATTERN = /^post-[A-Za-z0-9_-]{16,96}$/;
export const DESK_TIME_ZONE = 'America/Toronto';

// The two TEST_ADMIN_UIDS (fn/testActivity.ts:37-40) and the @appreview demo
// account: pinned constants, the same kind as TEST_ADMIN_UIDS, never a knob.
export const DESK_OWNER_UIDS = Object.freeze(['LiEG6SNtKEZN6eEGeybf0afZnHm1', 'eoP2Z0ElxIa0Eua7xpFxNlr6tur1']);
export const DESK_REVIEW_UIDS = Object.freeze(['92eygyJsD3VEXzHXdBLch44AMRl1']);

export const POST_CLASSES = Object.freeze(['official', 'lab', 'synthetic', 'real']);
export const ACTOR_CLASSES = Object.freeze(['real', 'owner', 'review', 'synthetic', 'unknown']);
export const ENTRY_BUCKETS = Object.freeze(['first', 'repeat', 'clamped', 'resync', '—']);
export const DECAY_MODES = Object.freeze(['normal', 'trial', 'stress', 'undetermined', '—']);

/** Knobs assumed when the digest has not published its own (fn/postEngagementPolicy.ts). */
export const DEFAULT_KNOBS = Object.freeze({
  firstViewMeters: 1_000,
  likeMeters: 1_000,
  dislikeMeters: -1_000,
  commentMeters: 2_000,
  repeatViewBaseMeters: 500,
  decayPerDay: 0.05,
  decayFloorMeters: 10,
  maxRadiusMeters: MAX_RADIUS_METERS,
  syntheticStressHalfLifeHours: 4,
});
/** Below this organic the integer floor makes a decay rate uninformative (§0 panel E). */
export const RATE_FLOOR_ORGANIC_METERS = 468;
const TRIAL_MULTIPLIERS = [2, 3, 4, 5, 6, 7, 8, 9, 10];

export const LEDGER_CSV_COLUMNS = Object.freeze([
  'postId', 'postClass', 'ownerClass', 'clean', 'channelId', 'entryId', 'atIso', 'atMillis', 'cause', 'kind',
  'actorClass', 'bucket', 'decayMode', 'radiusMeters', 'organicRadiusMeters', 'seedRadiusMeters',
  'boostedRadiusMeters', 'delta', 'organicDelta', 'writer',
]);
export const POSTS_CSV_COLUMNS = Object.freeze([
  'postId', 'cls', 'ownerClass', 'channelId', 'createdAtMillis', 'seedMeters', 'currentMeters', 'organicMeters',
  'boostMeters', 'peakMeters', 'peakAtMillis', 'entries', 'realGain', 'ownerGain', 'reviewGain', 'syntheticGain',
  'unknownGain', 'decayLoss', 'decayLossRealShare', 'decayModeSeen', 'clean', 'viewCount',
  'firstRealEngagementAtMillis', 'lastAtMillis', 'lastCause', 'atClaim', 'expired', 'deletedAtMillis',
]);

const MAX_DEPTH = 8;
const MAX_KEYS = 128;
const MAX_ITEMS = 128;
const MAX_TEXT = 160;

const text = (value, maximum = MAX_TEXT) => typeof value === 'string'
  ? value.trim().replace(/\s+/g, ' ').slice(0, maximum)
  : '';

const finite = value => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const integer = (value, maximum = Number.MAX_SAFE_INTEGER, minimum = 0) => {
  const parsed = finite(value);
  return parsed == null ? minimum : Math.max(minimum, Math.min(maximum, Math.trunc(parsed)));
};

const record = value => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

/** Metres clamp to ± the world radius, times to ≥ 0, everything else to the safe range. */
function clampNumber(value, key) {
  // ±Infinity clamps to the range; NaN and non-numbers read as 0.
  const parsed = typeof value === 'number' && !Number.isNaN(value) ? value : finite(value);
  if (parsed == null) return 0;
  // Metres: the *Meters fields plus the PostSummary's gain/loss/delta figures.
  if (/(meters|gain|loss|delta)$/i.test(key)) return Math.max(-MAX_RADIUS_METERS, Math.min(MAX_RADIUS_METERS, parsed));
  if (/(millis|ms|at)$/i.test(key)) return Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, parsed));
  return Math.max(-Number.MAX_SAFE_INTEGER, Math.min(Number.MAX_SAFE_INTEGER, parsed));
}

function sanitize(value, key, depth) {
  if (typeof value === 'string') return text(value);
  if (typeof value === 'number') return clampNumber(value, key);
  if (typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) return [];
    return value.slice(0, MAX_ITEMS).map(item => sanitize(item, key, depth + 1));
  }
  if (value && typeof value === 'object') {
    if (depth >= MAX_DEPTH) return {};
    // A Firestore Timestamp that slipped into the document reads as millis.
    if (typeof value.toMillis === 'function') return clampNumber(value.toMillis(), 'Millis');
    const out = {};
    for (const [childKey, child] of Object.entries(value).slice(0, MAX_KEYS)) {
      if (child === undefined || typeof child === 'function') continue;
      out[childKey] = sanitize(child, childKey, depth + 1);
    }
    return out;
  }
  return null;
}

const serializedBytes = value => Buffer.byteLength(JSON.stringify(value), 'utf8');

const arrayOf = (value, limit) => (Array.isArray(value) ? value.slice(0, limit) : []);

/**
 * Version gate, bounds and clamps for the published digest (§2.1). A missing
 * document is null; another schema major is reported, never rendered as zeros;
 * a frame over the serialized cap is trimmed in the digest's own order and
 * refused if still too large.
 */
export function normalizeAlgorithmDigest(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const version = finite(raw.version);
  if (version !== DIGEST_VERSION) {
    return { version: version == null ? null : Math.trunc(version), unsupportedVersion: true };
  }
  const digest = sanitize(raw, '', 0);
  digest.version = DIGEST_VERSION;
  digest.digestVersion = integer(raw.digestVersion);
  digest.generatedAtMillis = integer(raw.generatedAtMillis);
  digest.runId = text(raw.runId, 120);
  digest.runMs = integer(raw.runMs);
  digest.headline = record(digest.headline);
  digest.cost = record(digest.cost);
  digest.coverage = record(digest.coverage);
  digest.knobs = record(digest.knobs);
  digest.switches = record(digest.switches);
  digest.gates = record(digest.gates);
  digest.windows = record(digest.windows);
  digest.days = arrayOf(digest.days, DIGEST_BOUNDS.days).filter(day => day && typeof day === 'object');
  digest.channels = arrayOf(digest.channels, DIGEST_BOUNDS.channels).filter(row => row && typeof row === 'object');
  digest.posts = arrayOf(digest.posts, DIGEST_BOUNDS.posts)
    .filter(post => post && typeof post === 'object' && typeof post.postId === 'string' && post.postId);
  digest.anchors = { ...record(digest.anchors), rows: arrayOf(record(digest.anchors).rows, DIGEST_BOUNDS.anchors) };
  digest.observedPolicyVersions = arrayOf(digest.observedPolicyVersions, DIGEST_BOUNDS.policyVersions);
  digest.gaps = arrayOf(digest.gaps, DIGEST_BOUNDS.gaps);
  const contamination = record(digest.contamination);
  const d7 = record(contamination.d7);
  digest.contamination = { ...contamination, d7: { ...d7, posts: arrayOf(d7.posts, DIGEST_BOUNDS.contaminationPosts) } };

  if (serializedBytes(digest) > DIGEST_BOUNDS.serializedBytes) {
    // The digest's own hard-guard order (§2.1): halve posts, days to 14, drop
    // contamination posts. The proxy marks the trim so the page can say so.
    digest.posts = digest.posts.slice(0, Math.ceil(DIGEST_BOUNDS.posts / 2));
    if (serializedBytes(digest) > DIGEST_BOUNDS.serializedBytes) digest.days = digest.days.slice(-14);
    if (serializedBytes(digest) > DIGEST_BOUNDS.serializedBytes) digest.contamination.d7.posts = [];
    digest.coverage = { ...digest.coverage, trimmed: true };
    if (serializedBytes(digest) > DIGEST_BOUNDS.serializedBytes) {
      return { version: DIGEST_VERSION, digestVersion: digest.digestVersion, oversize: true };
    }
  }
  return digest;
}

// ---------------------------------------------------------------------------
// CSV

/** RFC 4180 quoting; text cells that a spreadsheet would read as a formula get a leading apostrophe. */
export function csvCell(value) {
  if (value == null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  let cell = typeof value === 'string' ? value : JSON.stringify(value);
  if (/^[=+@\t\r]/.test(cell) || (/^-/.test(cell) && !/^-?\d/.test(cell))) cell = `'${cell}`;
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

export function csvDocument(columns, rows) {
  const lines = [columns.map(csvCell).join(',')];
  for (const row of rows) lines.push(columns.map(column => csvCell(row[column])).join(','));
  return `${lines.join('\r\n')}\r\n`;
}

/** Dotted keys for nested numbers, so a DayStat's WindowStats become plain columns. */
export function flattenValues(value, prefix = '', out = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) flattenValues(child, prefix ? `${prefix}.${key}` : key, out);
  } else if (Array.isArray(value)) {
    out[prefix] = value.map(item => (typeof item === 'object' ? JSON.stringify(item) : String(item))).join('|');
  } else {
    out[prefix] = value;
  }
  return out;
}

/** poplur-algorithm-days.csv: one row per DayStat, every number, a policyVersion column (§4.5). */
export function digestDaysCsv(digest) {
  const days = arrayOf(digest?.days, DIGEST_BOUNDS.days).filter(day => day && typeof day === 'object');
  const rows = days.map(day => {
    const { day: dayKey, observedPolicy, ...rest } = day;
    return { day: dayKey ?? '', policyVersion: observedPolicy ?? '', ...flattenValues(rest) };
  });
  const columns = ['day', 'policyVersion'];
  for (const row of rows) for (const key of Object.keys(row)) if (!columns.includes(key)) columns.push(key);
  return csvDocument(columns, rows);
}

/** poplur-algorithm-posts.csv: one row per PostSummary in the document's field order (§2.1). */
export function digestPostsCsv(digest) {
  const posts = arrayOf(digest?.posts, DIGEST_BOUNDS.posts).filter(post => post && typeof post === 'object');
  return csvDocument(POSTS_CSV_COLUMNS, posts);
}

/**
 * poplur-ledger-<date>.csv. Exactly the §4.5 columns: actorClass is the
 * five-valued class from the join, never a uid; a row carrying anything else
 * (an actorUid from the join, coordinates) loses it here.
 */
export function ledgerCsv(rows) {
  const safe = (Array.isArray(rows) ? rows : []).map(row => {
    const entry = record(row);
    return {
      ...entry,
      // '—' is an entry with no actor (create, decay, boost); anything else unrecognised is unknown.
      actorClass: ACTOR_CLASSES.includes(entry.actorClass) || entry.actorClass === '—' ? entry.actorClass : 'unknown',
      bucket: ENTRY_BUCKETS.includes(entry.bucket) ? entry.bucket : '—',
      decayMode: DECAY_MODES.includes(entry.decayMode) ? entry.decayMode : '—',
      atIso: entry.atIso ?? (finite(entry.atMillis) != null ? new Date(entry.atMillis).toISOString() : ''),
    };
  });
  return csvDocument(LEDGER_CSV_COLUMNS, safe);
}

// ---------------------------------------------------------------------------
// Export estimate and day budget

/**
 * Reads for `POST /api/export/ledger`, from the digest's per-post entry counts
 * before any read: Σ (1 + entries) per post; a post absent from the watchlist
 * counts as the hard cap, 1 + 500.
 */
export function estimateLedgerExport(digest, postIds) {
  const entriesById = new Map();
  for (const post of arrayOf(digest?.posts, DIGEST_BOUNDS.posts)) {
    if (post && typeof post.postId === 'string') entriesById.set(post.postId, integer(post.entries, LEDGER_EXPORT_ENTRY_LIMIT));
  }
  const ids = [...new Set((Array.isArray(postIds) ? postIds : []).filter(id => typeof id === 'string'))];
  let reads = 0;
  let unknownPosts = 0;
  for (const id of ids) {
    if (entriesById.has(id)) reads += 1 + Math.min(LEDGER_EXPORT_ENTRY_LIMIT, entriesById.get(id));
    else { reads += 1 + LEDGER_EXPORT_ENTRY_LIMIT; unknownPosts += 1; }
  }
  return { reads, cad: readsToCad(reads), posts: ids.length, unknownPosts };
}

export const readsToCad = reads => Math.max(0, finite(reads) ?? 0) / 100_000 * READ_CAD_PER_100K;

const torontoDayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: DESK_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});
const torontoStampFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: DESK_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
});

/** "YYYY-MM-DD" in the owner's day (the same Intl technique as fn/testActivity.ts:266). */
export const torontoDayKey = nowMs => torontoDayFormat.format(new Date(nowMs));

/** poplur-ledger-YYYYMMDD-HHmm.csv, stamped in the owner's time. */
export function ledgerExportFilename(nowMs) {
  const parts = Object.fromEntries(torontoStampFormat.formatToParts(new Date(nowMs)).map(part => [part.type, part.value]));
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return `poplur-ledger-${parts.year}${parts.month}${parts.day}-${hour}${parts.minute}.csv`;
}

/** In-memory per-day read guard for the export route (25,000 reads per Toronto day). */
export function createLedgerReadBudget({ limitReads = LEDGER_EXPORT_DAY_READ_BUDGET, dayOf = torontoDayKey } = {}) {
  let day = '';
  let used = 0;
  const roll = nowMs => {
    const key = dayOf(nowMs);
    if (key !== day) { day = key; used = 0; }
  };
  return {
    limit: limitReads,
    remaining(nowMs = Date.now()) { roll(nowMs); return Math.max(0, limitReads - used); },
    used(nowMs = Date.now()) { roll(nowMs); return used; },
    charge(reads, nowMs = Date.now()) { roll(nowMs); used += Math.max(0, integer(reads)); return Math.max(0, limitReads - used); },
    day(nowMs = Date.now()) { roll(nowMs); return day; },
  };
}

/** The request body of the export route: ≤ 50 distinct callable-pattern ids. */
export function validateLedgerExportRequest(body) {
  const data = record(body);
  if (!Array.isArray(data.postIds) || data.postIds.length === 0) throw new Error('postIds must be a non-empty array.');
  if (data.postIds.length > LEDGER_EXPORT_POST_LIMIT) throw new Error(`At most ${LEDGER_EXPORT_POST_LIMIT} posts per export.`);
  const postIds = [];
  for (const id of data.postIds) {
    if (typeof id !== 'string' || !LEDGER_POST_ID_PATTERN.test(id)) throw new Error('That post id is not one this desk can export.');
    if (!postIds.includes(id)) postIds.push(id);
  }
  if ('classifyActors' in data && typeof data.classifyActors !== 'boolean') throw new Error('classifyActors must be a boolean.');
  return { postIds, classifyActors: data.classifyActors !== false };
}

// ---------------------------------------------------------------------------
// Classes (§1.1) — the same rules as fn/syntheticIdentity.ts, kept in step by hand

/** The widened mailbox rule: `@poplur.test` or any `.poplur.test` subdomain (the permanent QA cohort). */
export const isSyntheticMailbox = email => typeof email === 'string'
  && /(?:@|\.)poplur\.test$/i.test(email.trim());

export function isSyntheticAccount(uid, profile, email) {
  if (/^(synthetic-|sim-)/.test(String(uid ?? ''))) return true;
  const data = record(profile);
  if (data.syntheticBeta === true || data.syntheticCohort === true) return true;
  if (typeof data.syntheticSource === 'string' && data.syntheticSource) return true;
  if (typeof data.accountType === 'string' && data.accountType.toLowerCase().startsWith('synthetic')) return true;
  return isSyntheticMailbox(email);
}

export function isSyntheticPost(post, ownerSynthetic) {
  const data = record(post);
  return ownerSynthetic === true
    || data.syntheticBeta === true
    || data.syntheticCohort === true
    || (typeof data.syntheticActorId === 'string' && data.syntheticActorId !== '');
}

/** official → lab → synthetic → real, the order of .codex/test-center-report/gather.mjs:250-255. */
export function postClass(postId, post, ownerSynthetic = false) {
  const data = record(post);
  const id = String(postId ?? '');
  if (data.officialContent === true) return 'official';
  if (id.startsWith('post-radius-lab-') || (typeof data.syntheticSource === 'string' && data.syntheticSource.startsWith('radius-lab'))) return 'lab';
  if (isSyntheticPost(data, ownerSynthetic)
    || (typeof data.syntheticSource === 'string' && data.syntheticSource)
    || data.source === 'synthetic-browser'
    || id.startsWith('post-sim-') || id.startsWith('synthetic-')) return 'synthetic';
  return 'real';
}

/** Five-valued; `known === false` (absent from Auth and users) is `unknown`, never `real`. */
export function actorClass(uid, profile, email, known = true) {
  const id = String(uid ?? '');
  if (!id) return 'unknown';
  if (DESK_OWNER_UIDS.includes(id)) return 'owner';
  if (DESK_REVIEW_UIDS.includes(id)) return 'review';
  if (isSyntheticAccount(id, profile, email)) return 'synthetic';
  if (known === false) return 'unknown';
  return 'real';
}

/** PostSummary.ownerClass: official posts are `official`; every other post takes its owner's actor class. */
export function ownerClassOf(postId, post, ownerEmail, ownerKnown = true) {
  const data = record(post);
  if (postClass(postId, data) === 'official') return 'official';
  const ownerUid = typeof data.userID === 'string' ? data.userID : '';
  return actorClass(ownerUid, null, ownerEmail, ownerKnown);
}

// ---------------------------------------------------------------------------
// Entry labels (§1.2) — bucket for engagement entries, mode for functions-decay entries

/** The digest's knobs when published, the pinned defaults otherwise. */
export function digestKnobs(digest) {
  const knobs = { ...DEFAULT_KNOBS };
  for (const [key, fallback] of Object.entries(DEFAULT_KNOBS)) {
    const value = finite(digest?.knobs?.[key]);
    knobs[key] = value == null ? fallback : value;
  }
  return knobs;
}

const hourlyRate = (perDay, multiplier = 1) => 1 - (1 - perDay) ** (multiplier / 24);

/**
 * Rule 2 of §1.2: classify one decay entry's hourly organic rate by the nearest
 * of {normal, trial ×2..×10, stress}. Uninformative rates are undetermined.
 */
export function decayModeForRate(rate, knobs = DEFAULT_KNOBS) {
  if (!Number.isFinite(rate) || rate <= 0) return { mode: 'undetermined', multiplier: null };
  const candidates = [
    { mode: 'normal', multiplier: 1, rate: hourlyRate(knobs.decayPerDay, 1) },
    ...TRIAL_MULTIPLIERS.map(multiplier => ({ mode: 'trial', multiplier, rate: hourlyRate(knobs.decayPerDay, multiplier) })),
    { mode: 'stress', multiplier: null, rate: 1 - 0.5 ** (1 / knobs.syntheticStressHalfLifeHours) },
  ];
  let best = candidates[0];
  for (const candidate of candidates) if (Math.abs(candidate.rate - rate) < Math.abs(best.rate - rate)) best = candidate;
  return { mode: best.mode, multiplier: best.multiplier };
}

/** Rule 3 of §1.2: the post's own projection fields, written by every decay pass since 4fb73b53. */
export function decayModeFromProjection(post, knobs = DEFAULT_KNOBS) {
  const data = record(post);
  const anchor = finite(data.radiusDecayAnchorMillis);
  const perDay = finite(data.radiusDecayOrganicPerDay);
  if (anchor == null || perDay == null) return { mode: 'undetermined', multiplier: null, anchorMillis: null };
  if (anchor === 0) return { mode: 'stress', multiplier: null, anchorMillis: 0 };
  // radiusDecayOrganicPerDay = 1 − (1 − RATE)^m, so m = ln(1 − perDay) / ln(1 − RATE).
  const multiplier = Math.round(Math.log(1 - Math.min(0.999, Math.max(0, perDay))) / Math.log(1 - knobs.decayPerDay));
  if (multiplier <= 1) return { mode: 'normal', multiplier: 1, anchorMillis: anchor };
  return { mode: 'trial', multiplier, anchorMillis: anchor };
}

function engagementBucket(entry, knobs) {
  const organicDelta = finite(entry.organicDelta) ?? 0;
  const delta = finite(entry.delta) ?? 0;
  const radius = finite(entry.radiusMeters) ?? 0;
  if (organicDelta === 0 && delta !== 0) return 'resync';
  const nearCeiling = radius >= knobs.maxRadiusMeters - 2_000;
  const grant = entry.kind === 'like' ? knobs.likeMeters : entry.kind === 'comment' ? knobs.commentMeters
    : entry.kind === 'view' ? knobs.firstViewMeters : null;
  if (radius >= knobs.maxRadiusMeters) return 'clamped';
  if (entry.kind === 'dislike' && organicDelta > knobs.dislikeMeters && organicDelta < 0) return 'clamped';
  if (grant != null && nearCeiling && organicDelta > 0 && organicDelta < grant) return 'clamped';
  if (entry.kind === 'view') {
    if (organicDelta === knobs.firstViewMeters) return 'first';
    if (organicDelta > 0 && organicDelta < knobs.firstViewMeters) return 'repeat';
  }
  return '—';
}

/**
 * Label one post's entries in atMillis order. Rule 1 (a seed or boost drop
 * between consecutive entries exists only under a trial) beats rule 2 (the
 * entry's own hourly rate against the last decay pass) beats rule 3 (the
 * post's projection fields, for entries at or after the anchor pass). An entry
 * none can decide is `undetermined`, never a guess.
 */
export function labelLedgerEntries(entries, { knobs = DEFAULT_KNOBS, post = null } = {}) {
  const sorted = (Array.isArray(entries) ? entries : []).map(record)
    .sort((a, b) => (finite(a.atMillis) ?? 0) - (finite(b.atMillis) ?? 0));
  const projection = decayModeFromProjection(post, knobs);
  let previous = null;
  let lastDecayAtMillis = null;
  let multiplierSeen = null;
  return sorted.map(entry => {
    const atMillis = finite(entry.atMillis) ?? 0;
    let bucket = '—';
    let decayMode = '—';
    if (entry.cause === 'engagement') {
      bucket = engagementBucket(entry, knobs);
    } else if (entry.cause === 'decay' && entry.writer === 'radiusDecay') {
      decayMode = 'undetermined';
      const seedDrop = previous ? (finite(previous.seedRadiusMeters) ?? 0) - (finite(entry.seedRadiusMeters) ?? 0) : 0;
      const boostDrop = previous ? (finite(previous.boostedRadiusMeters) ?? 0) - (finite(entry.boostedRadiusMeters) ?? 0) : 0;
      if (seedDrop > 0 || boostDrop > 0) {
        decayMode = 'trial';
      } else {
        const organic = finite(entry.organicRadiusMeters) ?? 0;
        const before = organic - (finite(entry.organicDelta) ?? 0);
        const sinceMillis = lastDecayAtMillis ?? (previous ? finite(previous.atMillis) : null);
        const elapsedHours = sinceMillis == null ? 0 : (atMillis - sinceMillis) / 3_600_000;
        if (before >= RATE_FLOOR_ORGANIC_METERS && elapsedHours > 0) {
          const inferred = decayModeForRate((1 - organic / before) / elapsedHours, knobs);
          decayMode = inferred.mode;
          if (inferred.mode === 'trial') multiplierSeen = inferred.multiplier;
        }
        if (decayMode === 'undetermined' && projection.anchorMillis != null && atMillis >= projection.anchorMillis) {
          decayMode = projection.mode;
        }
      }
      lastDecayAtMillis = atMillis;
    }
    previous = entry;
    return { ...entry, bucket, decayMode };
  }).map(entry => (entry.decayMode === 'trial' && multiplierSeen ? { ...entry, trialMultiplierSeen: multiplierSeen } : entry));
}

/**
 * The export's rows for one post: digest labels per entry, the five-valued
 * actor class from the join (resolved by the caller into actorClassByEntryId),
 * and the post's clean flag from the digest when it has one.
 */
export function ledgerRowsForPost({ postId, post, entries, postClass: cls, ownerClass, clean = null, actorClassByEntryId = new Map(), knobs = DEFAULT_KNOBS }) {
  const labelled = labelLedgerEntries(entries, { knobs, post });
  const channelId = text(record(post).channelId, 64);
  const pumped = labelled.some(entry => entry.cause === 'engagement' && (finite(entry.organicDelta) ?? 0) > 0
    && ['owner', 'synthetic', 'unknown'].includes(actorClassByEntryId.get(entry.id) ?? 'unknown'));
  const isClean = typeof clean === 'boolean' ? clean : !pumped;
  return labelled.map(entry => ({
    postId,
    postClass: cls,
    ownerClass,
    clean: isClean,
    channelId,
    entryId: text(entry.id, 120),
    atIso: new Date(finite(entry.atMillis) ?? 0).toISOString(),
    atMillis: finite(entry.atMillis) ?? 0,
    cause: text(entry.cause, 24),
    kind: text(entry.kind, 24),
    actorClass: entry.cause === 'engagement' ? (actorClassByEntryId.get(entry.id) ?? 'unknown') : '—',
    bucket: entry.bucket,
    decayMode: entry.decayMode,
    radiusMeters: finite(entry.radiusMeters) ?? 0,
    organicRadiusMeters: finite(entry.organicRadiusMeters) ?? 0,
    seedRadiusMeters: finite(entry.seedRadiusMeters) ?? 0,
    boostedRadiusMeters: finite(entry.boostedRadiusMeters) ?? 0,
    delta: finite(entry.delta) ?? 0,
    organicDelta: finite(entry.organicDelta) ?? 0,
    writer: text(entry.writer, 40),
  }));
}
