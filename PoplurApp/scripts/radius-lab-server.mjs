// Radius Lab — a local desk service for the Test Center (127.0.0.1:8084).
//
// It stands ONE synthetic public post on the production map and lets the desk
// grow or shrink that post's radius live. The Poplur map (127.0.0.1:5173 and
// every device) listens to `posts` with onSnapshot, so every radius write here
// repaints the map's clay territory within a second: a larger radius wraps more
// terrain, a smaller one releases it.
//
// Writes go through the admin path with the machine's application-default
// credentials, the same way qa/radius-growth-2026-09-02/make-fixture-post.mjs
// seeds its fixtures: Firestore rules deny every client radius write, and the
// desk's own test-control proxy already reads with these credentials. The lab
// keeps exactly one pin at a time, names it so it can never be mistaken for a
// human post (`syntheticBeta`, `syntheticSource: 'radius-lab'`), and records
// every create/remove in radius-lab-manifest.md for cleanup.
//
// Deliberately its own process on its own port: test-control-proxy.mjs is
// supervised with keychain tokens and edited by other desk work, and the lab
// must never require that proxy to restart.
import { createServer } from 'node:http';
import { Buffer } from 'node:buffer';
import { appendFileSync, existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { ONBOARDING_TEST_CENTER_ORIGIN, isAuthorizedTestControlMutation } from './synthetic-onboarding-actions.mjs';

const host = '127.0.0.1';
const port = boundedPort(process.env.POPLUR_RADIUS_LAB_PORT, 8098);
const deskOrigin = ONBOARDING_TEST_CENTER_ORIGIN;
const PROJECT_ID = 'poplur2025';
/** The approved demo creative every radius fixture borrows its media from. */
const TEMPLATE_POST_ID = 'post-03d39e1a-f199-4b18-b802-6f7ac0abfba0';
/** The shared-journey beta account: a real owner, so engagement from the
 *  synthetic cohort lands on an account that exists. */
const OWNER_UID = 'n1BkpZPv4HcBKLAG7FXQTzYp7sF2';
const OWNER_USERNAME = 'radius.lab';
const LAB_SOURCE = 'radius-lab';
/** The browser preview's deterministic viewer fix (reach.ts HOME). A pin dropped
 *  here is in reach even at 0 m, so it always stands on the workbench map. */
const VIEWER = Object.freeze({ latitude: 43.6487, longitude: -79.3811 });
/** The top of the radius scale is the Earth's own radius: 6,371 km, the
 *  ceiling every client surface counts "of". A post there has taken over the
 *  world — the map and feed treat it as reaching everyone — so the lab never
 *  writes a radius above it. (Half the equator, 20,037.5 km, was the old
 *  ceiling here; the counter then read 24,901 mi over a 3,959 mi max.) */
const MAX_RADIUS_METERS = 6_371_000;
/** Cohort residue lives beside the pin state so a restart still knows what
 *  it stood up and what it must be able to remove. */
const cohortStatePath = new URL('./.radius-lab-cohort.json', import.meta.url).pathname;
const COHORT_SOURCE = 'radius-lab-cohort';
/**
 * Five posters, one per chooseable pin colour (pinColors.ts), contesting the
 * same ground. They read as people rather than as fixtures because that is
 * the exercise: a board where strangers with different pins are taking the
 * area over from each other, colour by colour.
 */
const COHORT_POSTERS = Object.freeze([
  { pinColor: 'red',    ownerId: 'synthetic-conquer-red',    username: 'saucy.red' },
  { pinColor: 'purple', ownerId: 'synthetic-conquer-purple', username: 'plum.pilot' },
  { pinColor: 'blue',   ownerId: 'synthetic-conquer-blue',   username: 'bluejay.to' },
  { pinColor: 'green',  ownerId: 'synthetic-conquer-green',  username: 'greenline.6ix' },
  { pinColor: 'orange', ownerId: 'synthetic-conquer-orange', username: 'orange.peel' },
]);
/** Where each poster's two pops stand relative to the drop centre — bearing
 *  (degrees), distance and radius (metres). Overlapping ON PURPOSE: contested
 *  ground is what makes five colours read as a takeover rather than five dots. */
const COHORT_LAYOUT = Object.freeze([
  [{ bearing: 20,  distance: 900,   radius: 2_400 }, { bearing: 200, distance: 2_100, radius: 1_500 }],
  [{ bearing: 95,  distance: 1_300, radius: 3_200 }, { bearing: 300, distance: 1_700, radius: 1_200 }],
  [{ bearing: 160, distance: 800,   radius: 2_000 }, { bearing: 40,  distance: 2_600, radius: 2_800 }],
  [{ bearing: 245, distance: 1_100, radius: 4_200 }, { bearing: 120, distance: 2_300, radius: 1_000 }],
  [{ bearing: 330, distance: 700,   radius: 1_800 }, { bearing: 270, distance: 2_900, radius: 3_600 }],
]);
const maxBodyBytes = 16 * 1024;
const statePath = new URL('./.radius-lab-state.json', import.meta.url).pathname;
const manifestPath = new URL('./radius-lab-manifest.md', import.meta.url).pathname;
/** Owner-written approved creative for the lab pin; see resolveMedia. */
const approvedMediaPath = new URL('./radius-lab-approved-media.json', import.meta.url).pathname;

const liveClients = new Set();
let firestore = null;
let pinUnsubscribe = null;
let watchedPostId = null;
let lastPin = null;

function boundedPort(value, fallback) {
  const resolved = Number(value || fallback);
  if (!Number.isInteger(resolved) || resolved < 1024 || resolved > 65_535) throw new Error('Radius lab port is invalid.');
  return resolved;
}

function db() {
  if (firestore) return firestore;
  const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  firestore = getFirestore(app);
  return firestore;
}

function responseHeaders(origin = '', contentType = 'application/json; charset=utf-8') {
  return {
    ...(origin === deskOrigin ? { 'access-control-allow-origin': deskOrigin } : {}),
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'cache-control': 'no-store',
    'content-type': contentType,
    vary: 'Origin',
  };
}

function sendJSON(response, status, origin, payload) {
  response.writeHead(status, responseHeaders(origin));
  response.end(JSON.stringify(payload));
}

function finite(value) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function millis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const parsed = finite(value);
  return parsed == null ? 0 : parsed;
}

