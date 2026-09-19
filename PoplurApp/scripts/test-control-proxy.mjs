import { createServer } from 'node:http';
import { Buffer } from 'node:buffer';
import { mkdirSync, readFileSync } from 'node:fs';
import { rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import {
  aggregateRealtimePublicPosts,
  applyRealtimeRadiusBaselines,
  normalizeRealtimePublicSnapshot,
} from './realtime-public-post-policy.mjs';
import {
  LEDGER_EXPORT_ENTRY_LIMIT,
  actorClass,
  createLedgerReadBudget,
  digestKnobs,
  estimateLedgerExport,
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
import {
  REPORT_DAYS_COLLECTION,
  REPORT_INDEX_DOC,
  createReportCache,
  isReportRefusal,
  normalizeAlgorithmReport,
  normalizeReportIndex,
  parseReportDay,
  reportRevisionListed,
} from './algorithm-report-policy.mjs';
import {
  BETA_ANCHOR_HIDDEN_POSTS,
  BETA_CACHE_MS,
  BETA_LIKES_PER_POP,
  BETA_POSTS_PER_USER,
  BETA_READ_CAP,
  BETA_READ_RESERVE,
  betaAccountClass,
  dayKeyOffset,
  emptySightings,
  engagementDaysToCount,
  foldBetaMetrics,
  hiddenPostIdsForAnchor,
  humanUidChunks,
  isHumanPop,
  markCountedThrough,
  normalizeSightings,
  pruneSightings,
  recordSighting,
  recordSightingDay,
  torontoDayBounds,
} from './beta-metrics-policy.mjs';
import {
  PRESENCE_LEASE_MS,
  createLiveDashboardState,
  createLiveRefreshScheduler,
  liveStreamOpenPlan,
  parseRefreshFloorMs,
} from './test-control-live-state.mjs';
import { isAuthorizedTestControlMutation, validateOnboardingCommand } from './synthetic-onboarding-actions.mjs';
import { validateRunnerCommand } from './synthetic-live-actions.mjs';

const host = '127.0.0.1';
const port = boundedPort(process.env.POPLUR_TEST_CONTROL_PORT, 8096);
const credential = process.env.POPLUR_TEST_CONTROL_TOKEN || '';
const localRunnerCredential = process.env.POPLUR_RUNNER_LOCAL_TOKEN || credential;
const runnerPort = boundedPort(process.env.POPLUR_SYNTHETIC_RUNNER_PORT, 8097);
const functionURL = 'https://us-central1-poplur2025.cloudfunctions.net/testActivityControl';
const controlRoomOrigin = 'http://127.0.0.1:8084';
// postHistory is the tester table's drill-down: one post's radius ledger;
// testerPosts is a row's lazy post list (≤ 24 reads on expand).
const allowedActions = new Set(['dashboard', 'runner', 'postHistory', 'testerPosts']);
// Watcher-triggered cloud `dashboard` calls run at most once per floor. Every
// Firestore change in a watched window used to become a full ≈ 516-read call
// after a 100 ms debounce: a lab hour alone was ≈ 93k reads (11 Sep). The
// public frame, the digest and presence are exempt — they are local data the
// watchers already paid for.
const LIVE_REFRESH_MIN_MS = parseRefreshFloorMs(process.env.POPLUR_LIVE_REFRESH_MIN_MS);
// The presence query's lower bound is fixed at issue time, so it is re-issued
// every minute; a lease that lapsed since is filtered at merge time.
const PRESENCE_REISSUE_MS = 60_000;
const ledgerReadBudget = createLedgerReadBudget();
// Report bodies per day@revision for the process lifetime (reports design
// §5.1): the first open of a day costs 1 read against the same 25k/day ledger
// budget, every later open 0; a higher revision in the index evicts.
const reportCache = createReportCache();
let liveSignupTicker = null;
// Set while the cloud switch is failing. Every reconnect re-earns LIVE with a
// fresh dashboard call, so a failing upstream must not be hammered at the
// 1.5 s reconnect cadence: 40 calls/min starved Cloud Run's instance
// admission while it recovered from a spend cap (11 Sep).
let liveUpstreamFailedAtMs = 0;
const actorPattern = '[a-zA-Z0-9._:-]+';
const maxBodyBytes = 16 * 1024;
const liveClients = new Set();
const productionRequests = new Map();
const publicSnapshotWaiters = new Set();
const liveState = createLiveDashboardState();
const liveRadiusBaselines = new Map();
let liveWatchers = [];
let liveWatchersStarted = false;
let liveFirestore = null;
// One broadcast per debounce window for local-only changes (public frame,
// presence): re-folds the last private dashboard, never calls the cloud.
let liveLocalBroadcastTimer = null;
const liveRefresh = createLiveRefreshScheduler({ minIntervalMs: LIVE_REFRESH_MIN_MS, run: refreshLiveDashboard });
let onboardingQuarantine = false;
let onboardingActive = false;
// The Beta tab's sightings ledger (beta-metrics-policy.mjs): every presence
// lease, tester heartbeat, sign-in and token refresh the desk sees, by uid
// and Toronto day, so retention can be answered for days Firestore keeps no
// history of. Lives beside the proxy log, never in the repo; simulation uids
// never enter it.
const betaSightingsPath = process.env.POPLUR_BETA_SIGHTINGS_PATH
  || join(process.env.HOME || homedir(), '.poplur', 'beta-sightings.json');
const betaSightings = loadBetaSightings(betaSightingsPath);
let betaSightingsSaveTimer = null;
// One computed Beta result per BETA_CACHE_MS; `?refresh=1` recomputes.
let betaCache = { atMs: 0, result: null, reads: 0 };
let betaInFlight = null;

if (!credential) {
  throw new Error('POPLUR_TEST_CONTROL_TOKEN is required. Keep it in the local machine keychain; never put it in the web bundle.');
}
if (!localRunnerCredential) {
  throw new Error('POPLUR_RUNNER_LOCAL_TOKEN is required for the local synthetic-runner bridge.');
}

function boundedPort(value, fallback) {
  const resolved = Number(value || fallback);
  if (!Number.isInteger(resolved) || resolved < 1024 || resolved > 65_535) throw new Error('Local beta desk port is invalid.');
  return resolved;
}

function responseHeaders(origin = '', contentType = 'application/json; charset=utf-8') {
  return {
    ...(origin === controlRoomOrigin ? { 'access-control-allow-origin': controlRoomOrigin } : {}),
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'cache-control': 'no-store',
    'content-type': contentType,
    vary: 'Origin',
  };
}

/** Firestore REST value → plain JSON (the scorecard is numbers, strings, arrays and maps). */
function decodeFirestoreValue(value) {
  if (!value || typeof value !== 'object') return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue === true;
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return Date.parse(value.timestampValue) || null;
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(decodeFirestoreValue);
  if ('mapValue' in value) return decodeFirestoreFields(value.mapValue.fields ?? {});
  return null;
}
function decodeFirestoreFields(fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields)) out[key] = decodeFirestoreValue(value);
  return out;
}

