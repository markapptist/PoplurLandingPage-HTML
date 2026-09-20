import test from 'node:test';
import assert from 'node:assert/strict';
import { actorForId } from './synthetic-runner-actions.mjs';
import {
  ACTOR_ACCOUNTS,
  LIVE_ACTIVITIES,
  LIVE_FRAME_STAGES,
  LIVE_MODE,
  LIVE_STEP_METHODS,
  READONLY_MODE,
  RUNNER_MODES,
  accountForActor,
  activitiesForMode,
  cloudEventForLiveStep,
  isLiveFrameStage,
  liveActorIdentities,
  livePlanForActor,
  validateRunnerCommand,
  randomPostLocation,
  postSpotsForActor, WORLD_POST_SPOTS, POST_SPOT_JITTER_DEG, POST_SPREAD_MEMORY, POST_SPREAD_CANDIDATES,
  CAMPUS_POST_SPOTS, CAMPUS_POST_JITTER_DEG, campusPostShare, campusPostLocation, engagementTarget,
  expectedAccountTypeForActor,
} from './synthetic-live-actions.mjs';
import { ACTOR_IDS, SAFE_ACTIONS, SAFE_EVENT_SCREENS, isAllowedEvent, eventTypeForAction } from './synthetic-runner-actions.mjs';

test('runner command keeps the historic read-only meaning and names live mode explicitly', () => {
  assert.deepEqual(validateRunnerCommand({ enabled: true }), { enabled: true, mode: READONLY_MODE });
  assert.deepEqual(validateRunnerCommand({ enabled: true, mode: LIVE_MODE }), { enabled: true, mode: LIVE_MODE });
  assert.deepEqual(validateRunnerCommand({ enabled: false }), { enabled: false });
  assert.throws(() => validateRunnerCommand({ enabled: false, mode: LIVE_MODE }));
  assert.throws(() => validateRunnerCommand({ enabled: true, mode: 'five-actor-anything' }));
  assert.throws(() => validateRunnerCommand({ enabled: 'true' }));
  assert.throws(() => validateRunnerCommand({ enabled: true, mode: LIVE_MODE, reset: true }));
  assert.throws(() => validateRunnerCommand(null));
  assert.deepEqual(RUNNER_MODES, [READONLY_MODE, LIVE_MODE]);
});

test('every actor has a pinned production account and a live plan', () => {
  assert.deepEqual(Object.keys(ACTOR_ACCOUNTS), ACTOR_IDS);
  for (const actorId of ACTOR_IDS) {
    const identity = accountForActor(actorId);
    assert.equal(identity.uid, actorId);
    assert.match(identity.email, /^beta-sim-[a-z]+(?:-[a-z]+)?-\d{3}@poplur\.test$/);
    const plan = livePlanForActor(actorId);
    assert.ok(plan.length >= 5);
    assert.equal(plan[0].method, 'current');
    assert.ok(plan.some(step => step.method === 'post'), `${actorId} never posts`);
    assert.ok(plan.some(step => step.method === 'engage'), `${actorId} never engages`);
    for (const step of plan) assert.ok(LIVE_STEP_METHODS.has(step.method), `${actorId} uses ${step.method}`);
  }
  assert.equal(liveActorIdentities().length, ACTOR_IDS.length);
  assert.throws(() => livePlanForActor('sim-unknown-009'));
  assert.throws(() => accountForActor('sim-unknown-009'));
});

test('cloud reporting of live steps never leaves the read-only ingest vocabulary', () => {
  for (const actorId of ACTOR_IDS) {
    for (const step of livePlanForActor(actorId)) {
      const event = cloudEventForLiveStep(step);
      assert.ok(event, 'every step maps to a cloud event');
      assert.ok(SAFE_EVENT_SCREENS.has(event.screen), `${event.screen} is not a read-only screen`);
      assert.ok(SAFE_ACTIONS.has(event.action), `${event.action} is not a read-only action`);
      assert.ok(isAllowedEvent(event.screen, event.action, eventTypeForAction(event.action)));
    }
  }
  assert.deepEqual(cloudEventForLiveStep({ screen: 'map', action: 'publish-post', method: 'post' }), { screen: 'map', action: 'screen-view' });
  assert.deepEqual(cloudEventForLiveStep({ screen: 'feed', action: 'like-post', method: 'engage' }), { screen: 'feed', action: 'screen-view' });
  assert.equal(cloudEventForLiveStep(null), null);
});

test('the activity catalogue is explicit about where each activity is recorded', () => {
  const ids = new Set(LIVE_ACTIVITIES.map(activity => activity.id));
  assert.equal(ids.size, LIVE_ACTIVITIES.length);
  for (const activity of LIVE_ACTIVITIES) {
    assert.ok(['cloud', 'local', 'production'].includes(activity.reported));
    assert.ok(activity.label.length > 3 && activity.detail.length > 10);
  }
  assert.ok(LIVE_ACTIVITIES.some(activity => activity.id === 'publish-post' && activity.reported === 'production'));
  assert.ok(LIVE_ACTIVITIES.some(activity => activity.id === 'like-post' && activity.reported === 'production'));
  const readonly = activitiesForMode(READONLY_MODE);
  assert.ok(readonly.length < LIVE_ACTIVITIES.length);
  assert.ok(readonly.every(activity => activity.reported === 'cloud'));
  assert.equal(activitiesForMode(LIVE_MODE), LIVE_ACTIVITIES);
});

test('live frames never include the sign-in screen', () => {
  assert.ok(!LIVE_FRAME_STAGES.includes('sign-in'));
  assert.ok(!LIVE_FRAME_STAGES.includes('welcome'));
  assert.equal(isLiveFrameStage('posted'), true);
  assert.equal(isLiveFrameStage('sign-in'), false);
});

import { createLiveCohortNetworkPolicy, LIVE_ENGAGEMENT_FUNCTION_URL, LIVE_MAX_LIKES_PER_ACTOR } from './synthetic-live-actions.mjs';

const KEY = 'AIzaSyC_b3-zHngzP-MKa1Cx5yclbV_6DlvGe_w';
const identity = () => ({ actorId: 'sim-food-001', uid: 'sim-food-001', email: 'beta-sim-food-001@poplur.test', handle: '@sauceboss' });
const RUN = 'live-cohort-abc123';
const bound = () => {
  const policy = createLiveCohortNetworkPolicy(identity(), RUN);
  policy.bindAuth({ uid: 'sim-food-001', idToken: 'id-token-1', refreshToken: 'refresh-1' });
  return policy;
};
const str = value => ({ stringValue: value });
const num = value => ({ doubleValue: value });
const int = value => ({ integerValue: String(value) });
const bool = value => ({ booleanValue: value });
const DOC = 'projects/poplur2025/databases/(default)/documents';
const commit = writes => ({
  method: 'POST',
  url: 'https://firestore.googleapis.com/v1/projects/poplur2025/databases/(default)/documents:commit',
  postData: JSON.stringify({ writes }),
  headers: { authorization: 'Bearer id-token-1' },
});
const postFields = (postId, overrides = {}) => ({
  userID: str('sim-food-001'), username: str('Beta Runner · Food scout'),
  mediaURL: str(`https://firebasestorage.googleapis.com/v0/b/poplur2025.firebasestorage.app/o/${encodeURIComponent(`posts/sim-food-001/${postId}.jpg`)}?alt=media&token=t`),
  mediaType: str('photo'), viewCount: int(0), radius: int(5000), createdAtMillis: int(1),
  syntheticBeta: bool(true), syntheticActorId: str('sim-food-001'), syntheticJourney: str('five-actor-live'),
  syntheticSource: str('visible-app-ui'), syntheticRunId: str(RUN), mediaStoragePath: str(`posts/sim-food-001/${postId}.jpg`),
  audience: str('public'), locationVisibility: str('approximate'), latitude: num(43.653), longitude: num(-79.383),
  latitudeCell: int(43653), longitudeCell: int(-79383), ...overrides,
});
const postWrite = (postId, overrides) => ({
  update: { name: `${DOC}/posts/${postId}`, fields: postFields(postId, overrides) },
  updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
});
const POST = 'post-0123456789abcdef0123';

test('live policy binds only the pinned identity and rejects foreign sign-ins', () => {
  assert.throws(() => createLiveCohortNetworkPolicy({ ...identity(), uid: 'someone-else' }, RUN));
  assert.throws(() => createLiveCohortNetworkPolicy(identity(), 'short'));
  const policy = createLiveCohortNetworkPolicy(identity(), RUN);
  assert.throws(() => policy.bindAuth({ uid: 'other-uid', idToken: 'x', refreshToken: 'y' }));
  const signIn = body => policy.inspect({ method: 'POST', url: `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${KEY}`, postData: JSON.stringify(body) });
  assert.equal(signIn({ email: 'beta-sim-food-001@poplur.test', password: 'p'.repeat(20), returnSecureToken: true }).allow, true);
  assert.equal(signIn({ email: 'beta-sim-news-005@poplur.test', password: 'p'.repeat(20), returnSecureToken: true }).allow, false);
  assert.equal(signIn({ email: 'beta-sim-food-001@poplur.test', password: 'p'.repeat(20), returnSecureToken: true, tenantId: 'x' }).allow, false);
  assert.equal(policy.inspect({ method: 'POST', url: `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${KEY}`, postData: '{}' }).allow, false);
});

