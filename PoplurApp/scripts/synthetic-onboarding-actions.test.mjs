import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ONBOARDING_ACTOR_ID,
  ONBOARDING_FRAME_STAGES,
  ONBOARDING_MODE,
  ONBOARDING_PROJECT_ID,
  ONBOARDING_STORAGE_BUCKET,
  SHARED_ONBOARDING_ACTOR_ID,
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
  isAuthorizedTestControlMutation,
  isSafeEmulatorFetchResponse,
  sharedPostIsRadiusEligible,
  sharedPostProofSelector,
  syntheticPostProofSelector,
  validateOnboardingCommand,
} from './synthetic-onboarding-actions.mjs';

const identity = () => createOnboardingIdentity(1_725_000_000_000, 'a1b2c3d4e5');

test('onboarding command is an exact, explicit account-and-post confirmation', () => {
  assert.deepEqual(validateOnboardingCommand({
    mode: ONBOARDING_MODE,
    confirmCreateAccountAndPublicPost: true,
  }), { mode: ONBOARDING_MODE, confirmCreateAccountAndPublicPost: true });
  assert.throws(() => validateOnboardingCommand({ mode: ONBOARDING_MODE }));
  assert.throws(() => validateOnboardingCommand({ mode: ONBOARDING_MODE, confirmCreateAccountAndPublicPost: true, enabled: true }));
  assert.deepEqual(validateOnboardingCommand({
    mode: SHARED_ONBOARDING_MODE,
    confirmCreateProductionTestAccountAndPublicPost: true,
  }), {
    mode: SHARED_ONBOARDING_MODE,
    confirmCreateProductionTestAccountAndPublicPost: true,
  });
  assert.throws(() => validateOnboardingCommand({
    mode: SHARED_ONBOARDING_MODE,
    confirmCreateAccountAndPublicPost: true,
  }));
  assert.throws(() => validateOnboardingCommand({
    mode: SHARED_ONBOARDING_MODE,
    confirmCreateProductionTestAccountAndPublicPost: true,
    reset: true,
  }));
});

test('Test Center mutations require its exact origin and JSON content type', () => {
  assert.equal(isAuthorizedTestControlMutation({
    origin: 'http://127.0.0.1:8084',
    contentType: 'application/json',
  }), true);
  assert.equal(isAuthorizedTestControlMutation({ origin: '', contentType: 'application/json' }), false);
  assert.equal(isAuthorizedTestControlMutation({ origin: 'https://evil.example', contentType: 'application/json' }), false);
  assert.equal(isAuthorizedTestControlMutation({ origin: 'http://127.0.0.1:8084', contentType: 'text/plain' }), false);
  assert.equal(isAuthorizedTestControlMutation({ origin: 'http://127.0.0.1:8084', contentType: undefined }), false);
});

test('special emulator fetches cannot follow or expose redirects', () => {
  assert.equal(isSafeEmulatorFetchResponse({ status: 200, location: '' }), true);
  assert.equal(isSafeEmulatorFetchResponse({ status: 400, location: '' }), true);
  assert.equal(isSafeEmulatorFetchResponse({ status: 302, location: 'https://firestore.googleapis.com/' }), false);
  assert.equal(isSafeEmulatorFetchResponse({ status: 200, location: 'https://firebasestorage.googleapis.com/' }), false);
});

test('identity is unique, tagged, and never reuses a fixed five-actor UID', () => {
  const actor = identity();
  assert.equal(actor.actorId, ONBOARDING_ACTOR_ID);
  assert.equal(actor.journey, ONBOARDING_MODE);
  assert.match(actor.email, /@synthetic\.poplur\.test$/);
  assert.equal(actor.handle, actor.email.split('@')[0]);
  assert.ok(actor.password.length >= 16);
  assert.notEqual(actor.actorId, 'sim-food-001');
  assert.notEqual(actor.email, createOnboardingIdentity(1_725_000_000_001, 'b1c2d3e4f5').email);
});

test('shared identity is a distinct normal tester with bounded production provenance', () => {
  const actor = createSharedOnboardingIdentity(1_725_000_000_000, 'a1b2c3d4e5');
  assert.equal(actor.actorId, SHARED_ONBOARDING_ACTOR_ID);
  assert.equal(actor.journey, SHARED_ONBOARDING_MODE);
  assert.match(actor.email, /^shared\.first\.user\..+@synthetic\.poplur\.test$/);
  assert.equal(actor.handle, actor.email.split('@')[0]);
  assert.notEqual(actor.actorId, ONBOARDING_ACTOR_ID);
});

