import { createServer } from 'node:http';
import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';
import { constants as fsConstants, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { access, lstat, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import {
  ACTOR_IDS,
  MAX_FRAMES_PER_ACTOR,
  POPLUR_APP_ORIGIN,
  PROHIBITED_CONTROL_NAME,
  SYNTHETIC_ACTORS,
  createFrameRing,
  endIngestRequest,
  eventIngestRequest,
  eventTypeForAction,
  frameMetadata,
  isAllowedAppURL,
  isAllowedEvent,
  isBlockedWriteRequest,
  planForActor,
  pushFrame,
  readValidatedPoplurScreen,
  startIngestRequest,
  statusIngestRequest,
  validateCredentialDocument,
} from './synthetic-runner-actions.mjs';
import { createSyntheticOnboardingRunner } from './synthetic-onboarding-runner.mjs';
import { validateOnboardingCommand } from './synthetic-onboarding-actions.mjs';
import { createSyntheticLiveRunner } from './synthetic-live-runner.mjs';
import {
  LIVE_MODE,
  READONLY_MODE,
  SYNTHETIC_COHORT_ID,
  accountForActor,
  activitiesForMode,
  validateRunnerCommand,
} from './synthetic-live-actions.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIR, '..');
const HOST = '127.0.0.1';
const PORT = boundedPort(process.env.POPLUR_SYNTHETIC_RUNNER_PORT, 8097);
const APP_START_URL = process.env.POPLUR_SYNTHETIC_APP_URL
  || `${POPLUR_APP_ORIGIN}/?view=feed&mapLite=1&managedLocation=1`;
const CHROME_PATH = process.env.POPLUR_SYSTEM_CHROME_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CONTROL_FUNCTION_URL = process.env.POPLUR_TEST_ACTIVITY_CONTROL_URL
  || 'https://us-central1-poplur2025.cloudfunctions.net/testActivityControl';
const INGEST_FUNCTION_URL = process.env.POPLUR_TEST_SESSION_INGEST_URL
  || 'https://us-central1-poplur2025.cloudfunctions.net/testSessionIngest';
// Secrets come from the environment first. When the launchd agent supplies
// only the loopback token, fall back to the same owner keychain item the desk
// proxy uses, the provisioning script's default credential path, and the
// ingest token the provisioning session left beside it. Nothing is printed.
const CREDENTIAL_FILE = process.env.POPLUR_SYNTHETIC_CREDENTIALS_FILE || defaultCredentialFile();
const DESK_CREDENTIAL = process.env.POPLUR_TEST_CONTROL_TOKEN || ownerKeychainToken();
const RUNNER_CREDENTIAL = process.env.POPLUR_RUNNER_TOKEN || fileToken(join(homedir(), '.poplur', 'synthetic-runner-ingest-token'));
const LOCAL_CREDENTIAL = process.env.POPLUR_RUNNER_LOCAL_TOKEN || DESK_CREDENTIAL;

function defaultCredentialFile() {
  const candidate = join(homedir(), '.poplur', 'synthetic-beta-credentials.json');
  return existsSync(candidate) ? candidate : '';
}

function ownerKeychainToken() {
  try {
    return execFileSync('/usr/bin/security', ['find-generic-password', '-s', 'Poplur Test Control', '-a', 'local-owner', '-w'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5_000,
    }).trim();
  } catch {
    return '';
  }
}

function fileToken(path) {
  try {
    return readFileSync(path, 'utf8').trim();
  } catch {
    return '';
  }
}

const NETWORK_TIMEOUT_MS = 12_000;
const APP_TIMEOUT_MS = 45_000;
const LIVE_FRAME_INTERVAL_MS = 1_500;
const LIVE_SELECTION_LEASE_MS = 8_000;
const ACTOR_DWELL_BASE_MS = 4_000;
const ACTOR_DWELL_SPREAD_MS = 3_000;
const MAX_LOCAL_BODY_BYTES = 8 * 1024;

if (!isAllowedAppURL(APP_START_URL)) {
  throw new Error(`POPLUR_SYNTHETIC_APP_URL must stay on ${POPLUR_APP_ORIGIN}.`);
}
if (!isSecureFunctionURL(CONTROL_FUNCTION_URL) || !isSecureFunctionURL(INGEST_FUNCTION_URL)) {
  throw new Error('Runner cloud endpoints must be HTTPS Cloud Functions URLs.');
}
if (!LOCAL_CREDENTIAL) {
  throw new Error('POPLUR_RUNNER_LOCAL_TOKEN (or POPLUR_TEST_CONTROL_TOKEN) is required for the loopback runner service.');
}

const actors = new Map(SYNTHETIC_ACTORS.map(actor => [actor.actorId, createActorRuntime(actor)]));
const runtime = {
  enabled: false,
  status: 'paused',
  browser: null,
  epoch: 0,
  selectedActorId: null,
  selectedUntilMs: 0,
  liveFrameTimer: null,
  cloudMonitorTimer: null,
  failureScheduled: false,
};
const onboardingRunner = createSyntheticOnboardingRunner({ chromium, chromePath: CHROME_PATH });
// Live cohort: the five accounts use the real web app shell (which owns the
// post upload and engagement paths), with the clay page inside it.
const LIVE_APP_ORIGIN = process.env.POPLUR_LIVE_APP_ORIGIN || 'http://127.0.0.1:8081';
const LIVE_FIXTURE_PATH = process.env.POPLUR_LIVE_FIXTURE_PATH
  || '/Users/matrix/Developer/Poplur2025-ReactNative/src/assets/icon-1024x1024.png';
if (new URL(LIVE_APP_ORIGIN).hostname !== '127.0.0.1') {
  throw new Error('POPLUR_LIVE_APP_ORIGIN must stay on the loopback app shell.');
}
const liveRunner = createSyntheticLiveRunner({
  chromium,
  chromePath: CHROME_PATH,
  appOrigin: LIVE_APP_ORIGIN,
  clayOrigin: POPLUR_APP_ORIGIN,
  fixturePath: LIVE_FIXTURE_PATH,
  readCredentials: () => readCredentials(),
  cloudRunnerEnabled: () => cloudRunnerEnabled(),
  cloudRunnerAllowlist: () => cloudRunnerAllowlist(),
  callIngest: (actor, payload) => callIngest(actor, payload),
});
let commandQueue = Promise.resolve();

function boundedPort(value, fallback) {
  const port = Number(value || fallback);
  if (!Number.isInteger(port) || port < 1024 || port > 65_535) throw new Error('Synthetic runner port is invalid.');
  return port;
}

function isSecureFunctionURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /\.cloudfunctions\.net$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function createActorRuntime(actor) {
  return {
    ...actor,
    status: 'paused',
    sessionId: null,
    generation: 0,
    currentScreen: 'feed',
    priorScreen: null,
    action: 'idle',
    sequence: 0,
    journeyIndex: 0,
    lastEventAtMs: 0,
    frameSequence: 0,
    lastFrameAtMs: 0,
    frameSuppressed: true,
    frames: createFrameRing(),
    captureQueue: Promise.resolve(null),
    transitioning: false,
    context: null,
    page: null,
    auth: null,
  };
}

function publicState() {
  if (onboardingRunner.hasSnapshot()) return onboardingRunner.publicState();
  if (liveRunner.hasSnapshot()) return liveRunner.publicState();
  return {
    ok: true,
    mode: READONLY_MODE,
    cohortId: SYNTHETIC_COHORT_ID,
    activities: activitiesForMode(READONLY_MODE),
    enabled: runtime.enabled,
    status: runtime.status,
    completed: false,
    startedAtMs: 0,
    completedAtMs: 0,
    runId: '',
    identity: null,
    error: '',
    actors: SYNTHETIC_ACTORS.map(descriptor => {
      const actor = actors.get(descriptor.actorId);
      const account = accountForActor(descriptor.actorId);
      return {
        actorId: actor.actorId,
        actor: actor.actor,
        handle: descriptor.handle,
        persona: descriptor.persona,
        place: descriptor.place,
        uid: account.uid,
        email: account.email,
        signedInAtMs: actor.signedInAtMs || 0,
        postsPublished: 0,
        lastPostId: '',
        lastPostAtMs: 0,
        viewsGiven: 0,
        likesGiven: 0,
        status: actor.status,
        sessionId: actor.sessionId,
        currentScreen: actor.currentScreen,
        action: actor.action,
        lastFrameSequence: actor.frameSequence || null,
        lastFrameAtMs: actor.lastFrameAtMs || 0,
        frameSuppressed: actor.frameSuppressed,
        frameCount: actor.frames.length,
      };
    }),
  };
}

function internalCredentialMatches(value) {
  const supplied = typeof value === 'string' ? value : '';
  if (!supplied || supplied.length !== LOCAL_CREDENTIAL.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(LOCAL_CREDENTIAL));
}

async function fetchJSON(url, options, timeoutMs = NETWORK_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`Cloud request failed with HTTP ${response.status}.`);
    if (!body || typeof body !== 'object') throw new Error('Cloud request returned no JSON result.');
    return body.result && typeof body.result === 'object' ? body.result : body;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * This owner credential check happens before Chrome is launched. It proves
 * that the shared production switch is enabled, satisfying the hard rule that
 * an explicit local Start command alone can never create browser contexts.
 */
async function cloudRunnerState() {
  if (!DESK_CREDENTIAL) throw new Error('POPLUR_TEST_CONTROL_TOKEN is required before the runner can check the production pause switch.');
  return fetchJSON(CONTROL_FUNCTION_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data: { action: 'runner', accessCode: DESK_CREDENTIAL } }),
  });
}

