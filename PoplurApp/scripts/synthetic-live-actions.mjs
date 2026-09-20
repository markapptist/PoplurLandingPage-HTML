import { LIVE_OWNER_UID, LIVE_MAX_CALLS_PER_ACTOR, inspectSocialCallWrite, isSocialThreadStateWrite } from './synthetic-social-contract.mjs';
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
  'sim-biz-food-006': 'beta-sim-biz-food-006@poplur.test',
  'sim-biz-shop-007': 'beta-sim-biz-shop-007@poplur.test',
  'sim-biz-fashion-008': 'beta-sim-biz-fashion-008@poplur.test',
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
  // Business testers stand where they trade (Kensington Market, the Eaton
  // Centre, SoHo) — the same seats functions/src/syntheticBrowserRunner.ts
  // gives their cloud-path posts.
  'sim-biz-food-006': Object.freeze({ place: 'Toronto', latitude: 43.6545, longitude: -79.4005 }),
  'sim-biz-shop-007': Object.freeze({ place: 'Toronto', latitude: 43.6544, longitude: -79.3807 }),
  'sim-biz-fashion-008': Object.freeze({ place: 'New York', latitude: 40.7233, longitude: -74.003 }),
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
  Object.freeze({ place: 'Calgary', latitude: 51.0447, longitude: -114.0719 }),
  Object.freeze({ place: 'Halifax', latitude: 44.6488, longitude: -63.5752 }),
  Object.freeze({ place: 'New York', latitude: 40.7128, longitude: -74.006 }),
  Object.freeze({ place: 'Los Angeles', latitude: 34.0522, longitude: -118.2437 }),
  Object.freeze({ place: 'Chicago', latitude: 41.8781, longitude: -87.6298 }),
  Object.freeze({ place: 'Miami', latitude: 25.7617, longitude: -80.1918 }),
  Object.freeze({ place: 'Seattle', latitude: 47.6062, longitude: -122.3321 }),
  Object.freeze({ place: 'Denver', latitude: 39.7392, longitude: -104.9903 }),
  Object.freeze({ place: 'Austin', latitude: 30.2672, longitude: -97.7431 }),
  Object.freeze({ place: 'Atlanta', latitude: 33.749, longitude: -84.388 }),
  Object.freeze({ place: 'Honolulu', latitude: 21.3069, longitude: -157.8583 }),
  Object.freeze({ place: 'Anchorage', latitude: 61.2181, longitude: -149.9003 }),
  Object.freeze({ place: 'Mexico City', latitude: 19.4326, longitude: -99.1332 }),
  Object.freeze({ place: 'Guadalajara', latitude: 20.6597, longitude: -103.3496 }),
  Object.freeze({ place: 'Havana', latitude: 23.1136, longitude: -82.3666 }),
  Object.freeze({ place: 'Panama City', latitude: 8.9824, longitude: -79.5199 }),
  Object.freeze({ place: 'Bogotá', latitude: 4.711, longitude: -74.0721 }),
  Object.freeze({ place: 'Lima', latitude: -12.0464, longitude: -77.0428 }),
  Object.freeze({ place: 'Santiago', latitude: -33.4489, longitude: -70.6693 }),
  Object.freeze({ place: 'São Paulo', latitude: -23.5505, longitude: -46.6333 }),
  Object.freeze({ place: 'Rio de Janeiro', latitude: -22.9068, longitude: -43.1729 }),
  Object.freeze({ place: 'Buenos Aires', latitude: -34.6037, longitude: -58.3816 }),
  Object.freeze({ place: 'Reykjavik', latitude: 64.1466, longitude: -21.9426 }),
  Object.freeze({ place: 'Dublin', latitude: 53.3498, longitude: -6.2603 }),
  Object.freeze({ place: 'London', latitude: 51.5074, longitude: -0.1278 }),
  Object.freeze({ place: 'Edinburgh', latitude: 55.9533, longitude: -3.1883 }),
  Object.freeze({ place: 'Lisbon', latitude: 38.7223, longitude: -9.1393 }),
  Object.freeze({ place: 'Madrid', latitude: 40.4168, longitude: -3.7038 }),
  Object.freeze({ place: 'Barcelona', latitude: 41.3874, longitude: 2.1686 }),
  Object.freeze({ place: 'Paris', latitude: 48.8566, longitude: 2.3522 }),
  Object.freeze({ place: 'Amsterdam', latitude: 52.3676, longitude: 4.9041 }),
  Object.freeze({ place: 'Brussels', latitude: 50.8503, longitude: 4.3517 }),
  Object.freeze({ place: 'Berlin', latitude: 52.52, longitude: 13.405 }),
  Object.freeze({ place: 'Munich', latitude: 48.1351, longitude: 11.582 }),
  Object.freeze({ place: 'Zurich', latitude: 47.3769, longitude: 8.5417 }),
  Object.freeze({ place: 'Milan', latitude: 45.4642, longitude: 9.19 }),
  Object.freeze({ place: 'Rome', latitude: 41.9028, longitude: 12.4964 }),
  Object.freeze({ place: 'Vienna', latitude: 48.2082, longitude: 16.3738 }),
  Object.freeze({ place: 'Prague', latitude: 50.0755, longitude: 14.4378 }),
  Object.freeze({ place: 'Warsaw', latitude: 52.2297, longitude: 21.0122 }),
  Object.freeze({ place: 'Copenhagen', latitude: 55.6761, longitude: 12.5683 }),
  Object.freeze({ place: 'Stockholm', latitude: 59.3293, longitude: 18.0686 }),
  Object.freeze({ place: 'Oslo', latitude: 59.9139, longitude: 10.7522 }),
  Object.freeze({ place: 'Helsinki', latitude: 60.1699, longitude: 24.9384 }),
  Object.freeze({ place: 'Athens', latitude: 37.9838, longitude: 23.7275 }),
  Object.freeze({ place: 'Istanbul', latitude: 41.0082, longitude: 28.9784 }),
  Object.freeze({ place: 'Tel Aviv', latitude: 32.0853, longitude: 34.7818 }),
  Object.freeze({ place: 'Cairo', latitude: 30.0444, longitude: 31.2357 }),
  Object.freeze({ place: 'Marrakesh', latitude: 31.6295, longitude: -7.9811 }),
  Object.freeze({ place: 'Dakar', latitude: 14.7167, longitude: -17.4677 }),
  Object.freeze({ place: 'Accra', latitude: 5.6037, longitude: -0.187 }),
  Object.freeze({ place: 'Lagos', latitude: 6.5244, longitude: 3.3792 }),
  Object.freeze({ place: 'Addis Ababa', latitude: 9.03, longitude: 38.74 }),
  Object.freeze({ place: 'Nairobi', latitude: -1.2921, longitude: 36.8219 }),
  Object.freeze({ place: 'Kigali', latitude: -1.9441, longitude: 30.0619 }),
  Object.freeze({ place: 'Johannesburg', latitude: -26.2041, longitude: 28.0473 }),
  Object.freeze({ place: 'Cape Town', latitude: -33.9249, longitude: 18.4241 }),
  Object.freeze({ place: 'Dubai', latitude: 25.2048, longitude: 55.2708 }),
  Object.freeze({ place: 'Doha', latitude: 25.2854, longitude: 51.531 }),
  Object.freeze({ place: 'Riyadh', latitude: 24.7136, longitude: 46.6753 }),
  Object.freeze({ place: 'Tehran', latitude: 35.6892, longitude: 51.389 }),
  Object.freeze({ place: 'Karachi', latitude: 24.8607, longitude: 67.0011 }),
  Object.freeze({ place: 'Mumbai', latitude: 19.076, longitude: 72.8777 }),
  Object.freeze({ place: 'Delhi', latitude: 28.6139, longitude: 77.209 }),
  Object.freeze({ place: 'Bengaluru', latitude: 12.9716, longitude: 77.5946 }),
  Object.freeze({ place: 'Colombo', latitude: 6.9271, longitude: 79.8612 }),
  Object.freeze({ place: 'Dhaka', latitude: 23.8103, longitude: 90.4125 }),
  Object.freeze({ place: 'Kathmandu', latitude: 27.7172, longitude: 85.324 }),
  Object.freeze({ place: 'Bangkok', latitude: 13.7563, longitude: 100.5018 }),
  Object.freeze({ place: 'Hanoi', latitude: 21.0278, longitude: 105.8342 }),
  Object.freeze({ place: 'Kuala Lumpur', latitude: 3.139, longitude: 101.6869 }),
  Object.freeze({ place: 'Singapore', latitude: 1.3521, longitude: 103.8198 }),
  Object.freeze({ place: 'Jakarta', latitude: -6.2088, longitude: 106.8456 }),
  Object.freeze({ place: 'Manila', latitude: 14.5995, longitude: 120.9842 }),
  Object.freeze({ place: 'Hong Kong', latitude: 22.3193, longitude: 114.1694 }),
  Object.freeze({ place: 'Taipei', latitude: 25.033, longitude: 121.5654 }),
  Object.freeze({ place: 'Shanghai', latitude: 31.2304, longitude: 121.4737 }),
  Object.freeze({ place: 'Beijing', latitude: 39.9042, longitude: 116.4074 }),
  Object.freeze({ place: 'Seoul', latitude: 37.5665, longitude: 126.978 }),
  Object.freeze({ place: 'Tokyo', latitude: 35.6762, longitude: 139.6503 }),
  Object.freeze({ place: 'Osaka', latitude: 34.6937, longitude: 135.5023 }),
  Object.freeze({ place: 'Sapporo', latitude: 43.0618, longitude: 141.3545 }),
  Object.freeze({ place: 'Perth', latitude: -31.9505, longitude: 115.8605 }),
  Object.freeze({ place: 'Melbourne', latitude: -37.8136, longitude: 144.9631 }),
  Object.freeze({ place: 'Sydney', latitude: -33.8688, longitude: 151.2093 }),
  Object.freeze({ place: 'Brisbane', latitude: -27.4698, longitude: 153.0251 }),
  Object.freeze({ place: 'Auckland', latitude: -36.8509, longitude: 174.7645 }),
  Object.freeze({ place: 'Wellington', latitude: -41.2865, longitude: 174.7762 }),
  Object.freeze({ place: 'Suva', latitude: -18.1416, longitude: 178.4419 }),
]);

