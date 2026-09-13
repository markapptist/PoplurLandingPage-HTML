import { Buffer } from 'node:buffer';

/**
 * Pure policy for the daily algorithm report's proxy side
 * (.codex/algorithm-reports-design.md §5.1): the normalisers for the index
 * document `testControl/algorithmReports` and a body
 * `testControl/algorithmReports/daily/{day}`, the frame projection (≤ 60 rows,
 * never a body), the per-`day@revision` body cache and the day validator the
 * GET route uses. No Firestore, no network; no uid ever leaves (decision 8);
 * nothing here can write a policy document — the report has no writer for one.
 */

export const REPORT_VERSION = 1;
export const REPORT_INDEX_DOC = 'testControl/algorithmReports';
export const REPORT_DAYS_COLLECTION = 'testControl/algorithmReports/daily';
export const REPORT_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const REPORT_BOUNDS = Object.freeze({
  indexRows: 120,
  /** The SSE frame re-broadcasts on every public/presence change: the newest rows only, never a body. */
  frameRows: 60,
  verdicts: 24,
  checks: 8,
  days: 30,
  posts: 50,
  channels: 13,
  metrics: 200,
  epochs: 8,
  gatesPerVerdict: 12,
  evidencePerVerdict: 48,
  /** A body is served once per day@revision and cached; past this it is refused, never zeroed. */
  serializedBytes: 1024 * 1024,
});
/** Bodies are ≈ 100 KB; the cache holds the listed four months plus slack before it evicts its oldest entry. */
export const REPORT_CACHE_ENTRIES = 240;
export const REPORT_DECISIONS = Object.freeze(['suggest', 'verify', 'none']);
export const REPORT_VERDICTS = Object.freeze(['insufficient', 'hold', 'suggest', 'verify']);
export const REPORT_DIRECTIONS = Object.freeze(['lower', 'raise']);
/** The hold reasons the generator counts as `fixed` (algorithmReportRules.ts FIXED_REASONS). */
export const REPORT_FIXED_REASONS = Object.freeze(['owner-fixed', 'paid', 'ui', 'simulation', 'rank-only', 'finding', 'experiment-switch']);
const KNOB_PATTERN = /^K(?:[1-9]|1[0-7])$/;

// A report is a memo: its first line, sentence and arithmetic strings run to a
// few hundred characters, its metric table to ≈ 110 keys and its day-CSV column
// list past a hundred names, so the caps sit well above the digest's.
const MAX_DEPTH = 12;
const MAX_KEYS = 256;
const MAX_ITEMS = 512;
const MAX_TEXT = 2_000;
const MAX_RADIUS_METERS = 6_371_000;

const text = (value, maximum = MAX_TEXT) => (typeof value === 'string'
  ? value.trim().replace(/\s+/g, ' ').slice(0, maximum)
  : '');

/** A finite number or null — never a zero-fill: `Number(null)` is 0, and a null seen value must stay unseen. */
const finite = value => {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const integer = (value, maximum = Number.MAX_SAFE_INTEGER, minimum = 0) => {
  const parsed = finite(value);
  return parsed == null ? minimum : Math.max(minimum, Math.min(maximum, Math.trunc(parsed)));
};

const record = value => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value);
const arrayOf = (value, limit) => (Array.isArray(value) ? value.slice(0, limit) : []);
const recordsOf = (value, limit) => arrayOf(value, limit).filter(isRecord);
const nullableText = (value, maximum) => (typeof value === 'string' && value ? text(value, maximum) : null);
const serializedBytes = value => Buffer.byteLength(JSON.stringify(value), 'utf8');