test('live policy admits only the actor’s own bound posts and their locations', () => {
  const policy = bound();
  const uploadStart = policy.inspect({
    method: 'POST',
    url: `https://firebasestorage.googleapis.com/v0/b/poplur2025.firebasestorage.app/o?name=${encodeURIComponent(`posts/sim-food-001/${POST}.jpg`)}&uploadType=resumable`,
    headers: { authorization: 'Firebase id-token-1' },
  });
  assert.equal(uploadStart.allow, true);
  assert.equal(uploadStart.kind, 'live-storage-upload');
  assert.equal(policy.state.lastPostId, POST);
  assert.equal(policy.inspect(commit([postWrite(POST)])).allow, true);
  assert.equal(policy.inspect(commit([postWrite(POST, { syntheticActorId: str('sim-news-005') })])).allow, false);
  assert.equal(policy.inspect(commit([postWrite(POST, { userID: str('someone-else') })])).allow, false);
  assert.equal(policy.inspect(commit([postWrite(POST, { audience: str('private') })])).allow, false);
  assert.equal(policy.inspect(commit([postWrite(POST, { syntheticJourney: str('first-user-shared-v1') })])).allow, false);
  assert.equal(policy.inspect(commit([postWrite('post-ffffffffffffffffffff')])).allow, false, 'unbound post id');
  assert.equal(policy.inspect(commit([{
    update: { name: `${DOC}/users/sim-food-001/postLocations/${POST}`, fields: { latitude: num(43.6532), longitude: num(-79.3832), source: str('post-upload') } },
    updateMask: { fieldPaths: ['latitude', 'longitude', 'source'] },
    updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
  }])).allow, true);
  assert.equal(policy.inspect(commit([{ update: { name: `${DOC}/dmThreads/a_b`, fields: { lastMessage: str('hi') } }, updateMask: { fieldPaths: ['lastMessage'] } }])).allow, false);
  assert.equal(policy.inspect(commit([{ update: { name: `${DOC}/posts/${POST}`, fields: { radius: int(999999) } }, updateMask: { fieldPaths: ['radius'] } }])).allow, false);
  assert.equal(policy.inspect({ method: 'DELETE', url: `https://firestore.googleapis.com/v1/${DOC}/posts/${POST}` }).allow, false);
  assert.equal(policy.inspect({
    method: 'POST',
    url: `https://firebasestorage.googleapis.com/v0/b/poplur2025.firebasestorage.app/o?name=${encodeURIComponent('profile_pictures/sim-food-001.jpg')}&uploadType=resumable`,
    headers: { authorization: 'Firebase id-token-1' },
  }).allow, false);
});

test('live policy caps posts per run at the storage boundary', () => {
  const policy = bound();
  for (let index = 0; index < 4; index += 1) {
    const verdict = policy.inspect({
      method: 'POST',
      url: `https://firebasestorage.googleapis.com/v0/b/poplur2025.firebasestorage.app/o?name=${encodeURIComponent(`posts/sim-food-001/post-aaaaaaaaaaaaaaaaaaa${index}.jpg`)}&uploadType=resumable`,
      headers: { authorization: 'Firebase id-token-1' },
    });
    assert.equal(verdict.allow, true, `post ${index}`);
  }
  const fifth = policy.inspect({
    method: 'POST',
    url: `https://firebasestorage.googleapis.com/v0/b/poplur2025.firebasestorage.app/o?name=${encodeURIComponent('posts/sim-food-001/post-bbbbbbbbbbbbbbbbbbbb.jpg')}&uploadType=resumable`,
    headers: { authorization: 'Firebase id-token-1' },
  });
  assert.equal(fifth.allow, false);
  assert.match(fifth.reason, /4-post limit/);
});

test('live policy admits the shell’s first-run profile a bounded number of times', () => {
  const policy = bound();
  const profile = () => commit([{
    update: { name: `${DOC}/users/sim-food-001`, fields: { uid: str('sim-food-001'), username: str('Beta Runner · Food scout'), usernameNormalized: str('betarunnerfoodscout'), email: str('beta-sim-food-001@poplur.test'), accountType: str('personal'), bio: str(''), createdAt: int(1) } },
    updateMask: { fieldPaths: ['uid', 'username', 'usernameNormalized', 'email', 'accountType', 'bio', 'createdAt'] },
  }]);
  const index = commit([{
    update: { name: `${DOC}/usernames/betarunnerfoodscout`, fields: { uid: str('sim-food-001'), username: str('Beta Runner · Food scout'), email: str('beta-sim-food-001@poplur.test'), updatedAt: int(1) } },
    updateMask: { fieldPaths: ['uid', 'username', 'email', 'updatedAt'] },
  }]);
  assert.equal(policy.inspect(index).allow, true);
  assert.equal(policy.inspect(profile()).allow, true);
  assert.equal(policy.inspect(profile()).allow, false, 'third profile write is refused');
  const foreign = commit([{ update: { name: `${DOC}/users/sim-news-005`, fields: { uid: str('sim-news-005'), username: str('x'), email: str('beta-sim-news-005@poplur.test') } }, updateMask: { fieldPaths: ['uid', 'username', 'email'] } }]);
  assert.equal(createLiveCohortNetworkPolicy(identity(), RUN).inspect(foreign).allow, false);
});

test('live policy admits the surface label the web shell sends, and nothing else on the wire', () => {
  // 12 Sep: engagements carry surface ∈ {feed, map, profile, unknown}; the
  // runner blocked every one of them until the exact-shape rule knew the key.
  const policy = bound();
  const engage = extra => policy.inspect({
    method: 'POST', url: LIVE_ENGAGEMENT_FUNCTION_URL,
    postData: JSON.stringify({ data: { postId: 'post-0123456789abcdef', eventId: `evt_${Object.values(extra).join('_') || 'bare'}_000001`, kind: 'view', ...extra } }),
    headers: { authorization: 'Bearer id-token-1' },
  });
  assert.equal(engage({ surface: 'feed' }).allow, true);
  assert.equal(engage({ surface: 'unknown' }).allow, true);
  assert.equal(engage({}).allow, true, 'the old three-key shape still passes');
  assert.equal(engage({ surface: 'widget' }).allow, false, 'an unlisted surface is refused');
  assert.equal(engage({ surface: 'feed', text: 'hi' }).allow, false, 'no fifth key rides along');
});

