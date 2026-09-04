import {
  ACTOR_IDS,
  SYNTHETIC_ACTORS,
  actorForId,
  cleanText,
} from './synthetic-runner-actions.mjs';

/**
 * Five-actor LIVE mode: the same five isolated beta accounts sign in to the
 * real web app shell and use it the way a tester would — browse, post through
 * Camera → Composer → Map → Post, and watch/like each other's posts so radius
 * grows and their posts intercept real testers. Everything they publish is a
 * real production post tagged as synthetic; nothing here is reconstructed.
 */
export const READONLY_MODE = 'five-actor-readonly';
export const LIVE_MODE = 'five-actor-live';
export const RUNNER_MODES = Object.freeze([READONLY_MODE, LIVE_MODE]);
export const SYNTHETIC_COHORT_ID = 'beta-browser-v1';
export const LIVE_SOURCE = 'visible-app-ui';

/** Pinned by functions/scripts/provisionSyntheticBetaAccounts.js — UID === actorId. */
export const ACTOR_ACCOUNTS = Object.freeze({
  'sim-food-001': 'beta-sim-food-001@poplur.test',
  'sim-sports-002': 'beta-sim-sports-002@poplur.test',
  'sim-music-003': 'beta-sim-music-003@poplur.test',
  'sim-tech-004': 'beta-sim-tech-004@poplur.test',
  'sim-news-005': 'beta-sim-news-005@poplur.test',
});

/**
 * Where each actor lives. The shell injects this as the managed fix, so the
 * Map picker, the Feed's reach test and every post use the actor's own city.
 * "World beta region" is the Toronto beta area, a little north of the core.
 */
export const ACTOR_LOCATIONS = Object.freeze({
  'sim-food-001': Object.freeze({ place: 'Toronto', latitude: 43.6532, longitude: -79.3832 }),
  'sim-sports-002': Object.freeze({ place: 'London', latitude: 51.5074, longitude: -0.1278 }),
  'sim-music-003': Object.freeze({ place: 'Toronto', latitude: 43.6471, longitude: -79.3951 }),
  'sim-tech-004': Object.freeze({ place: 'World beta region', latitude: 43.6611, longitude: -79.3802 }),
  'sim-news-005': Object.freeze({ place: 'New York', latitude: 40.7128, longitude: -74.006 }),
});

/**
 * Where a POST lands. Each actor still signs in at its own city, but a pop is
 * dropped somewhere different every time — spread across the world rather
 * than stacked on one block — so the board reads as a live world, not five
 * people standing still. Real named places, so the app's place lookup and the
 * "posted here" line stay honest; a small jitter keeps repeat visits from
 * landing on the identical pixel. Coordinates are rounded to four decimals
 * up front so the exact value the app is handed is the exact value the
 * write guard later expects back.
 */
export const WORLD_POST_SPOTS = Object.freeze([
  Object.freeze({ place: 'Toronto', latitude: 43.6532, longitude: -79.3832 }),
  Object.freeze({ place: 'Vancouver', latitude: 49.2827, longitude: -123.1207 }),
  Object.freeze({ place: 'Montreal', latitude: 45.5017, longitude: -73.5673 }),
  Object.freeze({ place: 'New York', latitude: 40.7128, longitude: -74.006 }),
  Object.freeze({ place: 'Los Angeles', latitude: 34.0522, longitude: -118.2437 }),
  Object.freeze({ place: 'Chicago', latitude: 41.8781, longitude: -87.6298 }),
  Object.freeze({ place: 'Miami', latitude: 25.7617, longitude: -80.1918 }),
  Object.freeze({ place: 'Mexico City', latitude: 19.4326, longitude: -99.1332 }),
  Object.freeze({ place: 'São Paulo', latitude: -23.5505, longitude: -46.6333 }),
  Object.freeze({ place: 'Buenos Aires', latitude: -34.6037, longitude: -58.3816 }),
  Object.freeze({ place: 'London', latitude: 51.5074, longitude: -0.1278 }),
  Object.freeze({ place: 'Paris', latitude: 48.8566, longitude: 2.3522 }),
  Object.freeze({ place: 'Berlin', latitude: 52.52, longitude: 13.405 }),
  Object.freeze({ place: 'Madrid', latitude: 40.4168, longitude: -3.7038 }),
  Object.freeze({ place: 'Rome', latitude: 41.9028, longitude: 12.4964 }),
  Object.freeze({ place: 'Amsterdam', latitude: 52.3676, longitude: 4.9041 }),
  Object.freeze({ place: 'Lagos', latitude: 6.5244, longitude: 3.3792 }),
  Object.freeze({ place: 'Cairo', latitude: 30.0444, longitude: 31.2357 }),
  Object.freeze({ place: 'Nairobi', latitude: -1.2921, longitude: 36.8219 }),
  Object.freeze({ place: 'Dubai', latitude: 25.2048, longitude: 55.2708 }),
  Object.freeze({ place: 'Mumbai', latitude: 19.076, longitude: 72.8777 }),
  Object.freeze({ place: 'Singapore', latitude: 1.3521, longitude: 103.8198 }),
  Object.freeze({ place: 'Tokyo', latitude: 35.6762, longitude: 139.6503 }),
  Object.freeze({ place: 'Seoul', latitude: 37.5665, longitude: 126.978 }),
  Object.freeze({ place: 'Sydney', latitude: -33.8688, longitude: 151.2093 }),
]);

/** ~±1.1 km of wobble, so two pops in one city are two pins, not one. */
const POST_SPOT_JITTER_DEG = 0.01;

// Mirror the app's publicCoordinate(): posts are written with 3-decimal public
// coordinates (and cells = round(x * 1000)), and the guard binds a post only
// when the written fields equal the expected spot exactly. A 4-decimal spot
// could never bind.
function roundPublic(value) {
  return Math.round(value * 1_000) / 1_000;
}

