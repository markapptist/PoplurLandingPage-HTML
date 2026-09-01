import { randomBytes } from 'node:crypto';

export const ONBOARDING_MODE = 'first-user-v1';
export const ONBOARDING_ACTOR_ID = 'sim-onboarding-first';
export const ONBOARDING_PROJECT_ID = 'demo-poplur-first-user-v1';
export const ONBOARDING_STORAGE_BUCKET = 'demo-poplur-first-user-v1.appspot.com';
export const SHARED_ONBOARDING_MODE = 'first-user-shared-v1';
export const SHARED_ONBOARDING_ACTOR_ID = 'sim-onboarding-first-shared';
export const SHARED_ONBOARDING_PROJECT_ID = 'poplur2025';
export const SHARED_ONBOARDING_STORAGE_BUCKET = 'poplur2025.firebasestorage.app';
export const SHARED_ONBOARDING_FIREBASE_API_KEY = 'AIzaSyC_b3-zHngzP-MKa1Cx5yclbV_6DlvGe_w';
export const ONBOARDING_APP_ORIGIN = 'http://127.0.0.1:8081';
export const ONBOARDING_CLAY_ORIGIN = 'http://127.0.0.1:5173';
export const ONBOARDING_TEST_CENTER_ORIGIN = 'http://127.0.0.1:8084';
export const ONBOARDING_EMULATORS = Object.freeze({
  auth: 'http://127.0.0.1:9099',
  firestore: 'http://127.0.0.1:8080',
  storage: 'http://127.0.0.1:9199',
});

export const ONBOARDING_FRAME_STAGES = Object.freeze([
  'welcome',
  'signup',
  'profile-photo',
  'account-created',
  'home',
  'camera',
  'composer',
  'location',
  'publish-review',
  'posted',
  'map',
  'profile',
]);

export const SHARED_ONBOARDING_FRAME_STAGES = Object.freeze([
  'welcome',
  'signup',
  'profile-photo',
  'account-created',
  'home',
  'camera',
  'composer',
  'location',
  'publish-review',
  'posted',
  'map',
  'feed',
]);

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const POST_ID = /^post-[a-zA-Z0-9-]{16,96}$/;

function safeDecode(value) {
  try { return decodeURIComponent(value); } catch { return String(value || ''); }
}

export function validateOnboardingCommand(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Onboarding requires one exact, explicit command.');
  }
  if (value.mode === ONBOARDING_MODE
    && value.confirmCreateAccountAndPublicPost === true
    && !Object.keys(value).some(key => !['mode', 'confirmCreateAccountAndPublicPost'].includes(key))) {
    return { mode: ONBOARDING_MODE, confirmCreateAccountAndPublicPost: true };
  }
  if (value.mode === SHARED_ONBOARDING_MODE
    && value.confirmCreateProductionTestAccountAndPublicPost === true
    && !Object.keys(value).some(key => !['mode', 'confirmCreateProductionTestAccountAndPublicPost'].includes(key))) {
    return {
      mode: SHARED_ONBOARDING_MODE,
      confirmCreateProductionTestAccountAndPublicPost: true,
    };
  }
  throw new Error('Onboarding requires the exact confirmation field for its selected backend.');
}

export function isAuthorizedTestControlMutation({ origin, contentType }) {
  return origin === ONBOARDING_TEST_CENTER_ORIGIN
    && typeof contentType === 'string'
    && contentType.trim().toLowerCase() === 'application/json';
}

export function isSafeEmulatorFetchResponse({ status, location }) {
  const code = Number(status);
  return Number.isInteger(code)
    && !(code >= 300 && code < 400)
    && !String(location || '').trim();
}

export function createOnboardingIdentity(now = Date.now(), entropy = randomBytes(5).toString('hex')) {
  return createIdentityForMode(ONBOARDING_MODE, now, entropy);
}

export function createSharedOnboardingIdentity(now = Date.now(), entropy = randomBytes(5).toString('hex')) {
  return createIdentityForMode(SHARED_ONBOARDING_MODE, now, entropy);
}

function createIdentityForMode(mode, now, entropy) {
  const stamp = Math.max(0, Math.round(Number(now) || 0)).toString(36);
  const safeEntropy = String(entropy || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
  if (safeEntropy.length < 6) throw new Error('Onboarding identity entropy is too short.');
  const suffix = `${stamp}-${safeEntropy}`;
  const shared = mode === SHARED_ONBOARDING_MODE;
  const localPart = `${shared ? 'shared.first.user' : 'first.user'}.${suffix}`;
  return {
    actorId: shared ? SHARED_ONBOARDING_ACTOR_ID : ONBOARDING_ACTOR_ID,
    journey: shared ? SHARED_ONBOARDING_MODE : ONBOARDING_MODE,
    email: `${localPart}@synthetic.poplur.test`,
    // The shipping signup flow derives the username from the email local-part.
    // Keeping the runner's identity identical prevents its allowlist from
    // accepting a profile shape the visible app can never produce.
    handle: localPart,
    password: `Poplur!First-${suffix}-9z`,
  };
}

function isLocalAppTarget(url) {
  try {
    const target = new URL(url);
    return target.origin === ONBOARDING_APP_ORIGIN || target.origin === ONBOARDING_CLAY_ORIGIN;
  } catch {
    return false;
  }
}

function isEmulatorTarget(url, origin) {
  try { return new URL(url).origin === origin; } catch { return false; }
}

function isProductionFirebaseTarget(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === 'identitytoolkit.googleapis.com'
      || hostname === 'securetoken.googleapis.com'
      || hostname === 'firestore.googleapis.com'
      || hostname === 'firebasestorage.googleapis.com'
      || hostname === 'firebaseinstallations.googleapis.com'
      || hostname === 'fcmregistrations.googleapis.com'
      || hostname === 'storage.googleapis.com'
      || (hostname.endsWith('.googleapis.com') && hostname.includes('firebase'))
      || hostname.endsWith('.cloudfunctions.net')
      || hostname.endsWith('.firebaseio.com')
      || hostname.endsWith('.firebasedatabase.app')
      || hostname.endsWith('.firebaseapp.com')
      || hostname.endsWith('.appspot.com');
  } catch {
    return false;
  }
}

