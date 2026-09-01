import { createConnection } from 'node:net';
import { access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import {
  ONBOARDING_ACTOR_ID,
  ONBOARDING_APP_ORIGIN,
  ONBOARDING_CLAY_ORIGIN,
  ONBOARDING_EMULATORS,
  ONBOARDING_FRAME_STAGES,
  ONBOARDING_MODE,
  ONBOARDING_PROJECT_ID,
  ONBOARDING_STORAGE_BUCKET,
  SHARED_ONBOARDING_ACTOR_ID,
  SHARED_ONBOARDING_FIREBASE_API_KEY,
  SHARED_ONBOARDING_FRAME_STAGES,
  SHARED_ONBOARDING_MODE,
  SHARED_ONBOARDING_PROJECT_ID,
  SHARED_ONBOARDING_STORAGE_BUCKET,
  assertEmptyOnboardingInventory,
  assertOnboardingInventory,
  assertSharedOnboardingOutcome,
  createOnboardingIdentity,
  createOnboardingNetworkPolicy,
  createSharedOnboardingIdentity,
  createSharedOnboardingNetworkPolicy,
  isOnboardingAppURL,
  isOnboardingWebSocketURL,
  isSafeEmulatorFetchResponse,
  sharedPostProofSelector,
  syntheticPostProofSelector,
  validateOnboardingCommand,
} from './synthetic-onboarding-actions.mjs';
import { createFrameRing, frameMetadata, pushFrame } from './synthetic-runner-actions.mjs';

const APP_TIMEOUT_MS = 75_000;
const COMMAND_TIMEOUT_MS = 12 * 60_000;
const UPLOAD_OUTCOME_TIMEOUT_MS = 105_000;
const FIXTURE_PATH = '/Users/matrix/Developer/Poplur2025-ReactNative/src/assets/icon-1024x1024.png';
const AUTH_ADMIN_APP_NAME = 'poplur-first-user-emulator';

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function actorRuntime() {
  return {
    actorId: ONBOARDING_ACTOR_ID,
    actor: 'FIRST USER · visible signup',
    status: 'paused',
    sessionId: '',
    currentScreen: 'welcome',
    action: 'waiting',
    frameSequence: 0,
    lastFrameAtMs: 0,
    frameSuppressed: true,
    frames: createFrameRing(),
  };
}

function onboardingStartURL(mode, runId) {
  const url = new URL(ONBOARDING_APP_ORIGIN);
  url.searchParams.set('syntheticOnboarding', mode);
  if (mode === SHARED_ONBOARDING_MODE) url.searchParams.set('syntheticRunId', runId);
  return url.toString();
}

function emulatorPorts() {
  return Object.values(ONBOARDING_EMULATORS).map(value => {
    const url = new URL(value);
    return { host: url.hostname, port: Number(url.port), label: url.origin };
  });
}

async function assertLoopbackPort({ host, port, label }) {
  if (host !== '127.0.0.1' || !Number.isInteger(port)) {
    throw new Error(`Onboarding emulator is not pinned to loopback: ${label}.`);
  }
  await new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    const timeout = setTimeout(() => socket.destroy(new Error(`Onboarding emulator is offline: ${label}.`)), 1_500);
    socket.once('connect', () => { clearTimeout(timeout); socket.end(); resolve(); });
    socket.once('error', error => { clearTimeout(timeout); reject(error); });
  });
}

async function assertEmulatorsAvailable() {
  await Promise.all(emulatorPorts().map(assertLoopbackPort));
}

function isSafeNavigation(value) {
  if (isOnboardingAppURL(value) || value === 'about:blank') return true;
  return /^data:text\/html(?:;|,)/i.test(value)
    || /^blob:http:\/\/127\.0\.0\.1:8081\//i.test(value);
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
  throw new Error(`Visible onboarding frame did not expose ${selector}.`);
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
  throw new Error(`Visible onboarding frames did not expose ${role}.`);
}