test('live policy admits views and likes as the actor, once per event, up to the like cap', () => {
  const policy = bound();
  const engage = (kind, eventId, token = 'id-token-1') => policy.inspect({
    method: 'POST', url: LIVE_ENGAGEMENT_FUNCTION_URL,
    postData: JSON.stringify({ data: { postId: 'post-0123456789abcdef', eventId, kind } }),
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(engage('view', 'evt_view_000001').allow, true);
  assert.equal(engage('view', 'evt_view_000001').allow, true, 'retry with the same event id is fine');
  assert.equal(policy.state.viewsGiven, 1);
  assert.equal(engage('like', 'evt_like_000001').allow, true);
  assert.equal(engage('dislike', 'evt_dis_0000001').allow, false);
  assert.equal(engage('comment', 'evt_com_0000001').allow, false);
  assert.equal(engage('like', 'evt_like_000002', 'stolen-token').allow, false);
  for (let index = 2; index <= LIVE_MAX_LIKES_PER_ACTOR; index += 1) assert.equal(engage('like', `evt_like_${String(index).padStart(6, '0')}`).allow, true);
  assert.equal(engage('like', 'evt_like_999999').allow, false, 'like cap');
  assert.equal(policy.state.likesGiven, LIVE_MAX_LIKES_PER_ACTOR);
  assert.equal(policy.inspect({ method: 'POST', url: 'https://us-central1-poplur2025.cloudfunctions.net/testActivityControl', postData: '{}', headers: { authorization: 'Bearer id-token-1' } }).allow, false);
});

import { ACTOR_LOCATIONS, locationForActor } from './synthetic-live-actions.mjs';

test('every actor has a managed city and the policy pins posts to it', () => {
  assert.deepEqual(Object.keys(ACTOR_LOCATIONS), ACTOR_IDS);
  const london = locationForActor('sim-sports-002');
  assert.equal(london.place, 'London');
  assert.deepEqual([london.latitudeCell, london.longitudeCell, london.latitude3, london.longitude3], [51507, -128, 51.507, -0.128]);
  assert.throws(() => locationForActor('sim-unknown-009'));

  const sports = createLiveCohortNetworkPolicy({ actorId: 'sim-sports-002', uid: 'sim-sports-002', email: 'beta-sim-sports-002@poplur.test', handle: '@pitchside' }, RUN);
  sports.bindAuth({ uid: 'sim-sports-002', idToken: 'id-token-2', refreshToken: 'refresh-2' });
  sports.inspect({
    method: 'POST',
    url: `https://firebasestorage.googleapis.com/v0/b/poplur2025.firebasestorage.app/o?name=${encodeURIComponent(`posts/sim-sports-002/${POST}.jpg`)}&uploadType=resumable`,
    headers: { authorization: 'Firebase id-token-2' },
  });
  const londonPost = overrides => ({
    method: 'POST',
    url: 'https://firestore.googleapis.com/v1/projects/poplur2025/databases/(default)/documents:commit',
    postData: JSON.stringify({ writes: [{
      update: { name: `${DOC}/posts/${POST}`, fields: { ...postFields(POST, {
        userID: str('sim-sports-002'), syntheticActorId: str('sim-sports-002'),
        mediaURL: str(`https://firebasestorage.googleapis.com/v0/b/poplur2025.firebasestorage.app/o/${encodeURIComponent(`posts/sim-sports-002/${POST}.jpg`)}?alt=media&token=t`),
        mediaStoragePath: str(`posts/sim-sports-002/${POST}.jpg`),
        latitude: num(51.507), longitude: num(-0.128), latitudeCell: int(51507), longitudeCell: int(-128),
      }), ...overrides } },
      updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
    }] }),
    headers: { authorization: 'Bearer id-token-2' },
  });
  assert.equal(sports.inspect(londonPost({})).allow, true, 'London post for the London actor');
  assert.equal(sports.inspect(londonPost({ latitude: num(43.653), longitude: num(-79.383), latitudeCell: int(43653), longitudeCell: int(-79383) })).allow, false, 'Toronto post for the London actor');
  const exactLocation = (latitude, longitude) => sports.inspect({
    method: 'POST',
    url: 'https://firestore.googleapis.com/v1/projects/poplur2025/databases/(default)/documents:commit',
    postData: JSON.stringify({ writes: [{
      update: { name: `${DOC}/users/sim-sports-002/postLocations/${POST}`, fields: { latitude: num(latitude), longitude: num(longitude), source: str('post-upload') } },
      updateMask: { fieldPaths: ['latitude', 'longitude', 'source'] },
      updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
    }] }),
    headers: { authorization: 'Bearer id-token-2' },
  });
  assert.equal(exactLocation(51.5074, -0.1278).allow, true);
  assert.equal(exactLocation(43.6532, -79.3832).allow, false);
});

import { LIVE_MAX_DMS_PER_ACTOR, LIVE_DM_MESSAGES, LIVE_DM_TEXT_MAX } from './synthetic-live-actions.mjs';

test('live policy admits one short DM per bound poster and blocks everything else in dmThreads', () => {
  const policy = bound();
  const other = 'n1BkpZPv4HcBKLAG7FXQTzYp7sF2';
  const threadOf = target => ['sim-food-001', target].sort().join('_');
  const messageId = 'dm-0123456789abcdef';
  const dmBatch = (text, id = messageId, target = other) => commit([
    {
      update: { name: `${DOC}/dmThreads/${threadOf(target)}`, fields: {
        participants: { arrayValue: { values: ['sim-food-001', target].sort().map(value => ({ stringValue: value })) } },
        lastMessage: str(text), lastSenderId: str('sim-food-001'),
        unreadBy: { mapValue: { fields: { 'sim-food-001': int(0) } } },
      } },
      updateMask: { fieldPaths: ['participants', 'lastMessage', 'lastSenderId', 'unreadBy.`sim-food-001`'] },
      updateTransforms: [
        { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
        { fieldPath: `unreadBy.\`${target}\``, increment: { integerValue: '1' } },
      ],
    },
    {
      update: { name: `${DOC}/dmThreads/${threadOf(target)}/messages/${id}`, fields: {
        senderId: str('sim-food-001'), clientMessageId: str(id), text: str(text), kind: str('text'),
      } },
      updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
    },
  ]);
  assert.equal(policy.inspect(dmBatch(LIVE_DM_MESSAGES[0])).allow, false, 'no recipient bound yet');
  assert.throws(() => policy.bindDMRecipient('sim-food-001'), /another real account/);
  policy.bindDMRecipient(other);
  assert.equal(policy.inspect(dmBatch(LIVE_DM_MESSAGES[0])).allow, true);
  assert.equal(policy.state.dmsSent, 1);
  assert.equal(policy.inspect(dmBatch(LIVE_DM_MESSAGES[0])).allow, true, 'retry of the same client message id');
  assert.equal(policy.state.dmsSent, 1);
  // A second message to the same person is a reply, and replies are what a
  // conversation is made of (bounded per recipient; see the thread test).
  assert.equal(policy.inspect(dmBatch(LIVE_DM_MESSAGES[1], 'dm-second-message-id')).allow, true, 'a reply to the same poster');
  assert.equal(policy.state.dmsSent, 2);
  assert.equal(policy.inspect(dmBatch('x'.repeat(LIVE_DM_TEXT_MAX + 1), 'dm-long-message-id')).allow, false, 'too long');
  assert.equal(policy.inspect(dmBatch(LIVE_DM_MESSAGES[0], 'dm-other-thread-id', 'ZH9TGw7iwKXLaxBrXDd1PkAJlrP2')).allow, false, 'unbound thread');
  const foreignSender = commit([{
    update: { name: `${DOC}/dmThreads/${threadOf(other)}/messages/dm-forged-sender-id`, fields: { senderId: str(other), clientMessageId: str('dm-forged-sender-id'), text: str('hi'), kind: str('text') } },
    updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
  }]);
  assert.equal(policy.inspect(foreignSender).allow, false);
  const hide = commit([{ update: { name: `${DOC}/dmThreads/${threadOf(other)}`, fields: { hiddenAtBy: { mapValue: { fields: {} } } } }, updateMask: { fieldPaths: ['hiddenAtBy'] } }]);
  assert.equal(policy.inspect(hide).allow, false, 'thread hiding is not part of the ledger');
  for (let index = 1; index < LIVE_MAX_DMS_PER_ACTOR; index += 1) policy.bindDMRecipient(`recipient-${index}-abcdefgh`);
  assert.throws(() => policy.bindDMRecipient('one-recipient-too-many'), /DM limit/);
});

test('every PERSON messages a poster right after liking one; a BUSINESS never messages anyone', () => {
  for (const actorId of ACTOR_IDS) {
    const plan = livePlanForActor(actorId);
    const engage = plan.findIndex(step => step.method === 'engage');
    assert.ok(engage >= 0, `${actorId} never engages`);
    if (actorForId(actorId)?.kind === 'business') {
      // A shop writing to strangers is what the block list exists for.
      assert.ok(plan.some(step => step.method === 'dm'), `${actorId} can message the consenting owner`);
      continue;
    }
    assert.equal(plan[engage + 1]?.method, 'dm', `${actorId} DM follows the like`);
    assert.deepEqual(cloudEventForLiveStep(plan[engage + 1]), { screen: 'feed', action: 'screen-view' });
  }
  assert.ok(LIVE_ACTIVITIES.some(activity => activity.id === 'send-dm' && activity.reported === 'production'));
});

test('a first-run profile may claim "business" only for a business tester', () => {
  assert.equal(expectedAccountTypeForActor('sim-food-001'), 'personal');
  assert.equal(expectedAccountTypeForActor('sim-biz-food-006'), 'business');
  assert.equal(expectedAccountTypeForActor('sim-unknown-009'), 'personal');
});


test('randomPostLocation spreads posts across real places and rounds exactly', () => {
  // A deterministic sequence: pick the 3rd spot, jitter both axes to their extremes.
  const spots = postSpotsForActor('sim-food-001');
  const seq = [2 / spots.length + 0.0001, 1, 0];
  const random = () => seq.shift() ?? 0.5;
  const spot = randomPostLocation('sim-food-001', null, random);
  const base = spots[2];
  assert.equal(spot.place, base.place);
  assert.equal(spot.latitude, Math.round((base.latitude + POST_SPOT_JITTER_DEG) * 1_000) / 1_000);
  assert.equal(spot.longitude, Math.round((base.longitude - POST_SPOT_JITTER_DEG) * 1_000) / 1_000);
  // The guard compares cells and 3-decimal values; both must derive from the
  // exact coordinates handed to the app, the way locationForActor does.
  assert.equal(spot.latitudeCell, Math.round(spot.latitude * 1000));
  assert.equal(spot.longitudeCell, Math.round(spot.longitude * 1000));
  assert.equal(spot.latitude3, spot.latitudeCell / 1000);
  assert.equal(spot.longitude3, spot.longitudeCell / 1000);
  assert.equal(spot.latitude, Math.round(spot.latitude * 1_000) / 1_000);
});

test('randomPostLocation never lands the same actor on the same place twice running', () => {
  const previous = { ...postSpotsForActor('sim-food-001')[0], latitudeCell: 0, longitudeCell: 0, latitude3: 0, longitude3: 0 };
  const spot = randomPostLocation('sim-food-001', previous, () => 0);
  assert.notEqual(spot.place, previous.place);
});

test('randomPostLocation never lands an actor in its own home city', () => {
  const homes = { 'sim-food-001': 'Toronto', 'sim-sports-002': 'London', 'sim-music-003': 'Toronto', 'sim-tech-004': 'Toronto', 'sim-news-005': 'New York' };
  for (const [actorId, homeCity] of Object.entries(homes)) {
    assert.ok(!postSpotsForActor(actorId).some(spot => spot.place === homeCity), `${actorId} may not post from ${homeCity}`);
    let seed = 0.123;
    const random = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    let previous = null;
    for (let i = 0; i < 200; i += 1) {
      previous = randomPostLocation(actorId, previous, random);
      assert.notEqual(previous.place, homeCity, `${actorId} landed at home on draw ${i}`);
    }
  }
});

test('randomPostLocation pushes a pop away from the cohort\'s latest pops', () => {
  const km = (a, b) => {
    const rad = d => d * Math.PI / 180;
    const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2
      + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
    return 2 * 6_371 * Math.asin(Math.sqrt(h));
  };
  // The cohort has just piled into western Europe.
  const recent = ['Paris', 'Brussels', 'Amsterdam', 'Berlin', 'Zurich', 'Milan']
    .map(place => WORLD_POST_SPOTS.find(spot => spot.place === place));
  assert.ok(recent.every(Boolean));
  let seed = 0.29;
  const random = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  let nearest = Infinity;
  for (let i = 0; i < 60; i += 1) {
    const spot = randomPostLocation('sim-food-001', null, random, recent);
    nearest = Math.min(nearest, Math.min(...recent.map(anchor => km(spot, anchor))));
  }
  // Sixty draws weighed against that pile-up never land inside it.
  assert.ok(nearest > 1_000, `a pop landed ${nearest.toFixed(0)} km from the pile-up`);
  // The plain draw still stands with nothing recent: the same seed, the same spot.
  const seq = () => { let s = 0.29; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };
  assert.equal(randomPostLocation('sim-food-001', null, seq(), []).place, randomPostLocation('sim-food-001', null, seq()).place);
  assert.ok(POST_SPREAD_MEMORY >= 8 && POST_SPREAD_CANDIDATES >= 4);
});

test('campus lane is off unless POPLUR_CAMPUS_POST_SHARE says otherwise, and is clamped to 0..1', () => {
  assert.equal(campusPostShare({}), 0);
  assert.equal(campusPostShare({ POPLUR_CAMPUS_POST_SHARE: 'nope' }), 0);
  assert.equal(campusPostShare({ POPLUR_CAMPUS_POST_SHARE: '0.35' }), 0.35);
  assert.equal(campusPostShare({ POPLUR_CAMPUS_POST_SHARE: '7' }), 1);
  assert.equal(campusPostShare({ POPLUR_CAMPUS_POST_SHARE: '-1' }), 0);
});

test('campusPostLocation lands within ~1 km of a real campus, 3-decimal, never the same campus twice running', () => {
  const spot = campusPostLocation(null, () => 0.5, []);
  const campus = CAMPUS_POST_SPOTS.find(c => c.place === spot.place);
  assert.ok(campus, 'a named campus');
  assert.ok(Math.abs(spot.latitude - campus.latitude) <= CAMPUS_POST_JITTER_DEG + 1e-9);
  assert.ok(Math.abs(spot.longitude - campus.longitude) <= CAMPUS_POST_JITTER_DEG + 1e-9);
  assert.equal(spot.latitude, spot.latitude3);
  assert.equal(spot.longitudeCell, Math.round(spot.longitude * 1000));
  const next = campusPostLocation(spot, () => 0.5, []);
  assert.notEqual(next.place, spot.place);
});

test('campusPostLocation takes the campus farthest from the cohort\'s latest pops', () => {
  const recent = [{ latitude: 43.469, longitude: -79.699 }]; // Sheridan Trafalgar just posted
  const spot = campusPostLocation(null, () => 0.5, recent);
  assert.equal(spot.place, 'Humber North'); // ~30 km away in Etobicoke: the farthest campus from Oakville
});

test('randomPostLocation is byte-for-byte unchanged while the campus lane is off', () => {
  const before = process.env.POPLUR_CAMPUS_POST_SHARE;
  delete process.env.POPLUR_CAMPUS_POST_SHARE;
  try {
    const draws = [0.31, 0.62, 0.93, 0.11, 0.47];
    const a = randomPostLocation('sim-food-001', null, (() => { let i = 0; return () => draws[i++ % draws.length]; })(), []);
    const b = randomPostLocation('sim-food-001', null, (() => { let i = 0; return () => draws[i++ % draws.length]; })(), []);
    assert.deepEqual(a, b);
    assert.ok(!CAMPUS_POST_SPOTS.some(c => c.place === a.place), 'no campus without the lane');
  } finally {
    if (before !== undefined) process.env.POPLUR_CAMPUS_POST_SHARE = before;
  }
});

test('randomPostLocation sends that share of pops to a campus when the lane is on', () => {
  const before = process.env.POPLUR_CAMPUS_POST_SHARE;
  process.env.POPLUR_CAMPUS_POST_SHARE = '1';
  try {
    const spot = randomPostLocation('sim-food-001', null, () => 0.5, []);
    assert.ok(CAMPUS_POST_SPOTS.some(c => c.place === spot.place), `${spot.place} is a campus`);
  } finally {
    if (before === undefined) delete process.env.POPLUR_CAMPUS_POST_SHARE; else process.env.POPLUR_CAMPUS_POST_SHARE = before;
  }
});

test('randomPostLocation refuses an unknown actor', () => {
  assert.throws(() => randomPostLocation('nobody', null, () => 0), /Unknown synthetic actor/);
});

import { LIVE_POST_SPOT_TOLERANCE_KM } from './synthetic-live-actions.mjs';

test('a post is accepted where the picker actually landed, not only at the exact spot', () => {
  const policy = bound();
  // The runner moved this actor to Berlin for this post.
  policy.state.expectedLocation = { place: 'Berlin', latitude: 52.52, longitude: 13.405, latitudeCell: 52520, longitudeCell: 13405, latitude3: 52.52, longitude3: 13.405 };
  policy.inspect({
    method: 'POST',
    url: `https://firebasestorage.googleapis.com/v0/b/poplur2025.firebasestorage.app/o?name=${encodeURIComponent(`posts/sim-food-001/${POST}.jpg`)}&uploadType=resumable`,
    headers: { authorization: 'Firebase id-token-1' },
  });
  const at = (latitude, longitude) => commit([{
    update: { name: `${DOC}/posts/${POST}`, fields: postFields(POST, {
      latitude: num(latitude), longitude: num(longitude),
      latitudeCell: int(Math.round(latitude * 1000)), longitudeCell: int(Math.round(longitude * 1000)),
    }) },
    updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
  }]);
  // The map placed the pin a few streets from the injected fix.
  assert.equal(policy.inspect(at(52.523, 13.411)).allow, true, 'a few hundred metres away');
  assert.equal(policy.inspect(at(52.61, 13.405)).allow, true, 'within the tolerance');
  // Another city is still refused, so the move is still proven.
  assert.equal(policy.inspect(at(48.857, 2.352)).allow, false, 'Paris while moved to Berlin');
  assert.ok(LIVE_POST_SPOT_TOLERANCE_KM < 100, 'tolerance stays well inside city separation');
});

test('a post must still carry the coarse public point, exactly', () => {
  const policy = bound();
  policy.state.expectedLocation = { place: 'Berlin', latitude: 52.52, longitude: 13.405, latitudeCell: 52520, longitudeCell: 13405, latitude3: 52.52, longitude3: 13.405 };
  policy.inspect({
    method: 'POST',
    url: `https://firebasestorage.googleapis.com/v0/b/poplur2025.firebasestorage.app/o?name=${encodeURIComponent(`posts/sim-food-001/${POST}.jpg`)}&uploadType=resumable`,
    headers: { authorization: 'Firebase id-token-1' },
  });
  const write = fields => commit([{
    update: { name: `${DOC}/posts/${POST}`, fields: postFields(POST, fields) },
    updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
  }]);
  // A precise origin leaking into the public document is refused.
  assert.equal(policy.inspect(write({ latitude: num(52.5231), longitude: num(13.4114), latitudeCell: int(52523), longitudeCell: int(13411) })).allow, false, 'four-decimal origin');
  // Cells that disagree with the published point are refused.
  assert.equal(policy.inspect(write({ latitude: num(52.523), longitude: num(13.411), latitudeCell: int(52999), longitudeCell: int(13411) })).allow, false, 'mismatched cell');
  assert.equal(policy.inspect(write({ latitude: num(52.523), longitude: num(13.411), latitudeCell: int(52523), longitudeCell: int(13411) })).allow, true, 'coarse and consistent');
});

test('a created post may carry a seed but never earned radius', () => {
  const policy = bound();
  policy.inspect({
    method: 'POST',
    url: `https://firebasestorage.googleapis.com/v0/b/poplur2025.firebasestorage.app/o?name=${encodeURIComponent(`posts/sim-food-001/${POST}.jpg`)}&uploadType=resumable`,
    headers: { authorization: 'Firebase id-token-1' },
  });
  const write = extra => commit([{
    update: { name: `${DOC}/posts/${POST}`, fields: postFields(POST, extra) },
    updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
  }]);
  assert.equal(policy.inspect(write({ seedRadiusMeters: int(5000), organicRadiusMeters: int(0) })).allow, true, 'a seeded post');
  assert.equal(policy.inspect(write({ seedRadiusMeters: int(5000), organicRadiusMeters: int(9000) })).allow, false, 'arriving with earned radius');
  assert.equal(policy.inspect(write({ seedRadiusMeters: int(25000), organicRadiusMeters: int(0) })).allow, false, 'a seed above the sanctioned 5 km');
  assert.equal(policy.inspect(write({ seedRadiusMeters: int(-1), organicRadiusMeters: int(0) })).allow, false, 'a negative seed');
  // The seed can never exceed the reach the post actually claims.
  assert.equal(policy.inspect(write({ radius: int(1000), seedRadiusMeters: int(5000), organicRadiusMeters: int(0) })).allow, false, 'seed larger than the post itself');
});

import { NEIGHBOUR_POST_SHARE, neighbourSpotsForActor, ACTOR_LOCATIONS as HOMES } from './synthetic-live-actions.mjs';

const isNeighbourOf = (actorId, spot) => neighbourSpotsForActor(actorId)
  .some(candidate => candidate.place === spot.place);

test('every pop goes somewhere in the world, never back to cohort ground on purpose', () => {
  // The board should read as a live world: posts spread across many cities,
  // not stacked on the three downtowns the cohort lives in.
  assert.equal(NEIGHBOUR_POST_SHARE, 0);
  assert.ok(WORLD_POST_SPOTS.length >= 80, `only ${WORLD_POST_SPOTS.length} world spots`);
  let seed = 0.377;
  const random = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const places = new Set();
  let previous = null;
  for (let i = 0; i < 400; i += 1) {
    previous = randomPostLocation('sim-food-001', previous, random);
    places.add(previous.place);
    assert.notEqual(previous.place, HOMES['sim-food-001'].place, 'never the actor’s own city');
  }
  assert.ok(places.size >= 60, `400 pops visited only ${places.size} places`);
  // Cohort ground is still reachable by chance — it is in the world — but no
  // draw is steered there any more.
  const away = randomPostLocation('sim-food-001', null, () => 0);
  const next = randomPostLocation('sim-food-001', away, () => 0);
  assert.equal(isNeighbourOf('sim-food-001', next), isNeighbourOf('sim-food-001', away));
});

test('a pop lands within the jitter of its named place', () => {
  const km = (a, b) => {
    const north = (a.latitude - b.latitude) * 111.32;
    const east = (a.longitude - b.longitude) * 111.32 * Math.cos(a.latitude * Math.PI / 180);
    return Math.sqrt(north * north + east * east);
  };
  let seed = 0.61;
  const random = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let i = 0; i < 200; i += 1) {
    const spot = randomPostLocation('sim-news-005', null, random);
    const base = WORLD_POST_SPOTS.find(candidate => candidate.place === spot.place);
    assert.ok(base, `${spot.place} is not a named world spot`);
    assert.ok(km(spot, base) < POST_SPOT_JITTER_DEG * 111.32 * 1.5, `${spot.place} landed ${km(spot, base).toFixed(1)} km out`);
  }
});

import { LIVE_MAX_DM_MESSAGES_PER_RECIPIENT, replyForOwnerMessage, LIVE_DM_ANSWERS, LIVE_DM_REPLIES } from './synthetic-live-actions.mjs';

test('a tester answers an owner question and keeps a statement moving', () => {
  const answer = replyForOwnerMessage('sim-food-001', 'What are you seeing in your radius tonight?', 0);
  assert.ok(LIVE_DM_ANSWERS.includes(answer));
  const beat = replyForOwnerMessage('sim-food-001', 'Nice to meet you.', 0);
  assert.ok(LIVE_DM_REPLIES.includes(beat));
  // Eight testers, eight different openers for the same message.
  const said = new Set(['sim-food-001', 'sim-sports-002', 'sim-music-003', 'sim-tech-004', 'sim-news-005']
    .map(actorId => replyForOwnerMessage(actorId, 'Nice to meet you.', 0)));
  assert.ok(said.size >= 4);
  // And one tester never repeats itself on consecutive replies.
  assert.notEqual(replyForOwnerMessage('sim-food-001', 'ok', 0), replyForOwnerMessage('sim-food-001', 'ok', 1));
  for (const line of [...LIVE_DM_ANSWERS, ...LIVE_DM_REPLIES]) assert.ok(line.length <= 240);
});

test('a bound thread admits the opener and its replies, bounded per recipient', () => {
  const policy = bound();
  const other = policy.bindDMRecipient(LIVE_OWNER_UID);
  const me = policy.state.uid;
  const threadId = [me, other].sort().join('_');
  // The shell's own shape: one merge-set on the thread and one set on the
  // message, in one batch — exactly what the guard admits for the opener.
  const message = (id, text) => commit([
    {
      update: { name: `${DOC}/dmThreads/${threadId}`, fields: {
        participants: { arrayValue: { values: [me, other].sort().map(value => ({ stringValue: value })) } },
        lastMessage: str(text), lastSenderId: str(me),
        unreadBy: { mapValue: { fields: { [me]: int(0) } } },
      } },
      updateMask: { fieldPaths: ['participants', 'lastMessage', 'lastSenderId', `unreadBy.\`${me}\``] },
      updateTransforms: [
        { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
        { fieldPath: `unreadBy.\`${other}\``, increment: { integerValue: '1' } },
      ],
    },
    {
      update: { name: `${DOC}/dmThreads/${threadId}/messages/${id}`, fields: {
        senderId: str(me), clientMessageId: str(id), text: str(text), kind: str('text'),
      } },
      updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
    },
  ]);
  assert.equal(policy.inspect(message('msg-opener-0001', 'hello')).allow, true, 'the opener');
  assert.equal(policy.inspect(message('msg-reply-00001', 'and a reply')).allow, true, 'a reply to the same person');
  for (let i = 2; i < LIVE_MAX_DM_MESSAGES_PER_RECIPIENT; i += 1) {
    assert.equal(policy.inspect(message(`msg-reply-${String(i).padStart(5, '0')}`, `reply ${i}`)).allow, true, `reply ${i}`);
  }
  assert.equal(policy.inspect(message('msg-reply-99999', 'one too many')).allow, false, 'the per-recipient bound');
  // A message to somebody the runner never bound stays refused.
  const strangerThread = [me, 'stranger-uid-000000000000'].sort().join('_');
  assert.equal(policy.inspect(commit([{ update: { name: `${DOC}/dmThreads/${strangerThread}/messages/msg-x-000001`, fields: {
    senderId: str(me), clientMessageId: str('msg-x-000001'), kind: str('text'), text: str('hi'),
  } }, updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }] }])).allow, false);
});

import { LIVE_OWNER_UID } from './synthetic-social-contract.mjs';
test('outgoing calls are bound to the owner, with exact signalling and cleanup', () => {
  const policy = bound();
  const call = (id = 'test-call-00001', overrides = {}) => ({ update: { name: `${DOC}/calls/${id}`, fields: {
    participants: { arrayValue: { values: [str(LIVE_OWNER_UID), str(identity().uid)] } },
    callerId: str(identity().uid), callerName: str('Synthetic food tester'), calleeId: str(LIVE_OWNER_UID),
    status: str('ringing'), provider: str('webrtc'), video: bool(true), ...overrides,
  } }, updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }] });
  assert.equal(policy.inspect(commit([call()])).allow, false);
  assert.throws(() => policy.bindCallRecipient('unrelated-person'), /consenting owner/);
  policy.bindCallRecipient(LIVE_OWNER_UID);
  assert.equal(policy.inspect(commit([call('forged-call-0001', { callerId: str(LIVE_OWNER_UID) })])).allow, false);
  assert.equal(policy.inspect(commit([call()])).allow, true);
  const offer = id => ({ update: { name: `${DOC}/calls/${id}`, fields: { offer: { mapValue: { fields: { type: str('offer'), sdp: str('v=0\r\n') } } } } }, updateMask: { fieldPaths: ['offer.type', 'offer.sdp'] } });
  assert.equal(policy.inspect(commit([offer('test-call-00001')])).allow, true);
  assert.equal(policy.inspect(commit([offer('foreign-call-001')])).allow, false);
  const candidate = sender => ({ update: { name: `${DOC}/calls/test-call-00001/candidates/test-candidate-01`, fields: { senderId: str(sender), candidate: str('candidate:...'), sdpMid: str('0'), sdpMLineIndex: int(0) } }, updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }] });
  assert.equal(policy.inspect(commit([candidate(identity().uid)])).allow, true);
  assert.equal(policy.inspect(commit([candidate(LIVE_OWNER_UID)])).allow, false);
  assert.equal(policy.inspect(commit([{ delete: `${DOC}/calls/test-call-00001` }])).allow, true);
  assert.equal(policy.inspect(commit([{ delete: `${DOC}/calls/foreign-call-001` }])).allow, false);
  assert.equal(policy.inspect(commit([call('test-call-00002')])).allow, true);
  assert.equal(policy.inspect(commit([call('test-call-00003')])).allow, false);
});