function clampRadius(value) {
  const parsed = finite(value);
  if (parsed == null) return null;
  return Math.round(Math.max(0, Math.min(MAX_RADIUS_METERS, parsed)));
}

function readState() {
  try {
    if (!existsSync(statePath)) return null;
    const parsed = JSON.parse(readFileSync(statePath, 'utf8'));
    return typeof parsed?.postId === 'string' && parsed.postId ? parsed : null;
  } catch {
    return null;
  }
}

function writeState(state) {
  if (!state) {
    try { unlinkSync(statePath); } catch { /* already gone */ }
    return;
  }
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function manifest(line) {
  try {
    if (!existsSync(manifestPath)) {
      writeFileSync(manifestPath, '# Radius lab manifest (production poplur2025)\n\n'
        + 'Every line is synthetic residue from the Test Center radius lab. The lab keeps one pin at a time\n'
        + 'and removes the previous pin (and its engagement subcollections) whenever a new one is dropped.\n\n');
    }
    appendFileSync(manifestPath, `- ${new Date().toISOString()} ${line}\n`);
  } catch { /* the manifest is a courtesy, never load-bearing */ }
}

/** Project a post document into the small truthful shape the desk shows. */
function summarize(postId, row) {
  if (!row) return null;
  return {
    postId,
    latitude: finite(row.latitude) ?? 0,
    longitude: finite(row.longitude) ?? 0,
    radiusMeters: finite(row.radiusMeters ?? row.radius ?? row.organicRadiusMeters) ?? 0,
    organicRadiusMeters: finite(row.organicRadiusMeters) ?? 0,
    viewCount: finite(row.viewCount) ?? 0,
    likeCount: finite(row.likeCount) ?? 0,
    createdAtMs: millis(row.createdAtMillis ?? row.createdAt),
    updatedAtMs: millis(row.updatedAt) || millis(row.createdAtMillis ?? row.createdAt),
    username: typeof row.username === 'string' ? row.username : OWNER_USERNAME,
    pinColor: typeof row.pinColor === 'string' ? row.pinColor : null,
    // Surfaced so a pin that is missing its creative can never sit on the map
    // unnoticed: a pop without media or a caption is not a valid post.
    mediaType: typeof row.mediaType === 'string' ? row.mediaType : '',
    hasMedia: typeof row.mediaURL === 'string' && row.mediaURL.startsWith('https://'),
    caption: typeof row.caption === 'string' ? row.caption : '',
  };
}

function statePayload() {
  return { ok: true, pin: lastPin, cohort: lastCohort, viewer: VIEWER, maxRadiusMeters: MAX_RADIUS_METERS, at: Date.now() };
}

// ── The conquer cohort ──────────────────────────────────────────────────────
let lastCohort = [];

function readCohortState() {
  try {
    if (!existsSync(cohortStatePath)) return null;
    const parsed = JSON.parse(readFileSync(cohortStatePath, 'utf8'));
    return Array.isArray(parsed?.posts) && parsed.posts.length ? parsed : null;
  } catch {
    return null;
  }
}

function writeCohortState(state) {
  if (!state) {
    try { unlinkSync(cohortStatePath); } catch { /* already gone */ }
    return;
  }
  writeFileSync(cohortStatePath, `${JSON.stringify(state, null, 2)}\n`);
}

/** Destination point along a bearing — the spherical formula, so a 3 km
 *  offset is 3 km whatever the latitude. */
function offsetCoordinate(latitude, longitude, bearingDeg, distanceMeters) {
  const R = 6_371_000;
  const bearing = (bearingDeg * Math.PI) / 180;
  const lat1 = (latitude * Math.PI) / 180;
  const lon1 = (longitude * Math.PI) / 180;
  const d = distanceMeters / R;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearing));
  const lon2 = lon1 + Math.atan2(Math.sin(bearing) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return {
    latitude: Math.round(((lat2 * 180) / Math.PI) * 1e6) / 1e6,
    longitude: Math.round(((((lon2 * 180) / Math.PI + 540) % 360) - 180) * 1e6) / 1e6,
  };
}