/** The same shape locationForActor returns, so the write guard can use either. */
function withCells(location) {
  const latitudeCell = Math.round(location.latitude * 1000);
  const longitudeCell = Math.round(location.longitude * 1000);
  return { ...location, latitudeCell, longitudeCell, latitude3: latitudeCell / 1000, longitude3: longitudeCell / 1000 };
}

/** How far (in degrees, either axis) a spot must sit from an actor's home to count as "somewhere else". */
const HOME_EXCLUSION_DEG = 0.5;

/**
 * The places one actor may post from: every world spot except its own home
 * city — by name, and by proximity, since a home like "World beta region" is
 * really Toronto by coordinates.
 */
export function postSpotsForActor(actorId) {
  const home = ACTOR_LOCATIONS[actorId];
  if (!home) throw new Error(`Unknown synthetic actor: ${cleanText(actorId)}`);
  return WORLD_POST_SPOTS.filter(spot => spot.place !== home.place
    && (Math.abs(spot.latitude - home.latitude) > HOME_EXCLUSION_DEG
      || Math.abs(spot.longitude - home.longitude) > HOME_EXCLUSION_DEG));
}

/**
 * A fresh spot for one post. `random` is injectable so a test can pin it.
 * Never the actor's own home city, and never the same spot twice in a row for
 * one actor, so even a two-post run shows movement.
 */
export function randomPostLocation(actorId, previous = null, random = Math.random) {
  const spots = postSpotsForActor(actorId);
  let spot = spots[Math.floor(random() * spots.length)];
  if (previous && spots.length > 1 && spot.place === previous.place) {
    spot = spots[(spots.indexOf(spot) + 1) % spots.length];
  }
  return withCells({
    place: spot.place,
    latitude: roundPublic(spot.latitude + (random() * 2 - 1) * POST_SPOT_JITTER_DEG),
    longitude: roundPublic(spot.longitude + (random() * 2 - 1) * POST_SPOT_JITTER_DEG),
  });
}

/** Pace of the live cohort. Posts trickle in rather than burst. */
export const LIVE_POST_STAGGER_MS = 75_000;
export const LIVE_POST_INTERVAL_MS = 20 * 60_000;
export const LIVE_MAX_POSTS_PER_ACTOR = 4;
export const LIVE_ENGAGEMENT_INTERVAL_MS = 4 * 60_000;
export const LIVE_MAX_LIKES_PER_ACTOR = 12;
/** Direct messages: one per poster the actor engaged with, a few per run, short and canned. */
export const LIVE_MAX_DMS_PER_ACTOR = 3;
export const LIVE_DM_TEXT_MAX = 240;
export const LIVE_DM_MESSAGES = Object.freeze([
  'Hey! Your post just reached me on the Feed — nice spot. Radius growing over here.',
  'Caught your post on Poplur and liked it. What’s the story behind it?',
  'Your pin showed up in my radius today. Keep posting, it travels!',
]);

/**
 * The activity catalogue shown in the Test Center. `reported` says where the
 * activity is recorded: 'cloud' events go to testSessionIngest (the desk's
 * runner analytics), 'local' steps are held only by this runner as frames and
 * counters, and 'production' steps create or change real Poplur data.
 */
export const LIVE_ACTIVITIES = Object.freeze([
  Object.freeze({ id: 'app-open', label: 'Open Poplur and sign in', detail: 'Fresh isolated browser, then email + password sign-in with the actor’s own beta account.', reported: 'cloud' }),
  Object.freeze({ id: 'screen-view', label: 'Land on the Feed', detail: 'Watch the TV feed and whatever is currently intercepting the actor’s radius.', reported: 'cloud' }),
  Object.freeze({ id: 'open-map', label: 'Open the Map', detail: 'Arrow the cube to the Map and look at the pins in reach.', reported: 'cloud' }),
  Object.freeze({ id: 'open-profile', label: 'Open the Profile', detail: 'Arrow the cube to Profile and check their own posts and radius.', reported: 'cloud' }),
  Object.freeze({ id: 'open-hold-menu', label: 'Hold the cube for the menu', detail: 'Long-press the cube, look at the hold menu, then Escape back.', reported: 'cloud' }),
  Object.freeze({ id: 'open-camera', label: 'Open the Camera', detail: 'Arrow the cube to Camera; the browser supplies a fake camera device.', reported: 'local' }),
  Object.freeze({ id: 'capture-photo', label: 'Capture a photo', detail: 'Press the cube to capture, then choose “Use original” in the Post composer.', reported: 'local' }),
  Object.freeze({ id: 'choose-location', label: 'Pick the spot on the Map', detail: 'Tap “Use this spot” in the Map picker at the actor’s own managed city (Toronto, London or New York).', reported: 'local' }),
  Object.freeze({ id: 'publish-post', label: 'Publish the post', detail: 'Confirm “I can share this”, press “Post to TV”, wait for the upload to finish. This creates a real public post tagged synthetic.', reported: 'production' }),
  Object.freeze({ id: 'verify-post', label: 'Find the post on the Map', detail: 'Return to the Map and confirm their own pin is there.', reported: 'cloud' }),
  Object.freeze({ id: 'view-post', label: 'Watch another tester’s post', detail: 'Dwell on an intercepting post in the Feed. A real view grows that post’s radius.', reported: 'production' }),
  Object.freeze({ id: 'like-post', label: 'Like it', detail: 'Like the post once per account. A real like grows its radius by about a kilometre.', reported: 'production' }),
  Object.freeze({ id: 'send-dm', label: 'Message the poster', detail: 'Hold the cube, open View Profile on the post they just liked, press Message and send one short note. One DM per poster, at most three per run; the thread is real and lands in that owner’s Mail.', reported: 'production' }),
  Object.freeze({ id: 'idle', label: 'Pause between actions', detail: 'Human-paced dwell, then the cycle repeats. Each actor posts again every 20 minutes, up to four posts per run.', reported: 'cloud' }),
]);