async function activateOnboardingControl(locator, label) {
  await locator.waitFor({ state: 'visible', timeout: APP_TIMEOUT_MS });
  await locator.evaluate((element, controlLabel) => {
    if (!(element instanceof HTMLButtonElement) || element.disabled) {
      throw new Error(`${controlLabel} is not an enabled onboarding button.`);
    }
    element.scrollIntoView({ block: 'center', inline: 'center' });
    // The welcome screen deliberately layers continuous clay/confetti motion
    // around its controls. A trusted DOM activation still follows the real
    // button listener while avoiding a false Playwright hit-target timeout
    // when a decorative layer crosses the button's centre point.
    element.click();
  }, label);
}

async function visiblePoplurScreen(frame) {
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
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await visiblePoplurScreen(frame) === expected) return;
    } catch { /* The clay tree may be replacing its current screen. */ }
    await sleep(150);
  }
  throw new Error(`Poplur did not settle on ${expected}.`);
}

async function moveCubeTo(frame, expected) {
  const cube = frame.getByRole('button', { name: /tab model — swipe or use arrow keys to change tabs/i });
  await cube.waitFor({ state: 'visible', timeout: APP_TIMEOUT_MS });
  if (await visiblePoplurScreen(frame) === expected) return;
  for (let count = 0; count < 12; count += 1) {
    await cube.press('ArrowRight');
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      if (await visiblePoplurScreen(frame) === expected) return;
      await sleep(100);
    }
  }
  throw new Error(`Cube navigation could not reach ${expected}.`);
}

async function waitForVisiblePost(frame, surface, postId) {
  const proof = frame.locator(syntheticPostProofSelector(surface, postId));
  await proof.waitFor({ state: 'visible', timeout: APP_TIMEOUT_MS });
  const values = await proof.evaluate(element => ({
    id: element.getAttribute('data-synthetic-post-id'),
    surface: element.getAttribute('data-synthetic-post-surface'),
  }));
  if (values.id !== postId || values.surface !== surface) {
    throw new Error(`Published post proof did not match ${surface}.`);
  }
}

async function waitForSharedPostProof(page, surface, postId) {
  const selector = sharedPostProofSelector(surface, postId);
  const frame = await findFrame(page, selector);
  const proof = frame.locator(selector).first();
  const values = await proof.evaluate(element => ({
    feedId: element.getAttribute('data-feed-post-id'),
    mapId: element.getAttribute('data-map-point-id'),
  }));
  if (surface === 'map' && values.mapId !== `pin:firestore:${postId}`) {
    throw new Error('Canonical Map proof did not match the bound production post.');
  }
  if (surface === 'feed' && values.feedId !== postId) {
    throw new Error('Canonical Feed proof did not match the bound production post.');
  }
}

function onboardingAdminApp() {
  const authHost = new URL(ONBOARDING_EMULATORS.auth).host;
  const firestoreHost = new URL(ONBOARDING_EMULATORS.firestore).host;
  if ((process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST !== authHost)
    || (process.env.FIRESTORE_EMULATOR_HOST && process.env.FIRESTORE_EMULATOR_HOST !== firestoreHost)) {
    throw new Error('Firebase Admin is already pinned to a different emulator target.');
  }
  process.env.FIREBASE_AUTH_EMULATOR_HOST = authHost;
  process.env.FIRESTORE_EMULATOR_HOST = firestoreHost;
  const existing = getApps().find(app => app.name === AUTH_ADMIN_APP_NAME);
  return existing ?? initializeApp({
    projectId: ONBOARDING_PROJECT_ID,
    storageBucket: ONBOARDING_STORAGE_BUCKET,
  }, AUTH_ADMIN_APP_NAME);
}