function sendJSON(response, status, origin, body) {
  response.writeHead(status, responseHeaders(origin));
  response.end(JSON.stringify(body));
}

function sendLiveEvent(response, body) {
  response.write(`data: ${JSON.stringify(body)}\n\n`);
}

function closeLiveClients() {
  for (const response of liveClients) response.end();
  liveClients.clear();
}

function resetLiveWatchers() {
  const watchers = liveWatchers;
  liveWatchers = [];
  liveWatchersStarted = false;
  liveFirestore = null;
  liveRadiusBaselines.clear();
  liveState.reset();
  liveRefresh.cancel();
  if (liveLocalBroadcastTimer) clearTimeout(liveLocalBroadcastTimer);
  liveLocalBroadcastTimer = null;
  for (const waiter of publicSnapshotWaiters) {
    clearTimeout(waiter.timeout);
    waiter.reject(new Error('Production snapshot wait was cancelled.'));
  }
  publicSnapshotWaiters.clear();
  for (const unsubscribe of watchers) {
    try { unsubscribe(); } catch { /* already closed */ }
  }
  closeLiveClients();
}

function acceptPublicDocuments(documents) {
  if (onboardingQuarantine) return;
  const normalized = normalizeRealtimePublicSnapshot(documents);
  const posts = applyRealtimeRadiusBaselines(normalized.posts, liveRadiusBaselines);
  liveState.acceptPublic({
    posts,
    cells: aggregateRealtimePublicPosts(posts),
    feed: normalized.feed,
  });
  for (const waiter of publicSnapshotWaiters) {
    clearTimeout(waiter.timeout);
    waiter.resolve();
  }
  publicSnapshotWaiters.clear();
}

async function ensurePublicSnapshot() {
  if (onboardingQuarantine) throw new Error('Production dashboard is quarantined during first-user onboarding.');
  startLiveWatchers();
  if (liveState.isPublicReady()) return;
  if (!liveFirestore) throw new Error('The private Firestore stream is unavailable.');
  await new Promise((resolve, reject) => {
    const waiter = {
      resolve,
      reject,
      timeout: setTimeout(() => {
        publicSnapshotWaiters.delete(waiter);
        reject(new Error('The initial production snapshot did not arrive in time.'));
      }, 12_000),
    };
    publicSnapshotWaiters.add(waiter);
    // The first listener event can settle between the readiness check above
    // and waiter registration. Resolve that race without issuing a separate
    // unary Firestore read that could outlive onboarding quarantine.
    if (liveState.isPublicReady()) {
      publicSnapshotWaiters.delete(waiter);
      clearTimeout(waiter.timeout);
      resolve();
    }
  });
  if (onboardingQuarantine || !liveState.isPublicReady()) {
    throw new Error('Production snapshot was cancelled before it became ready.');
  }
}

function broadcastLiveDashboard(result) {
  liveState.cache(result);
  for (const response of [...liveClients]) {
    if (response.destroyed || response.writableEnded) liveClients.delete(response);
    else sendLiveEvent(response, { result });
  }
}

/** The scheduler's run(): 'called' stamps the refresh floor, 'skipped' never does. */
async function refreshLiveDashboard() {
  if (onboardingQuarantine || !liveState.isPublicReady()) return 'skipped';
  try {
    const combined = liveState.combine(await callCloudControl({ action: 'dashboard' }));
    liveUpstreamFailedAtMs = 0;
    if (!onboardingQuarantine && combined) broadcastLiveDashboard(combined);
  } catch {
    // The cloud switch failed. Keep the Firestore watchers and the public
    // snapshot (both still valid) and drop only the cached dashboard, then
    // close the clients so the desk shows OFFLINE and earns LIVE again from
    // the next successful cloud call. Tearing the watchers down here cost
    // ~460 document reads per reconnect: ~400k reads an hour for the five
    // hours of the 11 Sep outage. A watcher that itself fails still goes
    // through resetLiveWatchers via its error callback.
    liveUpstreamFailedAtMs = Date.now();
    liveState.cache(null);
    closeLiveClients();
  }
  return 'called';
}

function scheduleLiveDashboardRefresh(delay = 100) {
  if (onboardingQuarantine) return;
  liveRefresh.schedule(delay);
}

/** Re-broadcast the last private dashboard with fresh local data — no cloud call. */
function scheduleLocalBroadcast(delay = 100) {
  if (onboardingQuarantine || liveLocalBroadcastTimer) return;
  liveLocalBroadcastTimer = setTimeout(() => {
    liveLocalBroadcastTimer = null;
    if (onboardingQuarantine) return;
    const frame = liveState.recombine();
    if (frame) broadcastLiveDashboard(frame);
  }, delay);
}

function adminApp() {
  return getApps()[0] ?? initializeApp({
    credential: applicationDefault(),
    projectId: 'poplur2025',
  });
}

/**
 * Ninth watcher: foreground leases (120 s, fn/appPresence.ts:7). The query's
 * `activeUntil > now` bound is fixed when it is issued, so it is re-issued
 * every minute; each snapshot merges "online" into the tester rows locally,
 * because behind the refresh floor a two-minute visit would never show and
 * "online" would linger for five minutes after a tester left.
 */
function startPresenceWatcher(firestore, presenceChanged, failed) {
  let unsubscribe = null;
  const issue = () => {
    if (unsubscribe) {
      try { unsubscribe(); } catch { /* already closed */ }
    }
    // No .select(): Firestore refuses projections on real-time listeners
    // ("'select' clauses are not supported for real-time queries"), and the
    // error path tears down every watcher. Lease documents are three fields.
    unsubscribe = firestore.collection('appPresenceSessions')
      .where('activeUntil', '>', Timestamp.fromMillis(Date.now()))
      .onSnapshot(presenceChanged, failed);
  };
  issue();
  const timer = setInterval(issue, PRESENCE_REISSUE_MS);
  return () => {
    clearInterval(timer);
    if (unsubscribe) unsubscribe();
  };
}