export const READONLY_ACTIVITY_IDS = new Set(['app-open', 'screen-view', 'open-map', 'open-profile', 'open-hold-menu', 'idle']);

export function activitiesForMode(mode) {
  if (mode === LIVE_MODE) return LIVE_ACTIVITIES;
  return LIVE_ACTIVITIES.filter(activity => READONLY_ACTIVITY_IDS.has(activity.id));
}

/**
 * The runner command is exact: `{ enabled: boolean }` keeps its historic
 * read-only meaning, and `{ enabled: true, mode }` selects one named mode.
 * A stop never carries a mode.
 */
export function validateRunnerCommand(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || typeof value.enabled !== 'boolean'
    || Object.keys(value).some(key => key !== 'enabled' && key !== 'mode')) {
    throw new Error('Runner command requires exact { enabled: boolean, mode?: string } JSON.');
  }
  if (!value.enabled) {
    if ('mode' in value) throw new Error('A stop command never selects a mode.');
    return { enabled: false };
  }
  const mode = 'mode' in value ? value.mode : READONLY_MODE;
  if (!RUNNER_MODES.includes(mode)) throw new Error('Runner mode is not one of the named synthetic modes.');
  return { enabled: true, mode };
}

/**
 * Live journeys. Each step names the real screen it must land on, the
 * activity it records, and the way the actor drives the app. `post` and
 * `engage` steps are gated by the pacing constants above at run time, so a
 * plan cycle without a due post simply skips them.
 */
export const LIVE_STEP_METHODS = new Set(['current', 'right', 'left', 'hold', 'escape', 'post', 'engage', 'dm']);

const LIVE_PLANS = Object.freeze({
  'sim-food-001': Object.freeze([
    Object.freeze({ screen: 'feed', action: 'screen-view', method: 'current' }),
    Object.freeze({ screen: 'map', action: 'publish-post', method: 'post' }),
    Object.freeze({ screen: 'profile', action: 'open-profile', method: 'left' }),
    Object.freeze({ screen: 'feed', action: 'open-feed', method: 'left' }),
    Object.freeze({ screen: 'feed', action: 'like-post', method: 'engage' }),
    Object.freeze({ screen: 'feed', action: 'send-dm', method: 'dm' }),
    Object.freeze({ screen: 'map', action: 'open-map', method: 'right' }),
    Object.freeze({ screen: 'feed', action: 'open-feed', method: 'left' }),
  ]),
  'sim-sports-002': Object.freeze([
    Object.freeze({ screen: 'feed', action: 'screen-view', method: 'current' }),
    Object.freeze({ screen: 'map', action: 'open-map', method: 'right' }),
    Object.freeze({ screen: 'feed', action: 'open-feed', method: 'left' }),
    Object.freeze({ screen: 'feed', action: 'like-post', method: 'engage' }),
    Object.freeze({ screen: 'feed', action: 'send-dm', method: 'dm' }),
    Object.freeze({ screen: 'map', action: 'publish-post', method: 'post' }),
    Object.freeze({ screen: 'hold-menu', action: 'open-hold-menu', method: 'hold' }),
    Object.freeze({ screen: 'map', action: 'back', method: 'escape' }),
    Object.freeze({ screen: 'feed', action: 'open-feed', method: 'left' }),
  ]),
  'sim-music-003': Object.freeze([
    Object.freeze({ screen: 'feed', action: 'screen-view', method: 'current' }),
    Object.freeze({ screen: 'profile', action: 'open-profile', method: 'right' }),
    Object.freeze({ screen: 'feed', action: 'open-feed', method: 'left' }),
    Object.freeze({ screen: 'map', action: 'publish-post', method: 'post' }),
    Object.freeze({ screen: 'feed', action: 'open-feed', method: 'left' }),
    Object.freeze({ screen: 'feed', action: 'like-post', method: 'engage' }),
    Object.freeze({ screen: 'feed', action: 'send-dm', method: 'dm' }),
  ]),
  'sim-tech-004': Object.freeze([
    Object.freeze({ screen: 'feed', action: 'screen-view', method: 'current' }),
    Object.freeze({ screen: 'feed', action: 'like-post', method: 'engage' }),
    Object.freeze({ screen: 'feed', action: 'send-dm', method: 'dm' }),
    Object.freeze({ screen: 'map', action: 'open-map', method: 'right' }),
    Object.freeze({ screen: 'profile', action: 'open-profile', method: 'right' }),
    Object.freeze({ screen: 'feed', action: 'open-feed', method: 'right' }),
    Object.freeze({ screen: 'map', action: 'publish-post', method: 'post' }),
    Object.freeze({ screen: 'hold-menu', action: 'open-hold-menu', method: 'hold' }),
    Object.freeze({ screen: 'map', action: 'back', method: 'escape' }),
    Object.freeze({ screen: 'feed', action: 'open-feed', method: 'left' }),
  ]),
  'sim-news-005': Object.freeze([
    Object.freeze({ screen: 'feed', action: 'screen-view', method: 'current' }),
    Object.freeze({ screen: 'map', action: 'open-map', method: 'right' }),
    Object.freeze({ screen: 'feed', action: 'open-feed', method: 'left' }),
    Object.freeze({ screen: 'map', action: 'publish-post', method: 'post' }),
    Object.freeze({ screen: 'profile', action: 'open-profile', method: 'left' }),
    Object.freeze({ screen: 'feed', action: 'open-feed', method: 'left' }),
    Object.freeze({ screen: 'feed', action: 'like-post', method: 'engage' }),
    Object.freeze({ screen: 'feed', action: 'send-dm', method: 'dm' }),
  ]),
});