async function assertEmptyEmulatorState() {
  const adminApp = onboardingAdminApp();
  const firestore = getFirestore(adminApp);
  const [authList, users, posts, locations, usernames, storageResponse] = await Promise.all([
    getAuth(adminApp).listUsers(1),
    firestore.collection('users').limit(1).get(),
    firestore.collection('posts').limit(1).get(),
    firestore.collectionGroup('postLocations').limit(1).get(),
    firestore.collection('usernames').limit(1).get(),
    fetch(`${ONBOARDING_EMULATORS.storage}/storage/v1/b/${ONBOARDING_STORAGE_BUCKET}/o?maxResults=1`),
  ]);
  if (!storageResponse.ok) throw new Error('Storage emulator preflight inventory is unavailable.');
  const storage = await storageResponse.json();
  assertEmptyOnboardingInventory({
    authCount: authList.users.length,
    userCount: users.size,
    postCount: posts.size,
    locationCount: locations.size,
    usernameCount: usernames.size,
    storageCount: Array.isArray(storage.items) ? storage.items.length : 0,
  });
}

async function verifyEmulatorOutcome(identity, policy) {
  const { uid, postId } = policy.state;
  if (!uid || !postId) throw new Error('The visible journey did not bind one account and one post.');
  const adminApp = onboardingAdminApp();
  const firestore = getFirestore(adminApp);
  const [authList, userSnapshot, postSnapshot, locationSnapshot, usersList, postsList, locationsList, storageListResponse] = await Promise.all([
    getAuth(adminApp).listUsers(2),
    firestore.doc(`users/${uid}`).get(),
    firestore.doc(`posts/${postId}`).get(),
    firestore.doc(`users/${uid}/postLocations/${postId}`).get(),
    firestore.collection('users').limit(2).get(),
    firestore.collection('posts').limit(2).get(),
    firestore.collection(`users/${uid}/postLocations`).limit(2).get(),
    fetch(`${ONBOARDING_EMULATORS.storage}/storage/v1/b/${ONBOARDING_STORAGE_BUCKET}/o?maxResults=3`),
  ]);
  if (!userSnapshot.exists || !postSnapshot.exists || !locationSnapshot.exists) {
    throw new Error('The onboarding emulator is missing its profile, post, or location document.');
  }
  const user = userSnapshot.data() || {};
  const post = postSnapshot.data() || {};
  const location = locationSnapshot.data() || {};
  for (const document of [user, post]) {
    if (document.syntheticActorId !== ONBOARDING_ACTOR_ID
      || document.syntheticJourney !== ONBOARDING_MODE) {
      throw new Error('Onboarding result is missing its synthetic identity tags.');
    }
  }
  if (post.syntheticSource !== 'visible-app-ui') {
    throw new Error('Onboarding post was not produced by the visible app UI.');
  }
  if (user.email !== identity.email || user.username !== identity.handle) {
    throw new Error('Onboarding profile does not match the generated first-user identity.');
  }
  if (location.source !== 'post-upload'
    || Math.abs(Number(location.latitude) - 43.6532) > 0.000001
    || Math.abs(Number(location.longitude) - (-79.3832)) > 0.000001) {
    throw new Error('Onboarding post location does not match the fixed emulator-only map spot.');
  }

  if (!storageListResponse.ok) {
    throw new Error('The onboarding emulator inventory could not be verified.');
  }
  const storageList = await storageListResponse.json();
  const authUsers = Array.isArray(authList.users) ? authList.users : [];
  const storageNames = (Array.isArray(storageList.items) ? storageList.items : [])
    .map(item => typeof item?.name === 'string' ? item.name : '')
    .filter(Boolean)
    .sort();
  if (authUsers[0]?.email !== identity.email
    || authUsers[0]?.displayName !== identity.handle
    || typeof authUsers[0]?.photoURL !== 'string'
    || !decodeURIComponent(authUsers[0].photoURL).includes(`profile_pictures/${uid}.jpg`)) {
    throw new Error('Auth emulator profile does not match the visible first-user signup.');
  }
  assertOnboardingInventory({
    uid,
    postId,
    authUids: authUsers.map(account => account.uid),
    userIds: usersList.docs.map(document => document.id),
    postIds: postsList.docs.map(document => document.id),
    locationIds: locationsList.docs.map(document => document.id),
    storageNames,
  });
}