/**
 * ~±13 km of wobble around the named place, so a cohort's pops land across a
 * city's whole area — its neighbourhoods, suburbs and shore — rather than on
 * one downtown pixel. Exported so the tests pin the exact figure.
 */
export const POST_SPOT_JITTER_DEG = 0.12;

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

/** How many of the cohort's latest pops a new pop is pushed away from. */
export const POST_SPREAD_MEMORY = 12;
/** How many random spots are weighed for one pop before the farthest is kept. */
export const POST_SPREAD_CANDIDATES = 6;

function greatCircleKm(a, b) {
  const rad = degrees => degrees * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

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
 * The share of pops that used to be sent back to another actor's own city so
 * the cohort could intercept itself. Zero now (user-ordered 5 Sep): every
 * pop lands somewhere in the world. The cohort still meets — it walks to the
 * OWNER's posts to view, like, message and call (findOwnerPost), which is the
 * reach that matters; stacking its own pops on three downtowns only made the
 * board read as five people standing still.
 */
export const NEIGHBOUR_POST_SHARE = 0;

/**
 * The home ground of every OTHER actor. Kept for the contract's readers; no
 * pop is aimed here any more.
 */
export function neighbourSpotsForActor(actorId) {
  const home = ACTOR_LOCATIONS[actorId];
  if (!home) throw new Error(`Unknown synthetic actor: ${cleanText(actorId)}`);
  return ACTOR_IDS
    .filter(id => id !== actorId)
    .map(id => ACTOR_LOCATIONS[id])
    .filter(spot => spot.place !== home.place
      && (Math.abs(spot.latitude - home.latitude) > HOME_EXCLUSION_DEG
        || Math.abs(spot.longitude - home.longitude) > HOME_EXCLUSION_DEG));
}

/**
 * Campus lane (16 Sep 2026). The student beta runs on two colleges while the
 * cohort keeps posting worldwide, so a share of every actor's pops lands on a
 * campus with ~1 km of wobble — inside a student's 5 km starting radius, not
 * 13 km away in a suburb. Off unless POPLUR_CAMPUS_POST_SHARE is set (the
 * launchd agents set it), which also keeps the pinned-random tests exact.
 * Coordinates are the campuses' main entrances, 3-decimal like every spot.
 */
export const CAMPUS_POST_SPOTS = Object.freeze([
  Object.freeze({ place: 'Humber North', latitude: 43.729, longitude: -79.607 }),
  Object.freeze({ place: 'Humber Lakeshore', latitude: 43.594, longitude: -79.508 }),
  Object.freeze({ place: 'Sheridan Trafalgar', latitude: 43.469, longitude: -79.699 }),
  Object.freeze({ place: 'Sheridan Hazel McCallion', latitude: 43.591, longitude: -79.648 }),
  Object.freeze({ place: 'Sheridan Davis', latitude: 43.732, longitude: -79.77 }),
]);
/** ~±1 km, so a campus pop stays on the campus a student is standing on. */
export const CAMPUS_POST_JITTER_DEG = 0.01;

/** The share of pops aimed at a campus: 0..1 from POPLUR_CAMPUS_POST_SHARE, else 0. */
/**
 * Who the cohort engages. 'owner' (default, the 5 Sep contract): it walks to
 * the OWNER's posts. 'cohort' (owner decision 18 Sep 2026, for the student
 * beta): it walks to each other's posts instead — otherwise the owner's pops
 * get ~200 synthetic likes a week, never decay, and his account behaves like
 * no student's. DMs and calls still need the consenting owner either way.
 * Set POPLUR_ENGAGE_TARGET=cohort in the runner's launchd plist.
 */
export function engagementTarget(env = process.env) {
  return env.POPLUR_ENGAGE_TARGET === 'cohort' ? 'cohort' : 'owner';
}

export function campusPostShare(env = process.env) {
  const raw = Number(env.POPLUR_CAMPUS_POST_SHARE);
  return Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0;
}

/**
 * One campus pop: the campus farthest from the cohort's latest pops (so the
 * colleges take turns), never the same campus twice in a row, jittered ~1 km.
 */
export function campusPostLocation(previous = null, random = Math.random, recent = []) {
  const anchors = recent
    .filter(point => Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude))
    .slice(-POST_SPREAD_MEMORY);
  let spot = CAMPUS_POST_SPOTS[Math.min(CAMPUS_POST_SPOTS.length - 1, Math.max(0, Math.floor(random() * CAMPUS_POST_SPOTS.length)))];
  if (anchors.length) {
    let best = -1;
    for (const candidate of CAMPUS_POST_SPOTS) {
      const nearestKm = Math.min(...anchors.map(anchor => greatCircleKm(candidate, anchor)));
      if (nearestKm > best) { best = nearestKm; spot = candidate; }
    }
  }
  if (previous && spot.place === previous.place) {
    spot = CAMPUS_POST_SPOTS[(CAMPUS_POST_SPOTS.indexOf(spot) + 1) % CAMPUS_POST_SPOTS.length];
  }
  return withCells({
    place: spot.place,
    latitude: roundPublic(spot.latitude + (random() * 2 - 1) * CAMPUS_POST_JITTER_DEG),
    longitude: roundPublic(spot.longitude + (random() * 2 - 1) * CAMPUS_POST_JITTER_DEG),
  });
}

