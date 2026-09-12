import { createServer } from 'node:http';
import { Buffer } from 'node:buffer';
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
  validateLedgerExportRequest,
} from './algorithm-digest-policy.mjs';
import {
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
    unsubscribe = firestore.collection('appPresenceSessions')
      .where('activeUntil', '>', Timestamp.fromMillis(Date.now()))
      .select('uid', 'synthetic', 'activeUntil')
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
    const failed = () => resetLiveWatchers();
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
      liveState.acceptPresence(snapshot.docs.map(document => ({
        uid: typeof document.data().uid === 'string' ? document.data().uid : '',
        synthetic: document.data().synthetic === true,
        activeUntilMs: document.data().activeUntil?.toMillis?.() ?? 0,
      })));
      scheduleLocalBroadcast();
    };
    liveWatchers = [
      firestore.collection('posts').orderBy('createdAt', 'desc').limit(160).onSnapshot(publicPostsChanged, failed),
      firestore.collection('testActivity').limit(100).onSnapshot(changed, failed),
      firestore.collection('testBetaPosts').limit(120).onSnapshot(changed, failed),
      firestore.collection('testFeedback').limit(80).onSnapshot(changed, failed),
      firestore.collection('testControl').doc('syntheticBrowserRunner').onSnapshot(changed, failed),
      firestore.collection('testControl').doc('syntheticBrowserRuntime').onSnapshot(changed, failed),
      firestore.collection('testControl').doc('simulation').onSnapshot(changed, failed),
      firestore.collection('testControl').doc('algorithmDigest').onSnapshot(algorithmChanged, failed),
      startPresenceWatcher(firestore, presenceChanged, failed),
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
  server.close();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