function summarizeCohortPost(postId, row) {
  const base = summarize(postId, row);
  return base ? { ...base, ownerId: typeof row.userID === 'string' ? row.userID : '', channelId: typeof row.channelId === 'string' ? row.channelId : 'live' } : null;
}

async function readCohort() {
  const state = readCohortState();
  if (!state) { lastCohort = []; return lastCohort; }
  const refs = state.posts.map(post => db().collection('posts').doc(post.postId));
  const snapshots = await db().getAll(...refs);
  const standing = [];
  snapshots.forEach((snapshot, index) => {
    if (snapshot.exists) standing.push(summarizeCohortPost(state.posts[index].postId, snapshot.data()));
  });
  if (standing.length === 0) {
    writeCohortState(null);
    manifest('observed every cohort post removed elsewhere; cohort state cleared.');
  }
  lastCohort = standing.filter(Boolean);
  return lastCohort;
}

/**
 * The cohort's creatives come from ONE approved pool: the official launch
 * content (officialContent: true) — the licensed demo creatives the owner
 * ships inside the app and seeded as real posts for App Review. Nothing is
 * ever borrowed from "whatever post has media": if that pool is empty the
 * drop is refused, exactly as the single pin's drop is.
 */
async function approvedCohortMedia() {
  const snapshot = await db().collection('posts').where('officialContent', '==', true).get();
  const usable = row => typeof row?.mediaURL === 'string' && row.mediaURL.startsWith('https://')
    && typeof row.mediaType === 'string' && row.mediaType.trim() !== '';
  const pool = [];
  snapshot.forEach(doc => { const row = doc.data(); if (usable(row)) pool.push({ postId: doc.id, row }); });
  // Photos first: a still reads instantly on a pin card and in the feed; the
  // videos are the drive ads and follow once the photos run out.
  pool.sort((a, b) => ((a.row.mediaType === 'photo' ? 0 : 1) - (b.row.mediaType === 'photo' ? 0 : 1)) || a.postId.localeCompare(b.postId));
  return pool;
}