function parseBody(text) {
  const body = typeof text === 'string' ? text : '';
  if (!body) return [];
  const values = [body];
  try { values.push(JSON.parse(body)); } catch { /* WebChannel bodies are form encoded. */ }
  try {
    const params = new URLSearchParams(body);
    for (const value of params.values()) {
      values.push(value);
      try { values.push(JSON.parse(value)); } catch { /* scalar form field */ }
    }
  } catch { /* not a form body */ }
  return values;
}

function searchableBody(text) {
  return parseBody(text).map(value => typeof value === 'string' ? value : JSON.stringify(value)).join('\n');
}

function extractDocumentNames(text) {
  const decoded = searchableBody(text);
  const names = new Set();
  const matcher = /projects\/[^\s"\\]+\/databases\/\(default\)\/documents\/([a-zA-Z0-9._~%/-]+)/g;
  let match;
  while ((match = matcher.exec(decoded))) names.add(safeDecode(match[1]).replace(/[}\],]+$/g, ''));
  return [...names];
}

function extractFirestoreProjectIds(text) {
  const decoded = safeDecode(searchableBody(text));
  const projects = new Set();
  const matcher = /projects\/([^/\s"'\\?&]+)\/databases\//g;
  let match;
  while ((match = matcher.exec(decoded))) projects.add(match[1]);
  return [...projects];
}

function isFirestoreWriteChannelHandshake(method, value, postData, idToken) {
  try {
    if (method !== 'POST' || !idToken) return false;
    const target = new URL(value);
    if (target.origin !== ONBOARDING_EMULATORS.firestore
      || target.pathname !== '/google.firestore.v1.Firestore/Write/channel') return false;
    const expectedDatabase = `projects/${ONBOARDING_PROJECT_ID}/databases/(default)`;
    const databaseValues = target.searchParams.getAll('database');
    if (databaseValues.length !== 1 || databaseValues[0] !== expectedDatabase) return false;

    const params = new URLSearchParams(typeof postData === 'string' ? postData : '');
    const keys = [...params.keys()];
    if (keys.length !== 4
      || params.getAll('count').length !== 1 || params.get('count') !== '1'
      || params.getAll('ofs').length !== 1 || params.get('ofs') !== '0'
      || params.getAll('req0___data__').length !== 1
      || params.getAll('headers').length !== 1
      || keys.some(key => !['count', 'ofs', 'req0___data__', 'headers'].includes(key))) return false;
    const headerLines = (params.get('headers') || '').split(/\r?\n/).filter(Boolean);
    const headers = new Map();
    for (const line of headerLines) {
      const separator = line.indexOf(':');
      if (separator <= 0) return false;
      const name = line.slice(0, separator).trim().toLowerCase();
      const headerValue = line.slice(separator + 1).trim();
      if (!name || headers.has(name)) return false;
      headers.set(name, headerValue);
    }
    if (headers.size !== 4
      || !/^gl-js\/[a-zA-Z0-9._-]* fire\/\d+\.\d+\.\d+$/.test(headers.get('x-goog-api-client') || '')
      || headers.get('content-type') !== 'text/plain'
      || headers.get('x-firebase-gmpid') !== '1:440480901104:ios:fb94ca04e37cd1d68c1f35'
      || headers.get('authorization') !== `Bearer ${idToken}`) return false;
    const data = JSON.parse(params.get('req0___data__') || '');
    return data && typeof data === 'object' && !Array.isArray(data)
      && Object.keys(data).length === 1
      && data.database === expectedDatabase;
  } catch {
    return false;
  }
}

function storageObjectName(value) {
  try {
    const target = new URL(value);
    const prefix = `/v0/b/${ONBOARDING_STORAGE_BUCKET}/o`;
    if (target.origin !== ONBOARDING_EMULATORS.storage) return null;
    const queryName = target.searchParams.get('name');
    if (queryName != null) return target.pathname === prefix ? queryName : null;
    if (!target.pathname.startsWith(`${prefix}/`)) return null;
    return safeDecode(target.pathname.slice(prefix.length + 1));
  } catch {
    return null;
  }
}

function isBoundStorageURL(value, objectPath) {
  return storageObjectName(value) === objectPath;
}

function isBoundUploadSession(value, objectPath) {
  try {
    const target = new URL(value);
    const firebasePath = `/v0/b/${ONBOARDING_STORAGE_BUCKET}/o`;
    const gcloudPath = `/upload/storage/v1/b/${ONBOARDING_STORAGE_BUCKET}/o`;
    const protocol = target.searchParams.get('upload_protocol') || target.searchParams.get('uploadType');
    return target.origin === ONBOARDING_EMULATORS.storage
      && (target.pathname === firebasePath || target.pathname === gcloudPath)
      && target.searchParams.get('name') === objectPath
      && protocol === 'resumable'
      && Boolean(target.searchParams.get('upload_id'));
  } catch {
    return false;
  }
}

function exactJSON(text) {
  try { return JSON.parse(typeof text === 'string' ? text : ''); } catch { return null; }
}

export function createOnboardingNetworkPolicy(identity) {
  if (!identity || identity.actorId !== ONBOARDING_ACTOR_ID || identity.journey !== ONBOARDING_MODE) {
    throw new Error('A fixed first-user onboarding identity is required.');
  }
  const state = {
    uid: '',
    idToken: '',
    refreshToken: '',
    postId: '',
    profilePhotoPath: '',
    uploadSession: '',
  };

  const bindAuth = ({ uid, idToken, refreshToken }) => {
    if (!/^[a-zA-Z0-9_-]{6,128}$/.test(uid || '') || !idToken || !refreshToken) {
      throw new Error('The Auth emulator returned no usable first-user identity.');
    }
    if (state.uid && state.uid !== uid) throw new Error('Onboarding attempted to change its bound Firebase UID.');
    state.uid = uid;
    state.idToken = idToken;
    state.refreshToken = refreshToken;
  };

  const bindPostId = postId => {
    if (!POST_ID.test(postId || '')) throw new Error('Onboarding post ID is invalid.');
    if (state.postId && state.postId !== postId) throw new Error('Onboarding attempted to create more than one post.');
    state.postId = postId;
  };

  const inspect = request => {
    const method = String(request?.method || '').toUpperCase();
    const url = String(request?.url || '');
    const postData = typeof request?.postData === 'string' ? request.postData : '';
    if (isLocalAppTarget(url)) return { allow: true, kind: 'local-app' };
    if (isProductionFirebaseTarget(url)) {
      return { allow: false, kind: 'production-firebase-blocked', reason: 'Production Firebase is unavailable during onboarding.' };
    }
    if (!WRITE_METHODS.has(method)) return { allow: true, kind: 'read' };

    if (isEmulatorTarget(url, ONBOARDING_EMULATORS.auth)) {
      const target = new URL(url);
      if (/\/accounts:signUp$/i.test(target.pathname)) {
        const body = exactJSON(postData);
        const allow = method === 'POST' && body?.email === identity.email
          && body?.password === identity.password && body?.returnSecureToken === true;
        return { allow, kind: 'auth-signup', reason: allow ? '' : 'Auth signup payload is not the bound first user.' };
      }
      if (/\/accounts:update$/i.test(target.pathname)) {
        const body = exactJSON(postData);
        const allow = method === 'POST' && Boolean(state.idToken)
          && body?.idToken === state.idToken
          && (!('displayName' in (body ?? {})) || body?.displayName === identity.handle)
          && (!('photoUrl' in (body ?? {}))
            || (typeof body?.photoUrl === 'string'
              && Boolean(state.uid)
              && isBoundStorageURL(body.photoUrl, `profile_pictures/${state.uid}.jpg`)));
        return { allow, kind: 'auth-profile', reason: allow ? '' : 'Auth profile update is not bound to the first user.' };
      }
      if (/\/token$/i.test(target.pathname)) {
        const params = new URLSearchParams(postData);
        const allow = method === 'POST' && Boolean(state.refreshToken)
          && params.get('grant_type') === 'refresh_token'
          && params.get('refresh_token') === state.refreshToken;
        return { allow, kind: 'auth-refresh', reason: allow ? '' : 'Auth refresh is not bound to the first user.' };
      }
      if (/\/accounts:lookup$/i.test(target.pathname)) return { allow: true, kind: 'auth-read' };
      return { allow: false, kind: 'auth-blocked', reason: 'Unallowlisted Auth emulator write.' };
    }

    if (isEmulatorTarget(url, ONBOARDING_EMULATORS.firestore)) {
      const target = new URL(url);
      if (/documents:(?:runQuery|batchGet)$/i.test(target.pathname)
        || /google\.firestore\.v1\.Firestore\/Listen\/channel$/i.test(target.pathname)) {
        return { allow: true, kind: 'firestore-read' };
      }
      if (!state.uid) return { allow: false, kind: 'firestore-blocked', reason: 'Firestore write arrived before Auth was bound.' };
      const combinedTarget = `${url}\n${postData}`;
      const projects = extractFirestoreProjectIds(combinedTarget);
      if (!projects.length || projects.some(projectId => projectId !== ONBOARDING_PROJECT_ID)) {
        return { allow: false, kind: 'firestore-blocked', reason: 'Firestore write is not bound to the onboarding demo project.' };
      }
      const names = extractDocumentNames(combinedTarget);
      if (!names.length) {
        // Firestore's Web SDK opens its Write WebChannel with a project-bound
        // control message before the first document-bearing payload. Allow
        // only that exact loopback channel after Auth is bound; subsequent
        // messages that carry writes still pass through the document allowlist
        // below. A control message cannot name or mutate a document by itself.
        const allow = isFirestoreWriteChannelHandshake(method, url, postData, state.idToken);
        return {
          allow,
          kind: allow ? 'firestore-write-channel-control' : 'firestore-blocked',
          reason: allow ? '' : 'Firestore write targets could not be proven.',
        };
      }
      const allowed = new Set([
        `users/${state.uid}`,
        ...(state.postId ? [`posts/${state.postId}`, `users/${state.uid}/postLocations/${state.postId}`] : []),
      ]);
      if (names.some(name => !allowed.has(name))) {
        return { allow: false, kind: 'firestore-blocked', reason: 'Firestore write targeted a different actor or document.' };
      }
      const body = searchableBody(postData);
      if (names.includes(`users/${state.uid}`)
        && (!body.includes(ONBOARDING_ACTOR_ID) || !body.includes(ONBOARDING_MODE)
          || !body.includes(identity.email) || !body.includes(identity.handle))) {
        return { allow: false, kind: 'firestore-blocked', reason: 'User profile is missing synthetic journey tags.' };
      }
      if (state.postId && names.includes(`posts/${state.postId}`)
        && (!body.includes(ONBOARDING_ACTOR_ID) || !body.includes(ONBOARDING_MODE)
          || !body.includes('visible-app-ui'))) {
        return { allow: false, kind: 'firestore-blocked', reason: 'Post is missing visible synthetic journey tags.' };
      }
      if (state.postId && names.includes(`users/${state.uid}/postLocations/${state.postId}`)
        && (!body.includes('post-upload') || !body.includes('43.6532') || !body.includes('-79.3832'))) {
        return { allow: false, kind: 'firestore-blocked', reason: 'Post location is not the fixed emulator-only map spot.' };
      }
      return { allow: true, kind: 'firestore-write', documentNames: names };
    }

    if (isEmulatorTarget(url, ONBOARDING_EMULATORS.storage)) {
      if (!state.uid) return { allow: false, kind: 'storage-blocked', reason: 'Storage write arrived before Auth was bound.' };
      if (state.uploadSession && url === state.uploadSession) return { allow: true, kind: 'storage-upload-chunk' };
      if (method !== 'POST') {
        return { allow: false, kind: 'storage-blocked', reason: 'Storage upload chunks must use the exact bound session URL.' };
      }
      const objectName = storageObjectName(url);
      if (objectName == null) {
        return { allow: false, kind: 'storage-blocked', reason: 'Storage write is not bound to the onboarding demo bucket.' };
      }
      const profilePath = `profile_pictures/${state.uid}.jpg`;
      if (objectName === profilePath) {
        if (state.profilePhotoPath && state.profilePhotoPath !== profilePath) {
          return { allow: false, kind: 'storage-blocked', reason: 'Onboarding attempted to replace a different profile image.' };
        }
        state.profilePhotoPath = profilePath;
        return { allow: true, kind: 'storage-profile-photo', profilePhotoPath: state.profilePhotoPath };
      }
      const pathMatch = objectName.match(new RegExp(`^posts/${state.uid}/(post-[a-zA-Z0-9-]{16,96})\\.jpg$`));
      if (pathMatch) {
        try { bindPostId(pathMatch[1]); } catch (error) {
          return { allow: false, kind: 'storage-blocked', reason: error.message };
        }
        return { allow: true, kind: 'storage-upload', postId: state.postId };
      }
      return { allow: false, kind: 'storage-blocked', reason: 'Storage write is outside the one bound post image.' };
    }

    return { allow: false, kind: 'external-write-blocked', reason: 'Onboarding permits writes only to loopback Firebase emulators.' };
  };

  return {
    state,
    bindAuth,
    bindPostId,
    bindUploadSession(value, objectPath) {
      const session = String(value || '').slice(0, 512);
      if (!isBoundUploadSession(session, objectPath)) throw new Error('Storage emulator returned an upload session outside the bound onboarding object.');
      state.uploadSession = session;
    },
    inspect,
  };
}

function exactSharedAuthTarget(value, operation) {
  try {
    const target = new URL(value);
    const expectedOrigin = operation === 'token'
      ? 'https://securetoken.googleapis.com'
      : 'https://identitytoolkit.googleapis.com';
    const expectedPath = operation === 'token'
      ? '/v1/token'
      : `/v1/accounts:${operation}`;
    return target.origin === expectedOrigin
      && target.pathname === expectedPath
      && target.searchParams.getAll('key').length === 1
      && target.searchParams.get('key') === SHARED_ONBOARDING_FIREBASE_API_KEY
      && [...target.searchParams.keys()].every(key => key === 'key');
  } catch {
    return false;
  }
}

function exactSharedFirestoreTarget(value, postData = '') {
  try {
    const target = new URL(value);
    if (target.origin !== 'https://firestore.googleapis.com') return false;
    const projects = extractFirestoreProjectIds(`${value}\n${postData}`);
    return projects.length > 0
      && projects.every(projectId => projectId === SHARED_ONBOARDING_PROJECT_ID);
  } catch {
    return false;
  }
}

function sharedStorageObjectName(value) {
  try {
    const target = new URL(value);
    const firebasePrefix = `/v0/b/${SHARED_ONBOARDING_STORAGE_BUCKET}/o`;
    const googlePrefix = `/upload/storage/v1/b/${SHARED_ONBOARDING_STORAGE_BUCKET}/o`;
    if (target.origin !== 'https://firebasestorage.googleapis.com'
      && target.origin !== 'https://storage.googleapis.com') return null;
    const queryName = target.searchParams.get('name');
    if (queryName != null) {
      return target.pathname === firebasePrefix || target.pathname === googlePrefix
        ? queryName
        : null;
    }
    if (target.origin !== 'https://firebasestorage.googleapis.com'
      || !target.pathname.startsWith(`${firebasePrefix}/`)) return null;
    return safeDecode(target.pathname.slice(firebasePrefix.length + 1));
  } catch {
    return null;
  }
}

function isSharedStorageTarget(value) {
  try {
    const target = new URL(value);
    if (target.origin !== 'https://firebasestorage.googleapis.com'
      && target.origin !== 'https://storage.googleapis.com') return false;
    return target.pathname.includes(`/b/${SHARED_ONBOARDING_STORAGE_BUCKET}/`)
      || target.pathname === `/v0/b/${SHARED_ONBOARDING_STORAGE_BUCKET}/o`;
  } catch {
    return false;
  }
}

function isBoundSharedStorageURL(value, objectPath) {
  return sharedStorageObjectName(value) === objectPath;
}

function isBoundSharedUploadSession(value, objectPath) {
  try {
    const target = new URL(value);
    const protocol = target.searchParams.get('upload_protocol') || target.searchParams.get('uploadType');
    return sharedStorageObjectName(value) === objectPath
      && protocol === 'resumable'
      && Boolean(target.searchParams.get('upload_id'));
  } catch {
    return false;
  }
}

function requestHeader(headers, name) {
  if (!headers || typeof headers !== 'object') return '';
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted && typeof value === 'string') return value.trim();
  }
  return '';
}