async function cloudRunnerEnabled() {
  const result = await cloudRunnerState();
  return result.enabled === true;
}

/** The actor ids the cloud allowlists for this generation. An actor the
 *  cloud has not allowlisted cannot open a session there, so signing it in
 *  only burns a 75 s timeout and fails the run's tail (12 Sep:
 *  sim-biz-fashion-008 did exactly that on every start). Null when the
 *  cloud sends no list, so an older function never blocks a start. */
async function cloudRunnerAllowlist() {
  const result = await cloudRunnerState();
  if (!Array.isArray(result.actors)) return null;
  return new Set(result.actors.filter(actor => actor && actor.active === true && typeof actor.actorId === 'string').map(actor => actor.actorId));
}

async function readCredentials() {
  if (!CREDENTIAL_FILE || !isAbsolute(CREDENTIAL_FILE)) {
    throw new Error('POPLUR_SYNTHETIC_CREDENTIALS_FILE must be an absolute path outside the repository.');
  }
  const linkInfo = await lstat(CREDENTIAL_FILE);
  if (linkInfo.isSymbolicLink() || !linkInfo.isFile()) {
    throw new Error('Synthetic credentials must be a regular, non-symlink file.');
  }
  if ((linkInfo.mode & 0o777) !== 0o600) {
    throw new Error('Synthetic credentials must have mode 600 (chmod 600).');
  }
  const resolvedPath = await realpath(CREDENTIAL_FILE);
  const repoRelative = relative(REPOSITORY_ROOT, resolvedPath);
  if (repoRelative === '' || (!repoRelative.startsWith('..') && !isAbsolute(repoRelative))) {
    throw new Error('Synthetic credentials must live outside the Poplur repository.');
  }
  const bytes = await readFile(resolvedPath);
  if (bytes.byteLength > 64 * 1024) throw new Error('Synthetic credential file is unexpectedly large.');
  let text = bytes.toString('utf8');
  bytes.fill(0);
  try {
    const parsed = JSON.parse(text);
    const credentials = validateCredentialDocument(parsed);
    if (Array.isArray(parsed?.actors)) {
      parsed.actors.forEach(row => {
        if (row && typeof row === 'object') {
          row.email = '';
          row.password = '';
        }
      });
    } else if (parsed && typeof parsed === 'object') {
      for (const actorId of ACTOR_IDS) {
        if (parsed[actorId] && typeof parsed[actorId] === 'object') {
          parsed[actorId].email = '';
          parsed[actorId].password = '';
        }
      }
    }
    return credentials;
  } finally {
    text = '';
  }
}

