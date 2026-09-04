/**
 * Radius Lab client — talks to scripts/radius-lab-server.mjs (127.0.0.1:8098),
 * the local desk service that stands one synthetic post on the production map
 * and rewrites its radius. The Poplur map repaints its territory from the same
 * Firestore document, so what this returns is what the map is being handed.
 */
const LAB_ORIGIN = 'http://127.0.0.1:8098';
const REQUEST_TIMEOUT_MS = 6_000;
const MUTATION_TIMEOUT_MS = 20_000;

export type RadiusLabPin = {
  postId: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  organicRadiusMeters: number;
  viewCount: number;
  likeCount: number;
  createdAtMs: number;
  updatedAtMs: number;
  username: string;
  pinColor: string | null;
  /** A pop is not valid without media and something to say. Surfaced so a pin
   *  missing its creative is visible on the desk rather than silently standing
   *  on the map. */
  hasMedia: boolean;
  mediaType: string;
  caption: string;
};

/** One pop of the conquer cohort: five synthetic posters, one per pin colour,
 *  each holding two overlapping claims around the drop centre. */
export type RadiusLabCohortPost = RadiusLabPin & {
  ownerId: string;
  channelId: string;
};

export type RadiusLabState = {
  ok: true;
  pin: RadiusLabPin | null;
  cohort: RadiusLabCohortPost[];
  viewer: { latitude: number; longitude: number };
  maxRadiusMeters: number;
  at: number;
};

export type RadiusLabLink = 'connecting' | 'live' | 'offline';

/** reach.ts HOME — the browser preview's deterministic viewer fix. */
export const RADIUS_LAB_VIEWER = Object.freeze({ latitude: 43.6487, longitude: -79.3811 });
/** The top of the radius scale: the Earth's radius, 6,371 km (worldRadius.ts
 *  in the clay map). A post there has taken over the world. */
export const RADIUS_LAB_MAX_METERS = 6_371_000;

const number = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const text = (value: unknown, maximum = 120): string => typeof value === 'string'
  ? value.trim().slice(0, maximum)
  : '';

function normalizePin(value: unknown): RadiusLabPin | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const postId = text(row.postId, 200);
  if (!postId) return null;
  return {
    postId,
    latitude: number(row.latitude),
    longitude: number(row.longitude),
    radiusMeters: Math.max(0, number(row.radiusMeters)),
    organicRadiusMeters: Math.max(0, number(row.organicRadiusMeters)),
    viewCount: Math.max(0, number(row.viewCount)),
    likeCount: Math.max(0, number(row.likeCount)),
    createdAtMs: Math.max(0, number(row.createdAtMs)),
    updatedAtMs: Math.max(0, number(row.updatedAtMs)),
    username: text(row.username, 48) || 'radius.lab',
    pinColor: text(row.pinColor, 24) || null,
    hasMedia: row.hasMedia === true,
    mediaType: text(row.mediaType, 16),
    caption: text(row.caption, 300),
  };
}

export function normalizeRadiusLabState(value: unknown): RadiusLabState {
  const row = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const viewer = (row.viewer && typeof row.viewer === 'object' ? row.viewer : {}) as Record<string, unknown>;
  return {
    ok: true,
    pin: normalizePin(row.pin),
    cohort: Array.isArray(row.cohort)
      ? row.cohort.flatMap(entry => {
        const pin = normalizePin(entry);
        if (!pin) return [];
        const raw = entry as Record<string, unknown>;
        return [{ ...pin, ownerId: text(raw.ownerId, 128), channelId: text(raw.channelId, 40) || 'live' }];
      })
      : [],
    viewer: {
      latitude: number(viewer.latitude, RADIUS_LAB_VIEWER.latitude),
      longitude: number(viewer.longitude, RADIUS_LAB_VIEWER.longitude),
    },
    maxRadiusMeters: Math.max(1, number(row.maxRadiusMeters, RADIUS_LAB_MAX_METERS)),
    at: Math.max(0, number(row.at, Date.now())),
  };
}