function startLiveWatchers() {
  if (onboardingQuarantine || liveWatchersStarted) return;
  liveWatchersStarted = true;
  try {
    const firestore = getFirestore(adminApp());
    liveFirestore = firestore;
    const changed = () => scheduleLiveDashboardRefresh();
    const failed = error => {
      console.error('live watcher failed:', error?.message ?? error);
      resetLiveWatchers();
    };
    const publicPostsChanged = snapshot => {
      if (onboardingQuarantine) return;
      acceptPublicDocuments(snapshot.docs.map(document => ({ id: document.id, data: document.data() })));
      // The map/feed strip is local data: broadcast it now, and let the
      // private dashboard catch up behind the floor.
      scheduleLocalBroadcast();
      scheduleLiveDashboardRefresh();
    };
    // Eighth watcher: the published digest (1 read per hourly write). Folded
    // locally — the generic `changed` would cost a full dashboard call per write.
    const algorithmChanged = snapshot => {
      if (onboardingQuarantine) return;
      liveState.acceptAlgorithm(normalizeAlgorithmDigest(snapshot.data() ?? null));
      const frame = liveState.recombine();
      if (frame) broadcastLiveDashboard(frame);
    };
    const presenceChanged = snapshot => {
      if (onboardingQuarantine) return;
      const leases = snapshot.docs.map(document => ({
        uid: typeof document.data().uid === 'string' ? document.data().uid : '',
        synthetic: document.data().synthetic === true,
        activeUntilMs: document.data().activeUntil?.toMillis?.() ?? 0,
      }));
      liveState.acceptPresence(leases);
      // A lease is renewed once a minute for PRESENCE_LEASE_MS: the sighting
      // is the renewal, not the expiry.
      let changed = false;
      for (const lease of leases) if (recordSighting(betaSightings, lease.uid, lease.activeUntilMs - PRESENCE_LEASE_MS, 'lease', { synthetic: lease.synthetic })) changed = true;
      if (changed) scheduleBetaSightingsSave();
      scheduleLocalBroadcast();
    };
    // Heartbeats (testActivity/{uid}.lastActivityAt) are a sighting too; the
    // watcher already pays for these documents.
    const activityChanged = snapshot => {
      if (onboardingQuarantine) return;
      let changed = false;
      for (const document of snapshot.docs) {
        const atMs = document.data().lastActivityAt?.toMillis?.() ?? 0;
        if (recordSighting(betaSightings, document.id, atMs, 'heartbeat')) changed = true;
      }
      if (changed) scheduleBetaSightingsSave();
      scheduleLiveDashboardRefresh();
    };
    // Tenth watcher: the daily report INDEX (1 read at attach, 1 per report
    // day). Folded locally like the digest; the frame carries ≤ 60 rows and
    // never a body — bodies are served by GET /api/reports/:day. An absent
    // document (repo 1 not deployed yet) reads as `reports: null`.
    const reportsChanged = snapshot => {
      if (onboardingQuarantine) return;
      liveState.acceptReports(normalizeReportIndex(snapshot.data() ?? null));
      const frame = liveState.recombine();
      if (frame) broadcastLiveDashboard(frame);
    };
    liveWatchers = [
      firestore.collection('posts').orderBy('createdAt', 'desc').limit(160).onSnapshot(publicPostsChanged, failed),
      firestore.collection('testActivity').limit(100).onSnapshot(activityChanged, failed),
      firestore.collection('testBetaPosts').limit(120).onSnapshot(changed, failed),
      firestore.collection('testFeedback').limit(80).onSnapshot(changed, failed),
      firestore.collection('testControl').doc('syntheticBrowserRunner').onSnapshot(changed, failed),
      firestore.collection('testControl').doc('syntheticBrowserRuntime').onSnapshot(changed, failed),
      firestore.collection('testControl').doc('simulation').onSnapshot(changed, failed),
      firestore.collection('testControl').doc('algorithmDigest').onSnapshot(algorithmChanged, failed),
      startPresenceWatcher(firestore, presenceChanged, failed),
      firestore.collection('testControl').doc('algorithmReports').onSnapshot(reportsChanged, failed),
    ];
    scheduleLiveDashboardRefresh(0);
  } catch {
    resetLiveWatchers();
  }
}

function openLiveStream(request, response, origin) {
  response.writeHead(200, {
    ...responseHeaders(origin, 'text/event-stream; charset=utf-8'),
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  // Reconnect fast while healthy; back off to 15 s while the upstream is down.
  response.write(`retry: ${liveUpstreamFailedAtMs ? 15_000 : 1500}\n\n`);
  liveClients.add(response);
  if (!onboardingQuarantine) startLiveWatchers();
  // Firestore watchers drive every refresh, but the tester table also reads
  // Auth, which has no watcher: a brand-new signup that has not yet touched
  // Firestore would sit invisible until something else changed. Tick while
  // anyone is watching so it surfaces within ten minutes regardless (a signup
  // with zero Firestore footprint can wait; Firestore changes still land
  // within the floor, and presence lands within a minute).
  if (!liveSignupTicker) {
    liveSignupTicker = setInterval(() => {
      if (!liveClients.size) { clearInterval(liveSignupTicker); liveSignupTicker = null; return; }
      scheduleLiveDashboardRefresh();
    }, 600_000);
  }
  // A reconnect inside 15 s of an upstream failure must not re-earn LIVE with
  // a fresh call (the client's retry was 1.5 s when it last connected). It
  // gets a frame without `result`, which the page skips, and the 15 s retry.
  const plan = liveStreamOpenPlan({ cached: liveState.cached(), failedAtMs: liveUpstreamFailedAtMs, now: Date.now() });
  if (plan === 'cached') sendLiveEvent(response, { result: liveState.cached() });
  else if (plan === 'upstream-down') sendLiveEvent(response, { result: null, upstream: 'down' });
  else scheduleLiveDashboardRefresh(0);
  const heartbeat = setInterval(() => {
    if (!response.destroyed && !response.writableEnded) response.write(': keep-alive\n\n');
  }, 20_000);
  const close = () => {
    clearInterval(heartbeat);
    liveClients.delete(response);
  };
  request.once('close', close);
  response.once('close', close);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    let bodyTooLarge = false;
    request.on('data', chunk => {
      if (bodyTooLarge) return;
      body += chunk;
      bodyTooLarge = Buffer.byteLength(body) > maxBodyBytes;
    });
    request.on('end', () => {
      if (bodyTooLarge) { reject(new BodyTooLargeError()); return; }
      try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('Invalid JSON.')); }
    });
    request.on('error', reject);
  });
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timeout); }
}

async function fetchProductionWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let markSettled;
  const settled = new Promise(resolve => { markSettled = resolve; });
  productionRequests.set(controller, settled);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally {
    clearTimeout(timeout);
    productionRequests.delete(controller);
    markSettled();
  }
}

async function drainProductionRequests() {
  const pending = [...productionRequests.entries()];
  for (const [controller] of pending) controller.abort();
  await Promise.all(pending.map(([, settled]) => settled));
}

async function callCloudControl(data) {
  if (onboardingQuarantine) throw new Error('Production control is quarantined during first-user onboarding.');
  const upstream = await fetchProductionWithTimeout(functionURL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data: { ...data, accessCode: credential } }),
  }, 12_000);
  const body = await upstream.json().catch(() => null);
  if (!upstream.ok || !body || typeof body !== 'object') {
    throw new Error('The beta desk could not update the cloud switch.');
  }
  const result = body.result && typeof body.result === 'object' ? body.result : body;
  if (body.error || result.error) throw new Error('The beta desk cloud switch rejected the request.');
  return result;
}