async function removeCohort(reason) {
  const state = readCohortState();
  if (!state) return false;
  for (const post of state.posts) {
    await db().recursiveDelete(db().collection('posts').doc(post.postId));
    manifest(`REMOVED posts/${post.postId} and its subcollections (cohort ${reason}).`);
  }
  writeCohortState(null);
  lastCohort = [];
  return true;
}

async function dropCohort({ latitude, longitude, radiusScale }) {
  const pool = await approvedCohortMedia();
  if (pool.length === 0) {
    throw new DeskError(409, 'No official launch content is available to lend the cohort its media, and a pop cannot be posted '
      + 'without approved media. The lab never borrows media on its own.');
  }
  await removeCohort('replaced by a new drop');
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  const created = [];
  let mediaIndex = 0;
  COHORT_POSTERS.forEach((poster, posterIndex) => {
    COHORT_LAYOUT[posterIndex].forEach((slot, slotIndex) => {
      const pick = pool[mediaIndex % pool.length];
      mediaIndex += 1;
      const media = pick.row;
      const at = offsetCoordinate(latitude, longitude, slot.bearing, slot.distance);
      const radiusMeters = clampRadius(Math.round(slot.radius * radiusScale));
      const stamp = now + posterIndex * 10 + slotIndex;
      const postId = `post-radius-lab-cohort-${day}-${poster.pinColor}-${slotIndex + 1}-${Math.random().toString(36).slice(2, 6)}`;
      const copy = key => (media[key] === undefined ? {} : { [key]: media[key] });
      const fields = {
        audience: 'public',
        channelId: typeof media.channelId === 'string' ? media.channelId : 'live',
        createdAt: Timestamp.fromMillis(stamp),
        createdAtMillis: stamp,
        updatedAt: Timestamp.fromMillis(stamp),
        latitude: at.latitude,
        longitude: at.longitude,
        latitudeCell: Math.round(at.latitude * 1000),
        longitudeCell: Math.round(at.longitude * 1000),
        locationVisibility: 'approximate',
        filterId: 'none',
        ...copy('mediaType'),
        ...copy('mediaURL'),
        ...copy('posterURL'),
        ...copy('mediaStoragePath'),
        ...copy('rightsAttestationVersion'),
        rightsAttestedAtMillis: stamp,
        caption: `@${poster.username} is taking over this block — synthetic cohort pop from the Test Center.`,
        radiusMeters,
        radius: radiusMeters,
        organicRadiusMeters: radiusMeters,
        viewCount: 0,
        likeCount: 0,
        downvoteCount: 0,
        commentCount: 0,
        userID: poster.ownerId,
        username: poster.username,
        pinColor: poster.pinColor,
        syntheticBeta: true,
        syntheticSource: COHORT_SOURCE,
      };
      created.push({ postId, fields, mediaFrom: pick.postId, poster });
    });
  });
  const batch = db().batch();
  for (const { postId, fields } of created) batch.set(db().collection('posts').doc(postId), fields);
  await batch.commit();
  writeCohortState({
    centre: { latitude, longitude },
    createdAtMs: now,
    posts: created.map(({ postId, poster }) => ({ postId, ownerId: poster.ownerId, pinColor: poster.pinColor })),
  });
  for (const { postId, fields, mediaFrom, poster } of created) {
    manifest(`created posts/${postId} (owner ${poster.ownerId} @${poster.username}, pin ${poster.pinColor}, radius ${fields.radiusMeters} m, `
      + `syntheticSource: ${COHORT_SOURCE}, at ${fields.latitude},${fields.longitude}, media approved from officialContent posts/${mediaFrom}); `
      + `engagement adds posts/${postId}/{engagements,engagementActors} docs.`);
  }
  lastCohort = created.map(({ postId, fields }) => summarizeCohortPost(postId, fields)).filter(Boolean);
  broadcast();
  return lastCohort;
}