/** "YYYY-MM-DD" that names a real calendar day; anything else is null (the route answers 400). */
export function parseReportDay(value) {
  if (typeof value !== 'string' || !REPORT_DAY_PATTERN.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return value;
}

/** Metres clamp to ± the world radius, times to ≥ 0, everything else to the safe range (the digest normaliser's rule). */
function clampNumber(value, key) {
  const parsed = typeof value === 'number' && !Number.isNaN(value) ? value : finite(value);
  if (parsed == null) return 0;
  if (/(meters|gain|loss|delta)$/i.test(key)) return Math.max(-MAX_RADIUS_METERS, Math.min(MAX_RADIUS_METERS, parsed));
  if (/(millis|ms|at)$/i.test(key)) return Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, parsed));
  return Math.max(-Number.MAX_SAFE_INTEGER, Math.min(Number.MAX_SAFE_INTEGER, parsed));
}

/**
 * Identity discipline (decision 8, test 20): the generator strips
 * `realActorEntries` and masks every owner uid before a report is written, so
 * a key of either kind arriving here is a defect upstream — it is dropped or
 * reduced to set/unset rather than forwarded to the page or a CSV.
 */
const IDENTITY_KEY = 'realActorEntries';
const UID_KEY = /uids?$/i;
const maskUid = value => (value === 'set' || value === 'unset' || value === '' ? value : 'set');

