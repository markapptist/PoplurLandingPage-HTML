import { collection, limit, onSnapshot, orderBy, query, type DocumentData } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '@/services/firebase';

/** A pop as the public map shows it: approximate origin, live reach, and
 *  whether it came from the synthetic harness. No names, no ids beyond the
 *  document's own. */
export type LivePop = { id: string; latitude: number; longitude: number; radiusKm: number; createdAtMillis: number; synthetic: boolean };

const finite = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const millis = (v: unknown): number => {
  const n = finite(v); if (n !== null && n > 0) return n;
  const t = v as { toMillis?: () => number } | undefined; const m = typeof t?.toMillis === 'function' ? Number(t.toMillis()) : NaN;
  return Number.isFinite(m) && m > 0 ? m : 0;
};

/** Same reading as the desk: a `sim-`/`synthetic-` owner or a `post-sim-` id
 *  is the harness; official demo content (`post-offic…`) is not a person
 *  either and is left off a public map. */
export function livePopFromRow(id: string, row: DocumentData): LivePop | null {
  if (id.startsWith('post-offic')) return null;
  if (row.locationVisibility === 'hidden' || row.visibilityStatus === 'expired' || row.status === 'deleted') return null;
  const latitude = finite(row.latitude), longitude = finite(row.longitude);
  if (latitude === null || longitude === null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const radiusMeters = Math.max(0, finite(row.radiusMeters ?? row.radius) ?? 0);
  if (radiusMeters <= 0) return null;
  const owner = String(row.userID ?? row.userId ?? '');
  const synthetic = /^(sim|synthetic)-/.test(owner) || id.startsWith('post-sim-') || row.syntheticBeta === true;
  return { id, latitude, longitude, radiusKm: Math.min(6_371, radiusMeters / 1_000), createdAtMillis: millis(row.createdAtMillis ?? row.createdAt), synthetic };
}

/** The map need not repaint on every like the cohort makes: snapshots are
 *  coalesced to one render every few seconds. */
export const LIVE_POPS_COALESCE_MS = 4_000;

export function useLivePops(max = 400): { pops: LivePop[]; state: 'loading' | 'ready' | 'error' } {
  const [pops, setPops] = useState<LivePop[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    let pending: LivePop[] | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let first = true;
    const flush = () => { timer = null; if (pending) { setPops(pending); pending = null; } };
    const unsubscribe = onSnapshot(query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(max)), snapshot => {
      const next: LivePop[] = [];
      for (const d of snapshot.docs) { const pop = livePopFromRow(d.id, d.data()); if (pop) next.push(pop); }
      pending = next; setState('ready');
      if (first) { first = false; flush(); return; }
      if (!timer) timer = setTimeout(flush, LIVE_POPS_COALESCE_MS);
    }, () => setState('error'));
    return () => { unsubscribe(); if (timer) clearTimeout(timer); };
  }, [max]);
  return { pops, state };
}