async function assertChromeAvailable() {
  await access(CHROME_PATH, fsConstants.X_OK).catch(() => {
    throw new Error(`System Chrome is not executable at ${CHROME_PATH}.`);
  });
}

function resetActorForStart(actor) {
  actor.status = 'starting';
  actor.sessionId = null;
  actor.generation = 0;
  actor.currentScreen = 'feed';
  actor.priorScreen = null;
  actor.action = 'idle';
  actor.sequence = 0;
  actor.journeyIndex = 0;
  actor.lastEventAtMs = 0;
  actor.frameSequence = 0;
  actor.lastFrameAtMs = 0;
  actor.frameSuppressed = true;
  actor.frames.splice(0);
  actor.captureQueue = Promise.resolve(null);
  actor.transitioning = false;
  actor.context = null;
  actor.page = null;
  actor.auth = null;
  actor.signedInAtMs = 0;
}

async function installBrowserSafety(context, page) {
  await context.clearPermissions();
  await context.route('**/*', async route => {
    const request = route.request();
    const target = request.url();
    if (request.isNavigationRequest() && target !== 'about:blank' && !isAllowedAppURL(target)) {
      await route.abort('blockedbyclient');
      return;
    }
    if (isBlockedWriteRequest(target, request.method())) {
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
  await page.addInitScript(() => {
    const denied = () => Promise.reject(new DOMException('Synthetic beta runner denies media capture.', 'NotAllowedError'));
    try {
      if (navigator.mediaDevices) {
        Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: denied });
        Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { configurable: true, value: denied });
      }
    } catch { /* A browser with a sealed mediaDevices object already denies it. */ }
    try {
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition(_success, error) {
            if (typeof error === 'function') error({ code: 1, message: 'Permission denied' });
          },
          watchPosition(_success, error) {
            if (typeof error === 'function') error({ code: 1, message: 'Permission denied' });
            return 0;
          },
          clearWatch() {},
        },
      });
    } catch { /* Playwright context permissions remain empty as the backstop. */ }
    try { window.open = () => null; } catch { /* popup listener remains the backstop. */ }
  });
  page.on('popup', popup => { void popup.close().catch(() => {}); });
  page.on('download', download => { void download.cancel().catch(() => {}); });
  page.on('dialog', dialog => { void dialog.dismiss().catch(() => {}); });
  page.on('filechooser', chooser => { void chooser.setFiles([]).catch(() => {}); });
}

