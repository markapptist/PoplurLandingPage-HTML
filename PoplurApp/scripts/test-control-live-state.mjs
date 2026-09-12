export const emptyPublicSnapshot = () => ({ posts: [], cells: [], feed: [] });

/** A foreground lease lasts two minutes (PRESENCE_LEASE_MS, fn/appPresence.ts:7). */
export const PRESENCE_LEASE_MS = 120_000;
/** Watcher-triggered cloud `dashboard` calls run at most once per floor (env POPLUR_LIVE_REFRESH_MIN_MS). */
export const LIVE_REFRESH_MIN_MS_DEFAULT = 300_000;
/** A reconnect inside this window of an upstream failure must not re-earn LIVE with a fresh call. */
export const UPSTREAM_FAILURE_GUARD_MS = 15_000;

/** The env override for the floor: whole milliseconds, 0 (off) to one hour; anything else is the default. */
export function parseRefreshFloorMs(value, fallback = LIVE_REFRESH_MIN_MS_DEFAULT) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 3_600_000) return fallback;
  return parsed;
}

const leaseLive = (lease, now) => lease.activeUntilMs > now && lease.activeUntilMs <= now + PRESENCE_LEASE_MS;

/** The tester table's order (fn/testActivity.ts:193-197): online first, then the freshest signal. */
const presenceRank = row => (row?.presence === 'online' ? 0 : row?.presence === 'away' ? 1 : 2);
const compareTesterRows = (a, b) => presenceRank(a) - presenceRank(b)
  || (b?.lastActivityAtMs ?? 0) - (a?.lastActivityAtMs ?? 0)
  || (b?.lastPostedAtMs ?? 0) - (a?.lastPostedAtMs ?? 0)
  || (b?.signedUpAtMs ?? 0) - (a?.signedUpAtMs ?? 0);

/**
 * Merge the live foreground leases into the cloud's tester rows the way the
 * cloud does it (buildTesterTable, fn/testActivity.ts:130-171): a live
 * non-synthetic lease makes the row online by lease; a row the cloud marked
 * online by a lease that has since lapsed drops to away. Heartbeat-decided rows
 * are left to the next cloud call — the proxy cannot see heartbeat freshness.
 */
export function mergePresenceIntoTesters(rows, leases, now) {
  if (!Array.isArray(rows) || !Array.isArray(leases)) return rows;
  const liveUntil = new Map();
  for (const lease of leases) {
    if (!lease || typeof lease.uid !== 'string' || !lease.uid || lease.synthetic) continue;
    if (!leaseLive(lease, now)) continue;
    liveUntil.set(lease.uid, Math.max(liveUntil.get(lease.uid) ?? 0, lease.activeUntilMs));
  }
  return rows.map(row => {
    if (!row || typeof row !== 'object' || typeof row.uid !== 'string') return row;
    if (liveUntil.has(row.uid)) {
      if (row.presence === 'online' && row.presenceSource === 'lease') return row;
      return { ...row, presence: 'online', presenceSource: 'lease', lastActivityAtMs: Math.max(row.lastActivityAtMs ?? 0, now) };
    }
    if (row.presence === 'online' && row.presenceSource === 'lease') {
      // The lease is what made the row online; without it the row has been
      // seen (a lease is a sign-in) but is not here now.
      return { ...row, presence: 'away', presenceSource: row.screen || row.platform ? 'heartbeat' : 'none' };
    }
    return row;
  }).sort(compareTesterRows);
}

