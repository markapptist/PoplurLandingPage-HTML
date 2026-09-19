import { installSyntheticCallMedia } from './synthetic-call-media.mjs';
import { LIVE_OWNER_UID, LIVE_CALL_INTERVAL_MS, LIVE_MAX_CALLS_PER_ACTOR, LIVE_CALL_RING_MS, LIVE_CALL_CONNECTED_MS } from './synthetic-social-contract.mjs';
import { access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The approved creative the actors' fake camera plays, in place of Chrome's
 *  built-in green test pattern. Built by build-fake-camera-source.mjs from an
 *  officialContent post; absent means the cohort must not publish at all. */
const APPROVED_CAPTURE_FILE = fileURLToPath(
  new URL('./fake-camera/approved-capture.y4m', import.meta.url),
);
import {
  LIVE_ACTIVITIES,
  LIVE_DM_MESSAGES,
  LIVE_REPLY_CHECK_INTERVAL_MS,
  replyForOwnerMessage,
  LIVE_ENGAGEMENT_INTERVAL_MS,
  LIVE_MAX_DMS_PER_ACTOR,
  LIVE_MAX_LIKES_PER_ACTOR,
  LIVE_MAX_POSTS_PER_ACTOR,
  LIVE_MODE,
  LIVE_POST_INTERVAL_MS,
  LIVE_POST_STAGGER_MS,
  SYNTHETIC_COHORT_ID,
  accountForActor,
  cloudEventForLiveStep,
  createLiveCohortNetworkPolicy,
  isLiveFrameStage,
  livePlanForActor,
  locationForActor,
  randomPostLocation,
  engagementTarget,
  POST_SPREAD_MEMORY,
} from './synthetic-live-actions.mjs';
import {
  ACTOR_IDS,
  SYNTHETIC_ACTORS,
  createFrameRing,
  endIngestRequest,
  eventIngestRequest,
  eventTypeForAction,
  pushFrame,
  startIngestRequest,
  statusIngestRequest,
} from './synthetic-runner-actions.mjs';

const APP_TIMEOUT_MS = 75_000;
const UPLOAD_OUTCOME_TIMEOUT_MS = 105_000;
const LIVE_FRAME_INTERVAL_MS = 1_500;
const LIVE_SELECTION_LEASE_MS = 8_000;
const ACTOR_DWELL_BASE_MS = 4_000;
const ACTOR_DWELL_SPREAD_MS = 3_000;
const SIGN_IN_GAP_MS = 2_500;
const MAX_CONSECUTIVE_STEP_FAILURES = 3;
const ENGAGE_DWELL_MS = 6_000;

/** DOM marker the clay page exposes for each screen a live frame may validate against. */
const SCREEN_MARKERS = Object.freeze({ feed: 'feed', profile: 'profile', map: 'map', 'hold-menu': 'hold', camera: 'camera' });
// The tab navigator's accessible name, in both renderers: the WebGL object
// ("<Tab> tab model — swipe or use arrow keys to change tabs, hold for menu",
// WebGLNavigator.tsx) and the shared-UI sprite that replaced it on the
// trial branch ("<Tab> navigator — swipe to switch tabs, tap to open, hold
// for menu", SpriteNavigator.tsx). Both take Enter and the arrow keys and
// both lead with the tab's name, which moveCubeTo reads. 12 Sep: the sprite
// shipped and every actor timed out here waiting for the old name.
const CUBE_NAME = /(tab model — swipe or use arrow keys to change tabs|navigator — swipe to switch tabs)/i;

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

class LiveStoppedError extends Error {
  constructor() { super('Live cohort runner stopped.'); }
}
class CloudPausedError extends Error {
  constructor() { super('The production synthetic-runner switch is paused.'); }
}

function createActorRuntime(descriptor) {
  const account = accountForActor(descriptor.actorId);
  return {
    actorId: descriptor.actorId,
    actor: descriptor.actor,
    handle: descriptor.handle,
    persona: descriptor.persona,
    place: descriptor.place,
    uid: account.uid,
    email: account.email,
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
    policy: null,
    signedInAtMs: 0,
    postsPublished: 0,
    lastPostId: '',
    lastPostAtMs: 0,
    nextPostAtMs: 0,
    nextEngageAtMs: 0,
    nextDMAtMs: 0,
    nextReplyAtMs: 0,
    repliesSent: 0,
    lastRepliedMessageId: '',
    dmsSent: 0,
    lastDMTo: '',
    lastDMPostId: '',
    consoleTail: [],
    consecutiveFailures: 0,
    lastError: '',
  };
}

async function findFrame(page, selector, timeoutMs = APP_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      try {
        if (await frame.locator(selector).first().isVisible()) return frame;
      } catch { /* A transitioning iframe can detach between discovery and probe. */ }
    }
    await sleep(120);
  }
  throw new Error(`Visible frame did not expose ${selector}.`);
}

async function findVisibleRole(page, role, options, timeoutMs = APP_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      try {
        const locator = frame.getByRole(role, options).first();
        if (await locator.isVisible()) return locator;
      } catch { /* The focused map iframe can replace itself while mounting. */ }
    }
    await sleep(120);
  }
  throw new Error(`Visible frames did not expose ${role}.`);
}

async function activateControl(locator, label) {
  await locator.waitFor({ state: 'visible', timeout: APP_TIMEOUT_MS });
  await locator.evaluate((element, controlLabel) => {
    if (!(element instanceof HTMLButtonElement) || element.disabled) {
      throw new Error(`${controlLabel} is not an enabled button.`);
    }
    element.scrollIntoView({ block: 'center', inline: 'center' });
    element.click();
  }, label);
}

/**
 * Poplur raises its own permission cards (motion, notifications, camera roll,
 * location) as modal alerts over a scrim. While one is up it swallows every
 * real pointer event in the app, so any click elsewhere times out. Answer it
 * the way a tester would before carrying on.
 */
async function answerPermissionCards(frame, { attempts = 4 } = {}) {
  let answered = 0;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const card = frame.getByRole('dialog', { name: /permission$/i }).first();
    if (!await card.isVisible({ timeout: 1_500 }).catch(() => false)) break;
    const allow = card.getByRole('button', { name: 'Allow', exact: true });
    const decline = card.getByRole('button', { name: "Don't Allow", exact: true });
    const choice = await allow.isVisible({ timeout: 1_000 }).catch(() => false) ? allow : decline;
    await choice.click({ timeout: 8_000 }).catch(async () => {
      await choice.evaluate(element => element.click()).catch(() => {});
    });
    answered += 1;
    await sleep(700);
  }
  return answered;
}

async function visibleClayScreen(frame) {
  const screens = await frame.locator('[data-poplur-screen]').evaluateAll(elements => elements
    .filter(element => {
      const style = window.getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > 0 && box.width > 0 && box.height > 0;
    })
    .map(element => element.getAttribute('data-poplur-screen') || '')
    .filter(Boolean));
  return screens[0] || '';
}

async function waitForScreen(frame, expected, timeoutMs = APP_TIMEOUT_MS) {
  const marker = SCREEN_MARKERS[expected] ?? expected;
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    try {
      last = await visibleClayScreen(frame);
      if (last === marker) return last;
    } catch { /* The clay tree may be replacing its current screen. */ }
    await sleep(150);
  }
  throw new Error(`Poplur did not settle on ${expected} (saw ${last || 'nothing'}).`);
}

/**
 * The read-only cohort refuses to touch a cube whose label names the camera,
 * because that runner must never reach a capture surface. The live cohort
 * posts through Camera by design, so the label is only read here to confirm
 * this really is the tab navigator.
 */
async function cubeLocator(frame) {
  const cube = frame.getByRole('button', { name: CUBE_NAME });
  await cube.waitFor({ state: 'visible', timeout: APP_TIMEOUT_MS });
  return cube;
}

/**
 * Tab order is the app's to decide, so never assume one press lands on a
 * given screen. Press in the requested direction until the app itself shows
 * the wanted screen.
 */
/**
 * The cube opens its menu on a 500 ms press that no pointer movement
 * interrupts. Position the pointer through the element itself so the press
 * lands correctly inside the shell's nested clay frame, then hold still.
 */
async function holdCube(page, frame, { attempts = 3 } = {}) {
  const menu = frame.getByRole('dialog', { name: 'Cube hold menu' });
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await answerPermissionCards(frame);
    const cube = await cubeLocator(frame);
    await cube.scrollIntoViewIfNeeded().catch(() => {});
    const box = await cube.boundingBox();
    if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    else await cube.hover({ timeout: 10_000 });
    await page.mouse.down();
    try { await page.waitForTimeout(900 + attempt * 400); } finally { await page.mouse.up(); }
    if (await menu.isVisible({ timeout: 4_000 }).catch(() => false)) {
      // Touching the cube is what first asks for motion, so the card tends to
      // land on top of the menu it just opened.
      await answerPermissionCards(frame);
      return true;
    }
    await sleep(600);
  }
  return false;
}