async function signInActor(actor, credential) {
  const context = await runtime.browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    acceptDownloads: false,
    serviceWorkers: 'block',
  });
  actor.context = context;
  let primaryPage = null;
  context.on('page', candidate => {
    if (primaryPage && candidate !== primaryPage) void candidate.close().catch(() => {});
  });
  const page = await context.newPage();
  primaryPage = page;
  actor.page = page;
  await installBrowserSafety(context, page);
  page.setDefaultTimeout(APP_TIMEOUT_MS);

  let email = credential.email;
  let password = credential.password;
  try {
    await page.goto(APP_START_URL, { waitUntil: 'domcontentloaded', timeout: APP_TIMEOUT_MS });
    await readValidatedPoplurScreen(page, 'feed', APP_TIMEOUT_MS);

    const opener = page.getByRole('button', { name: 'Sign in to call', exact: true });
    await opener.waitFor({ state: 'visible' });
    await opener.press('Enter');
    const emailInput = page.getByPlaceholder('Email', { exact: true });
    const passwordInput = page.getByPlaceholder('Password', { exact: true });
    await emailInput.fill(email);
    await passwordInput.fill(password);

    const authResponsePromise = page.waitForResponse(response => (
      response.request().method() === 'POST'
      && /identitytoolkit\.googleapis\.com\/v1\/accounts:signInWithPassword/i.test(response.url())
    ), { timeout: APP_TIMEOUT_MS });
    await page.getByRole('button', { name: 'Sign in', exact: true }).press('Enter');
    const authResponse = await authResponsePromise;
    if (!authResponse.ok()) throw new Error(`Firebase Auth rejected ${actor.actorId}.`);
    const authBody = await authResponse.json().catch(() => null);
    if (!authBody?.idToken || !authBody?.refreshToken || !authBody?.localId) {
      throw new Error(`Firebase Auth returned no usable token for ${actor.actorId}.`);
    }
    if (credential.uid && credential.uid !== authBody.localId) {
      throw new Error(`Firebase account UID does not match ${actor.actorId}.`);
    }
    const authURL = new URL(authResponse.url());
    const apiKey = authURL.searchParams.get('key') || '';
    if (!apiKey) throw new Error(`Firebase Auth response omitted its public API key for ${actor.actorId}.`);

    await page.getByRole('button', { name: 'Sign out', exact: true }).waitFor({ state: 'visible' });
    await page.locator('input[type="password"]').waitFor({ state: 'detached' });
    await readValidatedPoplurScreen(page, 'feed', APP_TIMEOUT_MS);
    actor.signedInAtMs = Date.now();
    actor.auth = {
      idToken: authBody.idToken,
      refreshToken: authBody.refreshToken,
      uid: authBody.localId,
      apiKey,
      expiresAtMs: Date.now() + Math.max(60, Number(authBody.expiresIn) || 3_600) * 1_000,
    };
  } finally {
    // The React card clears its password and unmounts on success. Remove our
    // own long-lived references as soon as this isolated context is ready.
    email = '';
    password = '';
    credential.email = '';
    credential.password = '';
  }
}

async function tokenForActor(actor) {
  const auth = actor.auth;
  if (!auth?.idToken) throw new Error(`No signed-in token is available for ${actor.actorId}.`);
  if (auth.expiresAtMs > Date.now() + 90_000) return auth.idToken;
  const response = await fetchJSON(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(auth.apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: auth.refreshToken }).toString(),
  });
  if (!response.id_token || !response.refresh_token || !response.user_id || response.user_id !== auth.uid) {
    throw new Error(`Firebase token refresh failed for ${actor.actorId}.`);
  }
  auth.idToken = response.id_token;
  auth.refreshToken = response.refresh_token;
  auth.expiresAtMs = Date.now() + Math.max(60, Number(response.expires_in) || 3_600) * 1_000;
  return auth.idToken;
}

async function callIngest(actor, payload) {
  if (!RUNNER_CREDENTIAL) throw new Error('POPLUR_RUNNER_TOKEN is required for testSessionIngest.');
  const token = await tokenForActor(actor);
  const result = await fetchJSON(INGEST_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'x-poplur-runner-token': RUNNER_CREDENTIAL,
    },
    body: JSON.stringify(payload),
  });
  if (result.ok !== true) throw new Error(`testSessionIngest rejected ${actor.actorId}.`);
  return result;
}

