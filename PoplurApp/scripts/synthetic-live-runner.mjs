import { access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import {
  LIVE_ACTIVITIES,
  LIVE_DM_MESSAGES,
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
const CUBE_NAME = /tab model — swipe or use arrow keys to change tabs/i;

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
  const key = direction === 'left' ? 'ArrowLeft' : 'ArrowRight';
  for (let count = 0; count < 8; count += 1) {
    await cube.press(key);
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      if (await visibleClayScreen(frame) === marker) return;
      await sleep(100);
    }
  }
  throw new Error(`Cube navigation could not reach ${expected} (showing ${await visibleClayScreen(frame) || 'nothing'}).`);
}

/**
 * The five provisioned beta accounts using the real web app shell. Creates
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
  callIngest,
  verdictLog = process.env.POPLUR_ONBOARDING_VERDICT_LOG !== '0',
}) {
  const actors = new Map(SYNTHETIC_ACTORS.map(descriptor => [descriptor.actorId, createActorRuntime(descriptor)]));
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
        lastFrameSequence: actor.frameSequence || null,
        lastFrameAtMs: actor.lastFrameAtMs || 0,
        frameSuppressed: actor.frameSuppressed,
        frameCount: actor.frames.length,
        signedInAtMs: actor.signedInAtMs,
        postsPublished: actor.postsPublished,
        lastPostId: actor.lastPostId,
        lastPostAtMs: actor.lastPostAtMs,
        viewsGiven: actor.policy?.state.viewsGiven ?? 0,
        likesGiven: actor.policy?.state.likesGiven ?? 0,
        dmsSent: actor.policy?.state.dmsSent ?? 0,
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
      lastDMTo: '', lastDMPostId: '', consecutiveFailures: 0, lastError: '',
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
    await context.grantPermissions(['camera'], { origin: clayOrigin });
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
      await moveCubeTo(clay, 'feed');
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
    const spot = randomPostLocation(actor.actorId, actor.lastPostSpot ?? null);
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
        log(`${actor.actorId} spot picker retry ${attempt + 1}: ${message.slice(0, 70)}`);
        await sleep(1_500);
      }
    }
    if (!spotChosen) throw new Error('The Map picker never accepted a spot for this post.');
    // Choosing the spot remounts the map iframe, which can detach the frame
    // handle taken before the picker opened. Re-resolve it for the review.
    const review = await clayFrame(actor);
    await review.getByRole('dialog', { name: 'Post composer' }).waitFor({ state: 'visible', timeout: APP_TIMEOUT_MS });
    actor.currentScreen = 'publish-review';
    actor.action = 'publish-post';
    await queueCapture(actor, 'publish-post', 'publish-review', { validate: false });
    await review.getByLabel('I can share this').check();
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
      throw new Error('The app reported a post but no bound post upload was observed.');
    }
    actor.postsPublished += 1;
    actor.lastPostId = actor.policy.state.lastPostId;
    actor.lastPostSpot = spot;
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
   * The app's own route from a post to its owner: hold the cube on Feed, open
   * VIEW PROFILE, press the Message button on the visited profile, type, Send,
   * and confirm the app's own "Sent to …" acknowledgement. Nothing is
   * fabricated — the shell's real sendDM performs the write.
   */
  const runDMFlow = async actor => {
    const clay = await clayFrame(actor);
    await moveCubeTo(clay, 'feed');
    actor.currentScreen = 'feed';
    // The feed mixes demo cards (no owner) with real posts, and the actor's
    // own posts cannot be messaged. Step through a bounded number of posts
    // with the app's own Next control until a messageable one is showing.
    // Read from the element that actually carries the post id: more than one
    // node claims data-poplur-screen="feed", and the outer one has no post.
    const feed = clay.locator('[data-feed-post-id]').first();
    // Posts arrive from the shell after the Feed mounts, so give the first one
    // time to land before deciding the feed is empty.
    for (let wait = 0; wait < 12; wait += 1) {
      if (await feed.count().catch(() => 0)) break;
      await answerPermissionCards(clay);
      await sleep(1_800);
    }
    let owner = '';
    let postId = '';
    const seen = [];
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await answerPermissionCards(clay);
      const candidateOwner = (await feed.getAttribute('data-feed-post-owner').catch(() => '') || '').trim();
      const candidateId = (await feed.getAttribute('data-feed-post-id').catch(() => '') || '').trim();
      seen.push(`${candidateId || 'no-id'}:${candidateOwner || 'no-owner'}`);
      if (candidateOwner && candidateOwner !== actor.uid && !actor.policy.state.dmSentTo.has(candidateOwner)) {
        owner = candidateOwner;
        postId = candidateId;
        break;
      }
      // Within a channel, step to the next post; an empty channel has no post
      // to advance to, so change channel the way a viewer would.
      const next = clay.getByRole('button', { name: 'Next post' }).first();
      const advanced = !candidateId
        ? false
        : await next.isVisible({ timeout: 2_500 }).catch(() => false)
          && await next.click({ timeout: 6_000 }).then(() => true).catch(() => false);
      if (!advanced) {
        const channel = clay.getByRole('button', { name: 'Channel up' }).first();
        if (!await channel.isVisible({ timeout: 2_500 }).catch(() => false)) break;
        if (!await channel.click({ timeout: 6_000 }).then(() => true).catch(() => false)) break;
        await sleep(2_200);
        continue;
      }
      await sleep(1_500);
    }
    if (!owner) {
      actor.action = 'dm-skipped-no-messageable-post';
      actor.nextDMAtMs = Date.now() + LIVE_ENGAGEMENT_INTERVAL_MS;
      log(`${actor.actorId} found no messageable post; saw ${seen.join(', ')}`);
      const feedShape = await clay.evaluate(() => ({
        screens: [...document.querySelectorAll('[data-poplur-screen]')].map(node => node.getAttribute('data-poplur-screen')).join(','),
        postNodes: document.querySelectorAll('[data-feed-post-id]').length,
        buttons: [...document.querySelectorAll('button')]
          .filter(node => node.offsetParent !== null)
          .map(node => node.getAttribute('aria-label') || node.textContent?.trim().slice(0, 18))
          .filter(Boolean).slice(0, 14).join(' | '),
        text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 160),
      })).catch(error => ({ error: String(error?.message || error).slice(0, 100) }));
      log(`${actor.actorId} feed shape=${JSON.stringify(feedShape)}`);
      await queueCapture(actor, 'dm-empty-feed', 'feed', { validate: false });
      return;
    }
    try {
      actor.policy.bindDMRecipient(owner);
    } catch (error) {
      actor.action = 'dm-capped';
      actor.lastError = error.message;
      actor.nextDMAtMs = Date.now() + LIVE_POST_INTERVAL_MS;
      return;
    }

    if (!await holdCube(actor.page, clay)) {
      actor.action = 'dm-blocked-hold-menu';
      actor.nextDMAtMs = Date.now() + LIVE_ENGAGEMENT_INTERVAL_MS;
      log(`${actor.actorId} could not open the hold menu to reach ${owner}'s profile`);
      return;
    }
    await activateControl(clay.getByRole('button', { name: 'Open VIEW PROFILE subscreen' }), 'View profile');
    await waitForScreen(clay, 'profile', 20_000);
    actor.currentScreen = 'profile';
    actor.action = 'open-poster-profile';

    // VIEW PROFILE lands on the poster's profile with a subscreen pushed over
    // it; the Message control belongs to the profile itself, so step back out
    // of any page still covering it before giving up.
    const messageButton = clay.getByRole('button', { name: /^Message / }).first();
    let messageReady = false;
    for (let attempt = 0; attempt < 3 && !messageReady; attempt += 1) {
      await answerPermissionCards(clay);
      messageReady = await messageButton.isVisible({ timeout: 8_000 }).catch(() => false);
      if (messageReady) break;
      await actor.page.keyboard.press('Escape');
      await sleep(1_200);
    }
    if (!messageReady) {
      const names = await clay.getByRole('button').all()
        .then(list => Promise.all(list.slice(0, 25).map(item => item.getAttribute('aria-label').catch(() => null))))
        .then(list => list.filter(Boolean).join(' / '))
        .catch(() => '(unreadable)');
      actor.action = 'dm-blocked-no-message-control';
      actor.nextDMAtMs = Date.now() + LIVE_ENGAGEMENT_INTERVAL_MS;
      log(`${actor.actorId} reached ${owner}'s profile but found no Message control; screen=${await visibleClayScreen(clay)} buttons=${names}`);
      return;
    }
    const messageLabel = (await messageButton.getAttribute('aria-label').catch(() => '')) || '';
    // Clay's corner buttons treat a detail-0 click as keyboard/assistive
    // activation and act exactly once, which is also the only activation that
    // survives this rail reliably; a pointer click here does not open it.
    await activateControl(messageButton, messageLabel || 'Message');
    // Both the dialog and its heading carry the same "Message <name>" text, so
    // an unscoped role query can match more than one node; take the first and
    // treat the composer input as the real readiness signal. Never re-click
    // blindly — a second click lands on the dismiss scrim and closes it.
    const dialog = clay.getByRole('dialog', { name: /^Message / }).first();
    const messageInput = clay.getByPlaceholder('Say something…').first();
    let dialogOpen = await messageInput.isVisible({ timeout: 10_000 })
      .catch(async error => {
        log(`${actor.actorId} dm dialog probe error: ${String(error?.message || error).slice(0, 120)}`);
        return dialog.isVisible({ timeout: 4_000 }).catch(() => false);
      });
    if (!dialogOpen) {
      await answerPermissionCards(clay);
      dialogOpen = await messageInput.isVisible({ timeout: 6_000 }).catch(() => false);
    }
    if (!dialogOpen) {
      const dialogs = await clay.locator('[role="dialog"]').all()
        .then(list => Promise.all(list.map(async item => `${await item.getAttribute('aria-label').catch(() => '?')}${await item.isVisible().catch(() => false) ? '' : ' (hidden)'}`)))
        .then(list => list.join(' / '))
        .catch(() => '(unreadable)');
      actor.action = 'dm-blocked-no-dialog';
      actor.nextDMAtMs = Date.now() + LIVE_ENGAGEMENT_INTERVAL_MS;
      log(`${actor.actorId} clicked "${messageLabel}" but no message dialog opened; screen=${await visibleClayScreen(clay)} dialogs=${dialogs}`);
      log(`${actor.actorId} dm console=${actor.consoleTail.slice(-4).join(' ¶ ') || '(none)'}`);
      await queueCapture(actor, 'dm-no-dialog', 'mail', { validate: false });
      const inside = await clay.evaluate(() => ({
        scrims: document.querySelectorAll('[class*="scrim"]').length,
        dialogRoles: [...document.querySelectorAll('[role="dialog"]')].map(node => node.getAttribute('aria-label')).join(','),
        saysSomething: document.body.innerText.includes('Say something'),
        mailButtons: [...document.querySelectorAll('button')]
          .filter(node => (node.getAttribute('aria-label') || '').startsWith('Message '))
          .map(node => {
            const box = node.getBoundingClientRect();
            const centre = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
            return `${node.getAttribute('aria-label')}@${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)} top=${centre?.tagName}${centre === node ? '(self)' : `.${String(centre?.className || '').slice(0, 24)}`}`;
          }).join(' ;; '),
      })).catch(error => ({ error: String(error?.message || error).slice(0, 120) }));
      log(`${actor.actorId} dm page state=${JSON.stringify(inside)}`);
      return;
    }
    actor.action = 'send-dm';
    await queueCapture(actor, 'send-dm', 'mail', { validate: false });
    const text = LIVE_DM_MESSAGES[ACTOR_IDS.indexOf(actor.actorId) % LIVE_DM_MESSAGES.length];
    await messageInput.fill(text);
    // Enter in the composer is the app's own submit path and keeps the pointer
    // away from the dialog's dismiss scrim.
    await messageInput.press('Enter');
    // The app flashes its own acknowledgement once the shell reports the write.
    await clay.getByText(/^Sent to /).waitFor({ state: 'visible', timeout: 30_000 });
    if (!actor.policy.state.dmSentTo.has(owner)) {
      throw new Error('The app reported a sent DM but no bound thread write was observed.');
    }
    actor.dmsSent = actor.policy.state.dmsSent;
    actor.lastDMTo = owner;
    actor.lastDMPostId = postId;
    actor.nextDMAtMs = Date.now() + LIVE_ENGAGEMENT_INTERVAL_MS;
    log(`${actor.actorId} messaged ${owner} about ${postId || 'a post'}`);
    await moveCubeTo(clay, 'feed');
    actor.currentScreen = 'feed';
  };

  const runEngageFlow = async actor => {
    const clay = await clayFrame(actor);
    await moveCubeTo(clay, 'feed');
    actor.currentScreen = 'feed';
    actor.action = 'view-post';
    // Dwelling on a live post is itself a production view; the shell records
    // it once per 30 s. Give the feed time to settle and mark the view.
    await sleep(ENGAGE_DWELL_MS);
    const livePost = clay.locator('[data-feed-post-id]').first();
    if (!await livePost.isVisible().catch(() => false)) {
      actor.action = 'feed-empty';
      actor.nextEngageAtMs = Date.now() + LIVE_ENGAGEMENT_INTERVAL_MS;
      return;
    }
    if (actor.policy.state.likesGiven < LIVE_MAX_LIKES_PER_ACTOR) {
      const like = clay.getByRole('button', { name: /Increase this post.s radius by one/i }).first();
      if (await like.isVisible().catch(() => false)) {
        actor.action = 'like-post';
        await like.click();
        await sleep(1_500);
      }
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
      await page.keyboard.press('Escape');
      // Escape returns to whichever tab was behind the menu; steer from there
      // rather than assuming which one that is.
      await moveCubeTo(clay, step.screen);
    } else if (step.method === 'current') {
      await moveCubeTo(clay, step.screen);
    } else if (step.method === 'post') {
      await runPostFlow(actor);
    } else if (step.method === 'engage') {
      await runEngageFlow(actor);
    } else if (step.method === 'dm') {
      await runDMFlow(actor);
    } else {
      throw new Error(`Unknown live runner method for ${actor.actorId}.`);
    }
  };

  const stepIsDue = (actor, step) => {
    if (step.method === 'post') return Date.now() >= actor.nextPostAtMs && actor.postsPublished < LIVE_MAX_POSTS_PER_ACTOR;
    if (step.method === 'engage') return Date.now() >= actor.nextEngageAtMs;
    if (step.method === 'dm') {
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
    if ([...actors.values()].every(candidate => candidate.status !== 'live') && runtime.status === 'live') {
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
      runtime.browser = await chromium.launch({
        executablePath: chromePath,
        headless: true,
        handleSIGINT: false,
        handleSIGTERM: false,
        args: [
          '--disable-background-networking', '--disable-component-update', '--disable-default-apps',
          '--disable-features=MediaRouter', '--disable-sync', '--no-first-run',
          '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
        ],
      });
      runtime.enabled = true;
      try {
        for (const credential of credentials) {
          if (runtime.epoch !== epoch) throw new LiveStoppedError();
          const actor = actors.get(credential.actorId);
          try {
            await signInActor(actor, credential, epoch);
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
      for (const actor of signedIn) await startCloudSession(actor);
      if (runtime.epoch !== epoch) throw new LiveStoppedError();
      const now = Date.now();
      signedIn.forEach((actor, index) => {
        actor.nextPostAtMs = now + index * LIVE_POST_STAGGER_MS;
        actor.nextEngageAtMs = now + 45_000 + index * 20_000;
        // Messaging waits until posts from the cohort exist to reply to.
        actor.nextDMAtMs = now + 4 * 60_000 + index * 30_000;
      });
      runtime.status = 'live';
      beginLiveFrameCapture();
      beginCloudMonitor(failRun);
      for (const actor of signedIn) {
        void runActorLoop(actor, epoch).catch(error => { if (!(error instanceof LiveStoppedError)) failRun(error); });
      }
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