async function exactProductionJSON(url, options, label) {
  const response = await fetch(url, { ...options, redirect: 'error' });
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}.`);
  const body = await response.json().catch(() => null);
  if (!body || typeof body !== 'object') throw new Error(`${label} returned no verifiable JSON.`);
  return body;
}

async function verifySharedOutcome(identity, runId, policy) {
  const { uid, idToken, postId, profilePhotoPath, postStoragePath } = policy.state;
  if (!uid || !idToken || !postId
    || profilePhotoPath !== `profile_pictures/${uid}.jpg`
    || postStoragePath !== `posts/${uid}/${postId}.jpg`) {
    throw new Error('The shared visible journey did not bind one account, one post and its exact image paths.');
  }
  const firestoreBase = `https://firestore.googleapis.com/v1/projects/${SHARED_ONBOARDING_PROJECT_ID}/databases/(default)/documents`;
  const firestoreHeaders = { authorization: `Bearer ${idToken}` };
  const storageHeaders = { authorization: `Firebase ${idToken}` };
  const storageMetadata = objectPath => (
    `https://firebasestorage.googleapis.com/v0/b/${SHARED_ONBOARDING_STORAGE_BUCKET}/o/${encodeURIComponent(objectPath)}`
  );
  // Every production read is a single exact self-owned path. There is no list,
  // collection scan, reset or cleanup request in this verification boundary.
  const [authLookup, user, post, location, profileStorage, postStorage] = await Promise.all([
    exactProductionJSON(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(SHARED_ONBOARDING_FIREBASE_API_KEY)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idToken }),
      },
      'Bound production Auth lookup',
    ),
    exactProductionJSON(`${firestoreBase}/users/${encodeURIComponent(uid)}`, { headers: firestoreHeaders }, 'Bound production profile'),
    exactProductionJSON(`${firestoreBase}/posts/${encodeURIComponent(postId)}`, { headers: firestoreHeaders }, 'Bound production post'),
    exactProductionJSON(`${firestoreBase}/users/${encodeURIComponent(uid)}/postLocations/${encodeURIComponent(postId)}`, { headers: firestoreHeaders }, 'Bound production post location'),
    exactProductionJSON(storageMetadata(profilePhotoPath), { headers: storageHeaders }, 'Bound production profile image'),
    exactProductionJSON(storageMetadata(postStoragePath), { headers: storageHeaders }, 'Bound production post image'),
  ]);
  return assertSharedOnboardingOutcome({
    identity,
    runId,
    uid,
    postId,
    authLookup,
    user,
    post,
    location,
    profileStorage,
    postStorage,
  });
}