function queueCapture(actor, action, expectedScreen) {
  const perform = async () => {
    const sequence = ++actor.frameSequence;
    const capturedAtMs = Date.now();
    let screen = expectedScreen;
    let image = null;
    let frameSuppressed = true;
    try {
      if (!actor.page || actor.page.isClosed()) throw new Error('Browser page is closed.');
      const validated = await readValidatedPoplurScreen(actor.page, expectedScreen, 12_000);
      screen = validated.screen;
      image = await actor.page.screenshot({ type: 'jpeg', quality: 58, timeout: 12_000 });
      frameSuppressed = false;
    } catch {
      // A failed or unvalidated screen creates metadata only. There is never a
      // guessed thumbnail and never a screenshot of WebSignIn or an unsafe UI.
      image = null;
      frameSuppressed = true;
    }
    const frame = { sequence, capturedAtMs, screen, action, frameSuppressed, image };
    pushFrame(actor.frames, frame);
    actor.lastFrameAtMs = capturedAtMs;
    actor.frameSuppressed = frameSuppressed;
    return frame;
  };
  actor.captureQueue = actor.captureQueue.catch(() => null).then(perform);
  return actor.captureQueue;
}

async function sendEvent(actor, step, frame, priorScreen, dwellMs) {
  const eventType = eventTypeForAction(step.action);
  if (!isAllowedEvent(step.screen, step.action, eventType)) {
    throw new Error(`Unsafe runner event rejected locally for ${actor.actorId}.`);
  }
  const sequence = ++actor.sequence;
  const occurredAtMs = Date.now();
  const result = await callIngest(actor, eventIngestRequest({
    actorId: actor.actorId,
    sessionId: actor.sessionId,
    sequence,
    occurredAtMs,
    screen: step.screen,
    action: step.action,
    localFrameSequence: frame.sequence,
    frameSuppressed: frame.frameSuppressed,
    dwellMs: Math.max(0, Math.min(120_000, Math.round(dwellMs))),
    stepIndex: actor.journeyIndex,
    journeyLength: planForActor(actor.actorId).length,
    eventType,
  }));
  if (result.enabled === false) throw new CloudPausedError();
  actor.priorScreen = priorScreen;
  actor.currentScreen = step.screen;
  actor.action = step.action;
  actor.lastEventAtMs = occurredAtMs;
}

async function startCloudSession(actor) {
  const status = await callIngest(actor, statusIngestRequest(actor.actorId));
  if (status.enabled !== true || status.actorId !== actor.actorId) throw new CloudPausedError();
  actor.generation = Number.isFinite(Number(status.generation)) ? Number(status.generation) : 0;
  const occurredAtMs = Date.now();
  const started = await callIngest(actor, startIngestRequest(actor.actorId, occurredAtMs));
  if (started.enabled !== true || started.actorId !== actor.actorId
    || typeof started.sessionId !== 'string' || !started.sessionId) {
    throw new CloudPausedError();
  }
  actor.sessionId = started.sessionId;
  actor.generation = Number.isFinite(Number(started.generation)) ? Number(started.generation) : actor.generation;
  actor.status = 'live';
  const initialStep = planForActor(actor.actorId)[0];
  const frame = await queueCapture(actor, initialStep.action, initialStep.screen);
  await sendEvent(actor, initialStep, frame, null, 0);
  actor.journeyIndex = 1;
}

async function executeStep(actor, step) {
  const page = actor.page;
  if (!page || page.isClosed()) throw new Error(`Browser page closed for ${actor.actorId}.`);
  if (step.method === 'right' || step.method === 'left') {
    const cube = page.getByRole('button', { name: /(tab model — swipe or use arrow keys to change tabs|navigator — swipe to switch tabs)/i });
    await cube.waitFor({ state: 'visible' });
    const accessibleName = await cube.getAttribute('aria-label') || '';
    if (PROHIBITED_CONTROL_NAME.test(accessibleName)) {
      throw new Error(`Unsafe navigator state for ${actor.actorId}.`);
    }
    await cube.press(step.method === 'right' ? 'ArrowRight' : 'ArrowLeft');
  } else if (step.method === 'hold') {
    const cube = page.getByRole('button', { name: /(tab model — swipe or use arrow keys to change tabs|navigator — swipe to switch tabs)/i });
    const box = await cube.boundingBox();
    if (!box) throw new Error(`Navigator is not visible for ${actor.actorId}.`);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    try { await page.waitForTimeout(650); } finally { await page.mouse.up(); }
  } else if (step.method === 'escape') {
    await page.keyboard.press('Escape');
  } else if (step.method !== 'current') {
    throw new Error(`Unknown safe runner method for ${actor.actorId}.`);
  }
  await readValidatedPoplurScreen(page, step.screen, APP_TIMEOUT_MS);
}

