import type { DocumentData } from 'firebase/firestore';
import type { BetaMapCell, BetaPostRow } from './testControl';

const MAX_RADIUS_METERS = 40_075_000;

export type RealtimePublicPost = BetaPostRow & {
  source: 'firestore';
  synthetic: boolean;
};

export type RealtimePublicPostSnapshot = {
  posts: RealtimePublicPost[];
  cells: BetaMapCell[];
};

const text = (value: unknown, maximum = 120): string => typeof value === 'string'
  ? value.trim().replace(/\s+/g, ' ').slice(0, maximum)
  : '';

const finite = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const metric = (value: unknown, maximum = Number.MAX_SAFE_INTEGER): number => {
  const parsed = finite(value);
  return parsed == null ? 0 : Math.max(0, Math.min(maximum, parsed));
};

const timestampMs = (value: unknown): number => {
  if (value && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    const parsed = Number((value as { toMillis: () => number }).toMillis());
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }
  if (value && typeof value === 'object') {
    const source = value as { seconds?: unknown; _seconds?: unknown };
    const seconds = finite(source.seconds ?? source._seconds);
    return seconds == null ? 0 : Math.max(0, seconds * 1_000);
  }
  return metric(value);
};

/**
 * Inspect the public approximate point only long enough to choose one broad
 * bucket. No coordinate, cell number or hidden origin leaves this helper.
 */
export function coarsePublicPostRegion(latitude: number, longitude: number): string | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
    || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  if (latitude > 43.2 && latitude < 44.1 && longitude > -80.3 && longitude < -78.7) return 'Toronto region';
  if (latitude > 40.3 && latitude < 41.1 && longitude > -74.5 && longitude < -73.3) return 'New York region';
  if (latitude > 49 && latitude < 49.7 && longitude > -123.6 && longitude < -122.5) return 'Vancouver region';
  if (latitude > 51.1 && latitude < 51.8 && longitude > -114.6 && longitude < -113.6) return 'Calgary region';
  if (latitude > 44.9 && latitude < 46 && longitude > -76.5 && longitude < -75) return 'Ottawa–Gatineau region';
  if (latitude > 45.1 && latitude < 46 && longitude > -74.4 && longitude < -72.8) return 'Montréal region';
  if (latitude > 50.9 && latitude < 51.8 && longitude > -0.8 && longitude < 0.5) return 'London region';
  if (latitude > 48.5 && latitude < 49.2 && longitude > 1.8 && longitude < 2.8) return 'Paris region';
  if (latitude > 42 && latitude < 55.5 && longitude > -142 && longitude < -52) return 'Canada region';
  if (latitude >= 7 && latitude <= 84 && longitude >= -170 && longitude < -50) return 'North America region';
  if (latitude >= -57 && latitude < 15 && longitude >= -95 && longitude < -30) return 'Central and South America region';
  if (latitude >= 34 && latitude <= 72 && longitude >= -25 && longitude < 45) return 'Europe region';
  if (latitude >= -36 && latitude < 38 && longitude >= -20 && longitude < 55) return 'Africa region';
  if (latitude >= 5 && latitude < 40 && longitude >= 60 && longitude < 100) return 'South Asia region';
  if (latitude >= 20 && latitude <= 72 && longitude >= 25 && longitude < 100) return 'West and Central Asia region';
  if (latitude >= 5 && latitude <= 72 && longitude >= 100 && longitude <= 180) return 'East Asia region';
  if (latitude >= -50 && latitude < 5 && longitude >= 105 && longitude <= 180) return 'Oceania region';
  return 'World region';
}

const isPublishedPublicPost = (row: DocumentData): boolean => {
  const audience = text(row.audience, 24).toLowerCase();
  const status = text(row.visibilityStatus ?? row.status, 24).toLowerCase();
  return row.locationVisibility === 'approximate'
    // Older native uploads omit these two fields; the real app Map treats
    // absence as its legacy published/public contract while still rejecting
    // every explicit non-public or unpublished value.
    && (!audience || audience === 'public')
    && (!status || status === 'published' || status === 'live')
    && row.privateAccount !== true
    && row.ghostMode !== true;
};