/**
 * A fresh spot for one post: somewhere in the world, never the actor's own
 * home city, never the same place twice in a row, and never the exact point
 * a previous pop took. `random` is injectable so a test can pin it. When the
 * campus lane is on, that share of pops goes to a college instead.
 */
export function randomPostLocation(actorId, previous = null, random = Math.random, recent = []) {
  const campusShare = campusPostShare();
  if (campusShare > 0 && random() < campusShare) return campusPostLocation(previous, random, recent);
  const spots = postSpotsForActor(actorId);
  const draw = () => spots[Math.min(spots.length - 1, Math.max(0, Math.floor(random() * spots.length)))];
  let spot = draw();
  // Uniform draws over a city list pile up wherever the list is dense: Europe
  // holds a quarter of the spots on a twentieth of the land, so "posting all
  // over the world" still read as a clutter over one continent (5 Sep 2026).
  // Weigh a few candidates and keep the one farthest from the cohort's latest
  // pops — farthest-point sampling seeded by chance — so consecutive pops
  // push away from each other across the whole board. With nothing recent
  // the plain draw stands, which is also what keeps the older tests exact.
  const anchors = recent
    .filter(point => Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude))
    .slice(-POST_SPREAD_MEMORY);
  if (anchors.length) {
    let best = -1;
    for (let i = 0; i < POST_SPREAD_CANDIDATES; i += 1) {
      const candidate = i === 0 ? spot : draw();
      const nearestKm = Math.min(...anchors.map(anchor => greatCircleKm(candidate, anchor)));
      if (nearestKm > best) { best = nearestKm; spot = candidate; }
    }
  }
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
/**
 * How many messages one actor may send ONE person over a run. The first is
 * the opener; the rest are replies to what that person writes back (a thread
 * the owner answers used to go silent, because the guard admitted exactly one
 * message per recipient). Bounded so a runaway loop cannot flood a thread.
 */