test('network policy permits only the exact loopback Auth signup', () => {
  const actor = identity();
  const policy = createOnboardingNetworkPolicy(actor);
  const allowed = policy.inspect({
    method: 'POST',
    url: 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo',
    postData: JSON.stringify({ email: actor.email, password: actor.password, returnSecureToken: true }),
  });
  assert.equal(allowed.allow, true);
  assert.equal(policy.inspect({
    method: 'POST',
    url: 'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=prod',
    postData: JSON.stringify({ email: actor.email, password: actor.password, returnSecureToken: true }),
  }).allow, false);
  assert.equal(policy.inspect({
    method: 'GET',
    url: 'https://firestore.googleapis.com/v1/projects/poplur2025/databases/(default)/documents/users',
    postData: '',
  }).allow, false);
  assert.equal(policy.inspect({
    method: 'OPTIONS',
    url: 'https://us-central1-poplur2025.cloudfunctions.net/test',
    postData: '',
  }).allow, false);
  assert.equal(policy.inspect({
    method: 'GET',
    url: 'https://poplur-default-rtdb.firebasedatabase.app/users.json',
    postData: '',
  }).allow, false);
  assert.equal(policy.inspect({
    method: 'POST',
    url: 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo',
    postData: JSON.stringify({ email: 'someone@else.test', password: actor.password, returnSecureToken: true }),
  }).allow, false);
});

test('network policy binds profile and post writes to one emulator UID and post', () => {
  const actor = identity();
  const policy = createOnboardingNetworkPolicy(actor);
  policy.bindAuth({ uid: 'firstUserUid01', idToken: 'id-token', refreshToken: 'refresh-token' });
  const base = `projects/${ONBOARDING_PROJECT_ID}/databases/(default)/documents/`;
  const profileBody = JSON.stringify({ writes: [{ update: {
    name: `${base}users/firstUserUid01`,
    fields: {
      email: actor.email,
      username: actor.handle,
      syntheticActorId: ONBOARDING_ACTOR_ID,
      syntheticJourney: ONBOARDING_MODE,
    },
  } }] });
  assert.equal(policy.inspect({ method: 'POST', url: 'http://127.0.0.1:8080/v1/write', postData: profileBody }).allow, true);
  assert.equal(policy.inspect({
    method: 'POST',
    url: 'http://127.0.0.1:8080/v1/write',
    postData: profileBody.replace('firstUserUid01', 'differentUid'),
  }).allow, false);

  const profilePhoto = policy.inspect({
    method: 'POST',
    url: `http://127.0.0.1:9199/v0/b/${ONBOARDING_STORAGE_BUCKET}/o?name=profile_pictures%2FfirstUserUid01.jpg`,
    postData: 'jpeg',
  });
  assert.equal(profilePhoto.allow, true);
  assert.equal(policy.state.profilePhotoPath, 'profile_pictures/firstUserUid01.jpg');
  assert.equal(policy.inspect({
    method: 'POST',
    url: `http://127.0.0.1:9199/v0/b/${ONBOARDING_STORAGE_BUCKET}/o?name=profile_pictures%2FdifferentUid.jpg`,
    postData: 'jpeg',
  }).allow, false);
  assert.equal(policy.inspect({
    method: 'POST',
    url: `http://127.0.0.1:9199/v0/b/${ONBOARDING_STORAGE_BUCKET}/o?name=prefix%2Fprofile_pictures%2FfirstUserUid01.jpg`,
    postData: 'jpeg',
  }).allow, false);
  assert.equal(policy.inspect({
    method: 'POST',
    url: `http://127.0.0.1:9199/v0/b/${ONBOARDING_STORAGE_BUCKET}/o?name=profile_pictures%2FfirstUserUid01.jpg.extra`,
    postData: 'jpeg',
  }).allow, false);
  assert.equal(policy.inspect({
    method: 'POST',
    url: 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=demo',
    postData: JSON.stringify({ idToken: 'id-token', photoUrl: `http://127.0.0.1:9199/v0/b/${ONBOARDING_STORAGE_BUCKET}/o/profile_pictures%2FfirstUserUid01.jpg?alt=media` }),
  }).allow, true);

  const upload = policy.inspect({
    method: 'POST',
    url: `http://127.0.0.1:9199/v0/b/${ONBOARDING_STORAGE_BUCKET}/o?name=posts%2FfirstUserUid01%2Fpost-abcdefghijklmnop.jpg`,
    postData: 'jpeg',
  });
  assert.equal(upload.allow, true);
  assert.equal(policy.state.postId, 'post-abcdefghijklmnop');
  assert.equal(policy.inspect({
    method: 'POST',
    url: `http://127.0.0.1:9199/v0/b/${ONBOARDING_STORAGE_BUCKET}/o?name=posts%2FfirstUserUid01%2Fpost-secondpostidentifier.jpg`,
    postData: 'jpeg',
  }).allow, false);
  assert.equal(policy.inspect({
    method: 'POST',
    url: `http://127.0.0.1:9199/v0/b/${ONBOARDING_STORAGE_BUCKET}/o?name=prefix%2Fposts%2FfirstUserUid01%2Fpost-abcdefghijklmnop.jpg`,
    postData: 'jpeg',
  }).allow, false);
  assert.equal(policy.inspect({
    method: 'POST',
    url: `http://127.0.0.1:9199/v0/b/${ONBOARDING_STORAGE_BUCKET}/o?name=posts%2FfirstUserUid01%2Fpost-abcdefghijklmnop.jpg.extra`,
    postData: 'jpeg',
  }).allow, false);

  const postBody = JSON.stringify({ writes: [{ update: {
    name: `${base}posts/post-abcdefghijklmnop`,
    fields: {
      syntheticActorId: ONBOARDING_ACTOR_ID,
      syntheticJourney: ONBOARDING_MODE,
      syntheticSource: 'visible-app-ui',
    },
  } }] });
  assert.equal(policy.inspect({ method: 'POST', url: 'http://127.0.0.1:8080/v1/write', postData: postBody }).allow, true);
  const locationBody = JSON.stringify({ writes: [{ update: {
    name: `${base}users/firstUserUid01/postLocations/post-abcdefghijklmnop`,
    fields: { latitude: 43.6532, longitude: -79.3832, source: 'post-upload' },
  } }] });
  assert.equal(policy.inspect({ method: 'POST', url: 'http://127.0.0.1:8080/v1/write', postData: locationBody }).allow, true);
  assert.equal(policy.inspect({
    method: 'POST',
    url: 'http://127.0.0.1:8080/v1/write',
    postData: locationBody.replace('43.6532', '40.7128'),
  }).allow, false);
  assert.equal(policy.inspect({ method: 'POST', url: 'https://us-central1-poplur2025.cloudfunctions.net/anything', postData: '{}' }).allow, false);
});