export function livePlanForActor(actorId) {
  const plan = LIVE_PLANS[actorId];
  if (!plan) throw new Error(`Unknown synthetic actor: ${cleanText(actorId)}`);
  return plan;
}

/** Frames the live runner may record. Sign-in is deliberately absent. */
export const LIVE_FRAME_STAGES = Object.freeze([
  'feed', 'profile', 'map', 'hold-menu',
  'camera', 'composer', 'location', 'publish-review', 'posted', 'mail',
]);

/**
 * The cloud ingest keeps its read-only vocabulary. A live step that the
 * cohort's cloud contract does not describe is reported as the read-only
 * event it visibly ends on (a published post ends on the Map), or not at all.
 */
export function cloudEventForLiveStep(step) {
  if (!step) return null;
  if (step.method === 'post') return { screen: 'map', action: 'screen-view' };
  if (step.method === 'engage' || step.method === 'dm') return { screen: 'feed', action: 'screen-view' };
  return { screen: step.screen, action: step.action };
}

export function accountForActor(actorId) {
  const actor = actorForId(actorId);
  const email = ACTOR_ACCOUNTS[actorId];
  if (!actor || !email) throw new Error(`Unknown synthetic actor: ${cleanText(actorId)}`);
  return { actorId, uid: actorId, email, handle: actor.handle, persona: actor.persona, place: actor.place };
}

/**
 * The actor's managed fix plus the coarse public form the shell writes on a
 * post: three-decimal degrees and thousandth-degree cells.
 */
export function locationForActor(actorId) {
  const location = ACTOR_LOCATIONS[actorId];
  if (!location) throw new Error(`Unknown synthetic actor: ${cleanText(actorId)}`);
  const latitudeCell = Math.round(location.latitude * 1000);
  const longitudeCell = Math.round(location.longitude * 1000);
  return {
    ...location,
    latitudeCell,
    longitudeCell,
    latitude3: latitudeCell / 1000,
    longitude3: longitudeCell / 1000,
  };
}

export function liveActorIdentities() {
  return ACTOR_IDS.map(accountForActor);
}

export function isLiveFrameStage(stage) {
  return LIVE_FRAME_STAGES.includes(stage);
}

export const LIVE_ACTOR_COUNT = SYNTHETIC_ACTORS.length;

// ---------------------------------------------------------------------------
// Live cohort network policy
// ---------------------------------------------------------------------------

import {
  SHARED_ONBOARDING_PROJECT_ID,
  sharedPolicyPrimitives as shared,
} from './synthetic-onboarding-actions.mjs';

export const LIVE_ENGAGEMENT_FUNCTION_URL = 'https://us-central1-poplur2025.cloudfunctions.net/recordPostEngagement';
export const LIVE_ENGAGEMENT_KINDS = new Set(['view', 'like']);
const MAX_PROFILE_WRITES = 2;

function isEngagementTarget(value) {
  try {
    const target = new URL(value);
    return `${target.origin}${target.pathname}` === LIVE_ENGAGEMENT_FUNCTION_URL && !target.search;
  } catch {
    return false;
  }
}

function writeShape(write) {
  const allowedWriteKeys = new Set(['update', 'updateMask', 'updateTransforms']);
  if (!write || typeof write !== 'object' || Array.isArray(write)
    || Object.keys(write).some(key => !allowedWriteKeys.has(key))
    || !write.update || typeof write.update !== 'object' || Array.isArray(write.update)
    || Object.keys(write.update).some(key => key !== 'name' && key !== 'fields')
    || typeof write.update.name !== 'string'
    || !write.update.fields || typeof write.update.fields !== 'object' || Array.isArray(write.update.fields)) {
    return null;
  }
  const prefix = `projects/${SHARED_ONBOARDING_PROJECT_ID}/databases/(default)/documents/`;
  if (!write.update.name.startsWith(prefix)) return null;
  return { path: write.update.name.slice(prefix.length), fields: write.update.fields };
}

/**
 * How far a published post may sit from the spot the runner moved the actor
 * to. The Map picker answers with the map's own placement, not the injected
 * fix to the metre, and the spot itself carries deliberate jitter — so
 * demanding an exact match rejected every real post. World spots are hundreds
 * of kilometres apart, so this still proves the actor posted from the city it
 * was moved to, and it never widens WHOSE ledger may be written.
 */
export const LIVE_POST_SPOT_TOLERANCE_KM = 25;

function withinSpotToleranceKm(latitude, longitude, spot, toleranceKm = LIVE_POST_SPOT_TOLERANCE_KM) {
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90) return false;
  if (!Number.isFinite(longitude) || Math.abs(longitude) > 180) return false;
  if (!spot || !Number.isFinite(spot.latitude) || !Number.isFinite(spot.longitude)) return false;
  const degreeKm = 111.32;
  const northSouth = (latitude - spot.latitude) * degreeKm;
  const eastWest = (longitude - spot.longitude) * degreeKm * Math.cos(latitude * Math.PI / 180);
  return Math.sqrt(northSouth * northSouth + eastWest * eastWest) <= toleranceKm;
}

/**
 * The public point a post carries must be the coarse form the app promises:
 * thousandth-degree cells, with the published latitude/longitude derived from
 * those same cells. This is the property that keeps an exact origin out of a
 * public document, and it is checked exactly rather than by tolerance.
 */