export const LIVE_MAX_DM_MESSAGES_PER_RECIPIENT = 8;
/** How often an actor looks in on its owner thread for something to answer. */
export const LIVE_REPLY_CHECK_INTERVAL_MS = 3 * 60_000;
export const LIVE_DM_MESSAGES = Object.freeze([
  'Hey! Your post just reached me on the Feed — nice spot. Radius growing over here.',
  'Caught your post on Poplur and liked it. What’s the story behind it?',
  'Your pin showed up in my radius today. Keep posting, it travels!',
]);

/**
 * What a tester says back. Answers first when the owner asked something;
 * otherwise a beat that keeps the thread alive without pretending to be a
 * person — every line says it is a Poplur tester, and none invents a fact.
 */
export const LIVE_DM_ANSWERS = Object.freeze([
  'Mostly your pins and the official world posts — my own radius is still small, so the Feed is quiet where I am.',
  'Right now I see your latest post and a couple of the world pops. Nothing else has reached my radius yet.',
  'A few pops in range tonight, yours included. The radius counter moved when I liked it, which was fun to watch.',
  'Your post, one shopping pop and the news channel. The map side is livelier than the Feed here.',
]);
export const LIVE_DM_REPLIES = Object.freeze([
  'Nice — thanks for writing back! I’m one of the Poplur testers, so I’ll keep liking and posting so your radius keeps moving.',
  'Got it. I’ll drop a pop near you later and see if it reaches your Feed.',
  'Good to hear from you. I just gave your post another look from the map — the pin is easy to spot.',
  'Thanks! I’ll be around the radius tonight; ping me here if you want me to test a call.',
  'Copy that. I’m posting from a different city each time, so watch the map for my pins.',
  'Appreciated. The Feed showed your post at the top for me, so the reach is working on my side.',
]);