test('network policy pins Firestore and Storage to the one demo project and bucket', () => {
  const actor = identity();
  const policy = createOnboardingNetworkPolicy(actor);
  policy.bindAuth({ uid: 'firstUserUid01', idToken: 'id-token', refreshToken: 'refresh-token' });
  const profile = projectId => JSON.stringify({ writes: [{ update: {
    name: `projects/${projectId}/databases/(default)/documents/users/firstUserUid01`,
    fields: {
      email: actor.email,
      username: actor.handle,
      syntheticActorId: ONBOARDING_ACTOR_ID,
      syntheticJourney: ONBOARDING_MODE,
    },
  } }] });
  assert.equal(policy.inspect({
    method: 'POST',
    url: 'http://127.0.0.1:8080/google.firestore.v1.Firestore/Write/channel?database=projects%2Fother-project%2Fdatabases%2F(default)',
    postData: profile(ONBOARDING_PROJECT_ID),
  }).allow, false);
  assert.equal(policy.inspect({
    method: 'POST',
    url: 'http://127.0.0.1:8080/v1/write',
    postData: profile('other-project'),
  }).allow, false);
  assert.equal(policy.inspect({
    method: 'POST',
    url: 'http://127.0.0.1:9199/v0/b/another-bucket.appspot.com/o?name=profile_pictures%2FfirstUserUid01.jpg',
    postData: 'jpeg',
  }).allow, false);
});