function broadcast() {
  const payload = `data: ${JSON.stringify(statePayload())}\n\n`;
  for (const client of liveClients) {
    if (!client.destroyed && !client.writableEnded) client.write(payload);
  }
}

/** Follow the current lab pin document so the desk shows exactly what the map
 *  is being handed, including hourly decay and any cohort engagement. */
function watchPin(postId) {
  if (watchedPostId === postId) return;
  if (pinUnsubscribe) { pinUnsubscribe(); pinUnsubscribe = null; }
  watchedPostId = postId;
  if (!postId) { lastPin = null; broadcast(); return; }
  pinUnsubscribe = db().collection('posts').doc(postId).onSnapshot(snapshot => {
    lastPin = snapshot.exists ? summarize(postId, snapshot.data()) : null;
    if (!snapshot.exists && readState()?.postId === postId) {
      // Deleted out from under the lab (a cleanup script, the console): forget it.
      writeState(null);
      manifest(`observed posts/${postId} removed elsewhere; lab state cleared.`);
    }
    broadcast();
  }, () => {
    lastPin = null;
    broadcast();
  });
}

async function readPin() {
  const state = readState();
  if (!state) { watchPin(null); return null; }
  const snapshot = await db().collection('posts').doc(state.postId).get();
  if (!snapshot.exists) { writeState(null); watchPin(null); return null; }
  watchPin(state.postId);
  lastPin = summarize(state.postId, snapshot.data());
  return lastPin;
}

async function removePin(reason) {
  const state = readState();
  if (!state) return false;
  const ref = db().collection('posts').doc(state.postId);
  await db().recursiveDelete(ref);
  writeState(null);
  manifest(`REMOVED posts/${state.postId} and its subcollections (${reason}).`);
  watchPin(null);
  return true;
}

/**
 * A pop is not a pop without media. The lab borrows a real, already-published
 * creative rather than inventing one — but the pinned template can be cleaned
 * up out from under us, and an absent template used to fall through silently
 * and mint a post with no media at all. So: try the template, then the most
 * recent public post that actually carries media, and if neither yields one,
 * refuse to create the pin instead of standing an invalid pop on the map.
 */
/**
 * ONLY media the owner has explicitly approved may stand on the map. The lab
 * never invents media and never borrows it on its own: a previous build fell
 * back to "the most recent public post that has media", which stood an
 * unapproved AI-generated creative on a live public post. That fallback is
 * gone for good. Approved sources, in order, and nothing else:
 *
 *   1. POPLUR_RADIUS_LAB_MEDIA_POST_ID — copy the media fields of that post
 *      (defaults to the demo creative the radius fixtures were approved with).
 *   2. scripts/radius-lab-approved-media.json — an owner-written object:
 *      { "mediaType": "photo"|"video", "mediaURL": "https://…",
 *        "posterURL"?: "https://…", "mediaStoragePath"?: "…", "channelId"?: "…" }
 *
 * Without one of those the drop is refused, and the desk says why.
 */
async function resolveMedia() {
  const usable = row => typeof row?.mediaURL === 'string' && row.mediaURL.startsWith('https://')
    && typeof row.mediaType === 'string' && row.mediaType.trim() !== '';
  const approvedPostId = (process.env.POPLUR_RADIUS_LAB_MEDIA_POST_ID || TEMPLATE_POST_ID).trim();
  if (approvedPostId) {
    const approved = await db().collection('posts').doc(approvedPostId).get();
    if (approved.exists && usable(approved.data())) return { ...approved.data(), approvedFrom: `posts/${approvedPostId}` };
  }
  try {
    if (existsSync(approvedMediaPath)) {
      const listed = JSON.parse(readFileSync(approvedMediaPath, 'utf8'));
      if (usable(listed)) return { ...listed, approvedFrom: 'radius-lab-approved-media.json' };
    }
  } catch { /* an unreadable list is the same as no list */ }
  return null;
}