async function callLocalRunnerCommand(enabled, mode = null) {
  const upstream = await fetchWithTimeout(`http://${host}:${runnerPort}/command`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-poplur-local-runner-token': localRunnerCredential,
    },
    body: JSON.stringify(enabled && mode ? { enabled, mode } : { enabled }),
  }, enabled ? 6 * 60_000 : 60_000);
  const body = await upstream.json().catch(() => null);
  if (!upstream.ok || !body || typeof body !== 'object') throw new Error('The local real-app runner did not apply the command.');
  return body;
}

async function callLocalOnboardingCommand(command) {
  const upstream = await fetchWithTimeout(`http://${host}:${runnerPort}/onboarding`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-poplur-local-runner-token': localRunnerCredential,
    },
    body: JSON.stringify(command),
  }, 12 * 60_000);
  const body = await upstream.json().catch(() => null);
  if (!upstream.ok || !body || typeof body !== 'object') {
    throw new Error('The local first-user journey did not apply the command.');
  }
  return body;
}

async function relayRunnerGET(localPath, response, origin, offlineState = false) {
  try {
    const upstream = await fetchWithTimeout(`http://${host}:${runnerPort}${localPath}`, {
      method: 'GET',
      headers: { 'x-poplur-local-runner-token': localRunnerCredential },
    }, 4_000);
    const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
    const body = Buffer.from(await upstream.arrayBuffer());
    response.writeHead(upstream.status, {
      ...responseHeaders(origin, contentType),
      ...(upstream.headers.get('x-poplur-frame-sequence')
        ? { 'x-poplur-frame-sequence': upstream.headers.get('x-poplur-frame-sequence') }
        : {}),
      'content-length': String(body.byteLength),
    });
    response.end(body);
  } catch {
    if (offlineState) {
      sendJSON(response, 200, origin, {
        ok: true,
        enabled: false,
        status: 'offline',
        mode: null,
        completed: false,
        actors: [],
      });
    } else {
      sendJSON(response, 503, origin, { error: { message: 'The local real-app runner is offline.' } });
    }
  }
}

async function applyOnboardingCommand(body, response, origin) {
  let command;
  try {
    command = validateOnboardingCommand(body);
  } catch {
    sendJSON(response, 400, origin, {
      error: { message: 'First-user run requires the exact confirmation for its selected backend.' },
    });
    return;
  }
  if (onboardingActive) {
    sendJSON(response, 409, origin, { error: { message: 'The first-user journey is already running.' } });
    return;
  }
  const isolated = command.mode === 'first-user-v1';
  onboardingActive = true;
  if (isolated) {
    onboardingQuarantine = true;
    resetLiveWatchers();
    await drainProductionRequests();
  }
  try {
    // Isolated mode drains and quarantines every production watcher. Shared
    // mode deliberately leaves the production realtime dashboard connected;
    // its browser owns a separate, exact UID/post/path write ledger.
    sendJSON(response, 200, origin, await callLocalOnboardingCommand(command));
  } catch {
    sendJSON(response, 502, origin, {
      error: { message: isolated
        ? 'The local first-user journey could not run; production was not contacted.'
        : 'The shared tester journey could not complete its exact production ledger.' },
    });
  } finally {
    onboardingActive = false;
    if (isolated) {
      onboardingQuarantine = false;
      if (liveClients.size) startLiveWatchers();
    }
  }
}

/**
 * Single explicit operator transaction. It never starts from a GET/poll:
 * ON commits the production switch before Chrome exists and rolls it back if
 * bootstrap fails; OFF closes local contexts first, then pauses production.
 */
async function applyRunnerCommand(body, response, origin) {
  let command;
  try {
    command = validateRunnerCommand(body);
  } catch (error) {
    sendJSON(response, 400, origin, { error: { message: error instanceof Error ? error.message : 'Runner command is invalid.' } });
    return;
  }
  if (onboardingActive) {
    sendJSON(response, 409, origin, { error: { message: 'Five-actor control is unavailable during first-user onboarding.' } });
    return;
  }
  if (command.enabled) {
    try {
      const cloud = await callCloudControl({ action: 'runner', enabled: true });
      if (cloud.enabled !== true) throw new Error('The production runner switch did not enable.');
      const local = await callLocalRunnerCommand(true, command.mode);
      if (local.status !== 'live' || local.enabled !== true) {
        await callLocalRunnerCommand(false).catch(() => {});
        await callCloudControl({ action: 'runner', enabled: false }).catch(() => {});
        sendJSON(response, 502, origin, {
          error: { message: 'Real-app browser bootstrap failed; the production runner switch was rolled back.' },
          state: local,
        });
        return;
      }
      sendJSON(response, 200, origin, local);
    } catch {
      await callLocalRunnerCommand(false).catch(() => {});
      await callCloudControl({ action: 'runner', enabled: false }).catch(() => {});
      sendJSON(response, 502, origin, { error: { message: 'Real-app browser bootstrap failed; no runner was left active.' } });
    }
    return;
  }

  let local = null;
  let localStopped = false;
  try {
    local = await callLocalRunnerCommand(false);
    localStopped = local.status === 'paused' && local.enabled === false;
  } catch {
    // If the service is offline there is no local Chrome owner. If it was only
    // temporarily unreachable, the cloud OFF transition below is observed by
    // its bounded monitor and closes all contexts without further UI action.
  }
  try {
    const cloud = await callCloudControl({ action: 'runner', enabled: false });
    if (cloud.enabled === true) throw new Error('The production runner switch remained enabled.');
  } catch {
    if (localStopped) {
      sendJSON(response, 502, origin, {
        error: { message: 'Local sessions are paused, but the cloud pause could not be verified.' },
        state: local,
      });
    } else {
      sendJSON(response, 502, origin, { error: { message: 'The runner pause could not be verified.' } });
    }
    return;
  }
  sendJSON(response, 200, origin, local ?? {
    ok: true,
    enabled: false,
    status: 'offline',
    actors: [],
  });
}

/** One Auth page (an API call, not a Firestore read) so QA accounts that exist only in Auth classify as synthetic. */
async function authEmailPage() {
  const page = await getAuth(adminApp()).listUsers(1000);
  return new Map(page.users.map(user => [user.uid, typeof user.email === 'string' ? user.email : null]));
}

/**
 * POST /api/export/ledger { postIds, classifyActors? }: ≤ 50 posts × ≤ 500
 * entries, estimated from the digest before any read and refused (429) when
 * the estimate exceeds what is left of the 25,000-reads Toronto day. Never
 * scans; never emits a uid — the CSV carries the five-valued actor class.
 */