test('Firestore Write WebChannel opens only for the bound user and exact demo project', () => {
  const actor = identity();
  const policy = createOnboardingNetworkPolicy(actor);
  const channel = projectId => (
    `http://127.0.0.1:8080/google.firestore.v1.Firestore/Write/channel?database=${encodeURIComponent(`projects/${projectId}/databases/(default)`)}&VER=8&RID=1`
  );
  const handshake = (projectId, token = 'id-token') => new URLSearchParams({
    headers: [
      'X-Goog-Api-Client:gl-js/ fire/10.14.1',
      'Content-Type:text/plain',
      'X-Firebase-GMPID:1:440480901104:ios:fb94ca04e37cd1d68c1f35',
      `Authorization:Bearer ${token}`,
      '',
    ].join('\r\n'),
    count: '1',
    ofs: '0',
    req0___data__: JSON.stringify({ database: `projects/${projectId}/databases/(default)` }),
  }).toString();

  assert.equal(policy.inspect({
    method: 'POST',
    url: channel(ONBOARDING_PROJECT_ID),
    postData: handshake(ONBOARDING_PROJECT_ID),
  }).allow, false);

  policy.bindAuth({ uid: 'firstUserUid01', idToken: 'id-token', refreshToken: 'refresh-token' });
  const control = policy.inspect({
    method: 'POST',
    url: channel(ONBOARDING_PROJECT_ID),
    postData: handshake(ONBOARDING_PROJECT_ID),
  });
  assert.equal(control.allow, true);
  assert.equal(control.kind, 'firestore-write-channel-control');

  for (const method of ['PUT', 'PATCH', 'DELETE']) {
    assert.equal(policy.inspect({
      method,
      url: channel(ONBOARDING_PROJECT_ID),
      postData: handshake(ONBOARDING_PROJECT_ID),
    }).allow, false);
  }

  assert.equal(policy.inspect({
    method: 'POST',
    url: channel('other-project'),
    postData: handshake('other-project'),
  }).allow, false);
  assert.equal(policy.inspect({
    method: 'POST',
    url: `http://127.0.0.1:8080/not-a-write-channel?database=${encodeURIComponent(`projects/${ONBOARDING_PROJECT_ID}/databases/(default)`)}`,
    postData: handshake(ONBOARDING_PROJECT_ID),
  }).allow, false);
  assert.equal(policy.inspect({
    method: 'POST',
    url: channel(ONBOARDING_PROJECT_ID),
    postData: 'count=0',
  }).allow, false);
  assert.equal(policy.inspect({
    method: 'POST',
    url: channel(ONBOARDING_PROJECT_ID),
    postData: `${handshake(ONBOARDING_PROJECT_ID)}&unexpected=1`,
  }).allow, false);
  assert.equal(policy.inspect({
    method: 'POST',
    url: channel(ONBOARDING_PROJECT_ID),
    postData: handshake(ONBOARDING_PROJECT_ID, 'different-token'),
  }).allow, false);
  assert.equal(policy.inspect({
    method: 'POST',
    url: `${channel(ONBOARDING_PROJECT_ID)}&database=${encodeURIComponent(`projects/${ONBOARDING_PROJECT_ID}/databases/(default)`)}`,
    postData: handshake(ONBOARDING_PROJECT_ID),
  }).allow, false);

  const base = `projects/${ONBOARDING_PROJECT_ID}/databases/(default)/documents/`;
  const profileBody = JSON.stringify({ writes: [{ update: {
    name: `${base}users/firstUserUid01`,
    fields: {
      email: actor.email,
      username: actor.handle,
      syntheticActorId: ONBOARDING_ACTOR_ID,
      syntheticJourney: ONBOARDING_MODE,
    },
  } }] });
  assert.equal(policy.inspect({
    method: 'POST',
    url: channel(ONBOARDING_PROJECT_ID),
    postData: profileBody,
  }).allow, true);
  assert.equal(policy.inspect({
    method: 'POST',
    url: channel(ONBOARDING_PROJECT_ID),
    postData: profileBody.replace('firstUserUid01', 'differentUid'),
  }).allow, false);
});

test('upload chunks are accepted only for the exact demo-bucket session returned by Storage', () => {
  const actor = identity();
  const policy = createOnboardingNetworkPolicy(actor);
  policy.bindAuth({ uid: 'firstUserUid01', idToken: 'id-token', refreshToken: 'refresh-token' });
  const objectPath = 'profile_pictures/firstUserUid01.jpg';
  const session = `http://127.0.0.1:9199/v0/b/${ONBOARDING_STORAGE_BUCKET}/o?name=profile_pictures%2FfirstUserUid01.jpg&upload_id=bound-session&upload_protocol=resumable`;
  policy.bindUploadSession(session, objectPath);
  assert.equal(policy.inspect({ method: 'PUT', url: session, postData: 'jpeg-bytes' }).allow, true);
  assert.equal(policy.inspect({ method: 'PUT', url: `${session}-different`, postData: 'jpeg-bytes' }).allow, false);
  assert.throws(() => policy.bindUploadSession(`http://127.0.0.1:9199/v0/b/${ONBOARDING_STORAGE_BUCKET}/o?name=profile_pictures%2FfirstUserUid01.jpg.extra&upload_id=bad&upload_protocol=resumable`, objectPath));
  assert.throws(() => policy.bindUploadSession(`http://127.0.0.1:9199/v0/b/${ONBOARDING_STORAGE_BUCKET}/o?name=profile_pictures%2FfirstUserUid01.jpg&upload_id=bad&upload_protocol=resumable`, 'profile_pictures/differentUid.jpg'));
});