/**
 * The reply for one owner message. A question gets an answer, anything else a
 * beat; both cycle by how many replies this actor has already sent, offset by
 * the actor so eight testers do not all say the same thing at once. Pure, so
 * a test can pin it.
 */
export function replyForOwnerMessage(actorId, ownerText, repliesSent = 0) {
  const offset = Math.max(0, ACTOR_IDS.indexOf(actorId));
  const asked = /\?/.test(String(ownerText || ''));
  const pool = asked ? LIVE_DM_ANSWERS : LIVE_DM_REPLIES;
  return pool[(offset + repliesSent) % pool.length].slice(0, LIVE_DM_TEXT_MAX);
}

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
  Object.freeze({ id: 'send-dm', label: 'Message the poster', detail: 'Open the Feed mailbox on the owner’s post and send a short note through Poplur Mail. One DM per poster, at most three per run; the thread is real and lands in that owner’s Mail.', reported: 'production' }),
  Object.freeze({ id: 'call-owner', label: 'Call the owner', detail: 'A paced voice or video call through Poplur Mail to the consenting owner; real WebRTC with a synthetic camera and microphone.', reported: 'production' }),
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
export const LIVE_STEP_METHODS = new Set(['current', 'right', 'left', 'hold', 'escape', 'post', 'engage', 'dm', 'call', 'reply']);

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
  // Business journeys also join the owner-authorized social steps above.
  'sim-biz-food-006': Object.freeze([
    Object.freeze({ screen: 'feed', action: 'screen-view', method: 'current' }),
    Object.freeze({ screen: 'map', action: 'publish-post', method: 'post' }),
    Object.freeze({ screen: 'profile', action: 'open-profile', method: 'left' }),
    Object.freeze({ screen: 'feed', action: 'open-feed', method: 'left' }),
    Object.freeze({ screen: 'feed', action: 'like-post', method: 'engage' }),
    Object.freeze({ screen: 'map', action: 'open-map', method: 'right' }),
    Object.freeze({ screen: 'feed', action: 'open-feed', method: 'left' }),
  ]),
  'sim-biz-shop-007': Object.freeze([
    Object.freeze({ screen: 'feed', action: 'screen-view', method: 'current' }),
    Object.freeze({ screen: 'map', action: 'open-map', method: 'right' }),
    Object.freeze({ screen: 'feed', action: 'open-feed', method: 'left' }),
    Object.freeze({ screen: 'feed', action: 'like-post', method: 'engage' }),
    Object.freeze({ screen: 'map', action: 'publish-post', method: 'post' }),
    Object.freeze({ screen: 'profile', action: 'open-profile', method: 'left' }),
    Object.freeze({ screen: 'feed', action: 'open-feed', method: 'left' }),
  ]),
  'sim-biz-fashion-008': Object.freeze([
    Object.freeze({ screen: 'feed', action: 'screen-view', method: 'current' }),
    Object.freeze({ screen: 'profile', action: 'open-profile', method: 'right' }),
    Object.freeze({ screen: 'feed', action: 'open-feed', method: 'left' }),
    Object.freeze({ screen: 'map', action: 'publish-post', method: 'post' }),
    Object.freeze({ screen: 'feed', action: 'open-feed', method: 'left' }),
    Object.freeze({ screen: 'feed', action: 'like-post', method: 'engage' }),
  ]),
});

