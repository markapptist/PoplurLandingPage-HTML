import { createServer } from 'node:http';
import { Buffer } from 'node:buffer';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  aggregateRealtimePublicPosts,
  applyRealtimeRadiusBaselines,
  normalizeRealtimePublicSnapshot,
} from './realtime-public-post-policy.mjs';
import { createLiveDashboardState } from './test-control-live-state.mjs';
import { isAuthorizedTestControlMutation, validateOnboardingCommand } from './synthetic-onboarding-actions.mjs';

const host = '127.0.0.1';
const port = boundedPort(process.env.POPLUR_TEST_CONTROL_PORT, 8096);
const credential = process.env.POPLUR_TEST_CONTROL_TOKEN || '';
const localRunnerCredential = process.env.POPLUR_RUNNER_LOCAL_TOKEN || credential;
const runnerPort = boundedPort(process.env.POPLUR_SYNTHETIC_RUNNER_PORT, 8097);
const functionURL = 'https://us-central1-poplur2025.cloudfunctions.net/testActivityControl';
const controlRoomOrigin = 'http://127.0.0.1:8084';
const allowedActions = new Set(['dashboard', 'runner']);
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
let liveRefreshTimer = null;
let liveRefreshInFlight = false;
let liveRefreshAgain = false;
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
  if (liveRefreshTimer) clearTimeout(liveRefreshTimer);
  liveRefreshTimer = null;
  liveRefreshAgain = false;
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

async function refreshLiveDashboard() {
  if (onboardingQuarantine) return;
  if (liveRefreshInFlight) {
    liveRefreshAgain = true;
    return;
  }
  liveRefreshInFlight = true;
  try {
    if (!liveState.isPublicReady()) return;
    const combined = liveState.combine(await callCloudControl({ action: 'dashboard' }));
    if (!onboardingQuarantine && combined) broadcastLiveDashboard(combined);
  } catch {
    // A broken watcher/upstream clears both cache and registrations. The next
    // reconnect must earn LIVE again from a fresh Firestore snapshot.
    resetLiveWatchers();
  } finally {
    liveRefreshInFlight = false;
    if (liveRefreshAgain) {
      liveRefreshAgain = false;
      scheduleLiveDashboardRefresh(40);
    }
  }
}

function scheduleLiveDashboardRefresh(delay = 100) {
  if (onboardingQuarantine) return;
  if (liveRefreshTimer) clearTimeout(liveRefreshTimer);
  liveRefreshTimer = setTimeout(() => {
    liveRefreshTimer = null;
    void refreshLiveDashboard();
  }, delay);
}

function startLiveWatchers() {
  if (onboardingQuarantine || liveWatchersStarted) return;
  liveWatchersStarted = true;
  try {
    const app = getApps()[0] ?? initializeApp({
      credential: applicationDefault(),
      projectId: 'poplur2025',
    });
    const firestore = getFirestore(app);
    liveFirestore = firestore;
    const changed = () => scheduleLiveDashboardRefresh();
    const failed = () => resetLiveWatchers();
    const publicPostsChanged = snapshot => {
      if (onboardingQuarantine) return;
      acceptPublicDocuments(snapshot.docs.map(document => ({ id: document.id, data: document.data() })));
      scheduleLiveDashboardRefresh();
    };
    liveWatchers = [
      firestore.collection('posts').orderBy('createdAt', 'desc').limit(160).onSnapshot(publicPostsChanged, failed),
      firestore.collection('testActivity').limit(100).onSnapshot(changed, failed),
      firestore.collection('testBetaPosts').limit(120).onSnapshot(changed, failed),
      firestore.collection('testFeedback').limit(80).onSnapshot(changed, failed),
      firestore.collection('testControl').doc('syntheticBrowserRunner').onSnapshot(changed, failed),
      firestore.collection('testControl').doc('syntheticBrowserRuntime').onSnapshot(changed, failed),
      firestore.collection('testControl').doc('simulation').onSnapshot(changed, failed),
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
  response.write('retry: 1500\n\n');
  liveClients.add(response);
  if (!onboardingQuarantine) startLiveWatchers();
  const cached = liveState.cached();
  if (cached) sendLiveEvent(response, { result: cached });
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

async function callLocalRunnerCommand(enabled) {
  const upstream = await fetchWithTimeout(`http://${host}:${runnerPort}/command`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-poplur-local-runner-token': localRunnerCredential,
    },
    body: JSON.stringify({ enabled }),
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
  if (!body || typeof body !== 'object' || typeof body.enabled !== 'boolean'
    || Object.keys(body).some(key => key !== 'enabled')) {
    sendJSON(response, 400, origin, { error: { message: 'Runner command requires exact { enabled: boolean } JSON.' } });
    return;
  }
  if (onboardingActive) {
    sendJSON(response, 409, origin, { error: { message: 'Five-actor control is unavailable during first-user onboarding.' } });
    return;
  }
  if (body.enabled) {
    try {
      const cloud = await callCloudControl({ action: 'runner', enabled: true });
      if (cloud.enabled !== true) throw new Error('The production runner switch did not enable.');
      const local = await callLocalRunnerCommand(true);
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
    && requestURL.pathname !== '/api/runner/onboarding')) {
    sendJSON(response, 404, origin, { error: { message: 'Local beta desk route not found.' } });
    return;
  }
  try {
    const body = await readBody(request);
    if (requestURL.pathname === '/api/runner/command') await applyRunnerCommand(body, response, origin);
    else if (requestURL.pathname === '/api/runner/onboarding') await applyOnboardingCommand(body, response, origin);
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