test('shared production policy binds one Auth UID, one post and two exact storage paths', () => {
  const actor = createSharedOnboardingIdentity(1_725_000_000_000, 'a1b2c3d4e5');
  const runId = 'shared-first-user-test01';
  const policy = createSharedOnboardingNetworkPolicy(actor, runId);
  const authBase = 'https://identitytoolkit.googleapis.com/v1';
  const key = 'AIzaSyC_b3-zHngzP-MKa1Cx5yclbV_6DlvGe_w';
  assert.equal(policy.inspect({
    method: 'POST',
    url: `${authBase}/accounts:signUp?key=${key}`,
    postData: JSON.stringify({ email: actor.email, password: actor.password, returnSecureToken: true }),
  }).allow, true);
  assert.equal(policy.inspect({
    method: 'POST',
    url: `${authBase}/accounts:signUp?key=wrong`,
    postData: JSON.stringify({ email: actor.email, password: actor.password, returnSecureToken: true }),
  }).allow, false);
  assert.equal(policy.inspect({
    method: 'OPTIONS',
    url: `${authBase}/accounts:signUp?key=${key}`,
  }).allow, true);
  assert.equal(policy.inspect({
    method: 'OPTIONS',
    url: `${authBase}/accounts:signUp?key=wrong`,
  }).allow, false);
  policy.bindAuth({ uid: 'sharedTesterUid01', idToken: 'shared-id-token', refreshToken: 'shared-refresh-token' });
  const authorization = { authorization: 'Firebase shared-id-token' };
  const storageBase = `https://firebasestorage.googleapis.com/v0/b/${SHARED_ONBOARDING_STORAGE_BUCKET}/o`;
  const profilePath = 'profile_pictures/sharedTesterUid01.jpg';
  const profileUpload = policy.inspect({
    method: 'POST',
    url: `${storageBase}?name=${encodeURIComponent(profilePath)}&uploadType=resumable`,
    headers: authorization,
    postData: 'jpeg',
  });
  assert.equal(profileUpload.allow, true);
  assert.equal(profileUpload.kind, 'shared-storage-profile-photo');
  assert.equal(policy.inspect({
    method: 'POST',
    url: `${storageBase}?name=${encodeURIComponent(profilePath)}&uploadType=resumable`,
    headers: { authorization: 'Firebase different-token' },
    postData: 'jpeg',
  }).allow, false);

  const postId = 'post-abcdefghijklmnop';
  const postPath = `posts/sharedTesterUid01/${postId}.jpg`;
  const postUpload = policy.inspect({
    method: 'POST',
    url: `${storageBase}?name=${encodeURIComponent(postPath)}&uploadType=resumable`,
    headers: authorization,
    postData: 'jpeg',
  });
  assert.equal(postUpload.allow, true);
  assert.equal(policy.state.postId, postId);
  assert.equal(policy.inspect({
    method: 'POST',
    url: `${storageBase}?name=${encodeURIComponent(`posts/sharedTesterUid01/post-secondpostidentifier.jpg`)}&uploadType=resumable`,
    headers: authorization,
    postData: 'jpeg',
  }).allow, false);
  assert.equal(policy.inspect({
    method: 'DELETE',
    url: `${storageBase}/${encodeURIComponent(postPath)}`,
    headers: authorization,
  }).allow, false);

  const firestore = `https://firestore.googleapis.com/v1/projects/${SHARED_ONBOARDING_PROJECT_ID}/databases/(default)/documents:commit`;
  const base = `projects/${SHARED_ONBOARDING_PROJECT_ID}/databases/(default)/documents/`;
  const profileDownloadURL = `${storageBase}/${encodeURIComponent(profilePath)}?alt=media&token=profile-token`;
  const fsString = value => ({ stringValue: value });
  const fsInteger = value => ({ integerValue: String(value) });
  const fsDouble = value => ({ doubleValue: value });
  const fsBoolean = value => ({ booleanValue: value });
  const profileFields = {
    uid: fsString('sharedTesterUid01'),
    email: fsString(actor.email),
    username: fsString(actor.handle),
    usernameNormalized: fsString(actor.handle),
    accountType: fsString('personal'),
    createdAt: fsInteger(1_725_000_000_000),
    photoURL: fsString(profileDownloadURL),
    profilePictureURL: fsString(profileDownloadURL),
    syntheticBeta: fsBoolean(true),
    syntheticActorId: fsString(SHARED_ONBOARDING_ACTOR_ID),
    syntheticJourney: fsString(SHARED_ONBOARDING_MODE),
    syntheticSource: fsString('visible-app-ui'),
    syntheticRunId: fsString(runId),
  };
  const profileBody = JSON.stringify({ writes: [{ update: {
    name: `${base}users/sharedTesterUid01`,
    fields: profileFields,
  }, updateMask: { fieldPaths: Object.keys(profileFields) } }] });
  assert.equal(policy.inspect({ method: 'POST', url: firestore, postData: profileBody }).allow, true);
  assert.equal(policy.inspect({
    method: 'POST',
    url: firestore,
    postData: profileBody.replace('"uid":{"stringValue":"sharedTesterUid01"}', '"uid":{"stringValue":"someoneElse"}'),
  }).allow, false);
  assert.equal(policy.inspect({
    method: 'POST',
    url: firestore,
    postData: profileBody.replace(`"email":{"stringValue":"${actor.email}"}`, '"email":{"stringValue":"someone@else.test"}'),
  }).allow, false);
  assert.equal(policy.inspect({
    method: 'POST',
    url: firestore,
    postData: JSON.stringify({ writes: [{
      update: {
        name: `${base}users/sharedTesterUid01`,
        fields: { ...profileFields, uid: { stringValue: 'sharedTesterUid01', integerValue: '1' } },
      },
      updateMask: { fieldPaths: Object.keys(profileFields) },
    }] }),
  }).allow, false);
  assert.equal(policy.inspect({
    method: 'POST',
    url: firestore,
    postData: JSON.stringify({ writes: [{
      update: { name: `${base}users/sharedTesterUid01`, fields: profileFields },
      updateMask: { fieldPaths: ['syntheticRunId'] },
    }] }),
  }).allow, false);
  assert.equal(policy.inspect({
    method: 'POST',
    url: firestore,
    postData: JSON.stringify({ writes: [{
      update: { name: `${base}users/sharedTesterUid01`, fields: profileFields },
      updateMask: { fieldPaths: Object.keys(profileFields) },
      updateTransforms: [{ fieldPath: 'uid', setToServerValue: 'REQUEST_TIME' }],
    }] }),
  }).allow, false);
  assert.equal(policy.inspect({
    method: 'POST',
    url: firestore,
    postData: JSON.stringify({ writes: [{
      update: { name: `${base}users/sharedTesterUid01`, fields: profileFields },
      updateMask: { fieldPaths: Object.keys(profileFields) },
      currentDocument: { exists: false },
    }] }),
  }).allow, false);
  assert.equal(policy.inspect({
    method: 'POST',
    url: firestore,
    postData: profileBody.replace('users/sharedTesterUid01', `usernames/${actor.handle}`),
  }).allow, false);
  const postBody = JSON.stringify({ writes: [
    { update: {
      name: `${base}posts/${postId}`,
      fields: {
        userID: fsString('sharedTesterUid01'),
        username: fsString(actor.handle),
        mediaURL: fsString(`${storageBase}/${encodeURIComponent(postPath)}?alt=media&token=post-token`),
        mediaType: fsString('photo'),
        viewCount: fsInteger(0),
        createdAtMillis: fsInteger(1_725_000_000_000),
        syntheticBeta: fsBoolean(true),
        syntheticActorId: fsString(SHARED_ONBOARDING_ACTOR_ID),
        syntheticJourney: fsString(SHARED_ONBOARDING_MODE),
        syntheticSource: fsString('visible-app-ui'),
        syntheticRunId: fsString(runId),
        mediaStoragePath: fsString(postPath),
        audience: fsString('public'),
        locationVisibility: fsString('approximate'),
        radius: fsInteger(5_000),
        latitude: fsDouble(43.653),
        longitude: fsDouble(-79.383),
        latitudeCell: fsInteger(43_653),
        longitudeCell: fsInteger(-79_383),
      },
    }, updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }] },
    { update: {
      name: `${base}users/sharedTesterUid01/postLocations/${postId}`,
      fields: { latitude: fsDouble(43.6532), longitude: fsDouble(-79.3832), source: fsString('post-upload') },
    }, updateMask: { fieldPaths: ['latitude', 'longitude', 'source', 'createdAt'] },
    updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }] },
  ] });
  assert.equal(policy.inspect({ method: 'POST', url: firestore, postData: postBody }).allow, true);
  assert.equal(policy.inspect({
    method: 'POST',
    url: firestore,
    postData: postBody.replace('"userID":{"stringValue":"sharedTesterUid01"}', '"userID":{"stringValue":"someoneElse"}'),
  }).allow, false);
  assert.equal(policy.inspect({
    method: 'POST',
    url: firestore,
    postData: postBody.replace(`"mediaStoragePath":{"stringValue":"${postPath}"}`, '"mediaStoragePath":{"stringValue":"posts/someoneElse/other.jpg"}'),
  }).allow, false);
  assert.equal(policy.inspect({
    method: 'POST',
    url: firestore,
    postData: JSON.stringify({ writes: [{ delete: `${base}posts/${postId}` }] }),
  }).allow, false);
  assert.equal(policy.inspect({
    method: 'POST',
    url: firestore.replace(SHARED_ONBOARDING_PROJECT_ID, 'different-project'),
    postData: postBody,
  }).allow, false);
  assert.equal(policy.inspect({
    method: 'GET',
    url: `https://firestore.googleapis.com/v1/projects/${SHARED_ONBOARDING_PROJECT_ID}/databases/(default)/documents/posts/${postId}`,
  }).allow, true);
  assert.equal(policy.inspect({
    method: 'GET',
    url: `https://firestore.googleapis.com/v1/projects/${SHARED_ONBOARDING_PROJECT_ID}/databases/(default)/documents/posts`,
  }).allow, false);
  assert.equal(policy.inspect({
    method: 'GET',
    url: storageBase,
  }).allow, false);
  assert.equal(policy.inspect({
    method: 'GET',
    url: 'https://firestore.googleapis.com/v1/projects/different-project/databases/(default)/documents/posts',
  }).allow, false);
  assert.equal(policy.inspect({
    method: 'POST',
    url: 'https://us-central1-poplur2025.cloudfunctions.net/resetAllUsers',
    postData: '{}',
  }).allow, false);
});