export function livePlanForActor(actorId) {
  const plan = LIVE_PLANS[actorId];
  if (!plan) throw new Error(`Unknown synthetic actor: ${cleanText(actorId)}`);
  return [plan[0],
    { screen: 'feed', action: 'like-post', method: 'engage' },
    { screen: 'feed', action: 'send-dm', method: 'dm' },
    { screen: 'feed', action: 'reply-dm', method: 'reply' },
    { screen: 'feed', action: 'call-owner', method: 'call' },
    ...plan.slice(1)];
}

/**
 * A post that failed retries after a quarter interval, not a whole one, so a
 * remounted picker or a covered button costs the actor five minutes and not
 * twenty.
 */
export const LIVE_POST_RETRY_MS = Math.round(LIVE_POST_INTERVAL_MS / 4);

/**
 * Whether one plan step is due for an actor at `now`. Pure: `actor` is the
 * runner's per-actor clock (nextPostAtMs, postsPublished, nextEngageAtMs,
 * nextDMAtMs, nextReplyAtMs, callsPlaced) plus the write guard's DM ledger
 * under `policy.state`, and `shared` carries the cohort-wide owner-call
 * slot (`nextOwnerCallAtMs`). Navigation steps are always due.
 */
export function liveStepIsDue(step, actor, now = Date.now(), shared = {}) {
  const ledger = actor?.policy?.state ?? {};
  const dmSentTo = ledger.dmSentTo ?? new Set();
  const dmRecipients = ledger.dmRecipients ?? null;
  switch (step?.method) {
    case 'post':
      return now >= (actor.nextPostAtMs ?? 0) && (actor.postsPublished ?? 0) < LIVE_MAX_POSTS_PER_ACTOR;
    case 'engage':
      return now >= (actor.nextEngageAtMs ?? 0);
    case 'call':
      return now >= (shared.nextOwnerCallAtMs ?? 0) && (actor.callsPlaced ?? 0) < LIVE_MAX_CALLS_PER_ACTOR;
    case 'reply':
      return dmSentTo.has(LIVE_OWNER_UID) && now >= (actor.nextReplyAtMs ?? 0);
    case 'dm':
      if (dmSentTo.has(LIVE_OWNER_UID)) return false;
      return now >= (actor.nextDMAtMs ?? 0)
        && (dmRecipients?.size ?? LIVE_MAX_DMS_PER_ACTOR) < LIVE_MAX_DMS_PER_ACTOR;
    default:
      return true;
  }
}

