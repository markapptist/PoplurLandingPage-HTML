const MAX_TEXT_LENGTH = 120;

export const POPLUR_APP_ORIGIN = 'http://127.0.0.1:5173';
export const CONTROL_ROOM_ORIGIN = 'http://127.0.0.1:8084';
export const MAX_FRAMES_PER_ACTOR = 120;

export const SYNTHETIC_ACTORS = Object.freeze([
  Object.freeze({
    actorId: 'sim-food-001',
    actor: 'RUNNER · @sauceboss',
    handle: '@sauceboss',
    persona: 'Food scout',
    place: 'Toronto',
  }),
  Object.freeze({
    actorId: 'sim-sports-002',
    actor: 'RUNNER · @pitchside',
    handle: '@pitchside',
    persona: 'Live sports fan',
    place: 'London',
  }),
  Object.freeze({
    actorId: 'sim-music-003',
    actor: 'RUNNER · @basement.set',
    handle: '@basement.set',
    persona: 'Music curator',
    place: 'Toronto',
  }),
  Object.freeze({
    actorId: 'sim-tech-004',
    actor: 'RUNNER · @shipit',
    handle: '@shipit',
    persona: 'Performance tester',
    place: 'World beta region',
  }),
  Object.freeze({
    actorId: 'sim-news-005',
    actor: 'RUNNER · @citydesk',
    handle: '@citydesk',
    persona: 'News explorer',
    place: 'New York',
  }),
]);

export const ACTOR_IDS = Object.freeze(SYNTHETIC_ACTORS.map(actor => actor.actorId));

/**
 * The runner intentionally exercises only the read-only top-level surfaces.
 * Camera, DMs, calls, upload flows, Store and the external Browser are absent
 * by construction rather than being filtered after an arbitrary click.
 */
const SAFE_PLANS = Object.freeze({
  'sim-food-001': Object.freeze([
    Object.freeze({ screen: 'feed', action: 'screen-view', method: 'current' }),
    Object.freeze({ screen: 'profile', action: 'open-profile', method: 'right' }),
    Object.freeze({ screen: 'map', action: 'open-map', method: 'right' }),
    Object.freeze({ screen: 'profile', action: 'open-profile', method: 'left' }),
    Object.freeze({ screen: 'feed', action: 'open-feed', method: 'left' }),
  ]),
  'sim-sports-002': Object.freeze([
    Object.freeze({ screen: 'feed', action: 'screen-view', method: 'current' }),
    Object.freeze({ screen: 'profile', action: 'open-profile', method: 'right' }),
    Object.freeze({ screen: 'map', action: 'open-map', method: 'right' }),
    Object.freeze({ screen: 'profile', action: 'open-profile', method: 'left' }),
    Object.freeze({ screen: 'feed', action: 'open-feed', method: 'left' }),
    Object.freeze({ screen: 'hold-menu', action: 'open-hold-menu', method: 'hold' }),
    Object.freeze({ screen: 'feed', action: 'back', method: 'escape' }),
  ]),
  'sim-music-003': Object.freeze([
    Object.freeze({ screen: 'feed', action: 'screen-view', method: 'current' }),
    Object.freeze({ screen: 'profile', action: 'open-profile', method: 'right' }),
    Object.freeze({ screen: 'feed', action: 'open-feed', method: 'left' }),
    Object.freeze({ screen: 'profile', action: 'open-profile', method: 'right' }),
    Object.freeze({ screen: 'map', action: 'open-map', method: 'right' }),
    Object.freeze({ screen: 'profile', action: 'open-profile', method: 'left' }),
    Object.freeze({ screen: 'feed', action: 'open-feed', method: 'left' }),
  ]),
  'sim-tech-004': Object.freeze([
    Object.freeze({ screen: 'feed', action: 'screen-view', method: 'current' }),
    Object.freeze({ screen: 'profile', action: 'open-profile', method: 'right' }),
    Object.freeze({ screen: 'map', action: 'open-map', method: 'right' }),
    Object.freeze({ screen: 'profile', action: 'open-profile', method: 'left' }),
    Object.freeze({ screen: 'feed', action: 'open-feed', method: 'left' }),
    Object.freeze({ screen: 'hold-menu', action: 'open-hold-menu', method: 'hold' }),
    Object.freeze({ screen: 'feed', action: 'back', method: 'escape' }),
  ]),
  'sim-news-005': Object.freeze([
    Object.freeze({ screen: 'feed', action: 'screen-view', method: 'current' }),
    Object.freeze({ screen: 'profile', action: 'open-profile', method: 'right' }),
    Object.freeze({ screen: 'map', action: 'open-map', method: 'right' }),
    Object.freeze({ screen: 'profile', action: 'open-profile', method: 'left' }),
    Object.freeze({ screen: 'feed', action: 'open-feed', method: 'left' }),
    Object.freeze({ screen: 'profile', action: 'open-profile', method: 'right' }),
    Object.freeze({ screen: 'feed', action: 'open-feed', method: 'left' }),
  ]),
});