export function normalizeRealtimePublicPost(
  id: string,
  row: DocumentData,
  nowMs = Date.now(),
): RealtimePublicPost | null {
  if (!id || !isPublishedPublicPost(row)) return null;
  const ownerId = text(row.userID ?? row.userId, 128);
  const latitude = finite(row.latitude);
  const longitude = finite(row.longitude);
  if (!ownerId || latitude == null || longitude == null) return null;
  const place = coarsePublicPostRegion(latitude, longitude);
  const postedAtMs = timestampMs(row.createdAtMillis ?? row.createdAt);
  if (!place || !postedAtMs) return null;

  const currentRadiusMeters = metric(
    row.radiusMeters ?? row.radius ?? row.organicRadiusMeters,
    MAX_RADIUS_METERS,
  );
  const initialRadiusMeters = metric(
    row.initialRadiusMeters ?? row.baseRadiusMeters ?? currentRadiusMeters,
    MAX_RADIUS_METERS,
  );
  const engagementScore = metric(row.viewCount, 1_000_000_000)
    + metric(row.repeatViewCount, 1_000_000_000)
    + metric(row.likeCount ?? row.upvoteCount, 1_000_000_000) * 2
    + metric(row.commentCount, 1_000_000_000) * 3;
  const viralScore = metric(row.viralScore, 1_000_000_000) || engagementScore;
  const elapsedHours = Math.max((Math.max(nowMs, postedAtMs) - postedAtMs) / 3_600_000, 0.1);
  const handle = text(row.username ?? row.handle ?? row.displayName, 48);
  const updatedAtMs = timestampMs(row.updatedAt) || postedAtMs;
  const radiusKm = currentRadiusMeters / 1_000;
  const initialRadiusKm = initialRadiusMeters / 1_000;

  return {
    id,
    label: handle ? (handle.startsWith('@') ? handle : `@${handle}`) : 'Public post',
    place,
    postedAtMs,
    updatedAtMs,
    initialRadiusKm,
    radiusKm,
    radiusDeltaKm: radiusKm - initialRadiusKm,
    viralScore,
    viralPerHour: Math.round((viralScore / elapsedHours) * 10) / 10,
    source: 'firestore',
    synthetic: row.syntheticBeta === true || text(row.source, 40) === 'synthetic-browser',
  };
}

export function aggregateRealtimePublicPosts(posts: RealtimePublicPost[]): BetaMapCell[] {
  const cells = new Map<string, BetaMapCell>();
  for (const post of posts) {
    const existing = cells.get(post.place) ?? {
      place: post.place,
      events: 0,
      realEvents: 0,
      syntheticEvents: 0,
      latestAtMs: 0,
      peakRadiusKm: 0,
      velocity: 0,
    };
    existing.events += 1;
    if (post.synthetic) existing.syntheticEvents = (existing.syntheticEvents ?? 0) + 1;
    else existing.realEvents = (existing.realEvents ?? 0) + 1;
    existing.latestAtMs = Math.max(existing.latestAtMs, post.updatedAtMs || post.postedAtMs);
    existing.peakRadiusKm = Math.max(existing.peakRadiusKm, post.radiusKm);
    existing.velocity = Math.max(existing.velocity, post.viralPerHour);
    cells.set(post.place, existing);
  }
  return [...cells.values()]
    .sort((left, right) => right.events - left.events
      || right.latestAtMs - left.latestAtMs
      || left.place.localeCompare(right.place));
}

/**
 * Keep only a bounded, non-location baseline for each post currently inside
 * Firestore's 160-document query window. This lets the desk show radius
 * growth/decrease as live document changes arrive without retaining origins.
 */
export function applyRealtimeRadiusBaselines(
  posts: RealtimePublicPost[],
  baselines: Map<string, number>,
): RealtimePublicPost[] {
  const activeIds = new Set<string>();
  const normalized = posts.map(post => {
    activeIds.add(post.id);
    const baseline = baselines.get(post.id) ?? post.initialRadiusKm;
    baselines.set(post.id, baseline);
    return {
      ...post,
      initialRadiusKm: baseline,
      radiusDeltaKm: post.radiusKm - baseline,
    };
  });
  for (const id of baselines.keys()) {
    if (!activeIds.has(id)) baselines.delete(id);
  }
  return normalized;
}

export function normalizeRealtimePublicSnapshot(
  documents: { id: string; data: DocumentData }[],
  nowMs = Date.now(),
): RealtimePublicPostSnapshot {
  const posts = documents
    .map(document => normalizeRealtimePublicPost(document.id, document.data, nowMs))
    .filter((post): post is RealtimePublicPost => post !== null)
    .sort((left, right) => right.postedAtMs - left.postedAtMs || left.id.localeCompare(right.id));
  return { posts, cells: aggregateRealtimePublicPosts(posts) };
}