async function runActorLoop(actor, epoch) {
  const plan = planForActor(actor.actorId);
  while (runtime.status === 'live' && runtime.epoch === epoch && actor.status === 'live') {
    if (actor.journeyIndex >= plan.length) actor.journeyIndex = 1;
    const step = plan[actor.journeyIndex];
    const dwell = ACTOR_DWELL_BASE_MS
      + ((ACTOR_IDS.indexOf(actor.actorId) * 977 + actor.journeyIndex * 613) % ACTOR_DWELL_SPREAD_MS);
    await waitForEpoch(dwell, epoch);
    const priorScreen = actor.currentScreen;
    actor.transitioning = true;
    try {
      await actor.captureQueue.catch(() => null);
      await executeStep(actor, step);
      const frame = await queueCapture(actor, step.action, step.screen);
      await sendEvent(actor, step, frame, priorScreen, Date.now() - actor.lastEventAtMs);
      actor.journeyIndex += 1;
    } finally {
      actor.transitioning = false;
    }
  }
}

async function waitForEpoch(milliseconds, epoch) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    if (runtime.epoch !== epoch || runtime.status !== 'live') throw new RunnerStoppedError();
    await new Promise(resolvePromise => setTimeout(resolvePromise, Math.min(250, deadline - Date.now())));
  }
}

function beginLiveFrameCapture() {
  clearInterval(runtime.liveFrameTimer);
  runtime.liveFrameTimer = setInterval(() => {
    if (runtime.status !== 'live' || Date.now() > runtime.selectedUntilMs || !runtime.selectedActorId) return;
    const actor = actors.get(runtime.selectedActorId);
    if (!actor || actor.status !== 'live' || actor.transitioning) return;
    void queueCapture(actor, actor.action, actor.currentScreen);
  }, LIVE_FRAME_INTERVAL_MS);
  runtime.liveFrameTimer.unref?.();
}

function beginCloudMonitor() {
  clearInterval(runtime.cloudMonitorTimer);
  runtime.cloudMonitorTimer = setInterval(() => {
    if (runtime.status !== 'live') return;
    const actor = actors.get(ACTOR_IDS[0]);
    void callIngest(actor, statusIngestRequest(actor.actorId))
      .then(result => {
        if (result.enabled !== true) scheduleFailure(new CloudPausedError());
      })
      .catch(error => scheduleFailure(error));
  }, 15_000);
  runtime.cloudMonitorTimer.unref?.();
}

function markSelectedActor(actorId) {
  if (!actors.has(actorId)) return;
  runtime.selectedActorId = actorId;
  runtime.selectedUntilMs = Date.now() + LIVE_SELECTION_LEASE_MS;
  liveRunner.markSelected(actorId);
}

async function startRunner() {
  if (runtime.status === 'live' || runtime.status === 'starting') return publicState();
  if (onboardingRunner.isActive()) throw new Error('The first-user runner is already active.');
  if (liveRunner.isActive()) throw new Error('The live cohort runner is already active.');
  if (onboardingRunner.hasSnapshot()) await onboardingRunner.stop({ clear: true });
  if (liveRunner.hasSnapshot()) await liveRunner.stop({ clear: true });
  runtime.status = 'starting';
  runtime.enabled = false;
  runtime.failureScheduled = false;
  runtime.epoch += 1;
  const epoch = runtime.epoch;
  for (const actor of actors.values()) resetActorForStart(actor);

  try {
    if (!await cloudRunnerEnabled()) {
      runtime.status = 'paused';
      for (const actor of actors.values()) actor.status = 'paused';
      return publicState();
    }
    if (!RUNNER_CREDENTIAL) throw new Error('POPLUR_RUNNER_TOKEN is required before browser sessions can start.');
    await assertChromeAvailable();
    const credentials = await readCredentials();

    runtime.enabled = true;
    runtime.browser = await chromium.launch({
      executablePath: CHROME_PATH,
      headless: true,
      handleSIGINT: false,
      handleSIGTERM: false,
      args: [
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-features=MediaRouter',
        '--disable-sync',
        '--no-first-run',
      ],
    });

    // Five fresh BrowserContexts are created only after both gates above.
    // Authenticate sequentially to avoid Firebase rate-limit bursts, then
    // erase each credential row before moving to the next account.
    try {
      for (const credential of credentials) {
        const actor = actors.get(credential.actorId);
        await signInActor(actor, credential);
      }
    } finally {
      for (const credential of credentials) {
        credential.email = '';
        credential.password = '';
      }
    }

    for (const actor of actors.values()) await startCloudSession(actor);
    if (runtime.epoch !== epoch) throw new RunnerStoppedError();
    runtime.status = 'live';
    beginLiveFrameCapture();
    beginCloudMonitor();
    for (const actor of actors.values()) {
      void runActorLoop(actor, epoch).catch(error => {
        if (!(error instanceof RunnerStoppedError)) scheduleFailure(error);
      });
    }
    return publicState();
  } catch (error) {
    if (error instanceof RunnerStoppedError) return publicState();
    await stopRunnerInternal(error instanceof CloudPausedError ? 'paused' : 'error', error instanceof CloudPausedError ? 'cloud-paused' : 'startup-error');
    return publicState();
  }
}

