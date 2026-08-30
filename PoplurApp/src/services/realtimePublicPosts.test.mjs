import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateRealtimePublicPosts,
  applyRealtimeRadiusBaselines,
  coarsePublicPostRegion,
  normalizeRealtimePublicPost,
  normalizeRealtimePublicSnapshot,
} from './realtimePublicPostPolicy.ts';

const NOW = Date.UTC(2026, 7, 29, 20);
const publicPost = (overrides = {}) => ({
  userID: 'synthetic-food-scout',
  username: 'noodlescout',
  audience: 'public',
  visibilityStatus: 'published',
  locationVisibility: 'approximate',
  latitude: 43.65,
  longitude: -79.38,
  radiusMeters: 5_000,
  createdAt: { seconds: (NOW - 3_600_000) / 1_000 },
  updatedAt: { seconds: NOW / 1_000 },
  viewCount: 10,
  likeCount: 2,
  commentCount: 1,
  ...overrides,
});

test('normalizes a published public approximate post without retaining coordinates', () => {
  const post = normalizeRealtimePublicPost('post-1', publicPost(), NOW);
  assert.ok(post);
  assert.equal(post.place, 'Toronto region');
  assert.equal(post.label, '@noodlescout');
  assert.equal(post.radiusKm, 5);
  assert.equal(post.viralScore, 17);
  assert.equal(post.viralPerHour, 17);
  assert.equal('latitude' in post, false);
  assert.equal('longitude' in post, false);
});

test('fails closed for hidden, private, unpublished, malformed and ownerless posts', () => {
  const rejected = [
    publicPost({ locationVisibility: 'hidden' }),
    publicPost({ privateAccount: true }),
    publicPost({ ghostMode: true }),
    publicPost({ audience: 'friends' }),
    publicPost({ visibilityStatus: 'draft' }),
    publicPost({ userID: undefined }),
    publicPost({ latitude: 120 }),
    publicPost({ createdAt: undefined }),
  ];
  rejected.forEach((row, index) => assert.equal(
    normalizeRealtimePublicPost(`rejected-${index}`, row, NOW),
    null,
  ));
  assert.ok(normalizeRealtimePublicPost('legacy-native', publicPost({
    audience: undefined,
    visibilityStatus: undefined,
  }), NOW));
});

test('maps approximate points to broad deterministic regions', () => {
  assert.equal(coarsePublicPostRegion(51.5, -0.1), 'London region');
  assert.equal(coarsePublicPostRegion(45.42, -75.7), 'Ottawa–Gatineau region');
  assert.equal(coarsePublicPostRegion(45.5, -73.57), 'Montréal region');
  assert.equal(coarsePublicPostRegion(-23.5, -46.6), 'Central and South America region');
  assert.equal(coarsePublicPostRegion(-33.9, 151.2), 'Oceania region');
  assert.equal(coarsePublicPostRegion(Number.NaN, 1), null);
});

test('aggregates realtime replacements and immediately represents an empty collection', () => {
  const first = normalizeRealtimePublicPost('one', publicPost(), NOW);
  const second = normalizeRealtimePublicPost('two', publicPost({
    userID: 'runner-two',
    latitude: 48.86,
    longitude: 2.35,
    radiusMeters: 8_000,
    source: 'synthetic-browser',
    syntheticBeta: true,
  }), NOW);
  assert.ok(first && second);
  const cells = aggregateRealtimePublicPosts([first, second]);
  assert.deepEqual(cells.map(cell => [cell.place, cell.events]), [
    ['Paris region', 1],
    ['Toronto region', 1],
  ]);
  assert.equal(cells.find(cell => cell.place === 'Paris region')?.syntheticEvents, 1);
  assert.deepEqual(normalizeRealtimePublicSnapshot([], NOW), { posts: [], cells: [] });
});

test('tracks radius changes only while a post remains in the bounded realtime window', () => {
  const baselines = new Map();
  const first = normalizeRealtimePublicPost('one', publicPost({ radiusMeters: 5_000 }), NOW);
  const changed = normalizeRealtimePublicPost('one', publicPost({ radiusMeters: 8_500 }), NOW);
  assert.ok(first && changed);

  const [initial] = applyRealtimeRadiusBaselines([first], baselines);
  const [updated] = applyRealtimeRadiusBaselines([changed], baselines);
  assert.equal(initial.radiusDeltaKm, 0);
  assert.equal(updated.initialRadiusKm, 5);
  assert.equal(updated.radiusDeltaKm, 3.5);

  assert.deepEqual(applyRealtimeRadiusBaselines([], baselines), []);
  assert.equal(baselines.size, 0);
});