async function dropPin({ latitude, longitude, radiusMeters, pinColor }) {
  const media = await resolveMedia();
  if (!media) {
    throw new DeskError(409, 'No approved creative is configured for the lab pin, and a pop cannot be posted without media. '
      + 'Approve one by setting POPLUR_RADIUS_LAB_MEDIA_POST_ID to a post whose media you approve, or by writing '
      + 'scripts/radius-lab-approved-media.json with mediaType and an https mediaURL. The lab never borrows media on its own.');
  }
  await removePin('replaced by a new drop');
  const copy = key => (media[key] === undefined ? {} : { [key]: media[key] });
  const now = Date.now();
  const postId = `post-radius-lab-${new Date(now).toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 8)}`;
  const fields = {
    audience: 'public',
    channelId: typeof media.channelId === 'string' ? media.channelId : 'live',
    createdAt: Timestamp.fromMillis(now),
    createdAtMillis: now,
    updatedAt: Timestamp.fromMillis(now),
    latitude,
    longitude,
    latitudeCell: Math.round(latitude * 1000),
    longitudeCell: Math.round(longitude * 1000),
    locationVisibility: 'approximate',
    filterId: 'none',
    ...copy('mediaType'),
    ...copy('mediaURL'),
    ...copy('posterURL'),
    ...copy('mediaStoragePath'),
    ...copy('rightsAttestationVersion'),
    rightsAttestedAtMillis: now,
    caption: 'Radius lab pin — synthetic, dropped from the Test Center.',
    radiusMeters,
    radius: radiusMeters,
    organicRadiusMeters: radiusMeters,
    viewCount: 0,
    likeCount: 0,
    downvoteCount: 0,
    commentCount: 0,
    userID: OWNER_UID,
    username: OWNER_USERNAME,
    syntheticBeta: true,
    syntheticSource: LAB_SOURCE,
    ...(pinColor ? { pinColor } : {}),
  };
  await db().collection('posts').doc(postId).set(fields);
  writeState({ postId, latitude, longitude, createdAtMs: now });
  manifest(`created posts/${postId} (owner ${OWNER_UID}, radius ${radiusMeters} m, syntheticSource: ${LAB_SOURCE}, at ${latitude},${longitude}, `
    + `media approved from ${media.approvedFrom}); engagement adds posts/${postId}/{engagements,engagementActors} docs + owner notifications.`);
  lastPin = summarize(postId, fields);
  watchPin(postId);
  broadcast();
  return lastPin;
}

async function setRadius(radiusMeters) {
  const state = readState();
  if (!state) throw new DeskError(409, 'Drop a pin first.');
  const ref = db().collection('posts').doc(state.postId);
  await ref.update({
    radiusMeters,
    radius: radiusMeters,
    organicRadiusMeters: radiusMeters,
    updatedAt: Timestamp.fromMillis(Date.now()),
  });
  if (lastPin?.postId === state.postId) {
    lastPin = { ...lastPin, radiusMeters, organicRadiusMeters: radiusMeters, updatedAtMs: Date.now() };
  }
  return lastPin;
}

class DeskError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
class BodyTooLargeError extends Error {}

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

