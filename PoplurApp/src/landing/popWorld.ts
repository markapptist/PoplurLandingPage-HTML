import type { LivePop } from './useLivePops';

/** Equirectangular, the whole world in a 2:1 box. */
export const WORLD_W = 1000, WORLD_H = 500;
export const worldXY = (lng: number, lat: number): [number, number] => [((lng + 180) / 360) * WORLD_W, ((90 - lat) / 180) * WORLD_H];

/** Coarse public places, the same buckets the desk labels — never a street. */
const PLACES: { name: string; lat: number; lng: number }[] = [
  { name: 'Toronto', lat: 43.65, lng: -79.38 }, { name: 'Ottawa', lat: 45.42, lng: -75.7 }, { name: 'Montréal', lat: 45.5, lng: -73.57 },
  { name: 'Vancouver', lat: 49.28, lng: -123.12 }, { name: 'Calgary', lat: 51.05, lng: -114.07 }, { name: 'New York', lat: 40.71, lng: -74.01 },
  { name: 'Los Angeles', lat: 34.05, lng: -118.24 }, { name: 'Mexico City', lat: 19.43, lng: -99.13 }, { name: 'São Paulo', lat: -23.55, lng: -46.63 },
  { name: 'London', lat: 51.51, lng: -0.13 }, { name: 'Paris', lat: 48.86, lng: 2.35 }, { name: 'Berlin', lat: 52.52, lng: 13.4 },
  { name: 'Lagos', lat: 6.52, lng: 3.38 }, { name: 'Cairo', lat: 30.04, lng: 31.24 }, { name: 'Nairobi', lat: -1.29, lng: 36.82 },
  { name: 'Dubai', lat: 25.2, lng: 55.27 }, { name: 'Mumbai', lat: 19.08, lng: 72.88 }, { name: 'Singapore', lat: 1.35, lng: 103.82 },
  { name: 'Tokyo', lat: 35.68, lng: 139.69 }, { name: 'Seoul', lat: 37.57, lng: 126.98 }, { name: 'Sydney', lat: -33.87, lng: 151.21 },
];
const kmBetween = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const dLat = (bLat - aLat) * 110.574, dLng = (bLng - aLng) * 111.32 * Math.cos((((aLat + bLat) / 2) * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
};
/** Coarse regions for clusters far from any listed city — the desk's own
 *  bucket names, so a label never reads as a street. */
export function regionName(lat: number, lng: number): string {
  if (lat < -60) return 'Antarctica';
  if (lng >= -170 && lng < -30) return lat >= 12 ? 'North America' : 'Central and South America';
  if (lng >= -30 && lng < 60) return lat >= 36 ? 'Europe' : lat >= -40 ? 'Africa' : 'Southern Ocean';
  if (lng >= 60 && lng < 100) return lat >= 35 ? 'Central Asia' : 'South Asia';
  if (lng >= 100 && lng <= 180) return lat >= 22 ? 'East Asia' : lat >= -10 ? 'Southeast Asia' : 'Oceania';
  return 'Pacific';
}

export function nearestPlace(lat: number, lng: number, withinKm = 400): string | null {
  let best: { name: string; km: number } | null = null;
  for (const p of PLACES) { const km = kmBetween(lat, lng, p.lat, p.lng); if (km <= withinKm && (!best || km < best.km)) best = { name: p.name, km }; }
  return best?.name ?? null;
}

export type WorldCluster = { key: string; x: number; y: number; count: number; real: number; sim: number; peakKm: number; label: string | null };

/** Bucket pops into ~5° cells, size a dot by how many landed there, label the
 *  busiest with the nearest public place. A cell with any real pop draws in
 *  the pop tone; a simulation-only cell in the simulation fill — colour never
 *  carries the meaning alone, the legend and label say so too. */
export function clusterPops(pops: readonly LivePop[], cellDeg = 5, labelled = 10): WorldCluster[] {
  const cells = new Map<string, { lat: number; lng: number; count: number; real: number; sim: number; peakKm: number }>();
  for (const p of pops) {
    const key = `${Math.floor(p.latitude / cellDeg)}:${Math.floor(p.longitude / cellDeg)}`;
    const c = cells.get(key) ?? { lat: 0, lng: 0, count: 0, real: 0, sim: 0, peakKm: 0 };
    c.lat += p.latitude; c.lng += p.longitude; c.count += 1; if (p.synthetic) c.sim += 1; else c.real += 1; c.peakKm = Math.max(c.peakKm, p.radiusKm);
    cells.set(key, c);
  }
  const out = [...cells.entries()].map(([key, c]) => {
    const lat = c.lat / c.count, lng = c.lng / c.count; const [x, y] = worldXY(lng, lat);
    return { key, x, y, count: c.count, real: c.real, sim: c.sim, peakKm: c.peakKm, label: null as string | null, lat, lng };
  }).sort((a, b) => b.real - a.real || b.count - a.count);
  out.slice(0, labelled).forEach(c => { c.label = nearestPlace(c.lat, c.lng) ?? regionName(c.lat, c.lng); });
  return out.map(({ lat: _lat, lng: _lng, ...c }) => c);
}
export const dotRadius = (count: number) => Math.min(16, 4 + Math.sqrt(count) * 2.2);