async function applyLedgerExport(body, response, origin) {
  let request;
  try {
    request = validateLedgerExportRequest(body);
  } catch (error) {
    sendJSON(response, 400, origin, { error: { message: error instanceof Error ? error.message : 'Ledger export request is invalid.' } });
    return;
  }
  if (onboardingQuarantine) {
    sendJSON(response, 503, origin, { error: { message: 'Production reads are quarantined during first-user onboarding.' } });
    return;
  }
  const digest = liveState.algorithm();
  const estimate = estimateLedgerExport(digest, request.postIds);
  const remaining = ledgerReadBudget.remaining(Date.now());
  if (estimate.reads > remaining) {
    sendJSON(response, 429, origin, {
      error: { message: 'That export would exceed today\'s ledger read budget.' },
      remaining,
      estimate,
    });
    return;
  }
  let reads = 0;
  try {
    const firestore = getFirestore(adminApp());
    const emailByUid = request.classifyActors ? await authEmailPage() : null;
    const digestPosts = new Map((digest?.posts ?? []).map(post => [post.postId, post]));
    const knobs = digestKnobs(digest);
    // Per request: a uid absent from the Auth page costs one users/{uid} read
    // (known = exists), the digest's own rule; absent from both → unknown.
    const classByUid = new Map();
    const resolveActorClass = async uid => {
      if (!uid) return 'unknown';
      if (classByUid.has(uid)) return classByUid.get(uid);
      let cls;
      if (!emailByUid) {
        cls = actorClass(uid, null, null, false);
      } else if (emailByUid.has(uid)) {
        cls = actorClass(uid, null, emailByUid.get(uid), true);
      } else if (reads < remaining) {
        const profile = await firestore.collection('users').doc(uid).get();
        reads += 1;
        cls = actorClass(uid, profile.data() ?? null, profile.data()?.email ?? null, profile.exists);
      } else {
        cls = 'unknown';
      }
      classByUid.set(uid, cls);
      return cls;
    };
    const rows = [];
    for (const postId of request.postIds) {
      const postRef = firestore.collection('posts').doc(postId);
      const [postSnapshot, historySnapshot] = await Promise.all([
        postRef.get(),
        postRef.collection('radiusHistory').orderBy('atMillis', 'asc').limit(LEDGER_EXPORT_ENTRY_LIMIT).get(),
      ]);
      reads += 1 + Math.max(1, historySnapshot.size);
      if (!postSnapshot.exists) continue;
      const post = postSnapshot.data() ?? {};
      const summary = digestPosts.get(postId);
      const ownerUid = typeof post.userID === 'string' ? post.userID : '';
      const ownerActorClass = await resolveActorClass(ownerUid);
      const cls = summary?.cls ?? postClass(postId, post, ownerActorClass === 'synthetic');
      const ownerClass = summary?.ownerClass
        ?? (cls === 'official' ? 'official' : ownerClassOf(postId, post, emailByUid?.get(ownerUid) ?? null, ownerActorClass !== 'unknown'));
      const entries = historySnapshot.docs.map(document => ({ id: document.id, ...document.data() }));
      const actorClassByEntryId = new Map();
      // Join only on real and official posts (decision 6); the day guard stays
      // hard — past it the remaining entries read unknown rather than reading.
      if (emailByUid && (cls === 'real' || cls === 'official')) {
        for (const entry of entries) {
          if (entry.cause !== 'engagement' || typeof entry.engagementId !== 'string' || !entry.engagementId) continue;
          if (reads >= remaining) { actorClassByEntryId.set(entry.id, 'unknown'); continue; }
          const engagement = await postRef.collection('engagements').doc(entry.engagementId).get();
          reads += 1;
          const actorUid = typeof engagement.data()?.actorUid === 'string' ? engagement.data().actorUid : '';
          actorClassByEntryId.set(entry.id, await resolveActorClass(actorUid));
        }
      }
      rows.push(...ledgerRowsForPost({
        postId,
        post,
        entries,
        postClass: cls,
        ownerClass,
        clean: typeof summary?.clean === 'boolean' ? summary.clean : null,
        actorClassByEntryId,
        knobs,
      }));
    }
    ledgerReadBudget.charge(reads, Date.now());
    const csv = ledgerCsv(rows);
    response.writeHead(200, {
      ...responseHeaders(origin, 'text/csv; charset=utf-8'),
      'content-disposition': `attachment; filename="${ledgerExportFilename(Date.now())}"`,
      'access-control-expose-headers': 'content-disposition, x-poplur-ledger-reads',
      'x-poplur-ledger-reads': String(reads),
      'content-length': String(Buffer.byteLength(csv)),
    });
    response.end(csv);
  } catch {
    ledgerReadBudget.charge(reads, Date.now());
    sendJSON(response, 502, origin, { error: { message: 'The ledger export could not read Poplur.' } });
  }
}

/** A report route's answer: the `{ result }` envelope plus the read count the ledger export already exposes. */
function sendReportJSON(response, status, origin, body, reads) {
  response.writeHead(status, {
    ...responseHeaders(origin),
    'access-control-expose-headers': 'x-poplur-ledger-reads',
    'x-poplur-ledger-reads': String(reads),
  });
  response.end(JSON.stringify(body));
}

/** The 429 the ledger export answers with (reports design §5.1), for a one-read report fetch. */
function refuseReportRead(response, origin, remaining) {
  sendJSON(response, 429, origin, {
    error: { message: 'That report read would exceed today\'s ledger read budget.' },
    remaining,
    estimate: { reads: 1, cad: readsToCad(1), reports: 1 },
  });
}

/**
 * GET /api/reports: the last normalised index — 0 reads while the watcher has
 * delivered (the frame already carries its newest 60 rows; this is the full
 * ≤ 120), one `doc.get()` charged to the budget when it has not spoken yet.
 * Never starts the watchers: attaching all ten costs ≈ 460 reads.
 */
async function serveReportIndex(response, origin) {
  if (onboardingQuarantine) {
    sendJSON(response, 503, origin, { error: { message: 'Production reads are quarantined during first-user onboarding.' } });
    return;
  }
  if (liveState.hasReports()) {
    sendReportJSON(response, 200, origin, { result: liveState.reports() }, 0);
    return;
  }
  const remaining = ledgerReadBudget.remaining(Date.now());
  if (remaining < 1) { refuseReportRead(response, origin, remaining); return; }
  try {
    const snapshot = await getFirestore(adminApp()).doc(REPORT_INDEX_DOC).get();
    ledgerReadBudget.charge(1, Date.now());
    liveState.acceptReports(normalizeReportIndex(snapshot.data() ?? null));
    sendReportJSON(response, 200, origin, { result: liveState.reports() }, 1);
  } catch {
    sendJSON(response, 502, origin, { error: { message: 'The report index could not be read from Poplur.' } });
  }
}

/**
 * GET /api/reports/:day: one report body from the Admin SDK, cached per
 * day@revision (the revision from the index copy) for the process lifetime.
 * A cache hit answers with `x-poplur-ledger-reads: 0`; a miss charges 1 read
 * through the 25k/day ledger budget and answers 429 in its shape when nothing
 * is left; a missing document is 404. A refusal shape (another schema major,
 * unreadable evidence, oversize) is served as the result so the page can say
 * why — never zero-filled.
 */