export function createSyntheticOnboardingRunner({ chromium, chromePath }) {
  const actor = actorRuntime();
  const runtime = {
    mode: null,
    status: 'paused',
    enabled: false,
    completed: false,
    startedAtMs: 0,
    completedAtMs: 0,
    runId: '',
    email: '',
    handle: '',
    postId: '',
    radiusMeters: 0,
    feedEligible: false,
    error: '',
    browser: null,
    epoch: 0,
  };

  const publicState = () => ({
    ok: true,
    mode: runtime.mode,
    enabled: runtime.enabled,
    status: runtime.status,
    completed: runtime.completed,
    startedAtMs: runtime.startedAtMs,
    completedAtMs: runtime.completedAtMs,
    runId: runtime.runId,
    identity: runtime.mode ? { actorId: actor.actorId, email: runtime.email, handle: runtime.handle } : null,
    result: runtime.postId ? {
      postId: runtime.postId,
      radiusMeters: runtime.radiusMeters,
      mapVerified: runtime.completed,
      feedEligible: runtime.feedEligible,
      feedVerified: runtime.completed && runtime.feedEligible,
      profileChecked: false,
    } : null,
    error: runtime.error,
    actors: runtime.mode ? [{
      actorId: actor.actorId,
      actor: actor.actor,
      status: actor.status,
      sessionId: actor.sessionId,
      currentScreen: actor.currentScreen,
      action: actor.action,
      lastFrameSequence: actor.frameSequence || null,
      lastFrameAtMs: actor.lastFrameAtMs || 0,
      frameSuppressed: actor.frameSuppressed,
      frameCount: actor.frames.length,
    }] : [],
  });

  const capture = async (page, stage, action = stage) => {
    const stages = runtime.mode === SHARED_ONBOARDING_MODE
      ? SHARED_ONBOARDING_FRAME_STAGES
      : ONBOARDING_FRAME_STAGES;
    if (!stages.includes(stage)) throw new Error(`Unknown onboarding frame stage: ${stage}.`);
    const sequence = ++actor.frameSequence;
    const capturedAtMs = Date.now();
    const image = await page.screenshot({ type: 'jpeg', quality: 62, timeout: 15_000 });
    const frame = { sequence, capturedAtMs, screen: stage, action, frameSuppressed: false, image };
    pushFrame(actor.frames, frame);
    actor.currentScreen = stage;
    actor.action = action;
    actor.lastFrameAtMs = capturedAtMs;
    actor.frameSuppressed = false;
    return frame;
  };

  const stop = async ({ clear = false, status = 'paused' } = {}) => {
    runtime.epoch += 1;
    if (runtime.browser) await runtime.browser.close().catch(() => {});
    runtime.browser = null;
    runtime.enabled = false;
    if (status !== 'completed') runtime.status = status;
    actor.status = status === 'error' ? 'error' : status === 'completed' ? 'completed' : 'paused';
    if (clear) {
      runtime.mode = null;
      runtime.completed = false;
      runtime.startedAtMs = 0;
      runtime.completedAtMs = 0;
      runtime.runId = '';
      runtime.email = '';
      runtime.handle = '';
      runtime.postId = '';
      runtime.radiusMeters = 0;
      runtime.feedEligible = false;
      runtime.error = '';
      actor.frames.splice(0);
      actor.frameSequence = 0;
      actor.lastFrameAtMs = 0;
      actor.frameSuppressed = true;
      actor.currentScreen = 'welcome';
      actor.action = 'waiting';
      actor.sessionId = '';
      actor.actorId = ONBOARDING_ACTOR_ID;
      actor.actor = 'FIRST USER · visible signup';
    }
    return publicState();
  };

  const runJourney = async (page, identity, runId, policy, epoch) => {
    const shared = identity.journey === SHARED_ONBOARDING_MODE;
    await page.goto(onboardingStartURL(identity.journey, runId), { waitUntil: 'domcontentloaded', timeout: APP_TIMEOUT_MS });
    const prelogin = await findFrame(page, '#btnSignUp');
    await sleep(1_800);
    await capture(page, 'welcome', 'welcome-visible');
    await activateOnboardingControl(prelogin.locator('#btnSignUp'), 'Sign Up');
    await activateOnboardingControl(prelogin.locator('.acctA'), 'Personal account');
    await activateOnboardingControl(prelogin.locator('#paneSignUp .paneBtn'), 'Create account');
    await activateOnboardingControl(prelogin.locator('#introNext'), 'Next');

    await prelogin.locator('#paneCreateLogin input[type="email"]').fill(identity.email);
    const passwords = prelogin.locator('#paneCreateLogin input[type="password"]');
    await passwords.nth(0).fill(identity.password);
    await passwords.nth(1).fill(identity.password);
    await prelogin.locator('#dobMonth').selectOption('1');
    await prelogin.locator('#dobDay').selectOption('1');
    await prelogin.locator('#dobYear').selectOption('1990');
    const terms = prelogin.locator('#paneCreateLogin input[type="checkbox"]');
    if (!await terms.isChecked()) await terms.check();
    await capture(page, 'signup', 'account-details-complete');
    await activateOnboardingControl(prelogin.locator('#paneCreateLogin [data-signup-next]'), 'Create account details');

    await prelogin.locator('#photoInput').setInputFiles(FIXTURE_PATH);
    await prelogin.locator('#photoCircle img').waitFor({ state: 'visible', timeout: APP_TIMEOUT_MS });
    await capture(page, 'profile-photo', 'profile-photo-selected');
    const authResponsePromise = page.waitForResponse(response => (
      response.request().method() === 'POST'
      && (shared
        ? response.url().startsWith('https://identitytoolkit.googleapis.com/v1/accounts:signUp?')
        : response.url().startsWith(ONBOARDING_EMULATORS.auth))
      && /\/accounts:signUp(?:\?|$)/i.test(response.url())
    ), { timeout: APP_TIMEOUT_MS });
    await activateOnboardingControl(prelogin.locator('#paneProfilePhoto [data-photo-continue]'), 'Continue with profile photo');
    const authResponse = await authResponsePromise;
    if (!authResponse.ok()) throw new Error(`${shared ? 'Production Auth' : 'Auth emulator'} rejected the visible first-user signup.`);
    const auth = await authResponse.json();
    policy.bindAuth({ uid: auth.localId, idToken: auth.idToken, refreshToken: auth.refreshToken });
    actor.sessionId = `first-user-${auth.localId}`;
    await capture(page, 'account-created', 'firebase-account-created');

    const clay = await findFrame(page, '[data-poplur-screen]');
    if (runtime.epoch !== epoch) throw new Error('Onboarding run was stopped.');
    await capture(page, 'home', 'postlogin-home-visible');
    await clay.waitForFunction(() => {
      const location = window.__poplurNativeLocation;
      return Number(location?.latitude) === 43.6532
        && Number(location?.longitude) === -79.3832;
    }, undefined, { timeout: APP_TIMEOUT_MS });
    await moveCubeTo(clay, 'camera');
    await capture(page, 'camera', 'camera-open');
    const allow = clay.getByRole('button', { name: 'Allow', exact: true });
    if (await allow.isVisible().catch(() => false)) await allow.click();
    const cube = clay.getByRole('button', { name: /tab model — swipe or use arrow keys to change tabs/i });
    await cube.press('Enter');
    await clay.getByRole('dialog', { name: 'Post composer' }).waitFor({ state: 'visible', timeout: APP_TIMEOUT_MS });
    await capture(page, 'composer', 'capture-ready');
    await clay.getByRole('button', { name: /Use original/i }).click();
    // Camera-first now parks the draft and opens the canonical Map picker as
    // soon as the user chooses the original/AI version. The old intermediate
    // LOCATION row no longer exists until the target has already been chosen.
    // The picker lives in Map's nested iframe, not the Home frame that owns the
    // composer. Search the page's visible frame tree so this remains a real
    // click on the shipped Map control.
    const spotButton = await findVisibleRole(page, 'button', { name: /Use this spot.*Attach the post here/i });
    await capture(page, 'location', 'map-location-visible');
    await spotButton.click();
    await clay.getByRole('dialog', { name: 'Post composer' }).waitFor({ state: 'visible', timeout: APP_TIMEOUT_MS });
    await capture(page, 'publish-review', 'post-review-visible');
    await clay.getByLabel('I can share this').check();
    const postButton = clay.getByRole('button', { name: /Post to TV/i });
    await postButton.click();
    const postedDialog = clay.getByRole('dialog', { name: 'Posted' });
    const uploadAlert = clay.getByRole('alert').first();
    const uploadOutcome = await Promise.race([
      postedDialog.waitFor({ state: 'visible', timeout: UPLOAD_OUTCOME_TIMEOUT_MS })
        .then(() => ({ kind: 'posted' })),
      waitForScreen(clay, 'map', UPLOAD_OUTCOME_TIMEOUT_MS)
        .then(() => ({ kind: 'map' })),
      uploadAlert.waitFor({ state: 'visible', timeout: UPLOAD_OUTCOME_TIMEOUT_MS })
        .then(async () => ({ kind: 'error', text: (await uploadAlert.innerText()).trim() })),
    ]);
    if (uploadOutcome.kind === 'error') {
      throw new Error(`Visible upload failed: ${uploadOutcome.text || 'Poplur showed an empty upload error.'}`);
    }
    await capture(page, 'posted', 'post-published');
    const proof = shared
      ? await verifySharedOutcome(identity, runId, policy)
      : (await verifyEmulatorOutcome(identity, policy), { radiusMeters: 0, feedEligible: false });
    runtime.postId = policy.state.postId;
    runtime.radiusMeters = proof.radiusMeters;
    runtime.feedEligible = proof.feedEligible;

    if (uploadOutcome.kind === 'posted') {
      const backToCamera = clay.getByRole('button', { name: /BACK TO CAMERA/i });
      if (await backToCamera.isVisible().catch(() => false)) await backToCamera.click();
      await moveCubeTo(clay, 'map');
    }
    if (shared) {
      await waitForSharedPostProof(page, 'map', policy.state.postId);
      await capture(page, 'map', 'canonical-production-post-on-map');
      if (proof.feedEligible) {
        await moveCubeTo(clay, 'feed');
        await waitForSharedPostProof(page, 'feed', policy.state.postId);
        await capture(page, 'feed', 'canonical-radius-eligible-post-in-feed');
      } else {
        actor.action = 'map-only-post-not-feed-eligible';
      }
      return;
    }
    await waitForVisiblePost(clay, 'map', policy.state.postId);
    await capture(page, 'map', 'published-post-on-map');
    await moveCubeTo(clay, 'profile');
    await waitForVisiblePost(clay, 'profile', policy.state.postId);
    await capture(page, 'profile', 'published-post-on-profile');
  };

  const start = async command => {
    const validatedCommand = validateOnboardingCommand(command);
    const mode = validatedCommand.mode;
    const shared = mode === SHARED_ONBOARDING_MODE;
    if (runtime.status === 'starting' || runtime.status === 'live') {
      throw new Error('A synthetic runner mode is already active.');
    }
    await stop({ clear: true });
    runtime.mode = mode;
    runtime.status = 'starting';
    runtime.enabled = true;
    runtime.completed = false;
    runtime.startedAtMs = Date.now();
    runtime.runId = `${shared ? 'shared-first-user' : 'first-user'}-${runtime.startedAtMs.toString(36)}`;
    runtime.error = '';
    const identity = shared ? createSharedOnboardingIdentity() : createOnboardingIdentity();
    runtime.email = identity.email;
    runtime.handle = identity.handle;
    actor.actorId = identity.actorId;
    actor.actor = shared
      ? 'SHARED TESTER · visible signup'
      : 'FIRST USER · visible signup';
    actor.status = 'starting';
    actor.sessionId = runtime.runId;
    actor.currentScreen = 'welcome';
    actor.action = 'starting';
    const epoch = ++runtime.epoch;

    try {
      await Promise.all([
        ...(shared ? [] : [assertEmulatorsAvailable()]),
        access(chromePath, fsConstants.X_OK),
        access(FIXTURE_PATH, fsConstants.R_OK),
      ]);
      if (!shared) await assertEmptyEmulatorState();
      runtime.browser = await chromium.launch({
        executablePath: chromePath,
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
          '--use-fake-device-for-media-stream',
          '--use-fake-ui-for-media-stream',
        ],
      });
      const context = await runtime.browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
        acceptDownloads: false,
        serviceWorkers: 'block',
      });
      await context.clearPermissions();
      await context.grantPermissions(['camera'], { origin: ONBOARDING_CLAY_ORIGIN });
      await context.routeWebSocket(/.*/, async socket => {
        if (!isOnboardingWebSocketURL(socket.url())) {
          await socket.close({ code: 1008, reason: 'Onboarding permits loopback WebSockets only.' });
          return;
        }
        socket.connectToServer();
      });
      const policy = shared
        ? createSharedOnboardingNetworkPolicy(identity, runtime.runId)
        : createOnboardingNetworkPolicy(identity);
      await context.route('**/*', async route => {
        const request = route.request();
        const target = request.url();
        if (request.isNavigationRequest() && !isSafeNavigation(target)) {
          await route.abort('blockedbyclient');
          return;
        }
        const verdict = policy.inspect({
          method: request.method(),
          url: target,
          postData: request.postData() || '',
          headers: request.headers(),
        });
        if (process.env.POPLUR_ONBOARDING_VERDICT_LOG !== '0') {
          console.error(`[verdict] ${verdict.allow ? 'allow' : 'BLOCK'} ${verdict.kind ?? '-'} ${request.method()} ${target.slice(0, 160)}${verdict.allow ? '' : ` reason=${verdict.reason ?? ''}`}`);
        }
        if (!verdict.allow) {
          await route.abort('blockedbyclient');
          return;
        }
        // Bind the emulator UID before the visible RN page receives signup
        // success. RN begins the profile-photo upload immediately afterward,
        // so a later page-response listener would leave a real policy race.
        if (verdict.kind === 'auth-signup' || verdict.kind === 'shared-auth-signup') {
          const upstream = await route.fetch({ maxRedirects: 0 });
          if (!isSafeEmulatorFetchResponse({ status: upstream.status(), location: upstream.headers().location })) {
            await route.abort('blockedbyclient');
            return;
          }
          if (upstream.ok()) {
            const auth = await upstream.json();
            policy.bindAuth({ uid: auth.localId, idToken: auth.idToken, refreshToken: auth.refreshToken });
          }
          await route.fulfill({ response: upstream });
          return;
        }
        if (verdict.kind === 'storage-profile-photo' || verdict.kind === 'storage-upload'
          || verdict.kind === 'shared-storage-profile-photo' || verdict.kind === 'shared-storage-upload') {
          const upstream = await route.fetch({ maxRedirects: 0 });
          if (!isSafeEmulatorFetchResponse({ status: upstream.status(), location: upstream.headers().location })) {
            await route.abort('blockedbyclient');
            return;
          }
          const uploadURL = upstream.headers()['x-goog-upload-url'];
          const objectPath = verdict.kind === 'storage-profile-photo' || verdict.kind === 'shared-storage-profile-photo'
            ? verdict.profilePhotoPath
            : verdict.objectPath ?? `posts/${policy.state.uid}/${verdict.postId}.jpg`;
          if (uploadURL) policy.bindUploadSession(uploadURL, objectPath);
          await route.fulfill({ response: upstream });
          return;
        }
        await route.continue();
      });
      const page = await context.newPage();
      page.setDefaultTimeout(APP_TIMEOUT_MS);
      page.on('popup', popup => { void popup.close().catch(() => {}); });
      page.on('download', download => { void download.cancel().catch(() => {}); });
      page.on('dialog', dialog => { void dialog.dismiss().catch(() => {}); });
      page.on('filechooser', chooser => { void chooser.setFiles(FIXTURE_PATH).catch(() => {}); });
      runtime.status = 'live';
      actor.status = 'live';
      let journeyTimeout;
      try {
        await Promise.race([
          runJourney(page, identity, runtime.runId, policy, epoch),
          new Promise((_, reject) => {
            journeyTimeout = setTimeout(() => reject(new Error('First-user journey exceeded its bounded runtime.')), COMMAND_TIMEOUT_MS - 10_000);
          }),
        ]);
      } finally {
        if (journeyTimeout) clearTimeout(journeyTimeout);
      }
      if (runtime.epoch !== epoch) throw new Error('Onboarding run was stopped.');
      runtime.completed = true;
      runtime.completedAtMs = Date.now();
      runtime.status = 'completed';
      actor.status = 'completed';
      actor.action = 'journey-complete';
      await stop({ status: 'completed' });
      return publicState();
    } catch (error) {
      runtime.error = error instanceof Error ? error.message.slice(0, 240) : 'Onboarding journey failed.';
      runtime.status = 'error';
      actor.status = 'error';
      actor.action = 'journey-error';
      await stop({ status: 'error' });
      return publicState();
    }
  };

  return {
    actorId: ONBOARDING_ACTOR_ID,
    isActive: () => runtime.status === 'starting' || runtime.status === 'live',
    hasSnapshot: () => runtime.mode === ONBOARDING_MODE || runtime.mode === SHARED_ONBOARDING_MODE,
    publicState,
    getActor: actorId => actorId === actor.actorId && runtime.mode ? actor : null,
    start,
    stop,
  };
}