async function moveCubeTo(frame, expected, direction = 'right') {
  const marker = SCREEN_MARKERS[expected] ?? expected;
  const cube = await cubeLocator(frame);
  if (await visibleClayScreen(frame) === marker) return;
  // Mail/Phone replace the tab DOM. The persistent cube is their actual Back
  // control; Escape is not wired to those screens.
  for (let depth = 0; depth < 4; depth += 1) {
    const screen = await visibleClayScreen(frame);
    if (['feed', 'profile', 'map', 'camera'].includes(screen)) break;
    await cube.press('Enter');
    await sleep(500);
  }
  const key = direction === 'left' ? 'ArrowLeft' : 'ArrowRight';
  for (let count = 0; count < 8; count += 1) {
    await cube.press(key);
    const label = await cube.getAttribute('aria-label');
    const deadline = Date.now() + (label?.toLowerCase().startsWith(expected) ? 20_000 : 5_000);
    while (Date.now() < deadline) {
      if (await visibleClayScreen(frame) === marker) return;
      await sleep(100);
    }
  }
  throw new Error(`Cube navigation could not reach ${expected} (showing ${await visibleClayScreen(frame) || 'nothing'}).`);
}

/**
 * The eight provisioned beta accounts using the real web app shell. Creates
 * nothing outside each actor's own bound ledger: its posts, its post
 * locations, its first-run profile, and view/like engagement calls.
 */