/**
 * The plan step the live runner should run next.
 *
 * A due post outranks everything else, wherever the plan keeps it. Before
 * this the runner only looked at the post when its lap reached that slot,
 * and a lap is long: the like/DM/call steps each walk the Feed for minutes
 * before they find (or fail to find) a post to act on, so an actor whose
 * second post came due at +20 min could sit through a whole lap of social
 * walks first, and any failure along the way pushed it further. 19 Sep
 * 2026: 409 first posts against 17 second ones.
 *
 * When nothing timed is due, the lap continues from `journeyIndex`, wrapping
 * past the end to 1 — index 0 is the session's opening screen-view and is
 * never replayed. Returns null only when no step at all is due, which a
 * plan with navigation steps never does.
 */
export function chooseLiveStep(plan, actor, now = Date.now(), shared = {}) {
  if (!Array.isArray(plan) || plan.length < 2) return null;
  const postIndex = plan.findIndex((step, index) => index > 0 && step.method === 'post');
  if (postIndex > 0 && liveStepIsDue(plan[postIndex], actor, now, shared)) {
    return { index: postIndex, step: plan[postIndex], outOfTurn: postIndex !== actor.journeyIndex };
  }
  let index = Number.isInteger(actor.journeyIndex) && actor.journeyIndex >= 1 && actor.journeyIndex < plan.length
    ? actor.journeyIndex : 1;
  for (let looked = 0; looked < plan.length - 1; looked += 1) {
    const step = plan[index];
    if (liveStepIsDue(step, actor, now, shared)) return { index, step, outOfTurn: false };
    index = index + 1 >= plan.length ? 1 : index + 1;
  }
  return null;
}

/**
 * When a failed step next runs. Pure; returns the clock fields to assign.
 * A post retries after LIVE_POST_RETRY_MS; the social steps wait out one
 * engagement interval; a navigation step is simply retried on the next lap.
 */
export function rescheduleFailedLiveStep(step, now = Date.now()) {
  switch (step?.method) {
    case 'post': return { nextPostAtMs: now + LIVE_POST_RETRY_MS };
    case 'engage': return { nextEngageAtMs: now + LIVE_ENGAGEMENT_INTERVAL_MS };
    case 'dm': return { nextDMAtMs: now + LIVE_ENGAGEMENT_INTERVAL_MS };
    case 'reply': return { nextReplyAtMs: now + LIVE_ENGAGEMENT_INTERVAL_MS };
    default: return {};
  }
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
  if (step.method === 'engage' || step.method === 'dm' || step.method === 'reply' || step.method === 'call') return { screen: 'feed', action: 'screen-view' };
  return { screen: step.screen, action: step.action };
}

/**
 * The account type a first-run profile write may claim: "business" only for
 * a business tester, "personal" for everyone else. Provisioning writes the
 * business profile itself, so the shell should never need to — but if it
 * does, it must not demote a business to a person or promote a person.
 */