test('bound chat permits own typing and read receipts, never the owner’s state', () => {
  const policy = bound(); policy.bindDMRecipient(LIVE_OWNER_UID);
  const id = [identity().uid, LIVE_OWNER_UID].sort().join('_');
  const typing = uid => ({ update: { name: `${DOC}/dmThreads/${id}`, fields: {} }, updateMask: { fieldPaths: [] }, updateTransforms: [{ fieldPath: `typingBy.\`${uid}\``, setToServerValue: 'REQUEST_TIME' }] });
  assert.equal(policy.inspect(commit([typing(identity().uid)])).allow, true);
  assert.equal(policy.inspect(commit([typing(LIVE_OWNER_UID)])).allow, false);
});

// The navigator's accessible name changed with the shared-UI sprite (12 Sep);
// the runner must find the tab control under either renderer's name.
test('the live runner finds the tab navigator under both renderer names', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('./synthetic-live-runner.mjs', import.meta.url), 'utf8');
  const match = source.match(/const CUBE_NAME = (\/.+\/i);/);
  assert.ok(match, 'CUBE_NAME is defined as a regex');
  const pattern = new RegExp(match[1].slice(1, -2), 'i');
  assert.ok(pattern.test('Feed tab model — swipe or use arrow keys to change tabs, hold for menu'), 'WebGL navigator');
  assert.ok(pattern.test('Feed navigator — swipe to switch tabs, tap to open, hold for menu'), 'sprite navigator');
  assert.ok(!pattern.test('Cube hold menu'), 'not the hold menu');
});