function hasBoundFirebaseAuthorization(headers, idToken) {
  const value = requestHeader(headers, 'authorization');
  return Boolean(idToken) && (value === `Firebase ${idToken}` || value === `Bearer ${idToken}`);
}

function isSharedFirestoreRead(method, value) {
  try {
    const target = new URL(value);
    if (method === 'GET') {
      // The WebChannel backchannel: the browser SDK receives Listen results
      // and Write acknowledgements through long-lived GET polls on the two
      // channel endpoints. Data only flows toward the client on these, so
      // admitting them grants read-stream capability only; document mutation
      // still requires the exact POST write inspection in the caller.
      if (/google\.firestore\.v1\.Firestore\/(?:Listen|Write)\/channel$/i.test(target.pathname)) {
        const databaseValues = target.searchParams.getAll('database');
        return databaseValues.length === 1
          && databaseValues[0] === `projects/${SHARED_ONBOARDING_PROJECT_ID}/databases/(default)`;
      }
      const marker = '/documents/';
      const markerIndex = target.pathname.indexOf(marker);
      if (markerIndex < 0) return false;
      const documentPath = safeDecode(target.pathname.slice(markerIndex + marker.length))
        .split('/').filter(Boolean);
      // REST collection enumeration is never part of the journey. Exact
      // document reads remain available to the shipping client, while its
      // canonical Map/Feed snapshots continue through Listen/runQuery below.
      return documentPath.length >= 2 && documentPath.length % 2 === 0;
    }
    if (method !== 'POST') return false;
    return /documents:(?:runQuery|batchGet)$/i.test(target.pathname)
      || /google\.firestore\.v1\.Firestore\/Listen\/channel$/i.test(target.pathname);
  } catch {
    return false;
  }
}

