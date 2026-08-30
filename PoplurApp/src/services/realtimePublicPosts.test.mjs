import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateRealtimePublicPosts,
  applyRealtimeRadiusBaselines,
  coarsePublicPostRegion,
  normalizeRealtimePublicPost,
  normalizeRealtimeFeedPost,
  normalizeRealtimePublicSnapshot,
} from '../../scripts/realtime-public-post-policy.mjs';
import { createLiveDashboardState } from '../../scripts/test-control-live-state.mjs';

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
  const post = normalizeRealtimePublicPost('post-1', publicPost({ channelId: 'Food', mediaType: 'video' }), NOW);
  assert.ok(post);
  assert.equal(post.place, 'Toronto region');
  assert.equal(post.label, '@noodlescout');
  assert.equal(post.radiusKm, 5);
  assert.equal(post.viralScore, 17);
  assert.equal(post.viralPerHour, 17);
  assert.equal(post.channelId, 'food');
  assert.equal(post.mediaType, 'video');
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

test('keeps hidden-origin public posts in the Feed projection without location data', () => {
  const post = normalizeRealtimeFeedPost('hidden-feed', publicPost({
    privateAccount: true,
    locationVisibility: 'hidden',
    channelId: 'Beauty',
    mediaType: 'photo',
  }));
  assert.ok(post);
  assert.equal(post.channelId, 'beauty');
  assert.equal(post.mediaType, 'photo');
  assert.equal('place' in post, false);
  assert.equal('latitude' in post, false);
  assert.equal('longitude' in post, false);
});

test('the loopback projection never serializes raw post content or coordinates', () => {
  const snapshot = normalizeRealtimePublicSnapshot([
    { id: 'public', data: publicPost({ caption: 'private draft words', mediaURL: 'https://private.invalid/file.jpg' }) },
    { id: 'hidden', data: publicPost({ privateAccount: true, locationVisibility: 'hidden', caption: 'hidden words' }) },
  ], NOW);
  const serialized = JSON.stringify(snapshot);
  assert.equal(serialized.includes('private draft words'), false);
  assert.equal(serialized.includes('hidden words'), false);
  assert.equal(serialized.includes('private.invalid'), false);
  assert.equal(serialized.includes('latitude'), false);
  assert.equal(serialized.includes('longitude'), false);
  assert.equal(serialized.includes('43.65'), false);
  assert.equal(serialized.includes('-79.38'), false);
  assert.equal(snapshot.posts.length, 1);
  assert.equal(snapshot.feed.length, 2);
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
  assert.deepEqual(normalizeRealtimePublicSnapshot([], NOW), { posts: [], cells: [], feed: [] });
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

test('watcher failure clears the cached dashboard before a reconnect can be live', () => {
  const state = createLiveDashboardState();
  state.acceptPublic({ posts: [{ id: 'one' }], cells: [], feed: [] });
  const combined = state.combine({ generatedAtMs: NOW });
  assert.ok(combined);
  state.cache(combined);
  assert.equal(state.cached()?.publicPosts.length, 1);

  state.reset();
  assert.equal(state.cached(), null);
  assert.equal(state.isPublicReady(), false);
  assert.equal(state.combine({ generatedAtMs: NOW + 1 }), null);

  state.acceptPublic({ posts: [], cells: [], feed: [] });
  const recovered = state.combine({ generatedAtMs: NOW + 2 });
  assert.deepEqual(recovered?.publicPosts, []);
});