test('the cohort engages the owner unless the plist says cohort', () => {
  assert.equal(engagementTarget({}), 'owner');
  assert.equal(engagementTarget({ POPLUR_ENGAGE_TARGET: 'cohort' }), 'cohort');
  assert.equal(engagementTarget({ POPLUR_ENGAGE_TARGET: 'Cohort' }), 'owner', 'exact spelling only');
  assert.equal(engagementTarget({ POPLUR_ENGAGE_TARGET: 'students' }), 'owner', 'never a human');
});

import { existsSync, readFileSync } from 'node:fs';
import {
  LIVE_TEST_ACTIVITY_CONTROL_URL, LIVE_TELEMETRY_BLOCKED_REASON, SYNTHETIC_ACCOUNT_UID_PATTERN, isSyntheticAccountUid,
} from './synthetic-live-actions.mjs';

test('tester telemetry has no live ledger slot: every app call to testActivityControl is refused by name', () => {
  const policy = bound();
  const call = (data, headers = { authorization: 'Bearer id-token-1' }) => policy.inspect({
    method: 'POST', url: LIVE_TEST_ACTIVITY_CONTROL_URL, postData: JSON.stringify({ data }), headers,
  });
  // Every action poplur-clay-map/src/testActivity.ts can send, as the actor
  // itself, with its own bound token. None of them is harmless enough to
  // admit: the desk must never hear from the cohort it drives (19 Sep: 1,142
  // of 2,000 log lines were this one refusal, unnamed).
  const appActions = [
    { action: 'getConsent' },
    { action: 'setConsent', enabled: true },
    { action: 'simulation' },
    { action: 'simulation', enabled: true },
    { action: 'simulationFeed', afterEventAtMs: 0 },
    { action: 'heartbeat', screen: 'feed', status: 'foreground', platform: 'browser', appVersion: '0.1.0' },
    { action: 'post', postKey: POST, place: 'Toronto region', radiusKm: 5 },
    { action: 'radius', postKey: POST, radiusKm: 5, deltaKm: 1, signal: 'like' },
    { action: 'simulationPulse', actor: 'sim-food-001', kind: 'like', place: 'Toronto region', radiusKm: 5 },
    { action: 'dashboard' },
  ];
  for (const data of appActions) {
    const verdict = call(data);
    assert.equal(verdict.allow, false, data.action);
    assert.equal(verdict.kind, 'live-telemetry-blocked', data.action);
    assert.equal(verdict.reason, `${LIVE_TELEMETRY_BLOCKED_REASON} action=${data.action}`, data.action);
    assert.equal(verdict.action, data.action);
  }
  // Not a matter of who asks or how: a stolen token, an empty body, a GET
  // with a query string, all get the same named refusal.
  assert.equal(call({ action: 'getConsent' }, { authorization: 'Bearer stolen' }).kind, 'live-telemetry-blocked');
  const bodyless = policy.inspect({ method: 'POST', url: LIVE_TEST_ACTIVITY_CONTROL_URL, postData: '' });
  assert.equal(bodyless.kind, 'live-telemetry-blocked');
  assert.equal(bodyless.action, 'unknown');
  assert.equal(policy.inspect({ method: 'GET', url: `${LIVE_TEST_ACTIVITY_CONTROL_URL}?action=dashboard` }).kind, 'live-telemetry-blocked');
  // The rule is exactly that endpoint. Any other production function still
  // falls to the generic ledger refusal, and the engagement slot is untouched.
  const other = policy.inspect({
    method: 'POST', url: 'https://us-central1-poplur2025.cloudfunctions.net/testSessionIngest',
    postData: '{}', headers: { authorization: 'Bearer id-token-1' },
  });
  assert.equal(other.allow, false);
  assert.equal(other.kind, 'live-production-blocked');
  assert.equal(policy.inspect({
    method: 'POST', url: LIVE_ENGAGEMENT_FUNCTION_URL,
    postData: JSON.stringify({ data: { postId: 'post-0123456789abcdef', eventId: 'evt_view_000001', kind: 'view' } }),
    headers: { authorization: 'Bearer id-token-1' },
  }).allow, true);
  // A refusal spends nothing from the actor's budgets.
  assert.equal(policy.state.likesGiven, 0);
  assert.equal(policy.state.postIds.size, 0);
  assert.equal(policy.state.profileWrites, 0);
});