function isSharedFirestoreWriteChannelHandshake(method, value, postData, idToken) {
  try {
    if (method !== 'POST' || !idToken) return false;
    const target = new URL(value);
    if (target.origin !== 'https://firestore.googleapis.com'
      || target.pathname !== '/google.firestore.v1.Firestore/Write/channel') return false;
    const expectedDatabase = `projects/${SHARED_ONBOARDING_PROJECT_ID}/databases/(default)`;
    const databaseValues = target.searchParams.getAll('database');
    if (databaseValues.length !== 1 || databaseValues[0] !== expectedDatabase) return false;

    const params = new URLSearchParams(typeof postData === 'string' ? postData : '');
    const keys = [...params.keys()];
    if (keys.length !== 4
      || params.getAll('count').length !== 1 || params.get('count') !== '1'
      || params.getAll('ofs').length !== 1 || params.get('ofs') !== '0'
      || params.getAll('req0___data__').length !== 1
      || params.getAll('headers').length !== 1
      || keys.some(key => !['count', 'ofs', 'req0___data__', 'headers'].includes(key))) return false;
    const headerLines = (params.get('headers') || '').split(/\r?\n/).filter(Boolean);
    const headers = new Map();
    for (const line of headerLines) {
      const separator = line.indexOf(':');
      if (separator <= 0) return false;
      const name = line.slice(0, separator).trim().toLowerCase();
      const headerValue = line.slice(separator + 1).trim();
      if (!name || headers.has(name)) return false;
      headers.set(name, headerValue);
    }
    if (headers.size !== 4
      || !/^gl-js\/[a-zA-Z0-9._-]* fire\/\d+\.\d+\.\d+$/.test(headers.get('x-goog-api-client') || '')
      || headers.get('content-type') !== 'text/plain'
      || headers.get('x-firebase-gmpid') !== '1:440480901104:ios:fb94ca04e37cd1d68c1f35'
      || headers.get('authorization') !== `Bearer ${idToken}`) return false;
    const data = JSON.parse(params.get('req0___data__') || '');
    return data && typeof data === 'object' && !Array.isArray(data)
      && Object.keys(data).length === 1
      && data.database === expectedDatabase;
  } catch {
    return false;
  }
}