function sanitize(value, key, depth) {
  if (typeof value === 'string') return UID_KEY.test(key) ? maskUid(value) : text(value);
  if (typeof value === 'number') return clampNumber(value, key);
  if (typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) {
    // A list under a uid key (realActorUids) is published as its count, the way the generator prints `M3.actors`.
    if (UID_KEY.test(key)) return value.length;
    if (depth >= MAX_DEPTH) return [];
    return value.slice(0, MAX_ITEMS).map(item => sanitize(item, key, depth + 1));
  }
  if (value && typeof value === 'object') {
    if (depth >= MAX_DEPTH) return {};
    // A Firestore Timestamp that slipped into the document reads as millis.
    if (typeof value.toMillis === 'function') return clampNumber(value.toMillis(), 'Millis');
    const out = {};
    for (const [childKey, child] of Object.entries(value).slice(0, MAX_KEYS)) {
      if (child === undefined || typeof child === 'function' || childKey === IDENTITY_KEY) continue;
      out[childKey] = sanitize(child, childKey, depth + 1);
    }
    return out;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The index (§1.8)

const knobId = value => (typeof value === 'string' && KNOB_PATTERN.test(value) ? value : null);

const counts = value => {
  const raw = record(value);
  return {
    suggest: integer(raw.suggest, 64),
    verify: integer(raw.verify, 64),
    hold: integer(raw.hold, 64),
    insufficient: integer(raw.insufficient, 64),
    fixed: integer(raw.fixed, 64),
  };
};

function indexRow(raw) {
  const row = record(raw);
  const day = parseReportDay(row.day);
  if (!day) return null;
  const knob = knobId(row.knob);
  const to = finite(row.to);
  let decision = REPORT_DECISIONS.includes(row.decision) ? row.decision : 'none';
  // A row that says "suggest" without a knob and a value names nothing the owner could decide on.
  if (decision === 'suggest' && (knob == null || to == null)) decision = 'none';
  return {
    day,
    generatedAtMillis: integer(row.generatedAtMillis),
    digestVersion: integer(row.digestVersion),
    revision: integer(row.revision, 1_000_000, 1),
    partial: row.partial === true,
    backfilled: row.backfilled === true,
    catchUp: row.catchUp === true,
    trialOn: row.trialOn === true,
    trialMultiplier: finite(row.trialMultiplier),
    decision,
    knob: decision === 'suggest' ? knob : null,
    to: decision === 'suggest' ? to : null,
    counts: counts(row.counts),
    productionEpoch: text(row.productionEpoch, 16),
    sourcePolicyVersion: text(row.sourcePolicyVersion, 16),
    bytes: integer(row.bytes),
    staleData: row.staleData === true,
  };
}

/**
 * The index document: rows typed, one per day (the highest revision wins),
 * newest first, ≤ 120. A missing document is null; another schema major is
 * reported, never rendered as an empty list.
 */
export function normalizeReportIndex(raw) {
  if (!isRecord(raw)) return null;
  const version = finite(raw.version);
  if (version !== REPORT_VERSION) return { version: version == null ? null : Math.trunc(version), unsupportedVersion: true };
  const byDay = new Map();
  for (const candidate of arrayOf(raw.days, REPORT_BOUNDS.indexRows * 2)) {
    const row = indexRow(candidate);
    if (!row) continue;
    const existing = byDay.get(row.day);
    if (!existing || row.revision > existing.revision) byDay.set(row.day, row);
  }
  const days = [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day)).slice(0, REPORT_BOUNDS.indexRows);
  return {
    version: REPORT_VERSION,
    lastReportedDay: parseReportDay(raw.lastReportedDay),
    updatedAtMillis: integer(raw.updatedAtMillis),
    runId: text(raw.runId, 120),
    days,
  };
}

/** What rides the SSE frame: the newest 60 rows and the scalars — a refusal passes through so the page can say why. */
export function reportIndexFrame(index) {
  if (!isRecord(index)) return null;
  if (index.unsupportedVersion === true) return { version: index.version ?? null, unsupportedVersion: true };
  return {
    version: REPORT_VERSION,
    lastReportedDay: index.lastReportedDay ?? null,
    updatedAtMillis: integer(index.updatedAtMillis),
    runId: text(index.runId, 120),
    days: arrayOf(index.days, REPORT_BOUNDS.frameRows),
  };
}

/** The revision the index lists for a day, or null when the day is not listed (older than 120 rows, or no index yet). */
export function reportRevisionListed(index, day) {
  if (!isRecord(index) || !Array.isArray(index.days)) return null;
  const row = index.days.find(candidate => candidate && candidate.day === day);
  return row ? integer(row.revision, 1_000_000, 1) : null;
}

// ---------------------------------------------------------------------------
// The body (§1.2–§1.7)

const refusal = (raw, extra) => ({
  version: REPORT_VERSION,
  day: parseReportDay(raw.day),
  revision: integer(raw.revision, 1_000_000, 1),
  digestVersion: integer(raw.digestVersion),
  ...extra,
});

function gateRow(raw) {
  const gate = record(raw);
  return {
    id: text(gate.id, 32),
    label: text(gate.label, 240),
    n: integer(gate.n),
    minN: integer(gate.minN),
    // Only the document's own flag is sufficient; a missing or non-boolean one never is.
    sufficient: gate.sufficient === true,
    basis: text(gate.basis, 240),
    ...(typeof gate.note === 'string' && gate.note ? { note: text(gate.note, 240) } : {}),
  };
}

function suggestionRow(raw) {
  if (!isRecord(raw)) return null;
  const from = finite(raw.from);
  const to = finite(raw.to);
  if (from == null || to == null || !REPORT_DIRECTIONS.includes(raw.direction)) return null;
  return {
    from,
    to,
    step: finite(raw.step) ?? 0,
    direction: raw.direction,
    ruleId: text(raw.ruleId, 24),
    rationale: text(raw.rationale, 600),
    respects: arrayOf(raw.respects, 8).filter(item => typeof item === 'string').map(item => text(item, 120)),
  };
}

/**
 * One verdict row, typed. The invariant of decision 14 is enforced here a
 * third time (generator, web normaliser, proxy): a value of the knob's own kind
 * — a `suggestion` or a deferred `to` — is kept only on a row every named gate
 * clears; otherwise the row is `insufficient/gate` with the value dropped and
 * `normaliserDropped` naming what went. A row with no gate at all names
 * nothing that could clear, so it can carry no value either (the conservative
 * reading: harder to suggest, never easier).
 */
function verdictRow(raw) {
  const row = record(sanitize(raw, '', 1));
  const knob = knobId(row.knob);
  if (!knob) return null;
  const gates = recordsOf(row.gates, REPORT_BOUNDS.gatesPerVerdict).map(gateRow);
  const admissible = gates.length > 0 && gates.every(gate => gate.sufficient);
  let verdict = REPORT_VERDICTS.includes(row.verdict) ? row.verdict : 'insufficient';
  let reason = text(row.reason, 40);
  let reasonText = text(row.reasonText, 600);
  let suggestion = suggestionRow(row.suggestion);
  let deferred = isRecord(row.deferred) && finite(row.deferred.to) != null ? { to: finite(row.deferred.to), ruleId: text(row.deferred.ruleId, 24) } : null;
  const dropped = [];
  // The generator's own line: a suggestion on anything but an admissible `suggest` row makes the row insufficient/gate.
  if (suggestion && !(verdict === 'suggest' && admissible)) { suggestion = null; dropped.push('suggestion'); }
  if (verdict === 'suggest' && !suggestion && !dropped.length) dropped.push('suggest-without-suggestion');
  if (deferred && !admissible) { deferred = null; dropped.push('deferred'); }
  if (dropped.length) {
    verdict = 'insufficient'; reason = 'gate';
    reasonText = `insufficient evidence — a ${dropped.join(' and ')} arrived under an insufficient gate and was dropped by the proxy normaliser`
      + (reasonText ? ` (document said: ${reasonText})` : '');
  }
  return {
    ...row,
    knob,
    name: text(row.name, 80),
    tunable: row.tunable === true,
    declaredValue: finite(row.declaredValue),
    unit: nullableText(row.unit, 16),
    seenValue: finite(row.seenValue),
    seenN: integer(row.seenN),
    seenBasis: text(row.seenBasis, 120),
    productionPays: finite(row.productionPays),
    where: text(row.where, 240),
    deploy: arrayOf(row.deploy, 8).filter(item => typeof item === 'string'),
    gates,
    evidence: recordsOf(row.evidence, REPORT_BOUNDS.evidencePerVerdict),
    verdict,
    reason,
    reasonText,
    rule: isRecord(row.rule) ? { id: text(row.rule.id, 24), text: text(row.rule.text, 600), inputs: record(row.rule.inputs) } : null,
    arithmetic: nullableText(row.arithmetic, 800),
    suggestion,
    deferred,
    curveAtSuggested: isRecord(row.curveAtSuggested) ? row.curveAtSuggested : null,
    curveCurrent: isRecord(row.curveCurrent) ? row.curveCurrent : null,
    frozenUntilDay: parseReportDay(row.frozenUntilDay),
    previous: isRecord(row.previous) ? row.previous : null,
    outcome: nullableText(row.outcome, 32),
    outcomeNote: nullableText(row.outcomeNote, 400),
    openSinceDay: parseReportDay(row.openSinceDay),
    withdrawnDay: parseReportDay(row.withdrawnDay),
    ...(dropped.length ? { normaliserDropped: dropped } : {}),
  };
}

function decisionRow(raw, verdicts, droppedKnobs, day) {
  const decision = record(raw);
  let open = recordsOf(decision.open, 4).map(item => ({
    knob: knobId(item.knob),
    to: finite(item.to),
    ruleId: text(item.ruleId, 24),
    openSinceDay: parseReportDay(item.openSinceDay),
    outcome: nullableText(item.outcome, 32),
    missedReports: integer(item.missedReports, 64),
  })).filter(item => item.knob && item.to != null);
  let kind = REPORT_DECISIONS.includes(decision.kind) ? decision.kind : 'none';
  let knob = knobId(decision.knob);
  let sentence = text(decision.sentence, 1_200);
  let action = isRecord(decision.action) && finite(decision.action.to) != null
    ? { where: text(decision.action.where, 240), from: finite(decision.action.from), to: finite(decision.action.to), unit: nullableText(decision.action.unit, 16), deploy: arrayOf(decision.action.deploy, 8).filter(item => typeof item === 'string') }
    : null;
  let productionPays = isRecord(decision.productionPays)
    ? { knob: knobId(decision.productionPays.knob), value: finite(decision.productionPays.value), n: integer(decision.productionPays.n), basis: text(decision.productionPays.basis, 120) }
    : null;
  let downgraded = false;
  if (kind === 'suggest') {
    const row = verdicts.find(candidate => candidate.knob === knob);
    // The card may restate an OPEN suggestion from an earlier report whose row
    // is hold/open or even insufficient/trial (§2.5: restated, never
    // re-derived) — an `open` entry older than this day. An entry opened THIS
    // day is the row's own suggestion listed on the card, so once that row
    // lost its value the entry goes with it, and the card says NO SUGGESTION.
    const restatedOpen = open.some(item => item.knob === knob && item.openSinceDay != null && day != null && item.openSinceDay < day);
    if (!row || knob == null || (row.verdict !== 'suggest' && !restatedOpen)) {
      downgraded = true;
      sentence = `NO SUGGESTION. The document named ${knob ?? 'no knob'} but that row carries no admissible suggestion — dropped by the proxy normaliser: a suggestion under an insufficient gate is never shown. Nothing is applied by this report; production pays what the SEEN column shows until you deploy.`;
      open = open.filter(item => !(item.knob === knob && item.openSinceDay === day));
      kind = 'none'; knob = null; action = null; productionPays = null;
    }
  }
  if (kind !== 'suggest') { knob = null; action = null; productionPays = null; }
  const deferredRows = recordsOf(decision.deferred, 8)
    .map(item => ({ knob: knobId(item.knob), to: finite(item.to), ruleId: text(item.ruleId, 24) }))
    // A deferred entry stands only while its row still carries the deferred value.
    .filter(item => item.knob && item.to != null && verdicts.some(row => row.knob === item.knob && row.deferred && row.deferred.to === item.to));
  return {
    decision: {
      kind,
      knob,
      sentence,
      // Literal, never read from the document: this report applies nothing.
      appliedByReport: false,
      productionPays,
      action,
      deferred: deferredRows,
      open,
      counts: counts(decision.counts),
      ownerQuestion: nullableText(decision.ownerQuestion, 240),
      ...(droppedKnobs.length ? { normaliserDropped: droppedKnobs } : {}),
    },
    downgraded,
  };
}

const verdictCountsOf = verdicts => {
  const out = { suggest: 0, verify: 0, hold: 0, insufficient: 0, fixed: 0 };
  for (const row of verdicts) {
    if (row.verdict === 'hold' && REPORT_FIXED_REASONS.includes(row.reason)) out.fixed += 1;
    else if (row.verdict in out) out[row.verdict] += 1;
  }
  return out;
};

/** A rate: a derived ratio or a per-unit figure. Its value is null below its gate (§1.7's metric rule). */
const isRate = unit => unit === 'ratio' || (typeof unit === 'string' && unit.includes('/'));

function metricRow(id, raw) {
  const row = record(raw);
  const gate = isRecord(row.gate) ? gateRow(row.gate) : null;
  const unit = text(row.unit, 16);
  const value = finite(row.value);
  return {
    ...row,
    id: text(row.id, 48) || id,
    value: gate && !gate.sufficient && isRate(unit) ? null : value,
    unit,
    n: finite(row.n),
    gate,
    window: text(row.window, 16),
    population: text(row.population, 64),
    basis: text(row.basis, 240),
    numerator: finite(row.numerator),
    denominator: finite(row.denominator),
  };
}

function evidenceBlock(parsed) {
  const evidence = record(sanitize(parsed, 'evidence', 1));
  const metrics = {};
  for (const [id, row] of Object.entries(record(evidence.metrics)).slice(0, REPORT_BOUNDS.metrics)) metrics[id] = metricRow(id, row);
  const snapshots = isRecord(evidence.snapshots) ? evidence.snapshots : null;
  if (snapshots && isRecord(snapshots.contamination) && isRecord(snapshots.contamination.d7)) {
    snapshots.contamination = { ...snapshots.contamination, d7: { ...snapshots.contamination.d7, posts: recordsOf(snapshots.contamination.d7.posts, 20) } };
  }
  return {
    day: record(evidence.day),
    windows: record(evidence.windows),
    days: recordsOf(evidence.days, REPORT_BOUNDS.days),
    observedOnDay: record(evidence.observedOnDay),
    observed7d: record(evidence.observed7d),
    posts: recordsOf(evidence.posts, REPORT_BOUNDS.posts).filter(post => typeof post.postId === 'string' && post.postId),
    channels: recordsOf(evidence.channels, REPORT_BOUNDS.channels),
    snapshots,
    metrics,
  };
}

/**
 * Version gate, evidence parse, bounds, the gate invariant and the size guard
 * for one report body. A missing document is null; another schema major, an
 * unreadable `evidence` string and a body still over 1 MiB after the
 * generator's own trim order are each a refusal shape — never zero-filled.
 */
export function normalizeAlgorithmReport(raw) {
  if (!isRecord(raw)) return null;
  const version = finite(raw.version);
  if (version !== REPORT_VERSION) return { version: version == null ? null : Math.trunc(version), unsupportedVersion: true };
  if (typeof raw.evidence !== 'string') return refusal(raw, { unreadableEvidence: true });
  let parsed;
  try { parsed = JSON.parse(raw.evidence); } catch { return refusal(raw, { unreadableEvidence: true }); }
  if (!isRecord(parsed)) return refusal(raw, { unreadableEvidence: true });

  const { evidence: _evidenceString, ...structuredRaw } = raw;
  const structured = record(sanitize(structuredRaw, '', 0));
  const verdicts = recordsOf(raw.verdicts, REPORT_BOUNDS.verdicts).map(verdictRow).filter(Boolean);
  const droppedKnobs = verdicts.filter(row => row.normaliserDropped).map(row => row.knob);
  const day = parseReportDay(raw.day);
  const { decision, downgraded } = decisionRow(raw.decision, verdicts, droppedKnobs, day);
  const headline = record(structured.headline);
  const report = {
    ...structured,
    version: REPORT_VERSION,
    digestSchema: integer(raw.digestSchema),
    day,
    timeZone: text(raw.timeZone, 40),
    dayStartMillis: integer(raw.dayStartMillis),
    dayEndMillis: integer(raw.dayEndMillis),
    generatedAtMillis: integer(raw.generatedAtMillis),
    runId: text(raw.runId, 120),
    digestVersion: integer(raw.digestVersion),
    revision: integer(raw.revision, 1_000_000, 1),
    supersedes: isRecord(structured.supersedes) ? structured.supersedes : null,
    partial: raw.partial === true,
    backfilled: raw.backfilled === true,
    catchUp: raw.catchUp === true,
    snapshotsAsOfMillis: finite(raw.snapshotsAsOfMillis) == null ? null : integer(raw.snapshotsAsOfMillis),
    productionEpoch: text(raw.productionEpoch, 16),
    sourcePolicyVersion: text(raw.sourcePolicyVersion, 16),
    knobsHash: text(raw.knobsHash, 16),
    ruleSetVersion: text(raw.ruleSetVersion, 16),
    trialOnDay: raw.trialOnDay === true,
    trialMultiplierOnDay: finite(raw.trialMultiplierOnDay),
    primarySuggestion: downgraded ? null : decision.kind === 'suggest' ? decision.knob : knobId(raw.primarySuggestion),
    verdictCounts: droppedKnobs.length ? verdictCountsOf(verdicts) : counts(raw.verdictCounts),
    bytes: integer(raw.bytes),
    firstLine: text(raw.firstLine, 600),
    headline: { ...headline, coverage: { ...record(headline.coverage), trimmed: record(headline.coverage).trimmed === true } },
    decision,
    policy: record(structured.policy),
    verdicts,
    checks: recordsOf(structured.checks, REPORT_BOUNDS.checks),
    previous: isRecord(structured.previous) ? structured.previous : null,
    previousUnavailable: nullableText(raw.previousUnavailable, 32),
    epochs: recordsOf(structured.epochs, REPORT_BOUNDS.epochs),
    csvColumns: Object.fromEntries(Object.entries(record(structured.csvColumns)).map(([table, columns]) => [
      table, arrayOf(columns, MAX_ITEMS).filter(column => typeof column === 'string' && column && !column.startsWith(IDENTITY_KEY)),
    ])),
    evidence: evidenceBlock(parsed),
  };
  if (droppedKnobs.length) report.decision.counts = report.verdictCounts;

  if (serializedBytes(report) > REPORT_BOUNDS.serializedBytes) {
    // guardReport's order (§1.7): halve posts, days to 14, drop contamination
    // posts, drop the per-post day rows. The trim is stamped so the page says so.
    const evidence = report.evidence;
    evidence.posts = evidence.posts.slice(0, Math.ceil(evidence.posts.length / 2));
    if (serializedBytes(report) > REPORT_BOUNDS.serializedBytes) evidence.days = evidence.days.slice(-14);
    if (serializedBytes(report) > REPORT_BOUNDS.serializedBytes && evidence.snapshots?.contamination?.d7) evidence.snapshots.contamination.d7.posts = [];
    if (serializedBytes(report) > REPORT_BOUNDS.serializedBytes) {
      evidence.posts = evidence.posts.map(({ dayGain: _dayGain, rk: _rk, ...rest }) => rest);
    }
    report.headline.coverage.trimmed = true;
    if (serializedBytes(report) > REPORT_BOUNDS.serializedBytes) return refusal(raw, { oversize: true });
  }
  return report;
}

/** True for the three refusal shapes the normalisers emit (the page says why; nothing is rendered as zeros). */
export const isReportRefusal = value => isRecord(value)
  && (value.unsupportedVersion === true || value.oversize === true || value.unreadableEvidence === true);

// ---------------------------------------------------------------------------
// The body cache (§5.1)

export const reportCacheKey = (day, revision) => `${day}@${revision}`;

/**
 * Bodies cached per `day@revision` for the process lifetime: a report is
 * immutable per revision, so a hit costs 0 reads; the index's revision for the
 * day is the authority, and a higher one evicts the entry. A day the index does
 * not list (older than its 120 rows, or no index yet) serves whatever revision
 * is cached — amendments reach back seven days only (§2.4), so an unlisted day
 * cannot change under the cache.
 */
export function createReportCache({ limit = REPORT_CACHE_ENTRIES } = {}) {
  const entries = new Map();
  let sequence = 0;
  const evictOldest = () => {
    let oldestDay = null;
    let oldestAt = Number.POSITIVE_INFINITY;
    for (const [day, entry] of entries) if (entry.storedAt < oldestAt) { oldestAt = entry.storedAt; oldestDay = day; }
    if (oldestDay != null) entries.delete(oldestDay);
  };
  return {
    limit,
    store(day, revision, report) {
      const key = parseReportDay(day);
      const rev = integer(revision, 1_000_000, 1);
      if (!key || !isRecord(report)) return false;
      const existing = entries.get(key);
      if (existing && existing.revision > rev) return false;
      entries.set(key, { revision: rev, report, storedAt: ++sequence });
      while (entries.size > limit) evictOldest();
      return true;
    },
    lookup(day, listedRevision = null) {
      const entry = entries.get(day);
      if (!entry) return null;
      if (listedRevision != null && entry.revision < integer(listedRevision, 1_000_000, 1)) { entries.delete(day); return null; }
      return entry.report;
    },
    has(day, revision) {
      const entry = entries.get(day);
      return !!entry && entry.revision === integer(revision, 1_000_000, 1);
    },
    revision(day) { return entries.get(day)?.revision ?? null; },
    keys() { return [...entries.entries()].map(([day, entry]) => reportCacheKey(day, entry.revision)); },
    size() { return entries.size; },
    clear() { entries.clear(); },
  };
}