async function serveReport(day, response, origin) {
  if (onboardingQuarantine) {
    sendJSON(response, 503, origin, { error: { message: 'Production reads are quarantined during first-user onboarding.' } });
    return;
  }
  const listed = reportRevisionListed(liveState.reports(), day);
  const cached = reportCache.lookup(day, listed);
  if (cached) {
    sendReportJSON(response, 200, origin, { result: cached }, 0);
    return;
  }
  const remaining = ledgerReadBudget.remaining(Date.now());
  if (remaining < 1) { refuseReportRead(response, origin, remaining); return; }
  // The read is charged once whatever happens after it: a get() that returned
  // (a missing document included) was billed by Firestore.
  let reads = 0;
  try {
    const snapshot = await getFirestore(adminApp()).doc(`${REPORT_DAYS_COLLECTION}/${day}`).get();
    reads = 1;
    if (!snapshot.exists) {
      sendReportJSON(response, 404, origin, { error: { message: 'No report was written for that day.' } }, reads);
      return;
    }
    const report = normalizeAlgorithmReport(snapshot.data() ?? null);
    // A body is immutable per revision, so a refusal for one is as cacheable
    // as the body; only a foreign schema major carries no revision to key on.
    if (report && !(isReportRefusal(report) && report.unsupportedVersion)) reportCache.store(day, report.revision, report);
    sendReportJSON(response, 200, origin, { result: report }, reads);
  } catch {
    sendJSON(response, 502, origin, { error: { message: 'The report could not be read from Poplur.' } });
  } finally {
    ledgerReadBudget.charge(reads, Date.now());
  }
}

async function relayControl(body, response, origin) {
  const data = body?.data;
  if (!data || typeof data !== 'object' || !allowedActions.has(data.action)) {
    sendJSON(response, 400, origin, { error: { message: 'Unsupported local desk action.' } });
    return;
  }
  if (onboardingQuarantine) {
    sendJSON(response, 503, origin, { error: { message: 'Production dashboard is quarantined during first-user onboarding.' } });
    return;
  }
  if (data.action === 'runner' && 'enabled' in data) {
    sendJSON(response, 400, origin, { error: { message: 'Use the explicit real-app runner command to change runner state.' } });
    return;
  }
  try {
    let result = await callCloudControl(data);
    if (data.action === 'dashboard') {
      await ensurePublicSnapshot();
      const combined = liveState.combine(result);
      if (!combined) throw new Error('The realtime public snapshot is unavailable.');
      result = combined;
    }
    sendJSON(response, 200, origin, { result });
  } catch {
    sendJSON(response, 502, origin, { error: { message: 'The local beta desk could not reach Poplur.' } });
  }
}

// ---------------------------------------------------------------------------
// Beta metrics (beta-metrics-policy.mjs): human accounts only, computed here
// from Admin SDK reads — nothing to deploy. One run reads the Auth page (an
// API call), users/ once, each human's posts, per human pop its ledger's
// first and largest entries (2 reads) plus the like documents human actors
// left on it (`actorUid in` chunks of 30), and per human per day ONE count()
// on the engagements collection group — the (actorUid, createdAt) index —
// so a like or view on a simulation pop is a day of activity; a day once
// counted is kept in the ledger and never counted again. The digest the
// desk already watches supplies each pop's gain by actor class (0 reads;
// 1 when the watcher has not spoken). The run is charged to the same
// 25k/day ledger budget as the export, capped per run, and cached.

