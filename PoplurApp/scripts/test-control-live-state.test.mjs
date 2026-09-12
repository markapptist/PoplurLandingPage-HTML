import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIVE_REFRESH_MIN_MS_DEFAULT,
  PRESENCE_LEASE_MS,
  UPSTREAM_FAILURE_GUARD_MS,
  createLiveDashboardState,
  createLiveRefreshScheduler,
  liveStreamOpenPlan,
  mergePresenceIntoTesters,
  parseRefreshFloorMs,
} from './test-control-live-state.mjs';

const NOW = Date.UTC(2026, 8, 11, 20);

const tester = (uid, overrides = {}) => ({
  uid,
  label: uid,
  presence: 'away',
  presenceSource: 'none',
  lastActivityAtMs: NOW - 3_600_000,
  lastPostedAtMs: 0,
  signedUpAtMs: NOW - 86_400_000,
  screen: '',
  platform: '',
  synthetic: false,
  ...overrides,
});

const privateDashboard = (overrides = {}) => ({
  generatedAtMs: NOW,
  testers: [tester('mark', { lastActivityAtMs: NOW - 600_000 }), tester('tester-a'), tester('tester-b', { screen: 'feed', platform: 'native' })],
  counts: { realTesters: 1 },
  ...overrides,
});

/** Deterministic timers for the scheduler: fire in due order, await the async run each time. */
function fakeClock(start = NOW) {
  let now = start;
  let sequence = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimer(callback, delay) {
      const id = ++sequence;
      timers.set(id, { at: now + Math.max(0, delay), callback });
      return id;
    },
    clearTimer(id) { timers.delete(id); },
    async advance(ms) {
      const target = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        const [id, timer] = due;
        timers.delete(id);
        now = Math.max(now, timer.at);
        timer.callback();
        // Let the async run() settle before the next timer.
        for (let i = 0; i < 4; i += 1) await Promise.resolve();
      }
      now = target;
    },
    pending: () => timers.size,
  };
}

test('recombine is null before any private dashboard, carries algorithm after acceptAlgorithm, and reset clears all', () => {
  const state = createLiveDashboardState();
  assert.equal(state.recombine(NOW), null);
  state.acceptAlgorithm({ version: 1, digestVersion: 41 });
  assert.equal(state.recombine(NOW), null, 'no broadcast until a private dashboard arrives');
  state.acceptPublic({ posts: [{ id: 'one' }], cells: [], feed: [] });
  assert.equal(state.recombine(NOW), null);
  const combined = state.combine(privateDashboard(), NOW);
  assert.deepEqual(combined.algorithm, { version: 1, digestVersion: 41 });
  assert.equal(combined.publicPosts.length, 1);
  assert.equal(combined.testers.length, 3);
  const again = state.recombine(NOW);
  assert.deepEqual(again.algorithm, { version: 1, digestVersion: 41 });
  assert.equal(again.generatedAtMs, NOW);
  state.acceptAlgorithm({ version: 1, digestVersion: 42 });
  assert.equal(state.recombine(NOW).algorithm.digestVersion, 42, 'a digest write re-folds the last private frame');
  state.acceptAlgorithm(null);
  assert.equal(state.recombine(NOW).algorithm, null);
  state.acceptAlgorithm({ version: 1, digestVersion: 43 });
  state.reset();
  assert.equal(state.algorithm(), null);
  assert.equal(state.presence(), null);
  assert.equal(state.hasPrivate(), false);
  assert.equal(state.recombine(NOW), null);
  assert.equal(state.cached(), null);
  state.acceptPublic({ posts: [], cells: [], feed: [] });
  assert.equal(state.combine(privateDashboard(), NOW).algorithm, null, 'after a reset the digest is re-accepted from the watcher, never remembered');
});

test('combine without a public snapshot stores the private frame but returns null', () => {
  const state = createLiveDashboardState();
  assert.equal(state.combine(privateDashboard(), NOW), null);
  assert.equal(state.hasPrivate(), true);
  state.acceptPublic({ posts: [{ id: 'p' }], cells: [], feed: [] });
  const frame = state.recombine(NOW);
  assert.equal(frame.publicPosts.length, 1);
  assert.equal(frame.algorithm, null);
});

test('a synthetic lease on a listed actor row makes it online — a tester in the app is online (owner, 12 Sep)', () => {
  const state = createLiveDashboardState();
  state.acceptPublic({ posts: [], cells: [], feed: [] });
  state.combine(privateDashboard({ testers: [tester('mark'), tester('sim-food-001', { synthetic: true })] }), NOW);
  state.acceptPresence([{ uid: 'sim-food-001', synthetic: true, activeUntilMs: NOW + 90_000 }]);
  const row = state.recombine(NOW).testers.find(r => r.uid === 'sim-food-001');
  assert.equal(row.presence, 'online');
  assert.equal(row.presenceSource, 'lease');
  assert.equal(row.synthetic, true, 'the split stays visible on the row');
});