async function request(path: string, init: RequestInit, timeoutMs: number): Promise<RadiusLabState> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${LAB_ORIGIN}${path}`, { ...init, signal: controller.signal, mode: 'cors' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = text((payload as { error?: { message?: unknown } })?.error?.message, 300);
      throw new Error(message || `The radius lab answered ${response.status}.`);
    }
    return normalizeRadiusLabState(payload);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('The radius lab did not answer in time.');
    if (error instanceof TypeError) throw new Error('The radius lab is offline. Start it with node scripts/radius-lab-server.mjs (port 8098).');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function readRadiusLabState(): Promise<RadiusLabState> {
  return request('/api/radius-lab/state', { method: 'GET', headers: { accept: 'application/json' } }, REQUEST_TIMEOUT_MS);
}

function mutate(path: string, body: Record<string, unknown>): Promise<RadiusLabState> {
  return request(path, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }, MUTATION_TIMEOUT_MS);
}

export function dropRadiusLabPin(input: { latitude: number; longitude: number; radiusMeters: number; pinColor?: string | null }): Promise<RadiusLabState> {
  return mutate('/api/radius-lab/drop', {
    latitude: input.latitude,
    longitude: input.longitude,
    radiusMeters: input.radiusMeters,
    ...(input.pinColor ? { pinColor: input.pinColor } : {}),
  });
}

export function setRadiusLabRadius(radiusMeters: number): Promise<RadiusLabState> {
  return mutate('/api/radius-lab/radius', { radiusMeters });
}

export function removeRadiusLabPin(): Promise<RadiusLabState> {
  return mutate('/api/radius-lab/remove', {});
}

/** Stand the conquer cohort around a centre: five posters, one per pin
 *  colour, two overlapping pops each, media lent by the official launch
 *  content and nothing else. */
export function dropRadiusLabCohort(input: { latitude: number; longitude: number; radiusScale?: number }): Promise<RadiusLabState> {
  return mutate('/api/radius-lab/cohort/drop', {
    latitude: input.latitude,
    longitude: input.longitude,
    ...(input.radiusScale ? { radiusScale: input.radiusScale } : {}),
  });
}

export function removeRadiusLabCohort(): Promise<RadiusLabState> {
  return mutate('/api/radius-lab/cohort/remove', {});
}

/**
 * Live pin document as the lab server sees it (Firestore onSnapshot), so the
 * desk shows the radius the map has actually been handed, decay and cohort
 * engagement included. Falls back to `offline` when the server is not there.
 */
export function subscribeRadiusLab(
  listener: (state: RadiusLabState) => void,
  onLink: (link: RadiusLabLink) => void,
): () => void {
  if (typeof EventSource === 'undefined') {
    onLink('offline');
    return () => {};
  }
  let closed = false;
  let source: EventSource | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const open = () => {
    if (closed) return;
    onLink('connecting');
    source = new EventSource(`${LAB_ORIGIN}/api/radius-lab/live`);
    source.onopen = () => { if (!closed) onLink('live'); };
    source.onmessage = event => {
      try { listener(normalizeRadiusLabState(JSON.parse(String(event.data)))); } catch { /* keep-alive or malformed frame */ }
    };
    source.onerror = () => {
      if (closed) return;
      onLink('offline');
      source?.close();
      source = null;
      retry = setTimeout(open, 2_500);
    };
  };
  open();
  return () => {
    closed = true;
    clearTimeout(retry);
    source?.close();
  };
}

/** Spherical-cap area of a radius on Earth, in km². */
export function coverageKm2(radiusMeters: number): number {
  const earthKm = 6_371.0088;
  const radiusKm = Math.max(0, Math.min(Math.PI * earthKm, radiusMeters / 1_000));
  return 2 * Math.PI * earthKm * earthKm * (1 - Math.cos(radiusKm / earthKm));
}

/** Share of the planet's surface a radius wraps, 0..1. */
export function coverageShare(radiusMeters: number): number {
  const earthKm = 6_371.0088;
  return Math.min(1, coverageKm2(radiusMeters) / (4 * Math.PI * earthKm * earthKm));
}

export function formatKm(meters: number): string {
  const km = meters / 1_000;
  if (km >= 10_000) return `${Math.round(km).toLocaleString()} km`;
  if (km >= 100) return `${Math.round(km)} km`;
  if (km >= 10) return `${km.toFixed(1)} km`;
  if (km >= 1) return `${km.toFixed(2).replace(/0$/, '')} km`;
  return `${Math.round(meters)} m`;
}

export function formatKm2(km2: number): string {
  if (km2 >= 1_000_000) return `${(km2 / 1_000_000).toFixed(1)}M km²`;
  if (km2 >= 10_000) return `${Math.round(km2 / 1_000)}k km²`;
  if (km2 >= 100) return `${Math.round(km2).toLocaleString()} km²`;
  return `${km2.toFixed(1)} km²`;
}