async function endCloudSession(actor, reason) {
  if (!actor.sessionId || !actor.auth?.idToken) return;
  const sequence = ++actor.sequence;
  await callIngest(actor, endIngestRequest({
    actorId: actor.actorId,
    sessionId: actor.sessionId,
    sequence,
    occurredAtMs: Date.now(),
    reason,
  })).catch(() => {});
}

async function stopRunnerInternal(nextStatus, reason) {
  runtime.epoch += 1;
  runtime.enabled = false;
  clearInterval(runtime.liveFrameTimer);
  clearInterval(runtime.cloudMonitorTimer);
  runtime.liveFrameTimer = null;
  runtime.cloudMonitorTimer = null;
  runtime.selectedActorId = null;
  runtime.selectedUntilMs = 0;
  const endingActors = [...actors.values()].filter(actor => actor.sessionId && actor.auth?.idToken);
  // Close every owned browser context before any downstream cloud pause. The
  // stored synthetic ID tokens are sufficient for best-effort session-end
  // metadata, so no real app pixel or interaction can continue while OFF is
  // waiting on the network.
  if (runtime.browser) await runtime.browser.close().catch(() => {});
  runtime.browser = null;
  await Promise.all(endingActors.map(actor => endCloudSession(actor, reason)));
  for (const actor of actors.values()) {
    actor.status = nextStatus === 'error' ? 'error' : 'paused';
    actor.action = 'session-end';
    actor.sessionId = null;
    actor.context = null;
    actor.page = null;
    actor.auth = null;
  }
  runtime.status = nextStatus;
}

async function pauseRunner() {
  if (runtime.status === 'paused' && !runtime.browser) return publicState();
  await stopRunnerInternal('paused', 'owner-paused');
  return publicState();
}

function scheduleFailure(error) {
  if (runtime.failureScheduled || runtime.status === 'paused' || runtime.status === 'error') return;
  runtime.failureScheduled = true;
  const isCloudPause = error instanceof CloudPausedError;
  commandQueue = commandQueue
    .catch(() => {})
    .then(() => stopRunnerInternal(isCloudPause ? 'paused' : 'error', isCloudPause ? 'cloud-paused' : 'runner-error'));
}

function enqueueCommand(command) {
  const operation = commandQueue
    .catch(() => {})
    .then(async () => {
      if (!command.enabled) {
        if (onboardingRunner.hasSnapshot()) return onboardingRunner.stop({ clear: false });
        if (liveRunner.hasSnapshot()) return liveRunner.stop({ clear: false });
        return pauseRunner();
      }
      if (command.mode === LIVE_MODE) {
        if (onboardingRunner.isActive()) throw new Error('The first-user runner is already active.');
        if (runtime.status === 'live' || runtime.status === 'starting' || runtime.browser) await pauseRunner();
        if (onboardingRunner.hasSnapshot()) await onboardingRunner.stop({ clear: true });
        return liveRunner.start();
      }
      return startRunner();
    });
  commandQueue = operation.catch(() => {});
  return operation;
}

function enqueueOnboarding(command) {
  const operation = commandQueue
    .catch(() => {})
    .then(async () => {
      validateOnboardingCommand(command);
      if (runtime.status === 'live' || runtime.status === 'starting' || runtime.browser) {
        throw new Error('The five-actor runner must be off before first-user onboarding.');
      }
      if (liveRunner.isActive()) throw new Error('The live cohort runner must be off before first-user onboarding.');
      if (liveRunner.hasSnapshot()) await liveRunner.stop({ clear: true });
      return onboardingRunner.start(command);
    });
  commandQueue = operation.catch(() => {});
  return operation;
}

class CloudPausedError extends Error {
  constructor() { super('The production synthetic-runner switch is paused.'); }
}

class RunnerStoppedError extends Error {
  constructor() { super('Synthetic runner stopped.'); }
}

function jsonHeaders() {
  return {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  };
}

function sendJSON(response, status, body) {
  response.writeHead(status, jsonHeaders());
  response.end(JSON.stringify(body));
}

function readSmallJSON(request) {
  return new Promise((resolvePromise, reject) => {
    let body = '';
    let tooLarge = false;
    request.on('data', chunk => {
      if (tooLarge) return;
      body += chunk;
      tooLarge = Buffer.byteLength(body) > MAX_LOCAL_BODY_BYTES;
    });
    request.on('end', () => {
      if (tooLarge) { reject(new Error('Local command body is too large.')); return; }
      try { resolvePromise(JSON.parse(body || '{}')); } catch { reject(new Error('Local command body is invalid.')); }
    });
    request.on('error', reject);
  });
}