test('a presence lease flips a tester row to online locally and drops it to away when the lease lapses', () => {
  const state = createLiveDashboardState();
  state.acceptPublic({ posts: [], cells: [], feed: [] });
  state.combine(privateDashboard(), NOW);
  state.acceptPresence([
    { uid: 'tester-a', synthetic: false, activeUntilMs: NOW + 90_000 },
    { uid: 'sim-food-scout', synthetic: true, activeUntilMs: NOW + 90_000 },
    { uid: 'tester-b', synthetic: false, activeUntilMs: NOW - 1 },
    { uid: '', synthetic: false, activeUntilMs: NOW + 90_000 },
  ]);
  const frame = state.recombine(NOW);
  const rowA = frame.testers.find(row => row.uid === 'tester-a');
  assert.equal(rowA.presence, 'online');
  assert.equal(rowA.presenceSource, 'lease');
  assert.equal(rowA.lastActivityAtMs, NOW);
  assert.equal(frame.testers[0].uid, 'tester-a', 'online rows sort first, as the cloud sorts them');
  assert.equal(frame.testers.find(row => row.uid === 'tester-b').presence, 'away', 'an expired lease is not online');
  assert.ok(!frame.testers.some(row => row.uid === 'sim-food-scout'), 'a lease for a uid the cloud does not list adds no row');
  // 100 s later the lease has lapsed with no Firestore event: the re-issued
  // query's snapshot re-folds the same leases and the row drops to away.
  const later = state.recombine(NOW + 100_000);
  const lapsed = later.testers.find(row => row.uid === 'tester-a');
  assert.equal(lapsed.presence, 'away');
  assert.equal(lapsed.presenceSource, 'none');
  assert.equal(later.testers[0].uid, 'mark', 'the freshest signal leads again');
});

test('mergePresenceIntoTesters mirrors buildTesterTable: lease window, freshest lease, heartbeat rows untouched', () => {
  const rows = [
    tester('lease-online', { presence: 'online', presenceSource: 'lease', lastActivityAtMs: NOW - 30_000, screen: 'map', platform: 'browser' }),
    tester('beat-online', { presence: 'online', presenceSource: 'heartbeat', lastActivityAtMs: NOW - 10_000, screen: 'feed', platform: 'native' }),
    tester('far-future', {}),
  ];
  const merged = mergePresenceIntoTesters(rows, [
    { uid: 'far-future', synthetic: false, activeUntilMs: NOW + PRESENCE_LEASE_MS + 1 },
    { uid: 'lease-online', synthetic: false, activeUntilMs: NOW + 10 },
    { uid: 'lease-online', synthetic: false, activeUntilMs: NOW + 60_000 },
  ], NOW);
  const byUid = Object.fromEntries(merged.map(row => [row.uid, row]));
  assert.equal(byUid['far-future'].presence, 'away', 'a lease beyond the window is a clock skew, not presence');
  assert.equal(byUid['lease-online'].presence, 'online');
  assert.equal(byUid['lease-online'].lastActivityAtMs, NOW - 30_000, 'a row already online by lease is left as the cloud built it');
  assert.equal(byUid['beat-online'].presence, 'online', 'heartbeat rows are the cloud call\'s to decide');
  const lapsed = mergePresenceIntoTesters(rows, [], NOW);
  assert.equal(lapsed.find(row => row.uid === 'lease-online').presence, 'away');
  assert.equal(lapsed.find(row => row.uid === 'lease-online').presenceSource, 'heartbeat', 'a screen means a heartbeat once existed');
  assert.equal(lapsed.find(row => row.uid === 'beat-online').presence, 'online');
  assert.equal(mergePresenceIntoTesters('rows', [], NOW), 'rows');
  assert.deepEqual(mergePresenceIntoTesters([null, 3], [], NOW), [null, 3]);
});

test('a public-posts change re-folds locally with no cloud call', () => {
  const state = createLiveDashboardState();
  state.acceptPublic({ posts: [{ id: 'one' }], cells: [{ region: 'Toronto region' }], feed: [] });
  state.combine(privateDashboard(), NOW);
  state.acceptPublic({ posts: [{ id: 'one' }, { id: 'two' }], cells: [{ region: 'Toronto region' }], feed: [{ id: 'two' }] });
  const frame = state.recombine(NOW);
  assert.equal(frame.publicPosts.length, 2);
  assert.equal(frame.publicFeed.length, 1);
  assert.equal(frame.generatedAtMs, NOW, 'the private part is the last cloud result, untouched');
});

test('openLiveStream replays the cache, reports the upstream down inside 15 s of a failure, else refreshes', () => {
  assert.equal(UPSTREAM_FAILURE_GUARD_MS, 15_000);
  assert.equal(liveStreamOpenPlan({ cached: { generatedAtMs: NOW }, failedAtMs: NOW - 1_000, now: NOW }), 'cached');
  assert.equal(liveStreamOpenPlan({ cached: null, failedAtMs: NOW - 1_000, now: NOW }), 'upstream-down');
  assert.equal(liveStreamOpenPlan({ cached: null, failedAtMs: NOW - 14_999, now: NOW }), 'upstream-down');
  assert.equal(liveStreamOpenPlan({ cached: null, failedAtMs: NOW - 15_000, now: NOW }), 'refresh');
  assert.equal(liveStreamOpenPlan({ cached: null, failedAtMs: 0, now: NOW }), 'refresh');
});