test('shared terminal proof uses exact self-owned paths and radius reaches the fixed viewer', () => {
  const actor = createSharedOnboardingIdentity(1_725_000_000_000, 'a1b2c3d4e5');
  const runId = 'shared-first-user-test01';
  const uid = 'sharedTesterUid01';
  const postId = 'post-abcdefghijklmnop';
  const base = `projects/${SHARED_ONBOARDING_PROJECT_ID}/databases/(default)/documents`;
  const stringValue = value => ({ stringValue: value });
  const doubleValue = value => ({ doubleValue: value });
  const user = {
    name: `${base}/users/${uid}`,
    fields: {
      uid: stringValue(uid), email: stringValue(actor.email), username: stringValue(actor.handle),
      syntheticActorId: stringValue(SHARED_ONBOARDING_ACTOR_ID),
      syntheticJourney: stringValue(SHARED_ONBOARDING_MODE), syntheticRunId: stringValue(runId),
    },
  };
  const post = {
    name: `${base}/posts/${postId}`,
    fields: {
      userID: stringValue(uid), mediaStoragePath: stringValue(`posts/${uid}/${postId}.jpg`),
      syntheticActorId: stringValue(SHARED_ONBOARDING_ACTOR_ID),
      syntheticJourney: stringValue(SHARED_ONBOARDING_MODE), syntheticSource: stringValue('visible-app-ui'),
      syntheticRunId: stringValue(runId), radius: doubleValue(5_000),
      latitude: doubleValue(43.653), longitude: doubleValue(-79.383),
      audience: stringValue('public'), status: stringValue('published'),
      locationVisibility: stringValue('approximate'),
    },
  };
  const location = {
    name: `${base}/users/${uid}/postLocations/${postId}`,
    fields: { source: stringValue('post-upload'), latitude: doubleValue(43.6532), longitude: doubleValue(-79.3832) },
  };
  const values = {
    identity: actor, runId, uid, postId,
    authLookup: { users: [{
      localId: uid, email: actor.email, displayName: actor.handle,
      photoUrl: `https://firebasestorage.googleapis.com/v0/b/${SHARED_ONBOARDING_STORAGE_BUCKET}/o/${encodeURIComponent(`profile_pictures/${uid}.jpg`)}?alt=media`,
    }] },
    user, post, location,
    profileStorage: { bucket: SHARED_ONBOARDING_STORAGE_BUCKET, name: `profile_pictures/${uid}.jpg`, size: '100' },
    postStorage: { bucket: SHARED_ONBOARDING_STORAGE_BUCKET, name: `posts/${uid}/${postId}.jpg`, size: '200' },
  };
  assert.deepEqual(assertSharedOnboardingOutcome(values), { radiusMeters: 5_000, feedEligible: true });
  assert.equal(sharedPostIsRadiusEligible(post, [-79.3832, 43.6532]), true);
  assert.equal(sharedPostIsRadiusEligible(post, [-73.9857, 40.7484]), false);
  assert.equal(sharedPostIsRadiusEligible({ ...post, fields: { ...post.fields, radius: doubleValue(0) } }), false);
  assert.throws(() => assertSharedOnboardingOutcome({
    ...values,
    post: { ...post, fields: { ...post.fields, userID: stringValue('someoneElse') } },
  }));
});