function firestoreWriteOperations(text) {
  const operations = [];
  const seenObjects = new Set();
  const seenOperations = new Set();
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (seenObjects.has(value)) return;
    seenObjects.add(value);
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (Array.isArray(value.writes)) {
      for (const write of value.writes) {
        if (!write || typeof write !== 'object' || Array.isArray(write)) continue;
        const key = JSON.stringify(write);
        if (!seenOperations.has(key)) {
          seenOperations.add(key);
          operations.push(write);
        }
      }
    }
    for (const nested of Object.values(value)) visit(nested);
  };
  for (const value of parseBody(text)) visit(value);
  return operations;
}

function firestoreField(fields, key) {
  const value = fields?.[key];
  if (value == null || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== 1) return undefined;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue;
  return undefined;
}

function near(value, expected, tolerance = 0.000001) {
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number - expected) <= tolerance;
}

function exactFieldSet(fields, allowed, required = allowed) {
  const keys = Object.keys(fields);
  return keys.every(key => allowed.has(key)) && [...required].every(key => keys.includes(key));
}

function exactUpdateMask(mask, fields, transformPaths = []) {
  if (!mask || typeof mask !== 'object' || Array.isArray(mask)
    || Object.keys(mask).length !== 1 || !Array.isArray(mask.fieldPaths)) return false;
  const actual = mask.fieldPaths;
  if (actual.some(path => typeof path !== 'string') || new Set(actual).size !== actual.length) return false;
  const fieldPaths = Object.keys(fields);
  const withoutTransforms = new Set(fieldPaths);
  const withTransforms = new Set([...fieldPaths, ...transformPaths]);
  const matches = expected => actual.length === expected.size && actual.every(path => expected.has(path));
  // Firestore SDK releases have represented a transform path both inside and
  // outside the merge mask. Either form is safe because transforms themselves
  // are independently constrained below.
  return matches(withoutTransforms) || matches(withTransforms);
}

function exactCreatedAtTransform(transforms) {
  return Array.isArray(transforms) && transforms.length === 1
    && transforms[0] && typeof transforms[0] === 'object' && !Array.isArray(transforms[0])
    && Object.keys(transforms[0]).length === 2
    && transforms[0].fieldPath === 'createdAt'
    && transforms[0].setToServerValue === 'REQUEST_TIME';
}