test('refresh floor: 50 watcher changes inside 300 s produce exactly one cloud call, and one more at the floor\'s end', async () => {
  const clock = fakeClock();
  let calls = 0;
  const scheduler = createLiveRefreshScheduler({
    minIntervalMs: LIVE_REFRESH_MIN_MS_DEFAULT,
    run: async () => { calls += 1; return 'called'; },
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  scheduler.schedule();
  await clock.advance(100);
  assert.equal(calls, 1, 'the first change runs after the 100 ms debounce');
  for (let change = 1; change <= 50; change += 1) {
    await clock.advance(5_000);
    scheduler.schedule();
  }
  assert.equal(calls, 1, 'fifty changes inside the floor cost nothing');
  assert.equal(scheduler.pending(), true, 'one refresh is due at the floor\'s end');
  await clock.advance(LIVE_REFRESH_MIN_MS_DEFAULT);
  assert.equal(calls, 2, 'exactly one more at the floor\'s end');
  assert.equal(scheduler.pending(), false);
  await clock.advance(LIVE_REFRESH_MIN_MS_DEFAULT);
  assert.equal(calls, 2, 'nothing runs without a change');
  scheduler.schedule(0);
  await clock.advance(0);
  assert.equal(calls, 3, 'outside the floor a change runs at once');
});

test('refresh floor stamps only real calls and coalesces a change that lands mid-call', async () => {
  const clock = fakeClock();
  let publicReady = false;
  let calls = 0;
  let resolveCall = null;
  const scheduler = createLiveRefreshScheduler({
    minIntervalMs: 300_000,
    run: () => {
      if (!publicReady) return Promise.resolve('skipped');
      calls += 1;
      return new Promise(resolve => { resolveCall = () => resolve('called'); });
    },
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  scheduler.schedule(0);
  await clock.advance(0);
  assert.equal(calls, 0);
  assert.equal(scheduler.lastCalledAtMs(), null, 'a skipped run does not start the floor');
  publicReady = true;
  scheduler.schedule();
  await clock.advance(100);
  assert.equal(calls, 1, 'the first real call is not delayed by the skipped one');
  scheduler.schedule();
  await clock.advance(100);
  assert.equal(calls, 1, 'a change while the call is in flight waits for it');
  resolveCall();
  for (let i = 0; i < 4; i += 1) await Promise.resolve();
  assert.equal(scheduler.pending(), true, 'the coalesced rerun is armed for the floor\'s end');
  await clock.advance(299_000);
  assert.equal(calls, 1);
  await clock.advance(2_000);
  assert.equal(calls, 2);
  resolveCall();
  for (let i = 0; i < 4; i += 1) await Promise.resolve();
  scheduler.schedule();
  scheduler.cancel();
  await clock.advance(400_000);
  assert.equal(calls, 2, 'cancel drops the armed refresh');
  const failing = createLiveRefreshScheduler({ minIntervalMs: 300_000, run: async () => { throw new Error('cloud down'); }, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  failing.schedule(0);
  await clock.advance(0);
  assert.equal(failing.calls(), 1, 'a failed call still counts against the floor');
});

test('the floor is read from the environment with bounds', () => {
  assert.equal(parseRefreshFloorMs(undefined), LIVE_REFRESH_MIN_MS_DEFAULT);
  assert.equal(parseRefreshFloorMs(''), LIVE_REFRESH_MIN_MS_DEFAULT);
  assert.equal(parseRefreshFloorMs('60000'), 60_000);
  assert.equal(parseRefreshFloorMs('0'), 0);
  assert.equal(parseRefreshFloorMs('-1'), LIVE_REFRESH_MIN_MS_DEFAULT);
  assert.equal(parseRefreshFloorMs('3600001'), LIVE_REFRESH_MIN_MS_DEFAULT);
  assert.equal(parseRefreshFloorMs('soon'), LIVE_REFRESH_MIN_MS_DEFAULT);
  assert.equal(parseRefreshFloorMs('1.5'), LIVE_REFRESH_MIN_MS_DEFAULT);
});

// Firestore rejects .select() on real-time listeners; a projected presence
// query took every watcher down on 12 Sep. Pin the query shape at the source.
test('presence watcher issues no select() projection', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('./test-control-proxy.mjs', import.meta.url), 'utf8');
  // The query chain: from the collection() call to its onSnapshot(), code only.
  const start = source.indexOf("collection('appPresenceSessions')");
  assert.ok(start > 0, 'presence watcher present');
  const chain = source.slice(start, source.indexOf('.onSnapshot(', start)).replace(/\/\/.*$/gm, '');
  assert.ok(!/\.select\(/.test(chain), 'no .select() on the real-time presence query');
});