function isCoarsePublicPoint(fields) {
  const { firestoreField } = shared;
  const latitude = Number(firestoreField(fields, 'latitude'));
  const longitude = Number(firestoreField(fields, 'longitude'));
  const latitudeCell = Number(firestoreField(fields, 'latitudeCell'));
  const longitudeCell = Number(firestoreField(fields, 'longitudeCell'));
  if (![latitude, longitude, latitudeCell, longitudeCell].every(Number.isFinite)) return false;
  if (!Number.isInteger(latitudeCell) || !Number.isInteger(longitudeCell)) return false;
  return Math.round(latitude * 1000) === latitudeCell
    && Math.round(longitude * 1000) === longitudeCell
    && Math.abs(latitude - latitudeCell / 1000) <= 1e-9
    && Math.abs(longitude - longitudeCell / 1000) <= 1e-9;
}

/**
 * A created post may carry a discovery seed, but never earned radius. The
 * account total that grants a claim is summed from the earned field alone, so
 * a post arriving with earned radius is exactly how post count would buy
 * ground it never won.
 */
function seedAndEarnedAreHonest(fields) {
  const { firestoreField } = shared;
  const seed = firestoreField(fields, 'seedRadiusMeters');
  const earned = firestoreField(fields, 'organicRadiusMeters');
  const radius = Number(firestoreField(fields, 'radius'));
  if (seed !== undefined) {
    const seedMeters = Number(seed);
    if (!Number.isFinite(seedMeters) || seedMeters < 0 || seedMeters > 5000) return false;
    if (Number.isFinite(radius) && seedMeters > radius) return false;
  }
  return earned === undefined || Number(earned) === 0;
}

function isExactLiveWrite(write, state, identity, runId) {
  const shape = writeShape(write);
  if (!shape) return false;
  const { path, fields } = shape;
  // Posts land wherever the runner moved the actor for THIS post (see
  // randomPostLocation); everything else is measured from the actor's home.
  const home = state.expectedLocation ?? locationForActor(identity.actorId);
  const { firestoreField, exactFieldSet, exactUpdateMask, exactCreatedAtTransform, near, isBoundSharedStorageURL } = shared;

  const postMatch = path.match(/^posts\/(post-[a-zA-Z0-9-]{16,96})$/);
  if (postMatch && state.postIds.has(postMatch[1])) {
    const postId = postMatch[1];
    const storagePath = `posts/${state.uid}/${postId}.jpg`;
    const allowedFields = new Set([
      'userID', 'username', 'mediaURL', 'mediaType', 'viewCount', 'radius',
      'seedRadiusMeters', 'organicRadiusMeters',
      'createdAtMillis', 'syntheticBeta', 'syntheticActorId', 'syntheticJourney',
      'syntheticSource', 'syntheticRunId', 'mediaStoragePath', 'audience',
      'locationVisibility', 'latitude', 'longitude', 'latitudeCell', 'longitudeCell',
      'caption', 'channelId', 'filterId', 'usedAI', 'rightsAttestationVersion',
      'rightsAttestedAtMillis', 'pinColor',
    ]);
    const radius = Number(firestoreField(fields, 'radius'));
    return exactFieldSet(fields, allowedFields, new Set([
      'userID', 'username', 'mediaURL', 'mediaType', 'viewCount', 'radius',
      'createdAtMillis', 'syntheticBeta', 'syntheticActorId', 'syntheticJourney',
      'syntheticSource', 'syntheticRunId', 'mediaStoragePath', 'audience',
      'locationVisibility', 'latitude', 'longitude', 'latitudeCell', 'longitudeCell',
    ]))
      && !('updateMask' in write)
      && exactCreatedAtTransform(write.updateTransforms)
      && firestoreField(fields, 'userID') === state.uid
      && typeof firestoreField(fields, 'username') === 'string'
      && firestoreField(fields, 'mediaStoragePath') === storagePath
      && isBoundSharedStorageURL(firestoreField(fields, 'mediaURL'), storagePath)
      && firestoreField(fields, 'mediaType') === 'photo'
      && Number(firestoreField(fields, 'viewCount')) === 0
      && firestoreField(fields, 'syntheticBeta') === true
      && firestoreField(fields, 'syntheticActorId') === identity.actorId
      && firestoreField(fields, 'syntheticJourney') === LIVE_MODE
      && firestoreField(fields, 'syntheticSource') === LIVE_SOURCE
      && firestoreField(fields, 'syntheticRunId') === runId
      && firestoreField(fields, 'audience') === 'public'
      && firestoreField(fields, 'locationVisibility') === 'approximate'
      && Number.isFinite(radius) && radius >= 0
      // A seed is reach, never entitlement: it may be at most the sanctioned
      // 5 km and may not exceed the post's own reach, and a new post may never
      // arrive already claiming earned radius.
      && seedAndEarnedAreHonest(fields)
      && isCoarsePublicPoint(fields)
      && withinSpotToleranceKm(
        Number(firestoreField(fields, 'latitude')),
        Number(firestoreField(fields, 'longitude')),
        home,
      );
  }

  const locationMatch = path.match(new RegExp(`^users/${state.uid}/postLocations/(post-[a-zA-Z0-9-]{16,96})$`));
  if (locationMatch && state.postIds.has(locationMatch[1])) {
    const allowedFields = new Set(['latitude', 'longitude', 'source']);
    return exactFieldSet(fields, allowedFields)
      && exactUpdateMask(write.updateMask, fields, ['createdAt'])
      && exactCreatedAtTransform(write.updateTransforms)
      && firestoreField(fields, 'source') === 'post-upload'
      && withinSpotToleranceKm(
        Number(firestoreField(fields, 'latitude')),
        Number(firestoreField(fields, 'longitude')),
        home,
      );
  }

  if (path.startsWith('dmThreads/')) return isExactLiveDMWrite(write, state, path, fields);

  // The shipping shell creates a profile for an account that has none. That
  // is the app working as designed, so the exact first-run shape is admitted
  // a bounded number of times and never with a different identity.
  if (path === `users/${state.uid}` && state.profileWrites < MAX_PROFILE_WRITES) {
    const allowedFields = new Set(['uid', 'username', 'usernameNormalized', 'email', 'accountType', 'photoURL', 'bio', 'createdAt']);
    const ok = exactFieldSet(fields, allowedFields, new Set(['uid', 'username', 'email']))
      && exactUpdateMask(write.updateMask, fields)
      && !('updateTransforms' in write)
      && firestoreField(fields, 'uid') === state.uid
      && firestoreField(fields, 'email') === identity.email
      && (firestoreField(fields, 'accountType') == null || firestoreField(fields, 'accountType') === 'personal');
    if (ok) state.profileWrites += 1;
    return ok;
  }
  if (/^usernames\/[a-z0-9._-]{1,64}$/.test(path) && state.profileWrites < MAX_PROFILE_WRITES) {
    const allowedFields = new Set(['uid', 'username', 'email', 'updatedAt']);
    const ok = exactFieldSet(fields, allowedFields, new Set(['uid', 'username', 'email']))
      && exactUpdateMask(write.updateMask, fields)
      && !('updateTransforms' in write)
      && firestoreField(fields, 'uid') === state.uid
      && firestoreField(fields, 'email') === identity.email;
    if (ok) state.profileWrites += 1;
    return ok;
  }
  return false;
}