export function expectedAccountTypeForActor(actorId) {
  return actorForId(actorId)?.kind === 'business' ? 'business' : 'personal';
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

/**
 * Tester telemetry (poplur-clay-map/src/testActivity.ts) has no slot in the
 * live ledger. A heartbeat seats the caller on the desk's tester table, the
 * `simulation` read widens what the actor's feed discovers and starts ambient
 * pulse writes, and `simulationFeed` is the cohort's own output. The app skips
 * every one of those calls for a synthetic account (isSyntheticAccountUid), so
 * a request here is an app regression: refused by name, so the log says which
 * rule fired instead of the generic production refusal.
 */
export const LIVE_TEST_ACTIVITY_CONTROL_URL = 'https://us-central1-poplur2025.cloudfunctions.net/testActivityControl';
export const LIVE_TELEMETRY_BLOCKED_REASON = 'Synthetic actors never report tester telemetry; testActivityControl has no live ledger slot.';

/** Auth uids are random, so the prefix cannot collide with a person. The same
 *  rule as SYNTHETIC_ACCOUNT_UID_PATTERN in the clay app and isSyntheticAccount
 *  in functions/src/syntheticIdentity.ts. */
export const SYNTHETIC_ACCOUNT_UID_PATTERN = /^(sim|synthetic)-/;

export function isSyntheticAccountUid(uid) {
  return typeof uid === 'string' && SYNTHETIC_ACCOUNT_UID_PATTERN.test(uid);
}

function isTestActivityControlTarget(value) {
  try {
    const target = new URL(value);
    return `${target.origin}${target.pathname}` === LIVE_TEST_ACTIVITY_CONTROL_URL;
  } catch {
    return false;
  }
}
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
  const call = inspectSocialCallWrite(write, state);
  if (call !== null) return call;
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
      && (firestoreField(fields, 'accountType') == null
        || firestoreField(fields, 'accountType') === expectedAccountTypeForActor(identity.actorId));
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
 * the actor, a bounded number of messages per recipient (the opener and the
 * replies to what they write back), short text.
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
      // The opener, then replies to what this person writes back — bounded
      // per recipient, so a thread can be a conversation but never a flood.
      && (state.dmMessageIds.has(messageId)
        || (state.dmMessagesTo.get(other) ?? 0) < LIVE_MAX_DM_MESSAGES_PER_RECIPIENT);
    if (ok && !state.dmMessageIds.has(messageId)) {
      state.dmMessageIds.add(messageId);
      state.dmSentTo.add(other);
      state.dmMessagesTo.set(other, (state.dmMessagesTo.get(other) ?? 0) + 1);
      state.dmsSent += 1;
    }
    return ok;
  }

  if (!('participants' in fields)) return isSocialThreadStateWrite(write, state, fields);
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
    dmMessagesTo: new Map(),
    dmsSent: 0,
    callIds: new Set(),
    callRecipient: null,
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
      return { allow: true, kind: 'live-firestore-write', documentNames: operations.map(write => (write.update?.name || write.delete).split('/documents/')[1]) };
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
      // The web shell labels each engagement with the surface it came from
      // (12 Sep); the server accepts exactly these four values and nothing
      // else may ride on the wire.
      const surfaceOk = !('surface' in data) || ['feed', 'map', 'profile', 'unknown'].includes(data.surface);
      const exact = keys.length >= 3 && keys.length <= 4 && keys.every(key => ['postId', 'eventId', 'kind', 'surface'].includes(key))
        && typeof data.postId === 'string' && /^[a-zA-Z0-9_-]{6,128}$/.test(data.postId)
        && typeof data.eventId === 'string' && /^[a-zA-Z0-9_-]{6,128}$/.test(data.eventId)
        && LIVE_ENGAGEMENT_KINDS.has(kind) && surfaceOk;
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

    // Public release artwork is read-only and shared by every app surface.
    if (['GET', 'HEAD'].includes(method) && /^https:\/\/storage\.googleapis\.com\/poplur2025-assets\/asset-packs\//.test(url)) {
      return { allow: true, kind: 'read' };
    }

    if (isTestActivityControlTarget(url)) {
      // Name the action so the log says which reporter leaked, not only that one did.
      const body = exactJSON(postData);
      const action = typeof body?.data?.action === 'string' ? body.data.action.slice(0, 40) : 'unknown';
      return { allow: false, kind: 'live-telemetry-blocked', reason: `${LIVE_TELEMETRY_BLOCKED_REASON} action=${action}`, action };
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
    bindCallRecipient(otherUid) {
      if (otherUid !== LIVE_OWNER_UID) throw new Error('Calls require the consenting owner.');
      state.callRecipient = otherUid;
    },
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