function openLiveStream(request, response, origin) {
  response.writeHead(200, {
    ...responseHeaders(origin, 'text/event-stream; charset=utf-8'),
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  response.write('retry: 1500\n\n');
  liveClients.add(response);
  response.write(`data: ${JSON.stringify(statePayload())}\n\n`);
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

function validPinColor(value) {
  return typeof value === 'string' && /^[a-z][a-z0-9-]{0,23}$/.test(value) ? value : null;
}

async function handleMutation(pathname, body) {
  if (pathname === '/api/radius-lab/drop') {
    const latitude = finite(body?.latitude);
    const longitude = finite(body?.longitude);
    const radiusMeters = clampRadius(body?.radiusMeters ?? 1_000);
    if (latitude == null || Math.abs(latitude) > 90) throw new DeskError(400, 'Latitude must be between -90 and 90.');
    if (longitude == null || Math.abs(longitude) > 180) throw new DeskError(400, 'Longitude must be between -180 and 180.');
    if (radiusMeters == null) throw new DeskError(400, 'Radius must be a number of metres.');
    await dropPin({ latitude, longitude, radiusMeters, pinColor: validPinColor(body?.pinColor) });
    return statePayload();
  }
  if (pathname === '/api/radius-lab/radius') {
    const radiusMeters = clampRadius(body?.radiusMeters);
    if (radiusMeters == null) throw new DeskError(400, 'Radius must be a number of metres.');
    await setRadius(radiusMeters);
    return statePayload();
  }
  if (pathname === '/api/radius-lab/remove') {
    await removePin('removed from the desk');
    return statePayload();
  }
  if (pathname === '/api/radius-lab/cohort/drop') {
    const latitude = finite(body?.latitude);
    const longitude = finite(body?.longitude);
    const radiusScale = Math.max(0.1, Math.min(10, finite(body?.radiusScale) ?? 1));
    if (latitude == null || Math.abs(latitude) > 90) throw new DeskError(400, 'Latitude must be between -90 and 90.');
    if (longitude == null || Math.abs(longitude) > 180) throw new DeskError(400, 'Longitude must be between -180 and 180.');
    await dropCohort({ latitude, longitude, radiusScale });
    return statePayload();
  }
  if (pathname === '/api/radius-lab/cohort/remove') {
    await removeCohort('removed from the desk');
    broadcast();
    return statePayload();
  }
  throw new DeskError(404, 'Radius lab route not found.');
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin === deskOrigin ? deskOrigin : '';
  const requestURL = new URL(request.url || '/', `http://${host}:${port}`);
  if (request.method === 'GET' && requestURL.pathname === '/health') {
    sendJSON(response, 200, '', { ok: true, pin: readState()?.postId ?? null, cohort: readCohortState()?.posts.length ?? 0 });
    return;
  }
  if (request.method === 'OPTIONS') {
    if (request.headers.origin !== deskOrigin) { response.writeHead(403, responseHeaders(origin)); response.end(); return; }
    response.writeHead(204, responseHeaders(origin));
    response.end();
    return;
  }
  if (origin !== deskOrigin) {
    sendJSON(response, 403, origin, { error: { message: 'Radius lab origin is not allowed.' } });
    return;
  }
  if (request.method === 'POST' && !isAuthorizedTestControlMutation({
    origin: request.headers.origin,
    contentType: request.headers['content-type'],
  })) {
    sendJSON(response, 415, origin, { error: { message: 'Radius lab mutations require exact application/json from the Test Center.' } });
    return;
  }
  try {
    if (request.method === 'GET' && requestURL.pathname === '/api/radius-lab/state') {
      await readPin();
      await readCohort();
      sendJSON(response, 200, origin, statePayload());
      return;
    }
    if (request.method === 'GET' && requestURL.pathname === '/api/radius-lab/live') {
      await readPin();
      await readCohort();
      openLiveStream(request, response, origin);
      return;
    }
    if (request.method === 'POST') {
      const body = await readBody(request);
      sendJSON(response, 200, origin, await handleMutation(requestURL.pathname, body));
      return;
    }
    sendJSON(response, 404, origin, { error: { message: 'Radius lab route not found.' } });
  } catch (error) {
    const status = error instanceof BodyTooLargeError ? 413 : error instanceof DeskError ? error.status : 502;
    const message = error instanceof BodyTooLargeError ? 'Radius lab request is too large.'
      : error instanceof DeskError ? error.message
        : `The radius lab could not reach Firestore: ${error instanceof Error ? error.message : String(error)}`;
    sendJSON(response, status, origin, { error: { message } });
  }
});

server.listen(port, host, () => {
  console.log(`Poplur Radius Lab listening at http://${host}:${port}`);
  readPin().catch(() => { /* surfaces on the first desk request instead */ });
});
server.on('error', error => {
  console.error('Poplur Radius Lab failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

function shutdown() {
  if (pinUnsubscribe) pinUnsubscribe();
  for (const client of liveClients) client.end();
  server.close();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