export function createSyntheticLiveRunner({
  chromium,
  chromePath,
  appOrigin,
  clayOrigin,
  fixturePath,
  readCredentials,
  cloudRunnerEnabled,
  cloudRunnerAllowlist = async () => null,
  callIngest,
  verdictLog = process.env.POPLUR_ONBOARDING_VERDICT_LOG !== '0',
}) {
  const actors = new Map(SYNTHETIC_ACTORS.map(descriptor => [descriptor.actorId, createActorRuntime(descriptor)]));
  /** Where the cohort's latest pops landed, across every actor (see randomPostLocation). */
  const recentCohortSpots = [];
  const runtime = {
    mode: null,
    enabled: false,
    status: 'paused',
    browser: null,
    epoch: 0,
    startedAtMs: 0,
    runId: '',
    error: '',
    selectedActorId: null,
    selectedUntilMs: 0,
    liveFrameTimer: null,
    cloudMonitorTimer: null,
    stopping: null,
  };

  const log = message => { if (verdictLog) console.error(`[live] ${message}`); };

  const publicState = () => ({
    ok: true,
    mode: LIVE_MODE,
    cohortId: SYNTHETIC_COHORT_ID,
    activities: LIVE_ACTIVITIES,
    enabled: runtime.enabled,
    status: runtime.status,
    completed: false,
    startedAtMs: runtime.startedAtMs,
    completedAtMs: 0,
    runId: runtime.runId,
    identity: null,
    error: runtime.error,
    actors: ACTOR_IDS.map(actorId => {
      const actor = actors.get(actorId);
      return {
        actorId: actor.actorId,
        actor: actor.actor,
        handle: actor.handle,
        persona: actor.persona,
        place: actor.place,
        uid: actor.uid,
        email: actor.email,
        status: actor.status,
        sessionId: actor.sessionId,
        currentScreen: actor.currentScreen,
        action: actor.action,
        journeyIndex: actor.journeyIndex, transitioning: actor.transitioning,
        lastFrameSequence: actor.frameSequence || null,
        lastFrameAtMs: actor.lastFrameAtMs || 0,
        frameSuppressed: actor.frameSuppressed,
        frameCount: actor.frames.length,
        signedInAtMs: actor.signedInAtMs,
        postsPublished: actor.postsPublished,
        lastPostId: actor.lastPostId,
        lastPostAtMs: actor.lastPostAtMs,
        viewsGiven: actor.viewsApplied || 0,
        likesGiven: actor.likesApplied || 0,
        engagementAttempts: actor.policy?.state.engagementEvents.size || 0,
        dmsSent: actor.dmsSent,
        callsPlaced: actor.callsPlaced || 0, callsConnected: actor.callsConnected || 0,
        lastDMTo: actor.lastDMTo,
        lastError: actor.lastError,
      };
    }),
  });

  const resetActor = actor => {
    Object.assign(actor, {
      status: 'starting', sessionId: null, generation: 0, currentScreen: 'feed', priorScreen: null,
      action: 'idle', sequence: 0, journeyIndex: 0, lastEventAtMs: 0, frameSequence: 0, lastFrameAtMs: 0,
      frameSuppressed: true, captureQueue: Promise.resolve(null), transitioning: false, context: null,
      page: null, auth: null, policy: null, signedInAtMs: 0, postsPublished: 0, lastPostId: '', lastPostSpot: null,
      lastPostAtMs: 0, nextPostAtMs: 0, nextEngageAtMs: 0, nextDMAtMs: 0, dmsSent: 0,
      nextReplyAtMs: 0, repliesSent: 0, lastRepliedMessageId: '',
      lastDMTo: '', lastDMPostId: '', ownerVisitIndex: 0, likedPostIds: new Set(), callsPlaced: 0, callsConnected: 0, viewsApplied: 0, likesApplied: 0, appliedEngagementIds: new Set(), consecutiveFailures: 0, lastError: '',
    });
    actor.consoleTail.length = 0;
    actor.frames.splice(0);
  };

  /**
   * The clay home frame, never the Map iframe nested inside it.
   *
   * Both expose [data-poplur-screen], so picking "the first frame that has
   * one" sometimes handed back the Map. That frame is torn down and rebuilt
   * whenever the actor is moved to a new spot or the picker opens, so a handle
   * to it detaches mid-publish and the whole post fails. The home frame hosts
   * the cube, the composer and the review, and it survives those remounts.
   */
  const clayFrame = async (actor, timeoutMs = 20_000) => {
    const deadline = Date.now() + timeoutMs;
    const isMapFrame = url => /[?&]map=1\b/.test(url);
    while (Date.now() < deadline) {
      const candidates = [];
      for (const frame of actor.page.frames()) {
        try {
          if (!isMapFrame(frame.url()) && await frame.getByRole('button', { name: CUBE_NAME }).isVisible()) return frame;
          if (await frame.locator('[data-poplur-screen]').first().isVisible()) candidates.push(frame);
        } catch { /* a transitioning iframe can detach between discovery and probe */ }
      }
      const home = candidates.find(frame => !isMapFrame(frame.url()));
      if (home) return home;
      if (candidates.length) return candidates[0];
      await sleep(120);
    }
    throw new Error('Visible frame did not expose [data-poplur-screen].');
  };

  /**
   * Re-resolve and retry once when a frame is torn down under an action. A
   * remount is normal here, not an error; only a second failure is real.
   */
  const withFreshFrame = async (actor, run) => {
    try {
      return await run(await clayFrame(actor));
    } catch (error) {
      const message = String(error?.message || error);
      if (!/detached|Cannot find context|Target closed|Execution context was destroyed/i.test(message)) throw error;
      await sleep(1_200);
      return run(await clayFrame(actor));
    }
  };

  /** Frames are recorded only after sign-in, and only of the app itself. */
  const queueCapture = (actor, action, stage, { validate = true } = {}) => {
    const perform = async () => {
      const sequence = ++actor.frameSequence;
      const capturedAtMs = Date.now();
      let image = null;
      let frameSuppressed = true;
      try {
        if (!actor.signedInAtMs || !isLiveFrameStage(stage)) throw new Error('Stage is not recordable.');
        if (!actor.page || actor.page.isClosed()) throw new Error('Browser page is closed.');
        if (validate && SCREEN_MARKERS[stage]) await waitForScreen(await clayFrame(actor), stage, 12_000);
        image = await actor.page.screenshot({ type: 'jpeg', quality: 58, timeout: 12_000 });
        frameSuppressed = false;
      } catch {
        image = null;
        frameSuppressed = true;
      }
      const frame = { sequence, capturedAtMs, screen: stage, action, frameSuppressed, image };
      pushFrame(actor.frames, frame);
      actor.lastFrameAtMs = capturedAtMs;
      actor.frameSuppressed = frameSuppressed;
      return frame;
    };
    actor.captureQueue = actor.captureQueue.catch(() => null).then(perform);
    return actor.captureQueue;
  };

  const installRoutes = async (actor, context, page) => {
    await context.clearPermissions();
    await context.grantPermissions(['camera', 'microphone'], { origin: clayOrigin });
    await context.routeWebSocket(/.*/, async socket => {
      let host = '';
      try { host = new URL(socket.url()).host; } catch { /* fall through to close */ }
      if (![new URL(appOrigin).host, new URL(clayOrigin).host].includes(host)) {
        await socket.close({ code: 1008, reason: 'Live cohort permits loopback WebSockets only.' });
        return;
      }
      socket.connectToServer();
    });
    await context.route('**/*', async route => {
      const request = route.request();
      const target = request.url();
      if (request.isNavigationRequest() && target !== 'about:blank') {
        let origin = '';
        try { origin = new URL(target).origin; } catch { /* blocked below */ }
        if (origin !== appOrigin && origin !== clayOrigin) { await route.abort('blockedbyclient'); return; }
      }
      const verdict = actor.policy.inspect({
        method: request.method(), url: target, postData: request.postData() || '', headers: request.headers(),
      });
      if (verdictLog && verdict.kind !== 'local-app' && verdict.kind !== 'read' && verdict.kind !== 'live-firestore-read') {
        console.error(`[verdict:${actor.actorId}] ${verdict.allow ? 'allow' : 'BLOCK'} ${verdict.kind ?? '-'} ${request.method()} ${target.slice(0, 140)}${verdict.allow ? '' : ` reason=${verdict.reason ?? ''}`}`);
      }
      if (!verdict.allow) { await route.abort('blockedbyclient'); return; }
      if (verdict.kind === 'live-auth-sign-in') {
        const upstream = await route.fetch({ maxRedirects: 0 });
        if (upstream.status() >= 300 && upstream.status() < 400) { await route.abort('blockedbyclient'); return; }
        if (upstream.ok()) {
          const auth = await upstream.json().catch(() => null);
          if (auth?.localId) {
            try { actor.policy.bindAuth({ uid: auth.localId, idToken: auth.idToken, refreshToken: auth.refreshToken }); } catch (error) {
              actor.lastError = error.message;
              await route.abort('blockedbyclient');
              return;
            }
          }
        }
        await route.fulfill({ response: upstream });
        return;
      }
      if (verdict.kind === 'live-auth-refresh') {
        const upstream = await route.fetch({ maxRedirects: 0 });
        if (upstream.ok()) {
          const refreshed = await upstream.json().catch(() => null);
          if (refreshed?.id_token && refreshed?.refresh_token && refreshed.user_id === actor.uid) {
            actor.policy.bindAuth({ uid: refreshed.user_id, idToken: refreshed.id_token, refreshToken: refreshed.refresh_token });
          }
        }
        await route.fulfill({ response: upstream });
        return;
      }
      if (verdict.kind === 'live-engagement') {
        const upstream = await route.fetch({ maxRedirects: 0 });
        const body = await upstream.json().catch(() => null);
        const result = body?.result;
        if (upstream.ok() && result?.applied && !actor.appliedEngagementIds.has(result.eventId)) {
          actor.appliedEngagementIds.add(result.eventId);
          if (result.kind === 'view') actor.viewsApplied += 1;
          if (result.kind === 'like') actor.likesApplied += 1;
          log(`${actor.actorId} server applied ${result.kind} to ${result.postId}; radius=${result.counters?.radiusMeters}`);
        }
        await route.fulfill({ response: upstream });
        return;
      }
      if (verdict.kind === 'live-storage-upload') {
        const upstream = await route.fetch({ maxRedirects: 0 });
        if (upstream.status() >= 300 && upstream.status() < 400) { await route.abort('blockedbyclient'); return; }
        const uploadURL = upstream.headers()['x-goog-upload-url'];
        if (uploadURL) {
          try { actor.policy.bindUploadSession(uploadURL, verdict.objectPath); } catch (error) {
            actor.lastError = error.message;
            await route.abort('blockedbyclient');
            return;
          }
        }
        await route.fulfill({ response: upstream });
        return;
      }
      await route.continue();
    });
    page.on('popup', popup => { void popup.close().catch(() => {}); });
    page.on('download', download => { void download.cancel().catch(() => {}); });
    page.on('dialog', dialog => { void dialog.dismiss().catch(() => {}); });
    page.on('filechooser', chooser => { void chooser.setFiles(fixturePath).catch(() => {}); });
    page.on('console', message => {
      if (message.type() !== 'error' && message.type() !== 'warning') return;
      actor.consoleTail.push(`[${message.type()}] ${message.text().slice(0, 200)}`);
      if (actor.consoleTail.length > 20) actor.consoleTail.shift();
    });
    page.on('pageerror', error => {
      actor.consoleTail.push(`[pageerror] ${String(error?.message || error).slice(0, 200)}`);
      if (actor.consoleTail.length > 20) actor.consoleTail.shift();
    });
  };

  const signInActor = async (actor, credential, epoch) => {
    const identity = accountForActor(actor.actorId);
    if (credential.email.toLowerCase() !== identity.email || credential.uid !== identity.uid) {
      throw new Error(`Credential row does not match the pinned account for ${actor.actorId}.`);
    }
    actor.policy = createLiveCohortNetworkPolicy(identity, runtime.runId);
    const context = await runtime.browser.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
      acceptDownloads: false, serviceWorkers: 'block',
    });
    actor.context = context;
    let primaryPage = null;
    context.on('page', candidate => { if (primaryPage && candidate !== primaryPage) void candidate.close().catch(() => {}); });
    const page = await context.newPage();
    primaryPage = page;
    actor.page = page;
    await installRoutes(actor, context, page);
    page.setDefaultTimeout(APP_TIMEOUT_MS);

    let password = credential.password;
    try {
      const url = new URL(appOrigin);
      url.searchParams.set('syntheticOnboarding', LIVE_MODE);
      url.searchParams.set('syntheticActorId', actor.actorId);
      url.searchParams.set('syntheticRunId', runtime.runId);
      const home = locationForActor(actor.actorId);
      url.searchParams.set('syntheticLatitude', String(home.latitude));
      url.searchParams.set('syntheticLongitude', String(home.longitude));
      await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: APP_TIMEOUT_MS });
      const prelogin = await findFrame(page, '#btnSignIn');
      await sleep(1_200);
      await activateControl(prelogin.locator('#btnSignIn'), 'Sign In');
      await prelogin.locator('#paneSignIn .fieldMail').fill(identity.email);
      await prelogin.locator('#paneSignIn .fieldPass').fill(password);
      const authResponsePromise = page.waitForResponse(response => (
        response.request().method() === 'POST'
        && /identitytoolkit\.googleapis\.com\/v1\/accounts:signInWithPassword/i.test(response.url())
      ), { timeout: APP_TIMEOUT_MS });
      await activateControl(prelogin.locator('#paneSignIn .paneBtn'), 'Sign In submit');
      const authResponse = await authResponsePromise;
      if (!authResponse.ok()) {
        const detail = await authResponse.json().catch(() => null);
        throw new Error(`Production Auth rejected ${actor.actorId} (HTTP ${authResponse.status()} ${detail?.error?.message || 'no message'}).`);
      }
      const authBody = await authResponse.json().catch(() => null);
      if (!authBody?.idToken || !authBody?.refreshToken || authBody.localId !== actor.uid) {
        throw new Error(`Production Auth returned no usable pinned token for ${actor.actorId}.`);
      }
      const apiKey = new URL(authResponse.url()).searchParams.get('key') || '';
      if (!apiKey) throw new Error(`Auth response omitted its public API key for ${actor.actorId}.`);
      actor.auth = {
        idToken: authBody.idToken,
        refreshToken: authBody.refreshToken,
        uid: authBody.localId,
        apiKey,
        expiresAtMs: Date.now() + Math.max(60, Number(authBody.expiresIn) || 3_600) * 1_000,
      };
      const clay = await findFrame(page, '[data-poplur-screen]').catch(async error => {
        // Say what the app was actually showing instead of only that a
        // selector never appeared; a stuck splash and a crashed screen look
        // identical from the selector alone.
        const frames = page.frames().map(frame => frame.url()).join(' | ');
        const visible = await page.evaluate(() => document.body?.innerText?.replace(/\s+/g, ' ').slice(0, 400) || '')
          .catch(() => '(page evaluate failed)');
        log(`${actor.actorId} post-login diagnostics url=${page.url()}`);
        log(`${actor.actorId} frames=${frames}`);
        log(`${actor.actorId} visible="${visible}"`);
        log(`${actor.actorId} console=${actor.consoleTail.slice(-6).join(' ¶ ') || '(none)'}`);
        throw error;
      });
      if (runtime.epoch !== epoch) throw new LiveStoppedError();
      await clay.waitForFunction(expected => {
        const location = window.__poplurNativeLocation;
        return Number(location?.latitude) === expected.latitude && Number(location?.longitude) === expected.longitude;
      }, { latitude: home.latitude, longitude: home.longitude }, { timeout: APP_TIMEOUT_MS });
      await moveCubeTo(clay, 'feed').catch(async error => {
        // The cube is the tab navigator; when it never appears the failure
        // reads as a bare selector timeout. Say what the home frame was
        // actually showing (12 Sep: every actor timed out here after signing
        // in, with nothing in the log to tell a stuck splash from a crash).
        const screen = await visibleClayScreen(clay).catch(() => null);
        const visible = await clay.evaluate(() => document.body?.innerText?.replace(/\s+/g, ' ').slice(0, 400) || '')
          .catch(() => '(frame evaluate failed)');
        log(`${actor.actorId} cube diagnostics screen=${screen || '(none)'} url=${clay.url().slice(0, 160)}`);
        log(`${actor.actorId} visible="${visible}"`);
        log(`${actor.actorId} console=${actor.consoleTail.slice(-6).join(' ¶ ') || '(none)'}`);
        throw error;
      });
      actor.signedInAtMs = Date.now();
      actor.currentScreen = 'feed';
      log(`${actor.actorId} signed in as ${identity.email} at ${home.place} (${home.latitude}, ${home.longitude})`);
    } finally {
      password = '';
      credential.email = '';
      credential.password = '';
    }
  };

  const sendEvent = async (actor, step, frame, priorScreen, dwellMs) => {
    const cloud = cloudEventForLiveStep(step);
    const eventType = eventTypeForAction(cloud.action);
    const sequence = ++actor.sequence;
    const occurredAtMs = Date.now();
    const result = await callIngest(actor, eventIngestRequest({
      actorId: actor.actorId,
      sessionId: actor.sessionId,
      sequence,
      occurredAtMs,
      screen: cloud.screen,
      action: cloud.action,
      localFrameSequence: frame.sequence,
      frameSuppressed: frame.frameSuppressed,
      dwellMs: Math.max(0, Math.min(120_000, Math.round(dwellMs))),
      stepIndex: actor.journeyIndex,
      journeyLength: livePlanForActor(actor.actorId).length,
      eventType,
    }));
    if (result.enabled === false) throw new CloudPausedError();
    actor.priorScreen = priorScreen;
    actor.lastEventAtMs = occurredAtMs;
  };

  const startCloudSession = async actor => {
    const status = await callIngest(actor, statusIngestRequest(actor.actorId));
    if (status.enabled !== true || status.actorId !== actor.actorId) throw new CloudPausedError();
    const started = await callIngest(actor, startIngestRequest(actor.actorId, Date.now()));
    if (started.enabled !== true || started.actorId !== actor.actorId || typeof started.sessionId !== 'string' || !started.sessionId) {
      throw new CloudPausedError();
    }
    actor.sessionId = started.sessionId;
    actor.generation = Number.isFinite(Number(started.generation)) ? Number(started.generation) : 0;
    actor.status = 'live';
    const initialStep = livePlanForActor(actor.actorId)[0];
    const frame = await queueCapture(actor, initialStep.action, initialStep.screen);
    await sendEvent(actor, initialStep, frame, null, 0);
    actor.currentScreen = initialStep.screen;
    actor.action = initialStep.action;
    actor.journeyIndex = 1;
  };

  /**
   * Drop this post somewhere new. The app takes its managed fix from
   * `window.__poplurNativeLocation` and the `poplur-native-location` event
   * (Feed, Home, nearbyLocation), and the map iframe takes a
   * `poplur-location` message directly (MapApp). Doing all three moves the
   * picker's "Use this spot" without a reload. The guard is told the same
   * coordinates first, so the write it then sees is the write it expects.
   */
  // The RN web shell answers every `requestLocation` from the Poplur frame by
  // re-reading syntheticLatitude/syntheticLongitude from ITS OWN URL
  // (resolveSyntheticLocation) and pushing that fix back into the frame. So a
  // move has to rewrite the host URL too, or the next request re-stamps home.
  const setHostSyntheticLocation = async (actor, { latitude, longitude }) => {
    await actor.page.evaluate(({ latitude, longitude }) => {
      const next = new URL(window.location.href);
      next.searchParams.set('syntheticLatitude', String(latitude));
      next.searchParams.set('syntheticLongitude', String(longitude));
      window.history.replaceState(window.history.state, '', next.toString());
    }, { latitude, longitude });
  };

  const stampFrameLocation = async (clay, { latitude, longitude, place }) => {
    await clay.evaluate(({ latitude, longitude, place }) => {
      const fix = { latitude, longitude, place, source: 'managed' };
      window.__poplurNativeLocation = fix;
      window.dispatchEvent(new CustomEvent('poplur-native-location', { detail: fix }));
      for (const frame of Array.from(document.querySelectorAll('iframe'))) {
        frame.contentWindow?.postMessage({ type: 'poplur-location', latitude, longitude }, '*');
      }
    }, { latitude, longitude, place });
  };

  // After a post (or a failed one) the actor browses and engages from home
  // again; the guard measures everything but the post from there.
  const returnActorHome = async actor => {
    const home = locationForActor(actor.actorId);
    try {
      await setHostSyntheticLocation(actor, home);
      const clay = await clayFrame(actor);
      await stampFrameLocation(clay, home);
    } catch (error) {
      log(`${actor.actorId} could not return home: ${error instanceof Error ? error.message.slice(0, 120) : error}`);
    }
  };

  const moveActorForPost = async (actor, clay) => {
    // Every actor's pops push away from the cohort's latest pops, not only
    // from its own last one, so the five of them spread over the board
    // together rather than each wandering into the same dense corner.
    const spot = randomPostLocation(actor.actorId, actor.lastPostSpot ?? null, Math.random, recentCohortSpots);
    actor.policy.state.expectedLocation = spot;
    await setHostSyntheticLocation(actor, spot);
    // The fix lives on the Poplur shell frame (`clay`), not the host page: the
    // picker launch reads that frame's window.__poplurNativeLocation, and the
    // sign-in asserts the home fix there too. Moving the host window was a no-op.
    await stampFrameLocation(clay, spot);
    await clay.waitForFunction(expected => {
      const location = window.__poplurNativeLocation;
      return Number(location?.latitude) === expected.latitude && Number(location?.longitude) === expected.longitude;
    }, { latitude: spot.latitude, longitude: spot.longitude }, { timeout: APP_TIMEOUT_MS });
    log(`${actor.actorId} moved to ${spot.place} (${spot.latitude}, ${spot.longitude}) for this post`);
    return spot;
  };

  const runPostFlow = async actor => {
    const page = actor.page;
    const clay = await clayFrame(actor);
    const before = actor.policy.state.postIds.size;
    const spot = await moveActorForPost(actor, clay);
    // Moving the actor rebuilds the Map iframe, so take a fresh handle rather
    // than carrying one from before the move.
    await withFreshFrame(actor, frame => moveCubeTo(frame, 'camera'));
    actor.currentScreen = 'camera';
    actor.action = 'open-camera';
    await queueCapture(actor, 'open-camera', 'camera');
    await withFreshFrame(actor, async frame => {
      const allow = frame.getByRole('button', { name: 'Allow', exact: true });
      if (await allow.isVisible().catch(() => false)) await allow.click();
      const cube = await cubeLocator(frame);
      await cube.press('Enter');
      const captureReview = frame.getByRole('dialog', { name: 'Review your capture' });
      await captureReview.waitFor({ state: 'visible', timeout: APP_TIMEOUT_MS });
      await captureReview.getByRole('button', { name: /Use this/ }).click();
      await frame.getByRole('dialog', { name: 'Post composer' }).waitFor({ state: 'visible', timeout: APP_TIMEOUT_MS });
    });
    actor.currentScreen = 'composer';
    actor.action = 'capture-photo';
    await queueCapture(actor, 'capture-photo', 'composer', { validate: false });
    await withFreshFrame(actor, frame => frame.getByRole('button', { name: /Use original/i }).click());
    actor.currentScreen = 'location';
    actor.action = 'choose-location';
    await queueCapture(actor, 'choose-location', 'location', { validate: false });
    // "Use this spot" lives in the Map iframe and commits by tearing it down,
    // so the click can land as its own frame goes away. Re-find and retry.
    let spotChosen = false;
    for (let attempt = 0; attempt < 3 && !spotChosen; attempt += 1) {
      try {
        const spotButton = await findVisibleRole(page, 'button', { name: /Use this spot.*Attach the post here/i }, 30_000);
        await spotButton.click({ timeout: 15_000 });
        spotChosen = true;
      } catch (error) {
        const message = String(error?.message || error);
        if (!/detached|Cannot find context|did not expose|Timeout/i.test(message)) throw error;
        // A permission card standing over the home unmounts the map surface
        // (HomeTwin: covered surfaces drop synchronously), so the picker's
        // iframe never appears while one is open. Answer it before retrying.
        const answered = await answerPermissionCards(await clayFrame(actor)).catch(() => 0);
        log(`${actor.actorId} spot picker retry ${attempt + 1}: ${message.slice(0, 70)}${answered ? ` (answered ${answered} permission card)` : ''}`);
        await sleep(1_500);
      }
    }
    if (!spotChosen) {
      // Say what the picker was showing. 15 Sep: every actor's SECOND post
      // failed here ("Visible frames did not expose button") after a clean
      // first one; the compose title tells 'Finding your area…' / 'Choose a
      // spot' / 'Use this spot' apart, and the frame list tells whether the
      // picker iframe exists at all.
      const picker = await Promise.all(page.frames().map(async frame => {
        const url = frame.url().slice(0, 120);
        const screen = await visibleClayScreen(frame).catch(() => '');
        const dialogs = await frame.locator('[role=dialog]').evaluateAll(list => list.map(el => (el.getAttribute('aria-label') || el.querySelector('h1,h2,h3')?.textContent || '').trim().slice(0, 40)).filter(Boolean).slice(0, 6)).catch(() => []);
        const state = `${screen ? ` screen=${screen}` : ''}${dialogs.length ? ` dialogs=${JSON.stringify(dialogs)}` : ''}`;
        const title = await frame.locator('#poplur-map-compose-title').first().textContent({ timeout: 1_000 }).catch(() => null);
        const buttons = title == null ? [] : await frame.locator('[role=dialog] button').evaluateAll(list => list.map(b => (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 40)).filter(Boolean).slice(0, 8)).catch(() => []);
        return title == null ? `${url}${state}` : `${url}${state} title="${title.trim()}" buttons=${JSON.stringify(buttons)}`;
      })).catch(() => []);
      log(`${actor.actorId} picker diagnostics: ${picker.join(' | ') || '(no frames)'}`);
      throw new Error('The Map picker never accepted a spot for this post.');
    }
    // Choosing the spot remounts the map iframe, which can detach the frame
    // handle taken before the picker opened. Re-resolve it for the review.
    const review = await clayFrame(actor);
    await review.getByRole('dialog', { name: 'Post composer' }).waitFor({ state: 'visible', timeout: APP_TIMEOUT_MS });
    actor.currentScreen = 'publish-review';
    actor.action = 'publish-post';
    await queueCapture(actor, 'publish-post', 'publish-review', { validate: false });
    await review.getByLabel('I can share this').check();
    // The composer uploads only through the shell bridge (PostComposer.tsx:
    // isNativeShell() → publishPost); without it the same button shows a
    // local "Posted" with the note "nothing was sent from this browser
    // preview". 13 Sep: 42 straight "no bound post upload" failures after
    // each actor's first post. Say which it is before pressing.
    const shell = await review.evaluate(() => ({ bridge: Boolean(window.PoplurNative), referrer: document.referrer, href: window.location.href.slice(0, 160) }), undefined, { timeout: 10_000 }).catch(() => null);
    if (shell && !shell.bridge) {
      throw new Error(`The Poplur shell bridge is missing from the home frame (referrer ${shell.referrer || 'none'}; ${shell.href}) — the composer would only preview-post.`);
    }
    await review.getByRole('button', { name: /Post to TV/i }).click();
    const postedDialog = review.getByRole('dialog', { name: 'Posted' });
    const uploadAlert = review.getByRole('alert').first();
    const outcome = await Promise.race([
      postedDialog.waitFor({ state: 'visible', timeout: UPLOAD_OUTCOME_TIMEOUT_MS }).then(() => ({ kind: 'posted' })),
      waitForScreen(review, 'map', UPLOAD_OUTCOME_TIMEOUT_MS).then(() => ({ kind: 'map' })),
      uploadAlert.waitFor({ state: 'visible', timeout: UPLOAD_OUTCOME_TIMEOUT_MS })
        .then(async () => ({ kind: 'error', text: (await uploadAlert.innerText()).trim() })),
    ]);
    if (outcome.kind === 'error') throw new Error(`Visible upload failed: ${outcome.text || 'Poplur showed an empty upload error.'}`);
    if (actor.policy.state.postIds.size <= before || !actor.policy.state.lastPostId) {
      throw new Error(`The app reported a post (${outcome.kind}) but no bound post upload was observed.`);
    }
    actor.postsPublished += 1;
    actor.lastPostId = actor.policy.state.lastPostId;
    actor.lastPostSpot = spot;
    recentCohortSpots.push(spot);
    if (recentCohortSpots.length > POST_SPREAD_MEMORY * 2) recentCohortSpots.splice(0, recentCohortSpots.length - POST_SPREAD_MEMORY);
    actor.policy.state.expectedLocation = null;
    await returnActorHome(actor);
    actor.lastPostAtMs = Date.now();
    actor.nextPostAtMs = Date.now() + LIVE_POST_INTERVAL_MS;
    actor.currentScreen = 'posted';
    await queueCapture(actor, 'post-published', 'posted', { validate: false });
    log(`${actor.actorId} published ${actor.lastPostId} (${actor.postsPublished}/${LIVE_MAX_POSTS_PER_ACTOR})`);
    if (outcome.kind === 'posted') {
      const backToCamera = review.getByRole('button', { name: /BACK TO CAMERA/i });
      if (await backToCamera.isVisible().catch(() => false)) await backToCamera.click();
    }
    await moveCubeTo(await clayFrame(actor), 'map');
    actor.currentScreen = 'map';
    actor.action = 'verify-post';
  };

  /**
   * The owner-authorized social journey uses the Feed mailbox and the real
   * message/call transport. Server acknowledgements are the completion signal.
   */
  // Visit the public location of an owner post, then find it through the
  // normal Feed controls. Reading this index never changes reach or counters.
  const OWNER_POST_CANDIDATES = 3;
  const findOwnerPost = async actor => {
    const response = await fetch('https://firestore.googleapis.com/v1/projects/poplur2025/databases/(default)/documents:runQuery', {
      method: 'POST', signal: AbortSignal.timeout(15_000), headers: { authorization: `Bearer ${actor.policy.state.idToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'posts' }],
        where: { fieldFilter: { field: { fieldPath: 'userID' }, op: 'EQUAL', value: { stringValue: LIVE_OWNER_UID } } }, limit: 64 } }),
    });
    if (!response.ok) throw new Error(`Owner post lookup failed (HTTP ${response.status}).`);
    const rows = await response.json();
    const value = field => field?.stringValue ?? field?.doubleValue ?? field?.integerValue;
    const posts = rows.flatMap(row => {
      const fields = row.document?.fields;
      if (!fields || value(fields.status) === 'deleted' || value(fields.audience) === 'private'
        || value(fields.visibilityStatus) === 'expired' || value(fields.locationVisibility) === 'hidden') return [];
      const latitude = Number(value(fields.latitude)), longitude = Number(value(fields.longitude));
      const createdAtMillis = Date.parse(fields.createdAt?.timestampValue || '') || 0;
      return Number.isFinite(latitude) && Number.isFinite(longitude)
        // A post without channelId is filed under the feed's DEFAULT_FEED_CHANNEL
        // ('news', poplur-clay-map/src/nativeFeedPosts.ts) — never 'live'. 13 Sep:
        // the owner's Paris post has no channelId and every fourth engage cycle
        // walked channel 116 for it and gave up.
        ? [{ id: row.document.name.split('/').pop(), latitude, longitude, createdAtMillis, channel: value(fields.channelId) || 'news' }] : [];
    });
    if (!posts.length) return null;
    // The Feed is a newest-N pool: an owner post older than the pool's window
    // is on no channel at all (13 Sep: three of four owner posts had aged out
    // behind the hourly simulation's drops and three engage cycles in four
    // were skipped). Newest first, and when a target is not on its channel,
    // fall through to the next candidate instead of giving up the cycle.
    posts.sort((a, b) => b.createdAtMillis - a.createdAtMillis);
    const startAt = (actor.ownerVisitIndex++ || 0) % posts.length;
    for (let offset = 0; offset < Math.min(posts.length, OWNER_POST_CANDIDATES); offset += 1) {
      const found = await reachOwnerPost(actor, posts[(startAt + offset) % posts.length]);
      if (found) return found;
    }
    return null;
  };

  // Visit one owner post's public location and walk its channel for it.
  // Owner decision 18 Sep 2026: during the student beta the cohort engages its
  // OWN pops (POPLUR_ENGAGE_TARGET=cohort), not the owner's — his four pops had
  // ~200 synthetic likes each in a week and never decayed. Same walk as the
  // owner finder (reachOwnerPost visits the spot and finds the post on its
  // channel); only the query changes. DMs/calls stay with the owner.
  const findCohortPost = async actor => {
    const others = ACTOR_IDS.filter(id => id !== actor.actorId);
    if (!others.length) return null;
    const response = await fetch('https://firestore.googleapis.com/v1/projects/poplur2025/databases/(default)/documents:runQuery', {
      method: 'POST', signal: AbortSignal.timeout(15_000), headers: { authorization: `Bearer ${actor.policy.state.idToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'posts' }],
        where: { fieldFilter: { field: { fieldPath: 'userID' }, op: 'IN', value: { arrayValue: { values: others.map(id => ({ stringValue: id })) } } } }, limit: 64 } }),
    });
    if (!response.ok) throw new Error(`Cohort post lookup failed (HTTP ${response.status}).`);
    const rows = await response.json();
    const value = field => field?.stringValue ?? field?.doubleValue ?? field?.integerValue;
    const posts = rows.flatMap(row => {
      const fields = row.document?.fields;
      if (!fields || value(fields.status) === 'deleted' || value(fields.audience) === 'private'
        || value(fields.visibilityStatus) === 'expired' || value(fields.locationVisibility) === 'hidden') return [];
      const latitude = Number(value(fields.latitude)), longitude = Number(value(fields.longitude));
      const createdAtMillis = Date.parse(fields.createdAt?.timestampValue || '') || 0;
      return Number.isFinite(latitude) && Number.isFinite(longitude)
        ? [{ id: row.document.name.split('/').pop(), latitude, longitude, createdAtMillis, channel: value(fields.channelId) || 'news' }] : [];
    });
    if (!posts.length) return null;
    posts.sort((a, b) => b.createdAtMillis - a.createdAtMillis);
    const startAt = (actor.cohortVisitIndex++ || 0) % posts.length;
    for (let offset = 0; offset < Math.min(posts.length, OWNER_POST_CANDIDATES); offset += 1) {
      const found = await reachOwnerPost(actor, posts[(startAt + offset) % posts.length]);
      if (found) return found;
    }
    return null;
  };
  const findEngagementPost = actor => (engagementTarget() === 'cohort' ? findCohortPost(actor) : findOwnerPost(actor));

  const reachOwnerPost = async (actor, target) => {
    await setHostSyntheticLocation(actor, { ...target, place: 'Visiting an owner post' });
    let clay = await clayFrame(actor);
    await stampFrameLocation(clay, target);
    await moveCubeTo(clay, 'feed');
    // The TV's numbered stepper changes the channel immediately. The wheel
    // animates its selected option and may suspend paints in a background tab.
    const channelNumbers = { food: 101, live: 116, beauty: 103, sports: 104, modelling: 105, fashion: 106, music: 107, tech: 108, news: 109, french: 110, spanish: 111, shopping: 112, cartoon: 113, kids: 114, comedy: 115 };
    // The feed's channel/post control is one of two things: the arrow
    // cluster ("Channel and post controls", four buttons, the channel number in
    // its first span) or, under GESTURE_NAVIGATION_TRIAL, the gesture dock
    // ("Swipe controls. Up: Channel up. …", no buttons, arrow keys on the
    // focused group, one readout span "113 · 1/1"). 12 Sep: the dock shipped
    // and every engage step hung on the cluster's button for 75 s.
    const controls = clay.getByRole('group', { name: /^(Channel and post controls|Swipe controls\.)/ }).first();
    await controls.waitFor({ state: 'visible', timeout: 20_000 });
    const isDock = await controls.evaluate(element => element.hasAttribute('data-poplur-gesture-navigation'));
    const readChannel = () => controls.evaluate(element => {
      const span = Array.from(element.querySelectorAll('span')).find(child => /^\d+/.test(child.textContent?.trim() || ''));
      return span?.textContent?.trim().split(/\s*·\s*/)[0] || '';
    }, undefined, { timeout: 10_000 });
    // The dock's hint line rotates every 2.8 s, so the element is never
    // "stable" and Playwright's focus()/press() wait out their whole timeout.
    // The dock handles keydown on the group itself: focus it in the page and
    // dispatch the key there, skipping the actionability wait.
    const dockKey = key => controls.evaluate((element, keyName) => {
      element.focus();
      element.dispatchEvent(new KeyboardEvent('keydown', { key: keyName, bubbles: true, cancelable: true }));
    }, key, { timeout: 10_000 });
    const channelUp = async () => {
      if (isDock) await dockKey('ArrowUp');
      else await activateControl(controls.getByRole('button', { name: 'Channel up', exact: true }), 'Channel up');
    };
    let selected = await readChannel();
    for (let index = 0; index < 16 && selected !== String(channelNumbers[target.channel]); index += 1) {
      await channelUp();
      await sleep(700);
      selected = await readChannel();
    }
    if (selected !== String(channelNumbers[target.channel])) throw new Error(`Could not tune owner channel ${target.channel}; saw ${selected}.`);
    await sleep(2_000);
    const seen = new Set();
    let empty = 0;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const post = clay.locator('[data-feed-post-id]').first();
      // A channel with no post renders no [data-feed-post-id] at all; each
      // getAttribute then waited the page default (75 s) before its catch,
      // twice per turn, for a hundred turns — the like-post step "hung" for
      // hours on every actor after the 14 Sep reboot. Bound the read and
      // give an empty channel three looks, not a hundred.
      const id = await post.getAttribute('data-feed-post-id', { timeout: 2_000 }).catch(() => '');
      const owner = id ? await post.getAttribute('data-feed-post-owner', { timeout: 2_000 }).catch(() => '') : '';
      if (owner === LIVE_OWNER_UID) return { clay, id };
      if (!id) { empty += 1; if (empty >= 3) break; }
      else if (seen.has(id)) break;
      else seen.add(id);
      if (isDock) await dockKey('ArrowRight');
      else {
        const next = clay.getByRole('button', { name: 'Next post', exact: true }).first();
        if (!await next.isVisible().catch(() => false)) break;
        await activateControl(next, 'Next post');
      }
      await sleep(500);
    }
    // Say so: a silent null here looked like a hang for a whole evening
    // (12 Sep) while the actors were healthy and the owner's post simply was
    // not on the channel.
    log(`${actor.actorId} owner post ${target.id} not reached on channel ${target.channel} (${channelNumbers[target.channel]}); walked ${seen.size} posts${seen.size ? '' : ' (channel empty)'}`);
    return null;
  };

  const openOwnerChat = async actor => {
    const post = await findOwnerPost(actor);
    if (!post) throw new Error('The owner post is not available in the live Feed.');
    actor.policy.bindDMRecipient(LIVE_OWNER_UID);
    await activateControl(post.clay.getByRole('button', { name: 'Message the poster', exact: true }), 'Message the poster');
    const clay = await clayFrame(actor);
    await clay.locator('input[name="message"]').waitFor({ state: 'visible', timeout: 20_000 });
    return { clay, id: post.id };
  };

  const runDMFlow = async actor => {
    if (actor.policy.state.dmSentTo.has(LIVE_OWNER_UID)) return;
    const { clay, id } = await openOwnerChat(actor);
    actor.action = 'send-dm';
    const text = `Hey Mark, ${actor.handle} here — one of your Poplur testers. ${LIVE_DM_MESSAGES[ACTOR_IDS.indexOf(actor.actorId) % LIVE_DM_MESSAGES.length]}`.slice(0, 240);
    await clay.evaluate(() => {
      window.__poplurSyntheticDMSent = null;
      const listener = event => {
        if (event.detail?.type === 'poplurDMSent' || event.detail?.type === 'poplurDMSendFailed') {
          window.__poplurSyntheticDMSent = event.detail.type;
          window.removeEventListener('poplur-dm-result', listener);
        }
      };
      window.addEventListener('poplur-dm-result', listener);
    });
    await clay.locator('input[name="message"]').fill(text);
    await clay.getByRole('button', { name: 'Send', exact: true }).click();
    await clay.waitForFunction(() => window.__poplurSyntheticDMSent, null, { timeout: 30_000 });
    if (await clay.evaluate(() => window.__poplurSyntheticDMSent) !== 'poplurDMSent') throw new Error('The server refused the tester message.');
    actor.dmsSent += 1;
    actor.lastDMTo = LIVE_OWNER_UID;
    actor.lastDMPostId = id;
    log(`${actor.actorId} delivered a message to the owner about ${id}`);
    await (await cubeLocator(clay)).press('Enter');
    await moveCubeTo(await clayFrame(actor), 'feed');
    actor.currentScreen = 'feed';
  };

  let nextOwnerCallAtMs = 0;
  let nextOwnerCallVideo = true;
  /**
   * A tester answers what the owner writes back. The thread is read off the
   * screen the way a person reads it — every bubble says who wrote it
   * (data-dm-message-from) — and only an owner message newer than the
   * actor's own last message, and not yet answered, gets a reply. The reply
   * goes out through the same input and Send as the opener, so the write
   * guard sees exactly the shell's own message shape. Nothing is read from
   * Firestore directly and nothing is written outside the app's own path.
   */
  const runReplyFlow = async actor => {
    actor.nextReplyAtMs = Date.now() + LIVE_REPLY_CHECK_INTERVAL_MS;
    if (!actor.policy.state.dmSentTo.has(LIVE_OWNER_UID)) return;
    const { clay } = await openOwnerChat(actor);
    actor.action = 'reply-dm';
    const thread = await clay.evaluate(() => Array.from(document.querySelectorAll('[data-dm-message-from]'))
      .map(element => ({
        from: element.getAttribute('data-dm-message-from') || '',
        id: element.getAttribute('data-dm-message-id') || '',
        text: (element.textContent || '').trim().slice(0, 240),
      })));
    const lastMine = thread.map(message => message.from).lastIndexOf('me');
    const unanswered = thread.slice(lastMine + 1).filter(message => message.from === 'them');
    const latest = unanswered[unanswered.length - 1];
    const leave = async () => {
      await (await cubeLocator(clay)).press('Enter');
      await moveCubeTo(await clayFrame(actor), 'feed');
      actor.currentScreen = 'feed';
    };
    if (!latest || latest.id === actor.lastRepliedMessageId) {
      log(`${actor.actorId} found nothing new from the owner to answer`);
      await leave();
      return;
    }
    const text = replyForOwnerMessage(actor.actorId, latest.text, actor.repliesSent);
    await clay.evaluate(() => {
      window.__poplurSyntheticDMSent = null;
      const listener = event => {
        if (event.detail?.type === 'poplurDMSent' || event.detail?.type === 'poplurDMSendFailed') {
          window.__poplurSyntheticDMSent = event.detail.type;
          window.removeEventListener('poplur-dm-result', listener);
        }
      };
      window.addEventListener('poplur-dm-result', listener);
    });
    await clay.locator('input[name="message"]').fill(text);
    await clay.getByRole('button', { name: 'Send', exact: true }).click();
    await clay.waitForFunction(() => window.__poplurSyntheticDMSent, null, { timeout: 30_000 });
    if (await clay.evaluate(() => window.__poplurSyntheticDMSent) !== 'poplurDMSent') throw new Error('The server refused the tester reply.');
    actor.lastRepliedMessageId = latest.id;
    actor.repliesSent += 1;
    actor.dmsSent += 1;
    log(`${actor.actorId} answered the owner's message ${latest.id || '(unnamed)'}`);
    await leave();
  };

  const runCallFlow = async actor => {
    if (Date.now() < nextOwnerCallAtMs || actor.callsPlaced >= LIVE_MAX_CALLS_PER_ACTOR) return;
    // Reserve before awaiting UI: eight independent journeys share one owner.
    nextOwnerCallAtMs = Date.now() + LIVE_CALL_INTERVAL_MS;
    const { clay } = await openOwnerChat(actor);
    actor.policy.bindCallRecipient(LIVE_OWNER_UID);
    const video = nextOwnerCallVideo;
    await installSyntheticCallMedia(clay, actor);
    try {
      const before = new Set(actor.policy.state.callIds);
      actor.action = video ? 'video-call-owner' : 'voice-call-owner';
      await clay.getByRole('button', { name: video ? /^FaceTime / : /^Call / }).first().click({ timeout: 10_000 });
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline && actor.policy.state.callIds.size === before.size) await sleep(250);
      const id = [...actor.policy.state.callIds].find(id => !before.has(id));
      if (!id) throw new Error('The app did not create the owner call.');
      // This is the shared call engine's actual state, not a timer that pretends
      // the receiver answered. Only an accepted WebRTC connection is connected.
      let connectedAt = 0;
      const started = Date.now();
      await clay.waitForFunction(async expected => (await import('/src/webCall.ts')).callState().callId === expected, id, { timeout: 15_000 });
      actor.callsPlaced += 1;
      nextOwnerCallVideo = !video;
      log(`${actor.actorId} placed ${video ? 'video' : 'voice'} call ${id} to the owner`);
      while (runtime.status === 'live') {
        const state = await clay.evaluate(async () => (await import('/src/webCall.ts')).callState());
        if (state.phase === 'connected' && !connectedAt) { connectedAt = Date.now(); actor.callsConnected += 1; }
        if (state.phase === 'ended' || state.phase === 'idle') break;
        if (connectedAt ? Date.now() - connectedAt > LIVE_CALL_CONNECTED_MS : Date.now() - started > LIVE_CALL_RING_MS) break;
        await sleep(1_000);
      }
      // Hangup through the shared engine also covers a receiver declining while
      // Phone is still finishing its boot animation.
    } finally {
      await clay.evaluate(async () => {
        (await import('/src/webCall.ts')).hangup();
        window.__poplurRestoreSyntheticCallMedia?.();
      }).catch(() => {});
    }
    await (await cubeLocator(clay)).press('Enter');
    await moveCubeTo(await clayFrame(actor), 'feed');
    actor.currentScreen = 'feed';
  };

  const runEngageFlow = async actor => {
    let post = await findEngagementPost(actor);
    if (!post) { log(`${actor.actorId} engage skipped: no ${engagementTarget()} post reachable; next try in ${Math.round(LIVE_ENGAGEMENT_INTERVAL_MS / 60_000)} min`); actor.nextEngageAtMs = Date.now() + LIVE_ENGAGEMENT_INTERVAL_MS; return; }
    actor.currentScreen = 'feed';
    actor.action = 'view-post';
    // A view requires the real image/video to be ready. Failed media is never
    // converted into an artificial view just to make the counter move.
    await sleep(ENGAGE_DWELL_MS);
    // The shared-UI shell remounts the home frame during the dwell; a frame
    // handle taken before it detaches and every locator on it times out
    // (12 Sep: every like-post step died this way). Re-resolve the live frame
    // now, and again for the press.
    let clay = await clayFrame(actor);
    if (await clay.locator('[data-feed-post-id]').first().getAttribute('data-feed-post-id') !== post.id) {
      post = await findEngagementPost(actor);
      if (!post) return;
      clay = await clayFrame(actor);
    }
    if (!actor.likedPostIds.has(post.id) && actor.policy.state.likesGiven < LIVE_MAX_LIKES_PER_ACTOR) {
      const response = actor.page.waitForResponse(response => response.url().includes('/recordPostEngagement')
        && response.request().postDataJSON()?.data?.kind === 'like'
        && response.request().postDataJSON()?.data?.postId === post.id.replace(/^firestore:/, ''), { timeout: 20_000 });
      // The rail's like button sits in a frame the shell can remount between
      // resolving it and pressing it; activateControl's DOM click then hangs
      // on a detached node until APP_TIMEOUT_MS. Press with bounded attempts,
      // re-resolving the frame each time, the way the permission cards are
      // answered.
      let pressed = false;
      for (let attempt = 0; attempt < 3 && !pressed; attempt += 1) {
        const like = (await clayFrame(actor)).getByRole('button', { name: /Increase this post.s radius by one/i }).first();
        pressed = await like.click({ timeout: 8_000 }).then(() => true).catch(async () => (
          like.evaluate(element => { element.scrollIntoView({ block: 'center', inline: 'center' }); element.click(); }, undefined, { timeout: 8_000 })
            .then(() => true).catch(() => false)
        ));
        if (!pressed) await sleep(500);
      }
      if (!pressed) throw new Error('The like button could not be pressed.');
      const result = await response;
      const body = await result.json();
      if (!result.ok() || body.error) throw new Error(body.error?.message || 'The server refused the tester like.');
      actor.likedPostIds.add(post.id);
      log(`${actor.actorId} owner engagement applied=${body.result?.applied} radius=${body.result?.counters?.radiusMeters}`);
    }
    actor.nextEngageAtMs = Date.now() + LIVE_ENGAGEMENT_INTERVAL_MS;
  };

  const executeStep = async (actor, step) => {
    const page = actor.page;
    if (!page || page.isClosed()) throw new Error(`Browser page closed for ${actor.actorId}.`);
    const clay = await clayFrame(actor);
    // A permission card left standing blocks every later click, so clear one
    // before each step rather than only where it first appeared.
    if (await answerPermissionCards(clay)) log(`${actor.actorId} answered a Poplur permission card`);
    if (step.method === 'right' || step.method === 'left') {
      await moveCubeTo(clay, step.screen, step.method);
    } else if (step.method === 'hold') {
      if (!await holdCube(page, clay)) throw new Error('The cube did not open its hold menu.');
      await waitForScreen(clay, step.screen, 15_000);
    } else if (step.method === 'escape') {
      await (await cubeLocator(clay)).press('Enter');
      // Back returns to whichever tab was behind the menu; steer from there
      // rather than assuming which one that is.
      await moveCubeTo(clay, step.screen);
    } else if (step.method === 'current') {
      await moveCubeTo(clay, step.screen);
    } else if (step.method === 'post') {
      await runPostFlow(actor);
    } else if (step.method === 'engage') {
      await runEngageFlow(actor);
    } else if (step.method === 'call') {
      await runCallFlow(actor);
    } else if (step.method === 'dm') {
      await runDMFlow(actor);
    } else if (step.method === 'reply') {
      await runReplyFlow(actor);
    } else {
      throw new Error(`Unknown live runner method for ${actor.actorId}.`);
    }
  };

  const stepIsDue = (actor, step) => {
    if (step.method === 'post') return Date.now() >= actor.nextPostAtMs && actor.postsPublished < LIVE_MAX_POSTS_PER_ACTOR;
    if (step.method === 'engage') return Date.now() >= actor.nextEngageAtMs;
    if (step.method === 'call') return Date.now() >= nextOwnerCallAtMs && actor.callsPlaced < LIVE_MAX_CALLS_PER_ACTOR;
    if (step.method === 'reply') {
      return Boolean(actor.policy?.state.dmSentTo.has(LIVE_OWNER_UID)) && Date.now() >= actor.nextReplyAtMs;
    }
    if (step.method === 'dm') {
      if (actor.policy?.state.dmSentTo.has(LIVE_OWNER_UID)) return false;
      return Date.now() >= actor.nextDMAtMs
        && (actor.policy?.state.dmRecipients.size ?? LIVE_MAX_DMS_PER_ACTOR) < LIVE_MAX_DMS_PER_ACTOR;
    }
    return true;
  };

  const waitForEpoch = async (milliseconds, epoch) => {
    const deadline = Date.now() + milliseconds;
    while (Date.now() < deadline) {
      if (runtime.epoch !== epoch || runtime.status !== 'live') throw new LiveStoppedError();
      await sleep(Math.min(250, deadline - Date.now()));
    }
  };

  const runActorLoop = async (actor, epoch) => {
    const plan = livePlanForActor(actor.actorId);
    while (runtime.status === 'live' && runtime.epoch === epoch && actor.status === 'live') {
      if (actor.journeyIndex >= plan.length) actor.journeyIndex = 1;
      const step = plan[actor.journeyIndex];
      if (!stepIsDue(actor, step)) { actor.journeyIndex += 1; continue; }
      const dwell = ACTOR_DWELL_BASE_MS + ((ACTOR_IDS.indexOf(actor.actorId) * 977 + actor.journeyIndex * 613) % ACTOR_DWELL_SPREAD_MS);
      await waitForEpoch(dwell, epoch);
      const priorScreen = actor.currentScreen;
      actor.transitioning = true;
      try {
        await actor.captureQueue.catch(() => null);
        log(`${actor.actorId} starting ${step.action}`);
        await executeStep(actor, step);
        const frame = await queueCapture(actor, step.action, step.method === 'post' ? 'map' : step.screen);
        await sendEvent(actor, step, frame, priorScreen, Date.now() - actor.lastEventAtMs);
        actor.currentScreen = step.method === 'post' ? 'map' : step.screen;
        actor.action = step.action;
        actor.consecutiveFailures = 0;
        actor.lastError = '';
        actor.journeyIndex += 1;
      } catch (error) {
        if (error instanceof LiveStoppedError || error instanceof CloudPausedError) throw error;
        actor.consecutiveFailures += 1;
        actor.lastError = error instanceof Error ? error.message.slice(0, 200) : 'step failed';
        log(`${actor.actorId} step ${step.action} failed (${actor.consecutiveFailures}): ${actor.lastError}`);
        if (step.method === 'post') {
          actor.nextPostAtMs = Date.now() + Math.round(LIVE_POST_INTERVAL_MS / 4);
          if (actor.policy) actor.policy.state.expectedLocation = null;
          await returnActorHome(actor);
        }
        if (step.method === 'engage') actor.nextEngageAtMs = Date.now() + LIVE_ENGAGEMENT_INTERVAL_MS;
        if (step.method === 'dm') actor.nextDMAtMs = Date.now() + LIVE_ENGAGEMENT_INTERVAL_MS;
        if (step.method === 'reply') actor.nextReplyAtMs = Date.now() + LIVE_ENGAGEMENT_INTERVAL_MS;
        if (actor.consecutiveFailures >= MAX_CONSECUTIVE_STEP_FAILURES) {
          actor.status = 'error';
          actor.action = 'actor-error';
          break;
        }
        actor.journeyIndex += 1;
      } finally {
        actor.transitioning = false;
      }
    }
    if ([...actors.values()].every(candidate => candidate.status !== 'live' && candidate.status !== 'starting') && runtime.status === 'live') {
      throw new Error('Every live cohort actor stopped.');
    }
  };

  const beginLiveFrameCapture = () => {
    clearInterval(runtime.liveFrameTimer);
    runtime.liveFrameTimer = setInterval(() => {
      if (runtime.status !== 'live' || Date.now() > runtime.selectedUntilMs || !runtime.selectedActorId) return;
      const actor = actors.get(runtime.selectedActorId);
      if (!actor || actor.status !== 'live' || actor.transitioning) return;
      void queueCapture(actor, actor.action, actor.currentScreen);
    }, LIVE_FRAME_INTERVAL_MS);
    runtime.liveFrameTimer.unref?.();
  };

  const beginCloudMonitor = onFailure => {
    clearInterval(runtime.cloudMonitorTimer);
    runtime.cloudMonitorTimer = setInterval(() => {
      if (runtime.status !== 'live') return;
      const actor = [...actors.values()].find(candidate => candidate.auth?.idToken) ?? actors.get(ACTOR_IDS[0]);
      void callIngest(actor, statusIngestRequest(actor.actorId))
        .then(result => { if (result.enabled !== true) onFailure(new CloudPausedError()); })
        .catch(error => onFailure(error));
    }, 15_000);
    runtime.cloudMonitorTimer.unref?.();
  };

  const endCloudSession = async (actor, reason) => {
    if (!actor.sessionId || !actor.auth?.idToken) return;
    const sequence = ++actor.sequence;
    await callIngest(actor, endIngestRequest({ actorId: actor.actorId, sessionId: actor.sessionId, sequence, occurredAtMs: Date.now(), reason })).catch(() => {});
  };

  const stop = async ({ clear = false, status = 'paused', reason = 'owner-paused' } = {}) => {
    runtime.epoch += 1;
    runtime.enabled = false;
    clearInterval(runtime.liveFrameTimer);
    clearInterval(runtime.cloudMonitorTimer);
    runtime.liveFrameTimer = null;
    runtime.cloudMonitorTimer = null;
    runtime.selectedActorId = null;
    runtime.selectedUntilMs = 0;
    const ending = [...actors.values()].filter(actor => actor.sessionId && actor.auth?.idToken);
    if (runtime.browser) await runtime.browser.close().catch(() => {});
    runtime.browser = null;
    await Promise.all(ending.map(actor => endCloudSession(actor, reason)));
    for (const actor of actors.values()) {
      actor.status = status === 'error' ? 'error' : 'paused';
      actor.action = 'session-end';
      actor.sessionId = null;
      actor.context = null;
      actor.page = null;
      actor.auth = null;
      actor.transitioning = false;
    }
    runtime.status = status;
    if (clear) {
      runtime.mode = null;
      runtime.runId = '';
      runtime.startedAtMs = 0;
      runtime.error = '';
      for (const actor of actors.values()) resetActor(actor), (actor.status = 'paused');
    }
    return publicState();
  };

  const failRun = error => {
    if (runtime.stopping || runtime.status === 'paused' || runtime.status === 'error') return;
    const cloudPause = error instanceof CloudPausedError;
    runtime.error = cloudPause ? '' : (error instanceof Error ? error.message.slice(0, 240) : 'Live cohort run failed.');
    runtime.stopping = stop({ status: cloudPause ? 'paused' : 'error', reason: cloudPause ? 'cloud-paused' : 'runner-error' })
      .finally(() => { runtime.stopping = null; });
  };

  const start = async () => {
    if (runtime.status === 'starting' || runtime.status === 'live') throw new Error('The live cohort runner is already active.');
    await stop({ clear: true });
    runtime.mode = LIVE_MODE;
    runtime.status = 'starting';
    runtime.enabled = false;
    runtime.error = '';
    runtime.startedAtMs = Date.now();
    runtime.runId = `live-cohort-${runtime.startedAtMs.toString(36)}`;
    const epoch = ++runtime.epoch;
    for (const actor of actors.values()) resetActor(actor);

    try {
      if (!await cloudRunnerEnabled()) {
        runtime.status = 'paused';
        for (const actor of actors.values()) actor.status = 'paused';
        return publicState();
      }
      await Promise.all([access(chromePath, fsConstants.X_OK), access(fixturePath, fsConstants.R_OK)]);
      const credentials = await readCredentials();
      // Fail closed. If the approved creative is missing, Chrome silently
      // falls back to synthesising its own frames, and the cohort publishes
      // that to production instead — which is exactly how the green capture
      // shipped. No approved source, no session.
      if (!existsSync(APPROVED_CAPTURE_FILE)) {
        throw new Error(
          `The approved fake-camera creative is missing at ${APPROVED_CAPTURE_FILE}. `
          + 'Run scripts/build-fake-camera-source.mjs before starting the live cohort; '
          + 'the actors must never publish Chrome\'s synthesised capture.',
        );
      }
      runtime.browser = await chromium.launch({
        executablePath: chromePath,
        headless: true,
        handleSIGINT: false,
        handleSIGTERM: false,
        args: [
          '--disable-background-networking', '--disable-component-update', '--disable-default-apps',
          '--disable-features=MediaRouter', '--disable-sync', '--no-first-run',
          '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required',
          // What the actors' camera actually sees. Without this Chrome
          // synthesises its own capture — a flat green field with a spinning
          // wedge — and every post the cohort publishes carries THAT as its
          // creative, on production, under a real account. Sixty-eight of them
          // reached the live map before this was caught (5 Sep 2026).
          // The frames come from the same approved pool the radius lab draws
          // on: officialContent, the licensed demo creatives the owner signed
          // off. Regenerate with scripts/build-fake-camera-source.mjs.
          `--use-file-for-fake-video-capture=${APPROVED_CAPTURE_FILE}`,
        ],
      });
      runtime.enabled = true;
      nextOwnerCallAtMs = Date.now() + 60_000;
      const allowlist = await cloudRunnerAllowlist().catch(() => null);
      try {
        for (const credential of credentials) {
          if (runtime.epoch !== epoch) throw new LiveStoppedError();
          const actor = actors.get(credential.actorId);
          if (allowlist && !allowlist.has(credential.actorId)) {
            // Not this generation's actor: skip it rather than sign it in and
            // watch the cloud refuse its session.
            actor.status = 'paused';
            actor.action = 'not-allowlisted';
            actor.lastError = '';
            log(`${actor.actorId} skipped: not allowlisted by the cloud for this generation`);
            continue;
          }
          try {
            await signInActor(actor, credential, epoch);
            await startCloudSession(actor);
            const now = Date.now();
            actor.nextPostAtMs = now + 5 * 60_000 + ACTOR_IDS.indexOf(actor.actorId) * LIVE_POST_STAGGER_MS;
            actor.nextEngageAtMs = now;
            actor.nextDMAtMs = now;
            if (runtime.status === 'starting') {
              runtime.status = 'live';
              beginLiveFrameCapture();
              beginCloudMonitor(failRun);
            }
            void runActorLoop(actor, epoch).catch(error => { if (!(error instanceof LiveStoppedError)) failRun(error); });
          } catch (error) {
            if (error instanceof LiveStoppedError) throw error;
            actor.status = 'error';
            actor.action = 'sign-in-failed';
            actor.lastError = error instanceof Error ? error.message.slice(0, 200) : 'sign-in failed';
            log(`${actor.actorId} sign-in failed: ${actor.lastError}`);
            await actor.context?.close().catch(() => {});
            actor.context = null;
            actor.page = null;
          }
          await sleep(SIGN_IN_GAP_MS);
        }
      } finally {
        for (const credential of credentials) { credential.email = ''; credential.password = ''; }
      }
      const signedIn = [...actors.values()].filter(actor => actor.auth?.idToken && actor.page);
      if (!signedIn.length) throw new Error('No live cohort account could sign in to the real app.');
      if (runtime.epoch !== epoch) throw new LiveStoppedError();
      return publicState();
    } catch (error) {
      if (error instanceof LiveStoppedError) return publicState();
      runtime.error = error instanceof CloudPausedError ? '' : (error instanceof Error ? error.message.slice(0, 240) : 'Live cohort run failed.');
      await stop({ status: error instanceof CloudPausedError ? 'paused' : 'error', reason: error instanceof CloudPausedError ? 'cloud-paused' : 'startup-error' });
      return publicState();
    }
  };

  return {
    mode: LIVE_MODE,
    isActive: () => runtime.status === 'starting' || runtime.status === 'live',
    hasSnapshot: () => runtime.mode === LIVE_MODE,
    publicState,
    getActor: actorId => (runtime.mode === LIVE_MODE ? actors.get(actorId) ?? null : null),
    markSelected: actorId => {
      if (!actors.has(actorId)) return;
      runtime.selectedActorId = actorId;
      runtime.selectedUntilMs = Date.now() + LIVE_SELECTION_LEASE_MS;
    },
    start,
    stop,
  };
}