const server = createServer(async (request, response) => {
  const requestURL = new URL(request.url || '/', `http://${HOST}:${PORT}`);
  if (request.method === 'GET' && requestURL.pathname === '/health') {
    const state = publicState();
    sendJSON(response, 200, { ok: true, status: state.status, mode: state.mode });
    return;
  }
  if (!internalCredentialMatches(request.headers['x-poplur-local-runner-token'])) {
    sendJSON(response, 403, { error: { message: 'Local runner request is not authorized.' } });
    return;
  }
  if (request.method === 'GET' && requestURL.pathname === '/state') {
    sendJSON(response, 200, publicState());
    return;
  }
  const framesMatch = requestURL.pathname.match(/^\/frames\/([a-zA-Z0-9._:-]+)$/);
  if (request.method === 'GET' && framesMatch) {
    const actorId = framesMatch[1];
    const actor = onboardingRunner.getActor(actorId) ?? liveRunner.getActor(actorId) ?? actors.get(actorId);
    if (!actor) { sendJSON(response, 404, { error: { message: 'Synthetic actor not found.' } }); return; }
    markSelectedActor(actorId);
    sendJSON(response, 200, {
      actorId,
      // Newest first: the selected live tile can paint index zero immediately;
      // sequence still provides deterministic replay ordering.
      frames: [...actor.frames].reverse().map(frame => frameMetadata(actorId, frame)),
    });
    return;
  }
  const frameMatch = requestURL.pathname.match(/^\/frame\/([a-zA-Z0-9._:-]+)$/);
  if (request.method === 'GET' && frameMatch) {
    const actorId = frameMatch[1];
    const actor = onboardingRunner.getActor(actorId) ?? liveRunner.getActor(actorId) ?? actors.get(actorId);
    if (!actor) { sendJSON(response, 404, { error: { message: 'Synthetic actor not found.' } }); return; }
    markSelectedActor(actorId);
    const requestedSequence = requestURL.searchParams.has('sequence')
      ? Number(requestURL.searchParams.get('sequence'))
      : null;
    if (requestedSequence != null && (!Number.isSafeInteger(requestedSequence) || requestedSequence < 1)) {
      sendJSON(response, 400, { error: { message: 'Frame sequence is invalid.' } });
      return;
    }
    const frame = requestedSequence == null
      ? [...actor.frames].reverse().find(candidate => !candidate.frameSuppressed && candidate.image)
      : actor.frames.find(candidate => candidate.sequence === requestedSequence && !candidate.frameSuppressed && candidate.image);
    if (!frame) { sendJSON(response, 404, { error: { message: 'Actual app frame is not available.' } }); return; }
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': 'image/jpeg',
      'content-length': String(frame.image.byteLength),
      'x-poplur-frame-sequence': String(frame.sequence),
    });
    response.end(frame.image);
    return;
  }
  if (request.method === 'POST' && requestURL.pathname === '/command') {
    try {
      const body = await readSmallJSON(request);
      let command;
      try {
        command = validateRunnerCommand(body);
      } catch (error) {
        sendJSON(response, 400, { error: { message: error instanceof Error ? error.message : 'Runner command is invalid.' } });
        return;
      }
      sendJSON(response, 200, await enqueueCommand(command));
    } catch (error) {
      sendJSON(response, 400, { error: { message: error instanceof Error ? error.message.slice(0, 240) : 'Runner command could not be applied.' } });
    }
    return;
  }
  if (request.method === 'POST' && requestURL.pathname === '/onboarding') {
    try {
      const body = await readSmallJSON(request);
      validateOnboardingCommand(body);
      sendJSON(response, 200, await enqueueOnboarding(body));
    } catch (error) {
      sendJSON(response, 409, { error: { message: error instanceof Error ? error.message : 'First-user onboarding could not start.' } });
    }
    return;
  }
  sendJSON(response, 404, { error: { message: 'Local runner route not found.' } });
});

server.listen(PORT, HOST, () => {
  console.log(`Poplur synthetic app runner is PAUSED at http://${HOST}:${PORT}`);
});
server.on('error', error => {
  console.error('Poplur synthetic app runner failed:', error instanceof Error ? error.message : 'unknown error');
  process.exitCode = 1;
});

async function shutdown(signal) {
  await onboardingRunner.stop({ clear: false }).catch(() => {});
  await liveRunner.stop({ clear: false }).catch(() => {});
  await enqueueCommand({ enabled: false }).catch(() => {});
  server.close(() => process.exit(signal === 'SIGINT' ? 130 : 143));
}
process.once('SIGINT', () => { void shutdown('SIGINT'); });
process.once('SIGTERM', () => { void shutdown('SIGTERM'); });

export const SYNTHETIC_RUNNER_LIMITS = Object.freeze({
  actorCount: SYNTHETIC_ACTORS.length,
  maxFramesPerActor: MAX_FRAMES_PER_ACTOR,
  frameStorage: 'memory-only',
});
