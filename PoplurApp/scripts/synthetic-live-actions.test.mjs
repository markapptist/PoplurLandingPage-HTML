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