/** Small state holder that makes stale-green reconnects impossible. */
export function createLiveDashboardState() {
  let cachedDashboard = null;
  let publicSnapshot = emptyPublicSnapshot();
  let publicReady = false;
  // The digest watcher's last normalised document; null until seen (§4.2).
  let algorithm = null;
  // The presence watcher's last lease set; null until its first snapshot.
  let presenceLeases = null;
  // The last private dashboard the cloud returned, so a local change (digest,
  // presence, public frame) can be re-broadcast without a cloud call.
  let lastPrivate = null;
  const state = {
    reset() {
      cachedDashboard = null;
      publicSnapshot = emptyPublicSnapshot();
      publicReady = false;
      algorithm = null;
      presenceLeases = null;
      lastPrivate = null;
    },
    acceptPublic(snapshot) {
      publicSnapshot = snapshot;
      publicReady = true;
    },
    isPublicReady() { return publicReady; },
    acceptAlgorithm(digest) {
      algorithm = digest && typeof digest === 'object' ? digest : null;
    },
    algorithm() { return algorithm; },
    acceptPresence(leases) {
      presenceLeases = (Array.isArray(leases) ? leases : [])
        .filter(lease => lease && typeof lease.uid === 'string' && lease.uid)
        .map(lease => ({
          uid: lease.uid,
          synthetic: lease.synthetic === true,
          activeUntilMs: Number.isFinite(Number(lease.activeUntilMs)) ? Number(lease.activeUntilMs) : 0,
        }));
    },
    presence() { return presenceLeases; },
    hasPrivate() { return lastPrivate != null; },
    combine(privateDashboard, now = Date.now()) {
      if (privateDashboard && typeof privateDashboard === 'object') lastPrivate = privateDashboard;
      if (!publicReady || !lastPrivate) return null;
      return {
        ...lastPrivate,
        ...(presenceLeases && Array.isArray(lastPrivate.testers)
          ? { testers: mergePresenceIntoTesters(lastPrivate.testers, presenceLeases, now) }
          : {}),
        publicPosts: publicSnapshot.posts,
        publicMap: publicSnapshot.cells,
        publicFeed: publicSnapshot.feed,
        algorithm,
      };
    },
    /** Re-fold the last private dashboard; null until one has arrived (no broadcast). */
    recombine(now = Date.now()) {
      return lastPrivate ? state.combine(lastPrivate, now) : null;
    },
    cache(dashboard) { cachedDashboard = dashboard; },
    cached() { return cachedDashboard; },
  };
  return state;
}

/** What openLiveStream does for a new client: replay the cache, say the upstream is down, or refresh. */
export function liveStreamOpenPlan({ cached, failedAtMs, now = Date.now(), guardMs = UPSTREAM_FAILURE_GUARD_MS }) {
  if (cached) return 'cached';
  if (failedAtMs && now - failedAtMs < guardMs) return 'upstream-down';
  return 'refresh';
}

/**
 * The refresh scheduler with the floor. `run()` resolves 'called' when it made
 * a cloud call (or tried and failed) and 'skipped' when it did not; only a
 * call stamps the floor, so a refresh that found the public snapshot not yet
 * ready never delays the first real one by five minutes. A change inside the
 * floor re-arms the timer for the floor's end, so a storm of watcher changes
 * costs one call now and one when the floor lifts.
 */
export function createLiveRefreshScheduler({
  minIntervalMs = LIVE_REFRESH_MIN_MS_DEFAULT,
  debounceMs = 100,
  rerunMs = 40,
  run,
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  if (typeof run !== 'function') throw new Error('createLiveRefreshScheduler needs run().');
  let timer = null;
  let inFlight = false;
  let again = false;
  let lastCalledAtMs = null;
  let calls = 0;
  const earliestMs = () => (lastCalledAtMs == null ? 0 : lastCalledAtMs + minIntervalMs);

  function schedule(delayMs = debounceMs) {
    if (timer) clearTimer(timer);
    const delay = Math.max(delayMs, earliestMs() - now());
    timer = setTimer(() => { timer = null; void fire(); }, delay);
  }

  async function fire() {
    if (inFlight) { again = true; return; }
    const wait = earliestMs() - now();
    if (wait > 0) { schedule(wait); return; }
    inFlight = true;
    const startedAt = now();
    let outcome = 'skipped';
    try {
      outcome = await run();
    } catch {
      outcome = 'called';
    } finally {
      if (outcome === 'called') { lastCalledAtMs = startedAt; calls += 1; }
      inFlight = false;
      if (again) { again = false; schedule(rerunMs); }
    }
  }

  return {
    schedule,
    cancel() {
      if (timer) clearTimer(timer);
      timer = null;
      again = false;
    },
    pending() { return timer != null; },
    calls() { return calls; },
    lastCalledAtMs() { return lastCalledAtMs; },
  };
}