function unquotedFieldPath(value) {
  return String(value || '').replace(/`/g, '');
}

function arrayStrings(value) {
  const values = value?.arrayValue?.values;
  if (!Array.isArray(values)) return null;
  const strings = values.map(item => (item && typeof item === 'object' && Object.keys(item).length === 1
    && typeof item.stringValue === 'string') ? item.stringValue : null);
  return strings.every(item => item !== null) ? strings : null;
}

function canonicalThreadId(a, b) {
  return [a, b].sort().join('_');
}

/**
 * A direct message exactly as the shipping shell sends it: one merge-set on
 * the thread and one set on the message, in the same batch. Only threads with
 * a recipient the runner bound after the app showed that poster, only from
 * the actor, one message per recipient, short text.
 */
function isExactLiveDMWrite(write, state, path, fields) {
  const match = path.match(/^dmThreads\/([A-Za-z0-9_-]{13,257})(?:\/messages\/([A-Za-z0-9_-]{6,128}))?$/);
  if (!match || !state.uid) return false;
  const threadId = match[1];
  const other = [...state.dmRecipients].find(candidate => canonicalThreadId(state.uid, candidate) === threadId);
  if (!other) return false;
  const { firestoreField } = shared;
  const transforms = Array.isArray(write.updateTransforms) ? write.updateTransforms : [];
  const isServerTime = (transform, fieldPath) => Boolean(transform) && typeof transform === 'object'
    && Object.keys(transform).length === 2 && unquotedFieldPath(transform.fieldPath) === fieldPath
    && transform.setToServerValue === 'REQUEST_TIME';

  if (match[2]) {
    const messageId = match[2];
    const text = firestoreField(fields, 'text');
    const ok = Object.keys(fields).length === 4
      && firestoreField(fields, 'senderId') === state.uid
      && firestoreField(fields, 'clientMessageId') === messageId
      && firestoreField(fields, 'kind') === 'text'
      && typeof text === 'string' && text.trim().length > 0 && text.length <= LIVE_DM_TEXT_MAX
      && !('updateMask' in write)
      && transforms.length === 1 && isServerTime(transforms[0], 'createdAt')
      && (state.dmMessageIds.has(messageId) || !state.dmSentTo.has(other));
    if (ok && !state.dmMessageIds.has(messageId)) {
      state.dmMessageIds.add(messageId);
      state.dmSentTo.add(other);
      state.dmsSent += 1;
    }
    return ok;
  }

  const participants = arrayStrings(fields.participants);
  const unread = fields.unreadBy?.mapValue?.fields;
  const unreadKeys = unread && typeof unread === 'object' ? Object.keys(unread) : null;
  const lastMessage = firestoreField(fields, 'lastMessage');
  // The sender may name only itself; naming the other side would let a sender
  // relabel someone else's entry in their own Mail list.
  const names = fields.participantNames?.mapValue?.fields;
  const nameKeys = names && typeof names === 'object' ? Object.keys(names) : null;
  const allowedMask = new Set([
    'participants', 'lastMessage', 'lastSenderId', 'updatedAt',
    `unreadBy.${state.uid}`, `unreadBy.${other}`, `participantNames.${state.uid}`,
  ]);
  const maskPaths = Array.isArray(write.updateMask?.fieldPaths) ? write.updateMask.fieldPaths.map(unquotedFieldPath) : null;
  return Object.keys(fields).every(key => ['participants', 'lastMessage', 'lastSenderId', 'unreadBy', 'participantNames'].includes(key))
    && participants !== null && participants.length === 2
    && participants.join('_') === canonicalThreadId(state.uid, other)
    && firestoreField(fields, 'lastSenderId') === state.uid
    && typeof lastMessage === 'string' && lastMessage.length <= LIVE_DM_TEXT_MAX
    && (!nameKeys || (nameKeys.length === 1 && nameKeys[0] === state.uid
      && typeof firestoreField(names, state.uid) === 'string'))
    && (!unreadKeys || (unreadKeys.every(key => key === state.uid)
      && (!unread[state.uid] || Number(firestoreField(unread, state.uid)) === 0)))
    && maskPaths !== null && maskPaths.every(pathValue => allowedMask.has(pathValue))
    && transforms.every(transform => isServerTime(transform, 'updatedAt')
      || (Boolean(transform) && typeof transform === 'object' && Object.keys(transform).length === 2
        && unquotedFieldPath(transform.fieldPath) === `unreadBy.${other}`
        && Number(transform.increment?.integerValue ?? transform.increment?.doubleValue) === 1));
}

/**
 * Fail-closed production policy for one live cohort actor. The pinned Auth
 * UID, exact document names and exact Storage paths are the authority; the
 * synthetic provenance fields are required on every post so cleanup can find
 * them. There is no list, reset, delete or profile-photo capability; a DM is
 * admitted only to a recipient the runner bound after the app showed them.
 */
export function createLiveCohortNetworkPolicy(identity, runId) {
  if (!identity || !ACTOR_ACCOUNTS[identity.actorId] || identity.uid !== identity.actorId
    || identity.email !== ACTOR_ACCOUNTS[identity.actorId]
    || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{7,63}$/.test(runId || '')) {
    throw new Error('A pinned live cohort identity and run ID are required.');
  }
  const {
    WRITE_METHODS, exactJSON, isLocalAppTarget, isProductionFirebaseTarget, exactSharedAuthTarget,
    exactSharedFirestoreTarget, isSharedFirestoreRead, isSharedFirestoreWriteChannelHandshake,
    firestoreWriteOperations, isSharedStorageTarget, sharedStorageObjectName, isBoundSharedUploadSession,
    hasBoundFirebaseAuthorization,
  } = shared;
  const state = {
    uid: '',
    idToken: '',
    refreshToken: '',
    postIds: new Set(),
    lastPostId: '',
    /** Where the post now in flight was dropped (a randomPostLocation), so the
     *  write guard accepts that spot instead of the actor's home. Null between
     *  posts. */
    expectedLocation: null,
    uploadSessions: Object.create(null),
    viewsGiven: 0,
    likesGiven: 0,
    engagementEvents: new Set(),
    profileWrites: 0,
    dmRecipients: new Set(),
    dmMessageIds: new Set(),
    dmSentTo: new Set(),
    dmsSent: 0,
  };

  /** The runner binds a recipient only after the app itself showed that poster. */
  const bindDMRecipient = otherUid => {
    if (!/^[a-zA-Z0-9_-]{6,128}$/.test(otherUid || '') || otherUid === identity.uid) {
      throw new Error('DM recipient must be another real account.');
    }
    if (state.dmRecipients.has(otherUid)) return otherUid;
    if (state.dmRecipients.size >= LIVE_MAX_DMS_PER_ACTOR) {
      throw new Error(`${identity.actorId} reached its ${LIVE_MAX_DMS_PER_ACTOR}-recipient DM limit for this run.`);
    }
    state.dmRecipients.add(otherUid);
    return otherUid;
  };

  const bindAuth = ({ uid, idToken, refreshToken }) => {
    if (uid !== identity.uid || !idToken || !refreshToken) {
      throw new Error(`Production Auth did not return the pinned identity for ${identity.actorId}.`);
    }
    state.uid = uid;
    state.idToken = idToken;
    state.refreshToken = refreshToken;
  };

  const bindPostId = postId => {
    if (!/^post-[a-zA-Z0-9-]{16,96}$/.test(postId || '')) throw new Error('Live cohort post ID is invalid.');
    if (!state.postIds.has(postId) && state.postIds.size >= LIVE_MAX_POSTS_PER_ACTOR) {
      throw new Error(`${identity.actorId} reached its ${LIVE_MAX_POSTS_PER_ACTOR}-post limit for this run.`);
    }
    state.postIds.add(postId);
    state.lastPostId = postId;
    return `posts/${state.uid}/${postId}.jpg`;
  };

  const inspect = request => {
    const method = String(request?.method || '').toUpperCase();
    const url = String(request?.url || '');
    const postData = typeof request?.postData === 'string' ? request.postData : '';
    const headers = request?.headers;
    if (isLocalAppTarget(url)) return { allow: true, kind: 'local-app' };

    if (method === 'OPTIONS') {
      const allow = ['signInWithPassword', 'update', 'lookup', 'token'].some(operation => exactSharedAuthTarget(url, operation))
        || (isSharedStorageTarget(url) && Boolean(sharedStorageObjectName(url)))
        || exactSharedFirestoreTarget(url, postData)
        || isEngagementTarget(url);
      return { allow, kind: allow ? 'live-preflight' : 'live-blocked', reason: allow ? '' : 'Preflight is outside the live cohort ledger.' };
    }

    if (exactSharedAuthTarget(url, 'signInWithPassword')) {
      const body = exactJSON(postData);
      const keys = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body) : [];
      const allow = method === 'POST'
        && body?.email === identity.email
        && typeof body?.password === 'string' && body.password.length >= 6
        && body?.returnSecureToken === true
        && keys.every(key => ['email', 'password', 'returnSecureToken', 'clientType'].includes(key));
      return { allow, kind: 'live-auth-sign-in', reason: allow ? '' : 'Sign-in is not the pinned cohort account.' };
    }
    if (exactSharedAuthTarget(url, 'update')) {
      const body = exactJSON(postData);
      const keys = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body) : [];
      const allow = method === 'POST' && Boolean(state.idToken) && body?.idToken === state.idToken
        && keys.every(key => ['idToken', 'displayName', 'returnSecureToken'].includes(key));
      return { allow, kind: 'live-auth-profile', reason: allow ? '' : 'Auth profile update is not bound to the actor.' };
    }
    if (exactSharedAuthTarget(url, 'lookup')) {
      const body = exactJSON(postData);
      const allow = method === 'POST' && Boolean(state.idToken) && body?.idToken === state.idToken && Object.keys(body).length === 1;
      return { allow, kind: 'live-auth-read', reason: allow ? '' : 'Auth lookup is not self-owned.' };
    }
    if (exactSharedAuthTarget(url, 'token')) {
      const params = new URLSearchParams(postData);
      const allow = method === 'POST' && Boolean(state.refreshToken)
        && params.get('grant_type') === 'refresh_token'
        && params.getAll('refresh_token').length === 1
        && params.get('refresh_token') === state.refreshToken
        && [...params.keys()].every(key => key === 'grant_type' || key === 'refresh_token');
      return { allow, kind: 'live-auth-refresh', reason: allow ? '' : 'Auth refresh is not bound to the actor.' };
    }

    if (exactSharedFirestoreTarget(url, postData)) {
      if (isSharedFirestoreRead(method, url)) return { allow: true, kind: 'live-firestore-read' };
      if (method !== 'POST') return { allow: false, kind: 'live-firestore-blocked', reason: 'Live cohort never updates or deletes via REST methods.' };
      if (!state.uid) return { allow: false, kind: 'live-firestore-blocked', reason: 'Firestore write arrived before Auth was bound.' };
      const operations = firestoreWriteOperations(postData);
      if (!operations.length) {
        const allow = isSharedFirestoreWriteChannelHandshake(method, url, postData, state.idToken);
        return { allow, kind: allow ? 'live-firestore-write-channel-control' : 'live-firestore-blocked', reason: allow ? '' : 'Firestore write targets could not be proven.' };
      }
      const refused = operations.filter(write => !isExactLiveWrite(write, state, identity, runId));
      if (refused.length) {
        // Name the document. "Fields are not exact" alone cannot tell a post
        // from a profile from a thread, which is the first thing anyone needs.
        const where = refused
          .map(write => String(write?.update?.name || '').split('/documents/')[1] || 'unknown')
          .join(', ').slice(0, 200);
        return { allow: false, kind: 'live-firestore-blocked', reason: `Firestore write fields are not the exact live cohort ledger: ${where}` };
      }
      return { allow: true, kind: 'live-firestore-write', documentNames: operations.map(write => write.update.name.split('/documents/')[1]) };
    }

    if (isSharedStorageTarget(url)) {
      if (!WRITE_METHODS.has(method)) {
        const objectPath = sharedStorageObjectName(url);
        return objectPath
          ? { allow: true, kind: 'live-storage-read', objectPath }
          : { allow: false, kind: 'live-storage-blocked', reason: 'Storage bucket listing is not permitted.' };
      }
      if (!state.uid || !hasBoundFirebaseAuthorization(headers, state.idToken)) {
        return { allow: false, kind: 'live-storage-blocked', reason: 'Storage write is not authenticated as the actor.' };
      }
      const boundSessionPath = Object.entries(state.uploadSessions).find(([, session]) => session === url)?.[0];
      if (boundSessionPath) {
        const allow = method === 'PUT' || method === 'POST';
        return { allow, kind: 'live-storage-upload-chunk', objectPath: boundSessionPath, reason: allow ? '' : 'Bound upload session used an invalid method.' };
      }
      if (method !== 'POST') return { allow: false, kind: 'live-storage-blocked', reason: 'Storage write is not an exact upload start.' };
      const objectName = sharedStorageObjectName(url);
      const pathMatch = objectName?.match(new RegExp(`^posts/${state.uid}/(post-[a-zA-Z0-9-]{16,96})\\.jpg$`));
      if (pathMatch) {
        try {
          const objectPath = bindPostId(pathMatch[1]);
          return { allow: true, kind: 'live-storage-upload', postId: pathMatch[1], objectPath };
        } catch (error) {
          return { allow: false, kind: 'live-storage-blocked', reason: error.message };
        }
      }
      return { allow: false, kind: 'live-storage-blocked', reason: 'Storage write is outside the actor’s own post images.' };
    }

    if (isEngagementTarget(url)) {
      if (method !== 'POST' || !state.idToken || !hasBoundFirebaseAuthorization(headers, state.idToken)) {
        return { allow: false, kind: 'live-engagement-blocked', reason: 'Engagement is not authenticated as the actor.' };
      }
      const body = exactJSON(postData);
      const data = body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 1 ? body.data : null;
      const keys = data && typeof data === 'object' && !Array.isArray(data) ? Object.keys(data) : [];
      const kind = data?.kind;
      const exact = keys.length === 3 && keys.every(key => ['postId', 'eventId', 'kind'].includes(key))
        && typeof data.postId === 'string' && /^[a-zA-Z0-9_-]{6,128}$/.test(data.postId)
        && typeof data.eventId === 'string' && /^[a-zA-Z0-9_-]{6,128}$/.test(data.eventId)
        && LIVE_ENGAGEMENT_KINDS.has(kind);
      if (!exact) return { allow: false, kind: 'live-engagement-blocked', reason: 'Engagement is not an exact view or like.' };
      const fresh = !state.engagementEvents.has(data.eventId);
      if (kind === 'like' && fresh && state.likesGiven >= LIVE_MAX_LIKES_PER_ACTOR) {
        return { allow: false, kind: 'live-engagement-capped', reason: `${identity.actorId} reached its like limit for this run.` };
      }
      if (fresh) {
        state.engagementEvents.add(data.eventId);
        if (kind === 'like') state.likesGiven += 1;
        else state.viewsGiven += 1;
      }
      return { allow: true, kind: 'live-engagement', engagement: kind, postId: data.postId };
    }

    if (isProductionFirebaseTarget(url)) {
      return { allow: false, kind: 'live-production-blocked', reason: 'Production request is outside the live cohort ledger.' };
    }
    if (!WRITE_METHODS.has(method)) return { allow: true, kind: 'read' };
    return { allow: false, kind: 'external-write-blocked', reason: 'Live cohort permits no unallowlisted writes.' };
  };

  return {
    identity,
    runId,
    state,
    bindAuth,
    bindPostId,
    bindDMRecipient,
    bindUploadSession(value, objectPath) {
      const session = String(value || '').slice(0, 1_024);
      if (!isBoundSharedUploadSession(session, objectPath)) {
        throw new Error('Production Storage returned an upload session outside the actor’s own post image.');
      }
      state.uploadSessions[objectPath] = session;
    },
    inspect,
  };
}
