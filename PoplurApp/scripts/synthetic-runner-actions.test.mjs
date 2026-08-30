import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import {
  ACTOR_IDS,
  MAX_FRAMES_PER_ACTOR,
  POPLUR_APP_ORIGIN,
  PROHIBITED_CONTROL_NAME,
  SAFE_EVENT_SCREENS,
  SYNTHETIC_ACTORS,
  createFrameRing,
  endIngestRequest,
  eventIngestRequest,
  eventTypeForAction,
  frameMetadata,
  isAllowedAppURL,
  isAllowedEvent,
  isBlockedWriteRequest,
  planForActor,
  pushFrame,
  startIngestRequest,
  statusIngestRequest,
  validateCredentialDocument,
} from './synthetic-runner-actions.mjs';

test('cohort contains exactly the five real-browser actors', () => {
  assert.equal(SYNTHETIC_ACTORS.length, 5);
  assert.equal(new Set(ACTOR_IDS).size, 5);
  assert.deepEqual(ACTOR_IDS, [
    'sim-food-001',
    'sim-sports-002',
    'sim-music-003',
    'sim-tech-004',
    'sim-news-005',
  ]);
});

test('every planned action is read-only and remains on a validated top-level screen', () => {
  for (const actorId of ACTOR_IDS) {
    const plan = planForActor(actorId);
    assert.ok(plan.length >= 5);
    assert.equal(plan[0].screen, 'feed');
    for (const step of plan) {
      const eventType = eventTypeForAction(step.action);
      assert.equal(isAllowedEvent(step.screen, step.action, eventType), true, `${actorId}:${step.action}`);
      assert.equal(SAFE_EVENT_SCREENS.has(step.screen), true);
      assert.equal(PROHIBITED_CONTROL_NAME.test(step.action), false);
    }
  }
});

test('runner accepts only the loopback Poplur app origin', () => {
  assert.equal(isAllowedAppURL(`${POPLUR_APP_ORIGIN}/?view=feed`), true);
  assert.equal(isAllowedAppURL('http://localhost:5173/?view=feed'), false);
  assert.equal(isAllowedAppURL('https://poplur.com/'), false);
  assert.equal(isAllowedAppURL('not a url'), false);
});

test('browser safety filter permits Firebase sign-in but blocks content writes', () => {
  assert.equal(isBlockedWriteRequest('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=x', 'POST'), false);
  assert.equal(isBlockedWriteRequest('https://firestore.googleapis.com/v1/projects/x/databases/(default)/documents:commit', 'POST'), true);
  assert.equal(isBlockedWriteRequest('https://firestore.googleapis.com/google.firestore.v1.Firestore/Write/channel?database=x', 'POST'), true);
  assert.equal(isBlockedWriteRequest('https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel?database=x', 'POST'), false);
  assert.equal(isBlockedWriteRequest('https://poplur-default-rtdb.firebaseio.com/calls/1.json', 'PATCH'), true);
  assert.equal(isBlockedWriteRequest('https://us-central1-poplur2025.cloudfunctions.net/createCheckout', 'POST'), true);
  assert.equal(isBlockedWriteRequest('https://example.com/image.png', 'GET'), false);
});

test('credentials require one distinct account for every actor', () => {
  const actors = ACTOR_IDS.map((actorId, index) => ({
    actorId,
    email: `runner-${index}@example.test`,
    password: `secret-${index}`,
    uid: actorId,
  }));
  assert.equal(validateCredentialDocument({ actors }).length, 5);
  assert.throws(() => validateCredentialDocument({ actors: actors.slice(0, 4) }), /exactly 5/);
  assert.throws(() => validateCredentialDocument({ actors: actors.map((row, index) => ({
    ...row,
    email: index === 4 ? actors[0].email : row.email,
  })) }), /distinct/);
  assert.throws(() => validateCredentialDocument({ actors: actors.map((row, index) => ({
    ...row,
    uid: index === 4 ? 'different-runner' : row.uid,
  })) }), /must pin Firebase UID/);
});

test('frame ring never retains more than 120 in-memory frames', () => {
  const ring = createFrameRing();
  for (let sequence = 1; sequence <= MAX_FRAMES_PER_ACTOR + 9; sequence += 1) {
    pushFrame(ring, { sequence, capturedAtMs: sequence, screen: 'feed', action: 'idle', frameSuppressed: false, image: Buffer.from([sequence % 255]) });
  }
  assert.equal(ring.length, MAX_FRAMES_PER_ACTOR);
  assert.equal(ring[0].sequence, 10);
  assert.equal(ring.at(-1).sequence, 129);
  assert.match(frameMetadata('sim-food-001', ring.at(-1)).imageUrl, /sequence=129$/);
});

test('strict ingest builders contain no client-generated or generation keys', () => {
  const actorId = ACTOR_IDS[0];
  assert.deepEqual(Object.keys(statusIngestRequest(actorId)), ['type', 'actorId']);
  assert.deepEqual(Object.keys(startIngestRequest(actorId, 100)), ['type', 'actorId', 'occurredAtMs']);
  const event = eventIngestRequest({
    actorId,
    sessionId: 'session-1',
    sequence: 1,
    occurredAtMs: 101,
    screen: 'feed',
    action: 'screen-view',
    localFrameSequence: 1,
    frameSuppressed: false,
    dwellMs: 0,
    stepIndex: 0,
    journeyLength: 5,
    eventType: 'discovery',
  });
  assert.deepEqual(Object.keys(event), [
    'type', 'actorId', 'sessionId', 'sequence', 'occurredAtMs', 'screen', 'action',
    'status', 'localFrameSequence', 'frameSuppressed', 'dwellMs', 'stepIndex',
    'journeyLength', 'eventType',
  ]);
  assert.equal('generation' in event || 'eventId' in event || 'priorScreen' in event, false);
  const end = endIngestRequest({ actorId, sessionId: 'session-1', sequence: 2, occurredAtMs: 102, reason: 'owner-paused' });
  assert.deepEqual(Object.keys(end), ['type', 'actorId', 'sessionId', 'sequence', 'occurredAtMs', 'status', 'reason']);
});