export const SAFE_EVENT_SCREENS = new Set(['feed', 'profile', 'map', 'hold-menu']);
export const SAFE_ACTIONS = new Set([
  'app-open',
  'screen-view',
  'open-map',
  'open-feed',
  'open-profile',
  'open-hold-menu',
  'back',
  'idle',
]);
export const SAFE_EVENT_TYPES = new Set(['session', 'navigation', 'discovery', 'lifecycle']);

const DOM_SCREEN_TO_EVENT_SCREEN = Object.freeze({
  feed: 'feed',
  profile: 'profile',
  map: 'map',
  hold: 'hold-menu',
});

export const PROHIBITED_CONTROL_NAME = /(?:\bdm\b|direct message|message |chat|call|facetime|camera|camera roll|photo|video|upload|drop a pop|publish|post\b|like|comment|radius|purchase|checkout|\bbuy\b|\bstore\b|browser|external|microphone|wardrobe|house)/i;

export function actorForId(actorId) {
  return SYNTHETIC_ACTORS.find(actor => actor.actorId === actorId) ?? null;
}

export function planForActor(actorId) {
  const plan = SAFE_PLANS[actorId];
  if (!plan) throw new Error(`Unknown synthetic actor: ${cleanText(actorId)}`);
  return plan;
}

export function eventTypeForAction(action) {
  if (action === 'app-open') return 'session';
  if (action === 'screen-view') return 'discovery';
  if (action === 'idle') return 'lifecycle';
  if (action === 'open-map' || action === 'open-profile' || action === 'open-feed'
    || action === 'open-hold-menu' || action === 'back') return 'navigation';
  return 'discovery';
}

export function isAllowedEvent(screen, action, eventType) {
  return SAFE_EVENT_SCREENS.has(screen)
    && SAFE_ACTIONS.has(action)
    && SAFE_EVENT_TYPES.has(eventType);
}

function assertKnownActor(actorId) {
  if (!actorForId(actorId)) throw new Error(`Unknown synthetic actor: ${cleanText(actorId)}`);
  return actorId;
}

/** Strict request builders mirror testSessionIngest's unknown-key rejection. */
export function statusIngestRequest(actorId) {
  return { type: 'status', actorId: assertKnownActor(actorId) };
}

export function startIngestRequest(actorId, occurredAtMs) {
  return { type: 'start', actorId: assertKnownActor(actorId), occurredAtMs };
}

export function eventIngestRequest(input) {
  if (!isAllowedEvent(input.screen, input.action, input.eventType)) {
    throw new Error('Synthetic event is outside the read-only runner vocabulary.');
  }
  return {
    type: 'event',
    actorId: assertKnownActor(input.actorId),
    sessionId: input.sessionId,
    sequence: input.sequence,
    occurredAtMs: input.occurredAtMs,
    screen: input.screen,
    action: input.action,
    status: 'foreground',
    localFrameSequence: input.localFrameSequence,
    frameSuppressed: input.frameSuppressed === true,
    dwellMs: input.dwellMs,
    stepIndex: input.stepIndex,
    journeyLength: input.journeyLength,
    eventType: input.eventType,
  };
}

export function endIngestRequest(input) {
  return {
    type: 'end',
    actorId: assertKnownActor(input.actorId),
    sessionId: input.sessionId,
    sequence: input.sequence,
    occurredAtMs: input.occurredAtMs,
    status: 'paused',
    reason: input.reason,
  };
}

export function isAllowedAppURL(value) {
  try {
    const url = new URL(value);
    return url.origin === POPLUR_APP_ORIGIN;
  } catch {
    return false;
  }
}

export function isBlockedWriteRequest(url, method) {
  const verb = String(method || '').toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(verb)) return false;
  const target = String(url || '');
  // WebSignIn and token renewal are the only state-changing browser requests
  // the runner needs. Firebase Auth is deliberately permitted; app content,
  // Storage and purchase/call endpoints are not.
  if (/identitytoolkit\.googleapis\.com\/v1\/accounts:signInWithPassword/i.test(target)) return false;
  if (/securetoken\.googleapis\.com\/v1\/token/i.test(target)) return false;
  return /firestore\.googleapis\.com\/.*(?:documents:commit|documents:batchWrite|google\.firestore\.v1\.Firestore\/Write\/channel)/i.test(target)
    || /firebasestorage\.googleapis\.com|storage\.googleapis\.com.*(?:upload|\/o\?)/i.test(target)
    || /(?:firebaseio\.com|firebasedatabase\.app)\/.*\.json/i.test(target)
    || /cloudfunctions\.net|\/calls(?:\/|\?|$)|checkout|purchase|upload/i.test(target);
}