test('shared proof selectors are canonical Map/Feed selectors and never Profile selectors', () => {
  assert.equal(sharedPostProofSelector('map', 'post-abcdefghijklmnop'), '[data-map-point-id="pin:firestore:post-abcdefghijklmnop"]');
  assert.equal(sharedPostProofSelector('feed', 'post-abcdefghijklmnop'), '[data-feed-post-id="post-abcdefghijklmnop"]');
  assert.throws(() => sharedPostProofSelector('profile', 'post-abcdefghijklmnop'));
});

test('visible browser navigation is pinned to the RN onboarding route and clay origin', () => {
  assert.equal(isOnboardingAppURL('http://127.0.0.1:8081/?syntheticOnboarding=first-user-v1'), true);
  assert.equal(isOnboardingAppURL('http://127.0.0.1:8081/?syntheticOnboarding=first-user-shared-v1&syntheticRunId=shared-first-user-test01'), true);
  assert.equal(isOnboardingAppURL('http://127.0.0.1:8081/?syntheticOnboarding=first-user-shared-v1'), false);
  assert.equal(isOnboardingAppURL('http://127.0.0.1:8081/'), false);
  assert.equal(isOnboardingAppURL('http://127.0.0.1:5173/?rnWebShell=1'), true);
  assert.equal(isOnboardingAppURL('https://poplur.com/?syntheticOnboarding=first-user-v1'), false);
  assert.equal(isOnboardingWebSocketURL('ws://127.0.0.1:8081/hot'), true);
  assert.equal(isOnboardingWebSocketURL('ws://127.0.0.1:5173/'), true);
  assert.equal(isOnboardingWebSocketURL('ws://127.0.0.1:9999/'), false);
  assert.equal(isOnboardingWebSocketURL('wss://firestore.googleapis.com/ws'), false);
});