function isExactSharedFirestoreUpdate(write, state, identity, runId) {
  const allowedWriteKeys = new Set(['update', 'updateMask', 'updateTransforms', 'currentDocument']);
  if (!write || typeof write !== 'object' || Array.isArray(write)
    || Object.keys(write).some(key => !allowedWriteKeys.has(key))
    || 'currentDocument' in write
    || !write.update || typeof write.update !== 'object' || Array.isArray(write.update)
    || Object.keys(write.update).some(key => key !== 'name' && key !== 'fields')
    || typeof write.update.name !== 'string'
    || !write.update.fields || typeof write.update.fields !== 'object' || Array.isArray(write.update.fields)) {
    return false;
  }
  const prefix = `projects/${SHARED_ONBOARDING_PROJECT_ID}/databases/(default)/documents/`;
  if (!write.update.name.startsWith(prefix)) return false;
  const path = write.update.name.slice(prefix.length);
  const fields = write.update.fields;
  if (path === `users/${state.uid}`) {
    const allowedFields = new Set([
      'uid', 'username', 'usernameNormalized', 'email', 'accountType', 'createdAt',
      'photoURL', 'profilePictureURL', 'syntheticBeta', 'syntheticActorId',
      'syntheticJourney', 'syntheticSource', 'syntheticRunId',
    ]);
    return exactFieldSet(fields, allowedFields)
      && exactUpdateMask(write.updateMask, fields)
      && !('updateTransforms' in write)
      && firestoreField(fields, 'uid') === state.uid
      && firestoreField(fields, 'email') === identity.email
      && firestoreField(fields, 'username') === identity.handle
      && firestoreField(fields, 'usernameNormalized') === identity.handle.toLowerCase().replace(/[^a-z0-9._-]/g, '')
      && firestoreField(fields, 'accountType') === 'personal'
      && firestoreField(fields, 'syntheticBeta') === true
      && firestoreField(fields, 'syntheticActorId') === SHARED_ONBOARDING_ACTOR_ID
      && firestoreField(fields, 'syntheticJourney') === SHARED_ONBOARDING_MODE
      && firestoreField(fields, 'syntheticSource') === 'visible-app-ui'
      && firestoreField(fields, 'syntheticRunId') === runId
      && isBoundSharedStorageURL(firestoreField(fields, 'photoURL'), `profile_pictures/${state.uid}.jpg`)
      && isBoundSharedStorageURL(firestoreField(fields, 'profilePictureURL'), `profile_pictures/${state.uid}.jpg`);
  }
  if (state.postId && path === `posts/${state.postId}`) {
    const allowedFields = new Set([
      'userID', 'username', 'mediaURL', 'mediaType', 'viewCount', 'radius',
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
      && firestoreField(fields, 'username') === identity.handle
      && firestoreField(fields, 'mediaStoragePath') === state.postStoragePath
      && isBoundSharedStorageURL(firestoreField(fields, 'mediaURL'), state.postStoragePath)
      && firestoreField(fields, 'mediaType') === 'photo'
      && Number(firestoreField(fields, 'viewCount')) === 0
      && firestoreField(fields, 'syntheticBeta') === true
      && firestoreField(fields, 'syntheticActorId') === SHARED_ONBOARDING_ACTOR_ID
      && firestoreField(fields, 'syntheticJourney') === SHARED_ONBOARDING_MODE
      && firestoreField(fields, 'syntheticSource') === 'visible-app-ui'
      && firestoreField(fields, 'syntheticRunId') === runId
      && firestoreField(fields, 'audience') === 'public'
      && firestoreField(fields, 'locationVisibility') === 'approximate'
      && Number.isFinite(radius) && radius >= 0
      && near(firestoreField(fields, 'latitude'), 43.653)
      && near(firestoreField(fields, 'longitude'), -79.383)
      && Number(firestoreField(fields, 'latitudeCell')) === 43_653
      && Number(firestoreField(fields, 'longitudeCell')) === -79_383;
  }
  if (state.postId && path === `users/${state.uid}/postLocations/${state.postId}`) {
    const allowedFields = new Set(['latitude', 'longitude', 'source']);
    return exactFieldSet(fields, allowedFields)
      && exactUpdateMask(write.updateMask, fields, ['createdAt'])
      && exactCreatedAtTransform(write.updateTransforms)
      && firestoreField(fields, 'source') === 'post-upload'
      && near(firestoreField(fields, 'latitude'), 43.6532)
      && near(firestoreField(fields, 'longitude'), -79.3832);
  }
  return false;
}

/**
 * Fail-closed production policy for the explicitly selected shared-backend
 * journey. Provenance fields are observability only: the Auth UID, exact
 * document names and exact Storage paths are the authority for every write.
 * There is intentionally no list, reset, delete or /usernames capability.
 */
export function createSharedOnboardingNetworkPolicy(identity, runId) {
  if (!identity || identity.actorId !== SHARED_ONBOARDING_ACTOR_ID
    || identity.journey !== SHARED_ONBOARDING_MODE
    || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{7,63}$/.test(runId || '')) {
    throw new Error('A bounded shared first-user identity and run ID are required.');
  }
  const state = {
    uid: '',
    idToken: '',
    refreshToken: '',
    postId: '',
    profilePhotoPath: '',
    postStoragePath: '',
    uploadSessions: Object.create(null),
  };

  const bindAuth = ({ uid, idToken, refreshToken }) => {
    if (!/^[a-zA-Z0-9_-]{6,128}$/.test(uid || '') || !idToken || !refreshToken) {
      throw new Error('Production Auth returned no usable tester identity.');
    }
    if (state.uid && state.uid !== uid) throw new Error('Shared onboarding attempted to change its bound Firebase UID.');
    state.uid = uid;
    state.idToken = idToken;
    state.refreshToken = refreshToken;
  };

  const bindPostId = postId => {
    if (!POST_ID.test(postId || '')) throw new Error('Shared onboarding post ID is invalid.');
    if (state.postId && state.postId !== postId) throw new Error('Shared onboarding attempted to create more than one post.');
    state.postId = postId;
    state.postStoragePath = `posts/${state.uid}/${postId}.jpg`;
  };

  const inspect = request => {
    const method = String(request?.method || '').toUpperCase();
    const url = String(request?.url || '');
    const postData = typeof request?.postData === 'string' ? request.postData : '';
    const headers = request?.headers;
    if (isLocalAppTarget(url)) return { allow: true, kind: 'local-app' };

    if (method === 'OPTIONS') {
      const exactAuthPreflight = ['signUp', 'update', 'lookup', 'token']
        .some(operation => exactSharedAuthTarget(url, operation));
      const exactStoragePreflight = isSharedStorageTarget(url) && Boolean(sharedStorageObjectName(url));
      const exactFirestorePreflight = exactSharedFirestoreTarget(url, postData);
      const allow = exactAuthPreflight || exactStoragePreflight || exactFirestorePreflight;
      return {
        allow,
        kind: allow ? 'shared-production-preflight' : 'shared-production-blocked',
        reason: allow ? '' : 'Production preflight is outside the exact Poplur project ledger.',
      };
    }

    if (exactSharedAuthTarget(url, 'signUp')) {
      const body = exactJSON(postData);
      const keys = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body) : [];
      const allow = method === 'POST'
        && body?.email === identity.email
        && body?.password === identity.password
        && body?.returnSecureToken === true
        && (!('clientType' in (body ?? {})) || body.clientType === 'CLIENT_TYPE_WEB')
        && keys.every(key => ['email', 'password', 'returnSecureToken', 'clientType'].includes(key));
      return { allow, kind: 'shared-auth-signup', reason: allow ? '' : 'Production Auth signup is not the bound tester.' };
    }
    if (exactSharedAuthTarget(url, 'update')) {
      const body = exactJSON(postData);
      const keys = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body) : [];
      const profilePath = state.uid ? `profile_pictures/${state.uid}.jpg` : '';
      const allow = method === 'POST'
        && Boolean(state.idToken)
        && body?.idToken === state.idToken
        && (!('displayName' in (body ?? {})) || body.displayName === identity.handle)
        && (!('photoUrl' in (body ?? {}))
          || (Boolean(profilePath) && isBoundSharedStorageURL(body.photoUrl, profilePath)))
        && (!('returnSecureToken' in (body ?? {})) || body.returnSecureToken === true)
        && keys.every(key => ['idToken', 'displayName', 'photoUrl', 'returnSecureToken'].includes(key));
      return { allow, kind: 'shared-auth-profile', reason: allow ? '' : 'Production Auth profile update is not bound to the tester.' };
    }
    if (exactSharedAuthTarget(url, 'lookup')) {
      const body = exactJSON(postData);
      const allow = method === 'POST' && Boolean(state.idToken)
        && body?.idToken === state.idToken && Object.keys(body).length === 1;
      return { allow, kind: 'shared-auth-read', reason: allow ? '' : 'Production Auth lookup is not self-owned.' };
    }
    if (exactSharedAuthTarget(url, 'token')) {
      const params = new URLSearchParams(postData);
      const allow = method === 'POST' && Boolean(state.refreshToken)
        && params.getAll('grant_type').length === 1
        && params.get('grant_type') === 'refresh_token'
        && params.getAll('refresh_token').length === 1
        && params.get('refresh_token') === state.refreshToken
        && [...params.keys()].every(key => key === 'grant_type' || key === 'refresh_token');
      return { allow, kind: 'shared-auth-refresh', reason: allow ? '' : 'Production Auth refresh is not bound to the tester.' };
    }

    if (exactSharedFirestoreTarget(url, postData)) {
      if (isSharedFirestoreRead(method, url)) return { allow: true, kind: 'shared-firestore-read' };
      if (method !== 'POST') {
        return { allow: false, kind: 'shared-firestore-blocked', reason: 'Shared onboarding never updates or deletes via REST methods.' };
      }
      if (!state.uid) {
        return { allow: false, kind: 'shared-firestore-blocked', reason: 'Production Firestore write arrived before Auth was bound.' };
      }
      const operations = firestoreWriteOperations(postData);
      if (!operations.length) {
        const allow = isSharedFirestoreWriteChannelHandshake(method, url, postData, state.idToken);
        return {
          allow,
          kind: allow ? 'shared-firestore-write-channel-control' : 'shared-firestore-blocked',
          reason: allow ? '' : 'Production Firestore write targets could not be proven.',
        };
      }
      if (operations.some(write => !isExactSharedFirestoreUpdate(write, state, identity, runId))) {
        return {
          allow: false,
          kind: 'shared-firestore-blocked',
          reason: 'Production Firestore write fields are not the exact bound tester ledger.',
        };
      }
      return {
        allow: true,
        kind: 'shared-firestore-write',
        documentNames: operations.map(write => write.update.name.split('/documents/')[1]),
      };
    }

    if (isSharedStorageTarget(url)) {
      if (!WRITE_METHODS.has(method)) {
        const objectPath = sharedStorageObjectName(url);
        return objectPath
          ? { allow: true, kind: 'shared-storage-read', objectPath }
          : { allow: false, kind: 'shared-storage-blocked', reason: 'Production Storage bucket listing is not permitted.' };
      }
      if (!state.uid || !hasBoundFirebaseAuthorization(headers, state.idToken)) {
        return { allow: false, kind: 'shared-storage-blocked', reason: 'Production Storage write is not authenticated as the bound tester.' };
      }
      const boundSessionPath = Object.entries(state.uploadSessions)
        .find(([, session]) => session === url)?.[0];
      if (boundSessionPath) {
        const allow = method === 'PUT' || method === 'POST';
        return { allow, kind: 'shared-storage-upload-chunk', objectPath: boundSessionPath, reason: allow ? '' : 'Bound upload session used an invalid method.' };
      }
      if (method !== 'POST') {
        return { allow: false, kind: 'shared-storage-blocked', reason: 'Production Storage write is not an exact upload start.' };
      }
      const objectName = sharedStorageObjectName(url);
      const profilePath = `profile_pictures/${state.uid}.jpg`;
      if (objectName === profilePath) {
        state.profilePhotoPath = profilePath;
        return { allow: true, kind: 'shared-storage-profile-photo', profilePhotoPath: profilePath };
      }
      const pathMatch = objectName?.match(new RegExp(`^posts/${state.uid}/(post-[a-zA-Z0-9-]{16,96})\\.jpg$`));
      if (pathMatch) {
        try { bindPostId(pathMatch[1]); } catch (error) {
          return { allow: false, kind: 'shared-storage-blocked', reason: error.message };
        }
        return { allow: true, kind: 'shared-storage-upload', postId: state.postId, objectPath: state.postStoragePath };
      }
      return { allow: false, kind: 'shared-storage-blocked', reason: 'Production Storage write is outside the two bound tester images.' };
    }

    if (isProductionFirebaseTarget(url)) {
      return { allow: false, kind: 'shared-production-blocked', reason: 'Production Firebase request is outside the exact Poplur project ledger.' };
    }
    if (!WRITE_METHODS.has(method)) return { allow: true, kind: 'read' };
    return { allow: false, kind: 'external-write-blocked', reason: 'Shared onboarding permits no unallowlisted writes.' };
  };

  return {
    state,
    bindAuth,
    bindPostId,
    bindUploadSession(value, objectPath) {
      const session = String(value || '').slice(0, 1_024);
      if (!isBoundSharedUploadSession(session, objectPath)) {
        throw new Error('Production Storage returned an upload session outside the bound tester object.');
      }
      state.uploadSessions[objectPath] = session;
    },
    inspect,
  };
}