function loadBetaSightings(path) {
  try {
    return normalizeSightings(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return emptySightings();
  }
}

function scheduleBetaSightingsSave(delay = 2_000) {
  if (betaSightingsSaveTimer) return;
  betaSightingsSaveTimer = setTimeout(() => {
    betaSightingsSaveTimer = null;
    void saveBetaSightings();
  }, delay);
}

async function saveBetaSightings() {
  try {
    mkdirSync(dirname(betaSightingsPath), { recursive: true });
    const temporary = `${betaSightingsPath}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(betaSightings), 'utf8');
    await rename(temporary, betaSightingsPath);
  } catch (error) {
    console.error('beta sightings save failed:', error?.message ?? error);
  }
}

/** Run `work` over `items` with at most `limit` in flight; results in order. */
async function mapLimit(items, limit, work) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await work(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const parseStamp = value => { const ms = Date.parse(value ?? ''); return Number.isFinite(ms) && ms > 0 ? ms : 0; };
const docMillis = value => value?.toMillis?.() ?? (typeof value === 'number' ? value : 0);

async function gatherBetaMetrics(now) {
  const firestore = getFirestore(adminApp());
  const cap = Math.min(BETA_READ_CAP, ledgerReadBudget.remaining(now));
  const coverage = { reads: 0, capped: false, cappedAt: null, engagementIndex: false };
  const charge = (reads, where) => {
    coverage.reads += Math.max(1, reads);
    if (coverage.reads >= cap && !coverage.capped) { coverage.capped = true; coverage.cappedAt = where; }
  };
  const room = () => !coverage.capped;
  try {
    const page = await getAuth(adminApp()).listUsers(1000);
    const accounts = page.users.map(user => ({
      uid: user.uid,
      email: typeof user.email === 'string' ? user.email : null,
      displayName: typeof user.displayName === 'string' ? user.displayName : null,
      createdAtMs: parseStamp(user.metadata?.creationTime),
      lastSignInAtMs: parseStamp(user.metadata?.lastSignInTime),
      lastRefreshAtMs: parseStamp(user.metadata?.lastRefreshTime),
    }));
    const usersSnapshot = await firestore.collection('users').limit(1000).get();
    charge(usersSnapshot.size, 'users');
    const profiles = usersSnapshot.docs.map(document => ({ uid: document.id, profile: document.data() ?? {} }));
    const profileByUid = new Map(profiles.map(row => [row.uid, row.profile]));
    const accountByUid = new Map(accounts.map(row => [row.uid, row]));
    const humans = [];
    for (const uid of new Set([...accountByUid.keys(), ...profileByUid.keys()])) {
      const account = accountByUid.get(uid) ?? null;
      const cls = betaAccountClass(uid, profileByUid.get(uid) ?? null, account?.email ?? profileByUid.get(uid)?.email ?? null, true);
      if (cls.human) humans.push({ uid, account, signedUpAtMs: account?.createdAtMs ?? 0 });
    }
    // Sightings this run can add without a read: the Auth stamps.
    let sightingsChanged = false;
    for (const { uid, account } of humans) {
      if (recordSighting(betaSightings, uid, account?.lastSignInAtMs ?? 0, 'signin')) sightingsChanged = true;
      if (recordSighting(betaSightings, uid, account?.lastRefreshAtMs ?? 0, 'refresh')) sightingsChanged = true;
    }
    // And the leases of the last day, in case the desk was down for them
    // (lease documents outlive their expiry by 24 h).
    if (room()) {
      const leases = await firestore.collection('appPresenceSessions')
        .where('activeUntil', '>', Timestamp.fromMillis(now - 24 * 3_600_000)).limit(500).get();
      charge(leases.size, 'presence');
      for (const document of leases.docs) {
        const data = document.data() ?? {};
        if (recordSighting(betaSightings, typeof data.uid === 'string' ? data.uid : '', docMillis(data.activeUntil) - PRESENCE_LEASE_MS, 'lease', { synthetic: data.synthetic === true })) sightingsChanged = true;
      }
    }
    // Engagement days: one aggregation read per human per uncounted day on
    // the collection group (any pop: human, simulation, official). A day that
    // has ended is marked counted so the next run pays only for today.
    const plan = engagementDaysToCount({ humans, ledger: betaSightings, now });
    const yesterday = dayKeyOffset(torontoDayKey(now), -1);
    const countedDays = {};
    let indexRefused = false;
    coverage.engagementDaysCounted = 0;
    await mapLimit(plan, 8, async ({ uid, day }) => {
      if (!room() || indexRefused) return;
      const { startMs, endMs } = torontoDayBounds(day);
      try {
        const count = await firestore.collectionGroup('engagements')
          .where('actorUid', '==', uid)
          .where('createdAt', '>=', Timestamp.fromMillis(startMs))
          .where('createdAt', '<', Timestamp.fromMillis(endMs))
          // The live index is (actorUid ASC, createdAt DESC): the order must
          // be said, or the implicit ascending order asks for another index.
          .orderBy('createdAt', 'desc')
          .count().get();
        charge(1, `engagement-days:${uid}`);
        coverage.engagementDaysCounted += 1;
        if (count.data().count > 0 && recordSightingDay(betaSightings, uid, day, 'engagement')) sightingsChanged = true;
        (countedDays[uid] ??= []).push(day);
      } catch (error) {
        // FAILED_PRECONDITION: the collection-group index is not live. Say
        // so on the frame; the other signals still stand.
        if (error?.code === 9) { indexRefused = true; return; }
        throw error;
      }
    });
    coverage.engagementIndex = !indexRefused;
    for (const { uid } of humans) {
      const wanted = plan.filter(entry => entry.uid === uid && entry.day <= yesterday).map(entry => entry.day);
      const done = countedDays[uid] ?? [];
      if (wanted.length && wanted.every(day => done.includes(day)) && markCountedThrough(betaSightings, uid, yesterday, now)) sightingsChanged = true;
    }
    if (pruneSightings(betaSightings, now)) sightingsChanged = true;
    if (sightingsChanged) scheduleBetaSightingsSave(0);

    // The digest: the watcher's copy when it has spoken, else one read.
    let digest = liveState.algorithm();
    if (!digest && room()) {
      const snapshot = await firestore.collection('testControl').doc('algorithmDigest').get();
      charge(1, 'digest');
      digest = normalizeAlgorithmDigest(snapshot.data() ?? null);
    }
    if (digest && (digest.unsupportedVersion || digest.oversize)) digest = null;
    coverage.digestAtMs = digest?.generatedAtMillis ?? 0;

    // Each human's posts, newest first (the tester table's own query).
    const postsByUid = {};
    await mapLimit(humans, 4, async ({ uid }) => {
      if (!room()) { postsByUid[uid] = []; return; }
      const snapshot = await firestore.collection('posts').where('userID', '==', uid)
        .orderBy('createdAt', 'desc').limit(BETA_POSTS_PER_USER).get();
      charge(snapshot.size, `posts:${uid}`);
      postsByUid[uid] = snapshot.docs.map(document => ({ id: document.id, data: document.data() ?? {} }));
    });

    // Anchors for accounts whose newest pops are hidden: the protected copy.
    const protectedLocations = {};
    for (const { uid } of humans) {
      for (const postId of hiddenPostIdsForAnchor(postsByUid[uid] ?? [], BETA_ANCHOR_HIDDEN_POSTS)) {
        if (!room()) break;
        const copy = await firestore.doc(`users/${uid}/postLocations/${postId}`).get();
        charge(1, `anchor:${uid}`);
        if (copy.exists) { (protectedLocations[uid] ??= {})[postId] = copy.data() ?? {}; break; }
      }
    }

    // Per human pop: its first and largest ledger entries, the human likes
    // on it (likes per pop is human-on-human), and its exact location when
    // the post hides it.
    const humanUids = humans.map(row => row.uid);
    const chunks = humanUidChunks(humanUids);
    const pops = [];
    for (const { uid } of humans) for (const post of postsByUid[uid] ?? []) if (isHumanPop(post.id, post.data)) pops.push({ uid, ...post });
    const popDetails = {};
    await mapLimit(pops, 6, async pop => {
      if (!room()) return;
      const postRef = firestore.collection('posts').doc(pop.id);
      const [start, peak] = await Promise.all([
        postRef.collection('radiusHistory').orderBy('atMillis', 'asc').limit(1).get(),
        postRef.collection('radiusHistory').orderBy('radiusMeters', 'desc').limit(1).get(),
      ]);
      charge(2, `ledger:${pop.id}`);
      const engagements = [];
      for (const chunk of chunks) {
        if (!room()) break;
        const snapshot = await postRef.collection('engagements').where('kind', '==', 'like').where('actorUid', 'in', chunk).limit(BETA_LIKES_PER_POP).get();
        charge(snapshot.size, `likes:${pop.id}`);
        for (const document of snapshot.docs) {
          const data = document.data() ?? {};
          engagements.push({ actorUid: data.actorUid, kind: data.kind, createdAtMs: docMillis(data.createdAt) });
        }
      }
      let exact = null;
      const data = pop.data ?? {};
      if (room() && (data.latitude == null || data.longitude == null)) {
        const copy = await firestore.doc(`users/${pop.uid}/postLocations/${pop.id}`).get();
        charge(1, `exact:${pop.id}`);
        exact = copy.exists ? copy.data() ?? null : null;
      }
      const first = start.docs[0]?.data() ?? null;
      const top = peak.docs[0]?.data() ?? null;
      popDetails[pop.id] = {
        startMeters: first ? first.radiusMeters : null,
        startAtMs: first ? first.atMillis : null,
        peakMeters: top ? top.radiusMeters : null,
        peakAtMs: top ? top.atMillis : null,
        engagements,
        exact,
      };
    });

    const sightingDays = Object.values(betaSightings.sightings ?? {}).flatMap(days => Object.keys(days));
    coverage.sightingsSince = sightingDays.length ? sightingDays.sort()[0] : null;
    return foldBetaMetrics({ now, accounts, profiles, postsByUid, popDetails, protectedLocations, sightings: betaSightings, digest, coverage });
  } finally {
    ledgerReadBudget.charge(coverage.reads, now);
  }
}

/**
 * GET /api/beta[?refresh=1]: the Beta tab's result — served from the run
 * cache inside BETA_CACHE_MS (0 reads), else computed (charged, capped). A
 * refusal (429) keeps the ledger export's shape; a run already in flight is
 * joined, never duplicated.
 */
async function serveBetaMetrics(response, origin, refresh) {
  if (onboardingQuarantine) {
    sendJSON(response, 503, origin, { error: { message: 'Production reads are quarantined during first-user onboarding.' } });
    return;
  }
  const now = Date.now();
  if (!refresh && betaCache.result && now - betaCache.atMs < BETA_CACHE_MS) {
    sendReportJSON(response, 200, origin, { result: { ...betaCache.result, cached: true, cachedAtMs: betaCache.atMs } }, 0);
    return;
  }
  const remaining = ledgerReadBudget.remaining(now);
  if (!betaInFlight && remaining < BETA_READ_RESERVE) {
    sendJSON(response, 429, origin, {
      error: { message: 'That Beta run would exceed today\'s ledger read budget.' },
      remaining,
      estimate: { reads: BETA_READ_RESERVE, cad: readsToCad(BETA_READ_RESERVE) },
    });
    return;
  }
  try {
    if (!betaInFlight) {
      betaInFlight = gatherBetaMetrics(now).then(result => {
        betaCache = { atMs: now, result, reads: result.coverage.reads };
        return result;
      }).finally(() => { betaInFlight = null; });
    }
    const result = await betaInFlight;
    sendReportJSON(response, 200, origin, { result: { ...result, cached: false, cachedAtMs: betaCache.atMs } }, result.coverage.reads);
  } catch (error) {
    console.error('beta metrics failed:', error?.message ?? error);
    sendJSON(response, 502, origin, { error: { message: 'The Beta metrics could not be read from Poplur.' } });
  }
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin === controlRoomOrigin ? controlRoomOrigin : '';
  const requestURL = new URL(request.url || '/', `http://${host}:${port}`);
  if (request.method === 'GET' && requestURL.pathname === '/health') {
    sendJSON(response, 200, '', { ok: true });
    return;
  }
  if (request.method === 'OPTIONS') {
    if (request.headers.origin !== controlRoomOrigin) { response.writeHead(403, responseHeaders(origin)); response.end(); return; }
    response.writeHead(204, responseHeaders(origin));
    response.end();
    return;
  }
  if (origin !== controlRoomOrigin) {
    sendJSON(response, 403, origin, { error: { message: 'Local beta desk origin is not allowed.' } });
    return;
  }
  if (request.method === 'POST' && !isAuthorizedTestControlMutation({
    origin: request.headers.origin,
    contentType: request.headers['content-type'],
  })) {
    sendJSON(response, 415, origin, { error: { message: 'Mutating local desk routes require exact application/json from the Test Center.' } });
    return;
  }

  if (request.method === 'GET' && requestURL.pathname === '/api/runner/state') {
    await relayRunnerGET('/state', response, origin, true);
    return;
  }
  if (request.method === 'GET' && requestURL.pathname === '/api/live') {
    openLiveStream(request, response, origin);
    return;
  }
  const framesMatch = requestURL.pathname.match(new RegExp(`^/api/runner/frames/(${actorPattern})$`));
  if (request.method === 'GET' && framesMatch) {
    await relayRunnerGET(`/frames/${encodeURIComponent(framesMatch[1])}`, response, origin);
    return;
  }
  const frameMatch = requestURL.pathname.match(new RegExp(`^/api/runner/frame/(${actorPattern})$`));
  if (request.method === 'GET' && frameMatch) {
    const sequence = requestURL.searchParams.get('sequence');
    if (sequence != null && (!/^\d+$/.test(sequence) || Number(sequence) < 1)) {
      sendJSON(response, 400, origin, { error: { message: 'Frame sequence is invalid.' } });
      return;
    }
    await relayRunnerGET(`/frame/${encodeURIComponent(frameMatch[1])}${sequence == null ? '' : `?sequence=${encodeURIComponent(sequence)}`}`, response, origin);
    return;
  }
  // Read-only report routes (reports design §5.1): behind the origin lock like
  // everything above — `fetch` sends Origin, a bare address-bar GET does not.
  if (request.method === 'GET' && requestURL.pathname === '/api/reports') {
    await serveReportIndex(response, origin);
    return;
  }
  if (request.method === 'GET' && requestURL.pathname === '/api/beta') {
    await serveBetaMetrics(response, origin, requestURL.searchParams.get('refresh') === '1');
    return;
  }
  // The beta scorecard the landing page shows (functions/src/betaScorecard.ts →
  // public/betaScorecard). World-readable by rule, so plain REST with no token:
  // the desk sees exactly what YC sees, from the same document.
  if (request.method === 'GET' && requestURL.pathname === '/api/scorecard') {
    try {
      const rest = await fetch('https://firestore.googleapis.com/v1/projects/poplur2025/databases/(default)/documents/public/betaScorecard', { signal: AbortSignal.timeout(10_000) });
      if (rest.status === 404) { sendJSON(response, 200, origin, { scorecard: null }); return; }
      if (!rest.ok) throw new Error(`Firestore REST ${rest.status}`);
      const body = await rest.json();
      sendJSON(response, 200, origin, { scorecard: decodeFirestoreFields(body.fields ?? {}) });
    } catch (error) {
      sendJSON(response, 503, origin, { error: { message: `Scorecard unavailable: ${error instanceof Error ? error.message : String(error)}` } });
    }
    return;
  }
  const reportMatch = requestURL.pathname.match(/^\/api\/reports\/([^/]+)$/);
  if (request.method === 'GET' && reportMatch) {
    let day = null;
    try { day = parseReportDay(decodeURIComponent(reportMatch[1])); } catch { day = null; }
    if (!day) {
      sendJSON(response, 400, origin, { error: { message: 'Report day must be YYYY-MM-DD.' } });
      return;
    }
    await serveReport(day, response, origin);
    return;
  }

  if (request.method !== 'POST' || (requestURL.pathname !== '/api/control'
    && requestURL.pathname !== '/api/runner/command'
    && requestURL.pathname !== '/api/runner/onboarding'
    && requestURL.pathname !== '/api/export/ledger')) {
    sendJSON(response, 404, origin, { error: { message: 'Local beta desk route not found.' } });
    return;
  }
  try {
    const body = await readBody(request);
    if (requestURL.pathname === '/api/runner/command') await applyRunnerCommand(body, response, origin);
    else if (requestURL.pathname === '/api/runner/onboarding') await applyOnboardingCommand(body, response, origin);
    else if (requestURL.pathname === '/api/export/ledger') await applyLedgerExport(body, response, origin);
    else await relayControl(body, response, origin);
  } catch (error) {
    const status = error instanceof BodyTooLargeError ? 413 : 400;
    sendJSON(response, status, origin, { error: { message: status === 413 ? 'Local desk request is too large.' : 'Local desk request is invalid.' } });
  }
});

class BodyTooLargeError extends Error {}

server.listen(port, host, () => {
  console.log(`Poplur Test Control proxy listening at http://${host}:${port}`);
});
server.on('error', error => {
  console.error('Poplur Test Control proxy failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

function shutdown() {
  resetLiveWatchers();
  if (betaSightingsSaveTimer) { clearTimeout(betaSightingsSaveTimer); betaSightingsSaveTimer = null; void saveBetaSightings(); }
  server.close();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