test('terminal inventory requires exactly one account, profile, post, location, and two images', () => {
  const values = {
    uid: 'firstUserUid01',
    postId: 'post-abcdefghijklmnop',
    authUids: ['firstUserUid01'],
    userIds: ['firstUserUid01'],
    postIds: ['post-abcdefghijklmnop'],
    locationIds: ['post-abcdefghijklmnop'],
    storageNames: [
      'profile_pictures/firstUserUid01.jpg',
      'posts/firstUserUid01/post-abcdefghijklmnop.jpg',
    ],
  };
  assert.equal(assertOnboardingInventory(values), true);
  assert.throws(() => assertOnboardingInventory({ ...values, authUids: [...values.authUids, 'secondUid'] }));
  assert.throws(() => assertOnboardingInventory({ ...values, locationIds: [] }));
  assert.throws(() => assertOnboardingInventory({ ...values, storageNames: values.storageNames.slice(0, 1) }));
});

test('preflight refuses to open the journey unless every emulator inventory is empty', () => {
  const empty = {
    authCount: 0,
    userCount: 0,
    postCount: 0,
    locationCount: 0,
    usernameCount: 0,
    storageCount: 0,
  };
  assert.equal(assertEmptyOnboardingInventory(empty), true);
  for (const key of Object.keys(empty)) {
    assert.throws(() => assertEmptyOnboardingInventory({ ...empty, [key]: 1 }));
  }
});

test('map and profile proof selectors are exact and bound to the generated post ID', () => {
  assert.equal(
    syntheticPostProofSelector('map', 'post-abcdefghijklmnop'),
    '[data-synthetic-post-surface="map"][data-synthetic-post-id="post-abcdefghijklmnop"]',
  );
  assert.equal(
    syntheticPostProofSelector('profile', 'post-abcdefghijklmnop'),
    '[data-synthetic-post-surface="profile"][data-synthetic-post-id="post-abcdefghijklmnop"]',
  );
  assert.throws(() => syntheticPostProofSelector('feed', 'post-abcdefghijklmnop'));
  assert.throws(() => syntheticPostProofSelector('map', 'wrong-id'));
});

test('visible frame contract covers account creation, posting, profile, and map', () => {
  assert.deepEqual(ONBOARDING_FRAME_STAGES, [
    'welcome', 'signup', 'profile-photo', 'account-created', 'home', 'camera',
    'composer', 'location', 'publish-review', 'posted', 'map', 'profile',
  ]);
  assert.equal(new Set(ONBOARDING_FRAME_STAGES).size, ONBOARDING_FRAME_STAGES.length);
});

test('shared visible frame contract proves canonical Map and eligible Feed but never Profile', () => {
  assert.deepEqual(SHARED_ONBOARDING_FRAME_STAGES, [
    'welcome', 'signup', 'profile-photo', 'account-created', 'home', 'camera',
    'composer', 'location', 'publish-review', 'posted', 'map', 'feed',
  ]);
  assert.equal(SHARED_ONBOARDING_FRAME_STAGES.includes('profile'), false);
  assert.equal(new Set(SHARED_ONBOARDING_FRAME_STAGES).size, SHARED_ONBOARDING_FRAME_STAGES.length);
});