function firestoreString(document, key) {
  return document?.fields?.[key]?.stringValue ?? '';
}

function firestoreNumber(document, key) {
  const value = document?.fields?.[key];
  return Number(value?.doubleValue ?? value?.integerValue ?? Number.NaN);
}

function exactFirestoreName(document, path) {
  return document?.name === `projects/${SHARED_ONBOARDING_PROJECT_ID}/databases/(default)/documents/${path}`;
}

export function sharedPostIsRadiusEligible(post, viewerCoords = [-79.3832, 43.6532]) {
  const radius = firestoreNumber(post, 'radius');
  const latitude = firestoreNumber(post, 'latitude');
  const longitude = firestoreNumber(post, 'longitude');
  const viewerLongitude = Number(viewerCoords?.[0]);
  const viewerLatitude = Number(viewerCoords?.[1]);
  const audience = firestoreString(post, 'audience') || 'public';
  const status = firestoreString(post, 'status') || firestoreString(post, 'visibilityStatus') || 'published';
  if (!Number.isFinite(radius) || radius <= 0
    || !Number.isFinite(latitude) || Math.abs(latitude) > 90
    || !Number.isFinite(longitude) || Math.abs(longitude) > 180
    || !Number.isFinite(viewerLatitude) || Math.abs(viewerLatitude) > 90
    || !Number.isFinite(viewerLongitude) || Math.abs(viewerLongitude) > 180
    || firestoreString(post, 'locationVisibility') !== 'approximate'
    || audience !== 'public'
    || (status !== 'published' && status !== 'live')) return false;
  const radians = degrees => degrees * Math.PI / 180;
  const latitudeDelta = radians(latitude - viewerLatitude);
  const longitudeDelta = radians(longitude - viewerLongitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(viewerLatitude)) * Math.cos(radians(latitude))
      * Math.sin(longitudeDelta / 2) ** 2;
  const distanceMeters = 6_371_000 * 2 * Math.asin(Math.min(1, Math.sqrt(haversine)));
  return distanceMeters <= radius;
}