export function cleanText(value, maximum = MAX_TEXT_LENGTH) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maximum) : '';
}

export function validateCredentialDocument(value) {
  const source = value && typeof value === 'object' ? value : {};
  const rows = Array.isArray(source.actors)
    ? source.actors
    : ACTOR_IDS.map(actorId => ({ actorId, ...(source[actorId] ?? {}) }));
  if (rows.length !== SYNTHETIC_ACTORS.length) {
    throw new Error(`Credential file must contain exactly ${SYNTHETIC_ACTORS.length} actors.`);
  }
  const seenActors = new Set();
  const seenEmails = new Set();
  const credentials = rows.map(row => {
    if (!row || typeof row !== 'object') throw new Error('Every credential row must be an object.');
    const actorId = cleanText(row.actorId, 80);
    const email = cleanText(row.email, 180).toLowerCase();
    const password = typeof row.password === 'string' ? row.password : '';
    const uid = cleanText(row.uid, 128);
    if (!actorForId(actorId)) throw new Error(`Credential file contains an unknown actor: ${actorId || '(missing)'}.`);
    if (seenActors.has(actorId)) throw new Error(`Credential file repeats actor ${actorId}.`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`Credential file has an invalid email for ${actorId}.`);
    if (password.length < 6) throw new Error(`Credential file has no usable password for ${actorId}.`);
    if (!/^[a-zA-Z0-9_-]{6,128}$/.test(uid) || uid !== actorId) {
      throw new Error(`Credential file must pin Firebase UID ${actorId} for ${actorId}.`);
    }
    if (seenEmails.has(email)) throw new Error('Each synthetic actor must use a distinct Firebase Auth account.');
    seenActors.add(actorId);
    seenEmails.add(email);
    // Deliberately mutable: the runner overwrites email/password immediately
    // after that one actor has authenticated so the long-lived process does
    // not retain the credentials document in its session model.
    return { actorId, email, password, uid };
  });
  for (const actorId of ACTOR_IDS) {
    if (!seenActors.has(actorId)) throw new Error(`Credential file is missing actor ${actorId}.`);
  }
  return credentials;
}

export function createFrameRing() {
  return [];
}

export function pushFrame(ring, frame) {
  if (!Array.isArray(ring)) throw new TypeError('Frame ring must be an array.');
  ring.push(frame);
  if (ring.length > MAX_FRAMES_PER_ACTOR) {
    ring.splice(0, ring.length - MAX_FRAMES_PER_ACTOR);
  }
  return ring;
}

export function frameMetadata(actorId, frame) {
  return {
    sequence: frame.sequence,
    capturedAtMs: frame.capturedAtMs,
    screen: frame.screen,
    action: frame.action,
    frameSuppressed: frame.frameSuppressed === true,
    imageUrl: frame.frameSuppressed === true
      ? ''
      : `/api/runner/frame/${encodeURIComponent(actorId)}?sequence=${frame.sequence}`,
  };
}

export function normalizeDOMScreen(attribute) {
  return DOM_SCREEN_TO_EVENT_SCREEN[attribute] ?? null;
}

/**
 * A frame is recordable only after the real app itself exposes a visible
 * data-poplur-screen marker. This function does not infer a screen from a URL,
 * title, action plan or generated thumbnail.
 */
export async function readValidatedPoplurScreen(page, expectedScreen, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastVisible = [];
  while (Date.now() < deadline) {
    lastVisible = await page.locator('[data-poplur-screen]').evaluateAll(elements => elements
      .filter(element => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number(style.opacity || 1) > 0
          && rect.width > 0
          && rect.height > 0;
      })
      .map(element => element.getAttribute('data-poplur-screen') || '')
      .filter(Boolean));
    const safeVisible = lastVisible
      .map(attribute => ({ attribute, screen: normalizeDOMScreen(attribute) }))
      .filter(item => item.screen != null);
    if (expectedScreen && safeVisible.some(item => item.screen === expectedScreen)) {
      return safeVisible.find(item => item.screen === expectedScreen);
    }
    if (!expectedScreen && safeVisible.length === 1) {
      return safeVisible[0];
    }
    await page.waitForTimeout(120);
  }
  throw new Error(`Real Poplur screen marker did not settle on ${expectedScreen || 'a safe screen'}; visible markers: ${lastVisible.join(', ') || 'none'}.`);
}