test('every live actor is a synthetic account by uid, the rule the app keys telemetry off', () => {
  assert.equal(String(SYNTHETIC_ACCOUNT_UID_PATTERN), '/^(sim|synthetic)-/');
  for (const identity of liveActorIdentities()) {
    assert.equal(identity.uid, identity.actorId, `${identity.actorId} uid is pinned to its actor id`);
    assert.equal(isSyntheticAccountUid(identity.uid), true, identity.actorId);
  }
  assert.equal(isSyntheticAccountUid('synthetic-conquer-blue'), true, 'a Radius Lab poster');
  assert.equal(isSyntheticAccountUid('LiEG6SNtKEZN6eEGeybf0afZnHm1'), false, 'a Firebase uid');
  assert.equal(isSyntheticAccountUid('simone-2024'), false, 'the prefix needs its hyphen');
  assert.equal(isSyntheticAccountUid(''), false);
  assert.equal(isSyntheticAccountUid(null), false);
  assert.equal(isSyntheticAccountUid(undefined), false);
});

test('the clay app keys telemetry off the same synthetic-uid rule and never reports as a cohort actor', () => {
  // The live runner drives the clay app from the sibling checkout (5173), so
  // that checkout is the app under test here, not a copy of it.
  const appSource = new URL('../../../poplur-clay-map/src/testActivity.ts', import.meta.url);
  assert.ok(existsSync(appSource), `poplur-clay-map is expected beside PoplurLandingPage-HTML: ${appSource.pathname}`);
  const source = readFileSync(appSource, 'utf8');
  const fnBody = name => {
    const start = source.indexOf(`function ${name}(`);
    assert.ok(start >= 0, `${name} exists in testActivity.ts`);
    return source.slice(start, source.indexOf('\n}\n', start));
  };
  // One rule, byte-for-byte the runner's.
  assert.match(source, /export const SYNTHETIC_ACCOUNT_UID_PATTERN = \/\^\(sim\|synthetic\)-\/\n/);
  assert.match(fnBody('isSyntheticAccountUid'), /SYNTHETIC_ACCOUNT_UID_PATTERN\.test\(uid\)/);
  // telemetryUid() is the one gate: null for a synthetic account.
  assert.match(fnBody('telemetryUid'), /!isSyntheticAccountUid\(uid\) \? uid : null/);
  // Every automatic reporter and every sync the reporter hook runs sits
  // behind it; consent itself reads as off for the cohort.
  for (const name of ['reportTestActivity', 'reportTestPost', 'reportTestRadius', 'reportSimulationPulse']) {
    assert.match(fnBody(name), /^\s*if \(!telemetryUid\(\)/m, `${name} is gated`);
  }
  assert.match(fnBody('readConsent'), /const uid = telemetryUid\(\)/);
  assert.match(fnBody('loadTestActivityConsent'), /const uid = telemetryUid\(\)/);
  assert.match(fnBody('loadTestSimulation'), /if \(!telemetryUid\(\)\) return isLiveSimulationEnabled\(\)/);
  assert.match(fnBody('pollSimulationFeed'), /!telemetryUid\(\) \|\| simulationFeedInFlight\) return/);
  const hook = fnBody('useTestActivityReporter');
  assert.match(hook, /const syncConsent = \(\) => \{\s+if \(!telemetryUid\(\)\) \{/);
  assert.match(hook, /const syncSimulation = \(\) => \{\s+if \(!telemetryUid\(\) \|\| document\.hidden\) return/);
  assert.match(hook, /document\.hidden \|\| !telemetryUid\(\)\) return\s+void pollSimulationFeed\(\)/);
  // No reporter is left on the old "any signed-in account" gate.
  assert.doesNotMatch(source, /!accountSnapshot\(\)\.authenticated/);
});

// ---------------------------------------------------------------------------
// Live pacing: why an actor never got past its first post (19 Sep 2026).
// ---------------------------------------------------------------------------
import {
  LIVE_ENGAGEMENT_INTERVAL_MS, LIVE_MAX_POSTS_PER_ACTOR, LIVE_POST_INTERVAL_MS, LIVE_POST_RETRY_MS,
  chooseLiveStep, liveStepIsDue, rescheduleFailedLiveStep,
} from './synthetic-live-actions.mjs';
import { LIVE_MAX_CALLS_PER_ACTOR } from './synthetic-social-contract.mjs';

const T0 = Date.parse('2026-09-19T20:00:00Z');
const MIN = 60_000;
/** A signed-in actor the way the runner keeps it, at the moment its first post landed. */
function liveActor(overrides = {}) {
  return {
    journeyIndex: 1,
    postsPublished: 1,
    nextPostAtMs: T0 + LIVE_POST_INTERVAL_MS,
    nextEngageAtMs: T0,
    nextDMAtMs: T0,
    nextReplyAtMs: T0,
    callsPlaced: 0,
    policy: { state: { dmSentTo: new Set(), dmRecipients: new Set() } },
    ...overrides,
  };
}
const stepOf = (plan, method) => plan.find(step => step.method === method);

test('a post is due exactly LIVE_POST_INTERVAL_MS after the last one, and never past the cap', () => {
  const plan = livePlanForActor('sim-food-001');
  const post = stepOf(plan, 'post');
  const actor = liveActor();
  assert.equal(liveStepIsDue(post, actor, T0), false, 'just posted');
  assert.equal(liveStepIsDue(post, actor, T0 + LIVE_POST_INTERVAL_MS - 1), false, 'one ms early');
  assert.equal(liveStepIsDue(post, actor, T0 + LIVE_POST_INTERVAL_MS), true, 'twenty minutes later');
  assert.equal(liveStepIsDue(post, liveActor({ postsPublished: LIVE_MAX_POSTS_PER_ACTOR }), T0 + 2 * LIVE_POST_INTERVAL_MS), false, 'cap reached');
  assert.equal(liveStepIsDue(post, liveActor({ postsPublished: LIVE_MAX_POSTS_PER_ACTOR - 1 }), T0 + LIVE_POST_INTERVAL_MS), true, 'last allowed post');
});

test('timed steps follow their own clocks; navigation steps are always due', () => {
  const plan = livePlanForActor('sim-sports-002');
  const actor = liveActor({ nextEngageAtMs: T0 + 4 * MIN, nextDMAtMs: T0 + 4 * MIN, nextReplyAtMs: T0 + 3 * MIN });
  assert.equal(liveStepIsDue(stepOf(plan, 'engage'), actor, T0), false);
  assert.equal(liveStepIsDue(stepOf(plan, 'engage'), actor, T0 + 4 * MIN), true);
  assert.equal(liveStepIsDue(stepOf(plan, 'dm'), actor, T0 + 4 * MIN), true);
  // The reply step exists only once the opener went out; the DM step then retires.
  assert.equal(liveStepIsDue(stepOf(plan, 'reply'), actor, T0 + 3 * MIN), false, 'nothing to answer before the opener');
  const wrote = liveActor({ policy: { state: { dmSentTo: new Set([LIVE_OWNER_UID]), dmRecipients: new Set([LIVE_OWNER_UID]) } } });
  assert.equal(liveStepIsDue(stepOf(plan, 'reply'), wrote, T0), true);
  assert.equal(liveStepIsDue(stepOf(plan, 'dm'), wrote, T0), false, 'one opener per owner');
  // The owner-call slot is cohort-wide and capped per actor.
  assert.equal(liveStepIsDue(stepOf(plan, 'call'), actor, T0, { nextOwnerCallAtMs: T0 + MIN }), false, 'slot reserved');
  assert.equal(liveStepIsDue(stepOf(plan, 'call'), actor, T0 + MIN, { nextOwnerCallAtMs: T0 + MIN }), true);
  assert.equal(liveStepIsDue(stepOf(plan, 'call'), liveActor({ callsPlaced: LIVE_MAX_CALLS_PER_ACTOR }), T0 + MIN, { nextOwnerCallAtMs: T0 }), false, 'call cap');
  for (const step of plan.filter(step => ['current', 'right', 'left', 'hold', 'escape'].includes(step.method))) {
    assert.equal(liveStepIsDue(step, actor, T0), true, `${step.action} is navigation`);
  }
});

test('a due post is chosen ahead of the lap, wherever the plan keeps it', () => {
  for (const actorId of ACTOR_IDS) {
    const plan = livePlanForActor(actorId);
    const postIndex = plan.findIndex(step => step.method === 'post');
    assert.ok(postIndex > 0, `${actorId} posts`);
    // Twenty minutes after the first post the lap is back at the social steps
    // (index 1) — the exact spot that used to cost a whole lap of Feed walks.
    const actor = liveActor({ journeyIndex: 1 });
    const choice = chooseLiveStep(plan, actor, T0 + LIVE_POST_INTERVAL_MS, { nextOwnerCallAtMs: T0 });
    assert.equal(choice.step.method, 'post', `${actorId}: the post outranks like/DM/call`);
    assert.equal(choice.index, postIndex);
    assert.equal(choice.outOfTurn, postIndex !== 1, `${actorId}: out of turn unless the lap was already there`);
  }
});

test('with no post due, the lap continues from journeyIndex and wraps to 1, never to the opening step', () => {
  const plan = livePlanForActor('sim-sports-002');
  // ['screen-view', like, dm, reply, call, open-map, open-feed, like, dm, post, hold, back, open-feed]
  const early = T0 + MIN;
  const actor = liveActor({ journeyIndex: 1, nextEngageAtMs: T0 + 4 * MIN, nextDMAtMs: T0 + 4 * MIN });
  const choice = chooseLiveStep(plan, actor, early, { nextOwnerCallAtMs: T0 + 5 * MIN });
  assert.equal(choice.step.action, 'open-map', 'like/DM/reply/call are not due; the first navigation step is');
  assert.equal(choice.index, 5);
  assert.equal(choice.outOfTurn, false);
  const atEnd = liveActor({ journeyIndex: plan.length - 1, nextEngageAtMs: T0 + 4 * MIN, nextDMAtMs: T0 + 4 * MIN });
  assert.equal(chooseLiveStep(plan, atEnd, early, { nextOwnerCallAtMs: T0 + 5 * MIN }).step, plan[plan.length - 1]);
  const past = liveActor({ journeyIndex: plan.length, nextEngageAtMs: T0 + 4 * MIN, nextDMAtMs: T0 + 4 * MIN });
  const wrapped = chooseLiveStep(plan, past, early, { nextOwnerCallAtMs: T0 + 5 * MIN });
  assert.equal(wrapped.index, 5, 'wraps to index 1 and walks on to the first due step');
  assert.notEqual(wrapped.step, plan[0], 'the opening screen-view is never replayed');
  assert.equal(chooseLiveStep(plan, liveActor({ journeyIndex: 0 }), early, {}).index >= 1, true, 'index 0 is normalised to 1');
  assert.equal(chooseLiveStep([plan[0]], liveActor(), early, {}), null, 'a plan with nothing after the opener has nothing to run');
});

test('an actor reaches its second, third and fourth post within one run under the real pacing', () => {
  // Reproduce the 19 Sep shape: every social step is due and takes minutes
  // (the Feed walks for an owner post that is not there), the lap is long,
  // and the post used to be looked at only when the lap reached it. With the
  // post outranking the lap, each post lands the moment its clock says so.
  const plan = livePlanForActor('sim-sports-002');
  const cost = { engage: 3 * MIN, dm: 2 * MIN, reply: MIN, call: 2 * MIN, post: 3 * MIN };
  const shared = { nextOwnerCallAtMs: T0 };
  const actor = liveActor({ journeyIndex: 1, postsPublished: 0, nextPostAtMs: T0 + 5 * MIN });
  const published = [];
  let now = T0;
  for (let steps = 0; steps < 400 && published.length < LIVE_MAX_POSTS_PER_ACTOR; steps += 1) {
    const choice = chooseLiveStep(plan, actor, now, shared);
    assert.ok(choice, 'a plan with navigation steps always has something due');
    const { step, outOfTurn } = choice;
    if (!outOfTurn) actor.journeyIndex = choice.index;
    now += 5_000 + (cost[step.method] ?? 5_000);
    if (step.method === 'post') {
      actor.postsPublished += 1;
      actor.nextPostAtMs = now + LIVE_POST_INTERVAL_MS;
      published.push(now);
    } else if (step.method === 'engage') actor.nextEngageAtMs = now + LIVE_ENGAGEMENT_INTERVAL_MS;
    else if (step.method === 'dm') actor.nextDMAtMs = now + LIVE_ENGAGEMENT_INTERVAL_MS;
    else if (step.method === 'reply') actor.nextReplyAtMs = now + LIVE_ENGAGEMENT_INTERVAL_MS;
    else if (step.method === 'call') shared.nextOwnerCallAtMs = now + 5 * MIN;
    if (!outOfTurn) actor.journeyIndex += 1;
    if (actor.journeyIndex >= plan.length) actor.journeyIndex = 1;
  }
  assert.equal(published.length, LIVE_MAX_POSTS_PER_ACTOR, 'all four posts land');
  for (let index = 1; index < published.length; index += 1) {
    const gapMin = (published[index] - published[index - 1]) / MIN;
    assert.ok(gapMin >= 20 && gapMin < 27, `post ${index + 1} followed post ${index} after ${gapMin.toFixed(1)} min — twenty plus at most one step in flight`);
  }
  assert.ok(published[3] - T0 < 90 * MIN, `four posts inside ninety minutes (took ${((published[3] - T0) / MIN).toFixed(0)} min)`);
});

test('a failed step reschedules itself: a post retries in five minutes, social steps wait one interval, navigation is simply retried', () => {
  assert.equal(LIVE_POST_RETRY_MS, LIVE_POST_INTERVAL_MS / 4);
  assert.equal(LIVE_POST_RETRY_MS, 5 * MIN);
  assert.deepEqual(rescheduleFailedLiveStep({ method: 'post' }, T0), { nextPostAtMs: T0 + 5 * MIN });
  assert.deepEqual(rescheduleFailedLiveStep({ method: 'engage' }, T0), { nextEngageAtMs: T0 + LIVE_ENGAGEMENT_INTERVAL_MS });
  assert.deepEqual(rescheduleFailedLiveStep({ method: 'dm' }, T0), { nextDMAtMs: T0 + LIVE_ENGAGEMENT_INTERVAL_MS });
  assert.deepEqual(rescheduleFailedLiveStep({ method: 'reply' }, T0), { nextReplyAtMs: T0 + LIVE_ENGAGEMENT_INTERVAL_MS });
  for (const method of ['right', 'left', 'hold', 'escape', 'current', 'call']) {
    assert.deepEqual(rescheduleFailedLiveStep({ method }, T0), {}, `${method} keeps its clock`);
  }
  // A retried post is still the next thing the actor does once its five minutes are up.
  const actor = liveActor({ journeyIndex: 1, ...rescheduleFailedLiveStep({ method: 'post' }, T0) });
  assert.equal(chooseLiveStep(livePlanForActor('sim-food-001'), actor, T0 + 5 * MIN - 1, {}).step.method, 'engage');
  assert.equal(chooseLiveStep(livePlanForActor('sim-food-001'), actor, T0 + 5 * MIN, {}).step.method, 'post');
});

test('the live runner paces its lap with these helpers and treats an unreachable owner post as a skip', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('./synthetic-live-runner.mjs', import.meta.url), 'utf8');
  assert.match(source, /chooseLiveStep\(plan, actor, Date\.now\(\), \{ nextOwnerCallAtMs \}\)/, 'the loop asks chooseLiveStep');
  assert.match(source, /Object\.assign\(actor, rescheduleFailedLiveStep\(step, Date\.now\(\)\)\)/, 'failures reschedule through the shared helper');
  assert.doesNotMatch(source, /const stepIsDue = /, 'no private copy of the due rule');
  assert.doesNotMatch(source, /throw new Error\('The owner post is not available in the live Feed\.'\)/, 'an absent owner post is not a strike');
  assert.match(source, /if \(!post\) return null;/, 'openOwnerChat answers null instead');
  // The two UI reads behind the 19 Sep strikes: the hold menu is an overlay
  // over a still-visible tab, and a kept composer spot is re-picked through
  // the composer's own LOCATION row instead of waiting for a picker that
  // never mounts.
  assert.match(source, /if \(screens\.includes\('hold'\)\) return 'hold';/, 'the hold menu wins the screen read');
  assert.match(source, /getByRole\('button', \{ name: \/\^LOCATION\\b\/i \}\)/, 'the composer is asked for the picker');
  assert.match(source, /await dismissFailedPost\(actor\);/, 'a failed post is dismissed before the next step');
  assert.match(source, /getByRole\('alertdialog', \{ name: 'This pop replaces one of yours' \}\)/, 'the one-pop-per-place prompt is answered, not waited out');
  assert.match(source, /name: 'Replace it', exact: true/, 'answered by replacing the actor\'s own pop');
  assert.match(source, /\$\{new Date\(\)\.toISOString\(\)\} \[live\]/, 'log lines carry a clock');
  assert.match(source, /await context\.route\('\*\*\/\*', createLiveRouteGuard\(\{ actor, appOrigin, clayOrigin, log, verdictLog \}\)\);/, 'every actor context routes through the guarded factory');
  assert.doesNotMatch(source, /await context\.route\('\*\*\/\*', async route =>/, 'no unguarded inline route handler remains');
});

// The route guard proper. A Playwright Route is four calls; the fake records
// which one the guard ended on, and `fetch` is whatever the test says the
// upstream did — including dying.
import { createLiveRouteGuard } from './synthetic-live-runner.mjs';

const GUARD_APP = 'http://127.0.0.1:8081';
const GUARD_CLAY = 'http://127.0.0.1:5173';
const guardActor = (policy = bound()) => ({
  actorId: 'sim-food-001', uid: 'sim-food-001', policy, lastError: '',
  appliedEngagementIds: new Set(), viewsApplied: 0, likesApplied: 0,
});
const guardHarness = (actor = guardActor()) => {
  const lines = [];
  const guard = createLiveRouteGuard({ actor, appOrigin: GUARD_APP, clayOrigin: GUARD_CLAY, log: message => lines.push(message), verdictLog: false });
  return { actor, lines, guard };
};
const fakeRoute = ({ method = 'POST', url, postData = '', headers = {}, navigation = false, fetch, abort }) => {
  const calls = [];
  return {
    calls,
    request: () => ({
      url: () => url, method: () => method, postData: () => postData, headers: () => headers,
      isNavigationRequest: () => navigation,
    }),
    fetch: async options => { calls.push(['fetch', options]); return fetch(); },
    abort: async code => { calls.push(['abort', code]); if (abort) return abort(); },
    fulfill: async options => { calls.push(['fulfill', options.response]); },
    continue: async () => { calls.push(['continue']); },
  };
};
const upstreamAnswer = ({ status = 200, headers = {}, body = {} } = {}) => ({
  status: () => status, ok: () => status >= 200 && status < 300, headers: () => headers, json: async () => body,
});
const GUARD_POST = 'post-0123456789abcdef0123';
const GUARD_OBJECT = `posts/sim-food-001/${GUARD_POST}.jpg`;
const proxiedRequests = () => ({
  'live-auth-sign-in': {
    url: `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${KEY}`,
    postData: JSON.stringify({ email: 'beta-sim-food-001@poplur.test', password: 'secret-1', returnSecureToken: true }),
  },
  'live-auth-refresh': {
    url: `https://securetoken.googleapis.com/v1/token?key=${KEY}`,
    postData: 'grant_type=refresh_token&refresh_token=refresh-1',
  },
  'live-engagement': {
    url: LIVE_ENGAGEMENT_FUNCTION_URL,
    headers: { authorization: 'Bearer id-token-1' },
    postData: JSON.stringify({ data: { postId: GUARD_POST, eventId: 'event-000001', kind: 'view', surface: 'feed' } }),
  },
  'live-storage-upload': {
    url: `https://firebasestorage.googleapis.com/v0/b/poplur2025.firebasestorage.app/o?name=${encodeURIComponent(GUARD_OBJECT)}&uploadType=resumable`,
    headers: { authorization: 'Firebase id-token-1' },
  },
});

test('the route guard reaches every proxied production call it is asked about', () => {
  const policy = bound();
  for (const [kind, request] of Object.entries(proxiedRequests())) {
    const verdict = policy.inspect({ method: 'POST', postData: '', headers: {}, ...request });
    assert.equal(verdict.allow, true, `${kind} is admitted`);
    assert.equal(verdict.kind, kind, `${kind} is the verdict the guard proxies`);
  }
});

test('a dead upstream socket on any proxied branch aborts that one request and keeps the process alive', async () => {
  // 20 Sep 2026 05:00Z: route.fetch rejected with "socket hang up" on an
  // upload start; the four earlier exits were ECONNRESET, ETIMEDOUT and the
  // 30 s fetch timeout. Each one must now end in abort('failed'), a note on
  // the actor, and exactly one log line — never a rejection out of the guard.
  const failures = ['route.fetch: socket hang up', 'route.fetch: read ECONNRESET', 'route.fetch: read ETIMEDOUT', 'route.fetch: Timeout 30000ms exceeded.'];
  for (const [kind, request] of Object.entries(proxiedRequests())) {
    for (const failure of failures) {
      const { actor, lines, guard } = guardHarness();
      const route = fakeRoute({ ...request, fetch: async () => { throw new Error(`${failure}\nCall log:\n  - some playwright detail`); } });
      await guard(route);
      assert.deepEqual(route.calls.at(-1), ['abort', 'failed'], `${kind}: ${failure} ends in abort('failed')`);
      assert.ok(!route.calls.some(call => call[0] === 'fulfill'), `${kind}: nothing is fulfilled after ${failure}`);
      assert.equal(actor.lastError, `request guard: ${failure}`, `${kind}: the actor records ${failure}`);
      assert.equal(lines.length, 1, `${kind}: one log line for ${failure}`);
      assert.match(lines[0], /^sim-food-001 request guard failed for https:\/\//, 'the line names the actor and the target');
      assert.ok(lines[0].endsWith(`: ${failure}`), 'and carries only the first line of the error');
    }
  }
});

test('the route guard survives a non-Error rejection and an abort that itself fails', async () => {
  const request = proxiedRequests()['live-storage-upload'];
  {
    const { actor, lines, guard } = guardHarness();
    const route = fakeRoute({ ...request, fetch: async () => { throw 'boom'; } });
    await guard(route);
    assert.deepEqual(route.calls.at(-1), ['abort', 'failed']);
    assert.equal(actor.lastError, 'request guard: boom');
    assert.equal(lines.length, 1);
  }
  {
    // The page may already be gone by the time the guard aborts (the actor's
    // context closed mid-request): abort rejects, and that must not escape.
    const { actor, guard } = guardHarness();
    const route = fakeRoute({ ...request, fetch: async () => { throw new Error('route.fetch: socket hang up'); }, abort: async () => { throw new Error('Route is already handled!'); } });
    await assert.doesNotReject(() => guard(route));
    assert.equal(actor.lastError, 'request guard: route.fetch: socket hang up');
  }
});

test('the route guard still binds what a healthy upstream returns', async () => {
  const requests = proxiedRequests();
  {
    // Upload start: the session URL Storage hands back is bound to the post.
    const { actor, guard } = guardHarness();
    const session = `https://firebasestorage.googleapis.com/v0/b/poplur2025.firebasestorage.app/o?name=${encodeURIComponent(GUARD_OBJECT)}&uploadType=resumable&upload_id=abc123`;
    const upstream = upstreamAnswer({ headers: { 'x-goog-upload-url': session } });
    const route = fakeRoute({ ...requests['live-storage-upload'], fetch: async () => upstream });
    await guard(route);
    assert.deepEqual(route.calls.at(-1), ['fulfill', upstream]);
    assert.equal(actor.policy.state.uploadSessions[GUARD_OBJECT], session);
    assert.equal(actor.lastError, '');
  }
  {
    // Upload start answered by a redirect is refused, not followed.
    const { guard } = guardHarness();
    const route = fakeRoute({ ...requests['live-storage-upload'], fetch: async () => upstreamAnswer({ status: 302, headers: { location: 'https://elsewhere.example' } }) });
    await guard(route);
    assert.deepEqual(route.calls.at(-1), ['abort', 'blockedbyclient']);
  }
  {
    // Engagement: the server's applied view is counted once per event id.
    const { actor, lines, guard } = guardHarness();
    const answer = upstreamAnswer({ body: { result: { applied: true, eventId: 'event-000001', kind: 'view', postId: GUARD_POST, counters: { radiusMeters: 5000 } } } });
    const route = fakeRoute({ ...requests['live-engagement'], fetch: async () => answer });
    await guard(route);
    await guard(fakeRoute({ ...requests['live-engagement'], fetch: async () => answer }));
    assert.deepEqual(route.calls.at(-1), ['fulfill', answer]);
    assert.equal(actor.viewsApplied, 1);
    assert.deepEqual([...actor.appliedEngagementIds], ['event-000001']);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /server applied view to post-0123456789abcdef0123; radius=5000/);
  }
  {
    // Refresh: a token for the pinned uid rebinds; the request is fulfilled.
    const { actor, guard } = guardHarness();
    const answer = upstreamAnswer({ body: { id_token: 'id-token-2', refresh_token: 'refresh-2', user_id: 'sim-food-001' } });
    const route = fakeRoute({ ...requests['live-auth-refresh'], fetch: async () => answer });
    await guard(route);
    assert.deepEqual(route.calls.at(-1), ['fulfill', answer]);
    assert.equal(actor.policy.state.idToken, 'id-token-2');
    assert.equal(actor.policy.state.refreshToken, 'refresh-2');
  }
  {
    // Sign-in for a foreign uid is refused after the fetch and noted.
    const { actor, guard } = guardHarness();
    const answer = upstreamAnswer({ body: { localId: 'someone-else', idToken: 'x', refreshToken: 'y' } });
    const route = fakeRoute({ ...requests['live-auth-sign-in'], fetch: async () => answer });
    await guard(route);
    assert.deepEqual(route.calls.at(-1), ['abort', 'blockedbyclient']);
    assert.match(actor.lastError, /did not return the pinned identity/);
  }
});

test('the route guard never fetches what the policy refuses, and lets the local app through untouched', async () => {
  {
    const { guard } = guardHarness();
    const route = fakeRoute({ url: `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${KEY}`, postData: '{}', fetch: async () => { throw new Error('must not be called'); } });
    await guard(route);
    assert.deepEqual(route.calls, [['abort', 'blockedbyclient']]);
  }
  {
    const { guard } = guardHarness();
    const route = fakeRoute({ method: 'GET', url: `${GUARD_CLAY}/assets/index.js`, fetch: async () => { throw new Error('must not be called'); } });
    await guard(route);
    assert.deepEqual(route.calls, [['continue']]);
  }
  {
    // A top-level navigation away from the two loopback origins is blocked
    // before the policy is even asked.
    const { guard } = guardHarness({ ...guardActor(), policy: null });
    const route = fakeRoute({ method: 'GET', url: 'https://example.com/', navigation: true, fetch: async () => { throw new Error('must not be called'); } });
    await guard(route);
    assert.deepEqual(route.calls, [['abort', 'blockedbyclient']]);
  }
});

test('the app runner logs an unhandled rejection instead of letting Node exit', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('./synthetic-app-runner.mjs', import.meta.url), 'utf8');
  assert.match(source, /process\.on\('unhandledRejection', reason => \{/, 'a process-level catcher exists');
  assert.match(source, /unhandled rejection #\$\{unhandledRejections\} kept from exiting the process/, 'it says so, with a running count');
  assert.doesNotMatch(source, /process\.on\('uncaughtException'/, 'a thrown exception still exits: its state cannot be trusted');
});

test('the app runner waits out a Cloud Run "no instance to spare" answer instead of retiring the cohort on it', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('./synthetic-app-runner.mjs', import.meta.url), 'utf8');
  assert.match(source, /const CLOUD_BUSY_STATUSES = new Set\(\[429, 500, 503\]\);/, '429, 500 and 503 are the platform\'s busy answers');
  assert.match(source, /if \(body === null && CLOUD_BUSY_STATUSES\.has\(response\.status\) && busyRetries < CLOUD_BUSY_RETRIES\)/, 'only a non-JSON (platform) answer is retried, bounded');
  const retries = Number(source.match(/const CLOUD_BUSY_RETRIES = (\d+);/)?.[1]);
  const backoff = Number(source.match(/const CLOUD_BUSY_BACKOFF_MS = ([\d_]+);/)?.[1].replace(/_/g, ''));
  assert.ok(retries >= 3 && retries <= 6, 'a few retries, not forever');
  // Linear backoff: the last wait must still be shorter than the scheduler's
  // own start timeout (180 s), or the scheduler gives up on a start that is
  // about to succeed.
  const totalWaitMs = backoff * (retries * (retries + 1)) / 2;
  assert.ok(totalWaitMs < 180_000, `total busy wait ${totalWaitMs} ms fits inside the scheduler's 180 s start timeout`);
});