export function assertSharedOnboardingOutcome({
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
}) {
  const profilePath = `profile_pictures/${uid}.jpg`;
  const postPath = `posts/${uid}/${postId}.jpg`;
  const authUsers = Array.isArray(authLookup?.users) ? authLookup.users : [];
  const authUser = authUsers.length === 1 ? authUsers[0] : null;
  if (!identity || identity.actorId !== SHARED_ONBOARDING_ACTOR_ID
    || identity.journey !== SHARED_ONBOARDING_MODE
    || !POST_ID.test(postId || '')
    || !/^[a-zA-Z0-9_-]{6,128}$/.test(uid || '')
    || authUser?.localId !== uid
    || authUser?.email !== identity.email
    || authUser?.displayName !== identity.handle
    || !isBoundSharedStorageURL(authUser?.photoUrl, profilePath)) {
    throw new Error('Production Auth lookup does not match the bound tester account.');
  }
  if (!exactFirestoreName(user, `users/${uid}`)
    || firestoreString(user, 'uid') !== uid
    || firestoreString(user, 'email') !== identity.email
    || firestoreString(user, 'username') !== identity.handle
    || firestoreString(user, 'syntheticActorId') !== SHARED_ONBOARDING_ACTOR_ID
    || firestoreString(user, 'syntheticJourney') !== SHARED_ONBOARDING_MODE
    || firestoreString(user, 'syntheticRunId') !== runId) {
    throw new Error('The exact self-owned production profile does not match the bound tester.');
  }
  if (!exactFirestoreName(post, `posts/${postId}`)
    || firestoreString(post, 'userID') !== uid
    || firestoreString(post, 'syntheticActorId') !== SHARED_ONBOARDING_ACTOR_ID
    || firestoreString(post, 'syntheticJourney') !== SHARED_ONBOARDING_MODE
    || firestoreString(post, 'syntheticSource') !== 'visible-app-ui'
    || firestoreString(post, 'syntheticRunId') !== runId
    || firestoreString(post, 'mediaStoragePath') !== postPath) {
    throw new Error('The exact production post does not match the bound tester and run.');
  }
  if (!exactFirestoreName(location, `users/${uid}/postLocations/${postId}`)
    || firestoreString(location, 'source') !== 'post-upload'
    || Math.abs(firestoreNumber(location, 'latitude') - 43.6532) > 0.000001
    || Math.abs(firestoreNumber(location, 'longitude') - (-79.3832)) > 0.000001) {
    throw new Error('The exact self-owned production post location does not match the visible journey.');
  }
  if (profileStorage?.bucket !== SHARED_ONBOARDING_STORAGE_BUCKET
    || profileStorage?.name !== profilePath
    || Number(profileStorage?.size) <= 0
    || postStorage?.bucket !== SHARED_ONBOARDING_STORAGE_BUCKET
    || postStorage?.name !== postPath
    || Number(postStorage?.size) <= 0) {
    throw new Error('The two exact production Storage objects could not be proven.');
  }
  return {
    radiusMeters: Math.max(0, firestoreNumber(post, 'radius') || 0),
    feedEligible: sharedPostIsRadiusEligible(post),
  };
}

export function sharedPostProofSelector(surface, postId) {
  if (!POST_ID.test(postId || '')) throw new Error('Shared post proof requires one bound post.');
  if (surface === 'map') return `[data-map-point-id="pin:firestore:${postId}"]`;
  if (surface === 'feed') return `[data-feed-post-id="${postId}"]`;
  throw new Error('Shared post proof supports canonical Map and Feed only.');
}

export function assertOnboardingInventory({
  uid,
  postId,
  authUids,
  userIds,
  postIds,
  locationIds,
  storageNames,
}) {
  const expectedStorage = [
    `posts/${uid}/${postId}.jpg`,
    `profile_pictures/${uid}.jpg`,
  ].sort();
  const sorted = values => [...values].sort();
  const exact = (actual, expected) => JSON.stringify(sorted(actual)) === JSON.stringify(sorted(expected));
  if (!exact(authUids, [uid])
    || !exact(userIds, [uid])
    || !exact(postIds, [postId])
    || !exact(locationIds, [postId])
    || !exact(storageNames, expectedStorage)) {
    throw new Error('First-user emulator isolation failed: expected exactly one account, one profile, one post, one location, and its two images.');
  }
  return true;
}

export function assertEmptyOnboardingInventory({
  authCount,
  userCount,
  postCount,
  locationCount,
  usernameCount,
  storageCount,
}) {
  const counts = [authCount, userCount, postCount, locationCount, usernameCount, storageCount];
  if (counts.some(value => !Number.isInteger(value) || value !== 0)) {
    throw new Error('First-user emulators are not empty; reset them before opening the visible journey.');
  }
  return true;
}

export function syntheticPostProofSelector(surface, postId) {
  if (!['map', 'profile'].includes(surface) || !POST_ID.test(postId || '')) {
    throw new Error('Synthetic post proof selector requires one bound post and a known surface.');
  }
  return `[data-synthetic-post-surface="${surface}"][data-synthetic-post-id="${postId}"]`;
}

export function isOnboardingAppURL(value) {
  try {
    const url = new URL(value);
    const mode = url.searchParams.get('syntheticOnboarding');
    const sharedRunId = url.searchParams.get('syntheticRunId') || '';
    return (url.origin === ONBOARDING_APP_ORIGIN || url.origin === ONBOARDING_CLAY_ORIGIN)
      && (url.origin !== ONBOARDING_APP_ORIGIN
        || mode === ONBOARDING_MODE
        || (mode === SHARED_ONBOARDING_MODE
          && /^[a-zA-Z0-9][a-zA-Z0-9_-]{7,63}$/.test(sharedRunId))
        || url.pathname !== '/');
  } catch {
    return false;
  }
}

export function isOnboardingWebSocketURL(value) {
  try {
    const target = new URL(value);
    if (target.protocol !== 'ws:') return false;
    const allowed = new Set([
      new URL(ONBOARDING_APP_ORIGIN).host,
      new URL(ONBOARDING_CLAY_ORIGIN).host,
      ...Object.values(ONBOARDING_EMULATORS).map(origin => new URL(origin).host),
    ]);
    return target.hostname === '127.0.0.1' && allowed.has(target.host);
  } catch {
    return false;
  }
}
