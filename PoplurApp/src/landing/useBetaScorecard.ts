import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '@/services/firebase';

export type Verdict = 'good' | 'mid' | 'weak' | 'pending';
export type ScorecardSignal = { key: string; label: string; count: number; of: number; share: number | null; verdict: Verdict; note: string };
export type Scorecard = {
  version: number; updatedAtMillis: number;
  window: { startMillis: number; endMillis: number | null; days: number };
  installs: number; signals: ScorecardSignal[];
  loop: { engagedPops: number; grewPops: number; repostRateGrew: number | null; repostRateNotGrew: number | null; ratio: number | null };
  discovery: { interception: number; profile: number; other: number };
  organic: { referralInstalls: number; offPromptPops: number; humanPops: number; promptDays: number };
  activity: { activeLast7d: number; humanPops: number; humanEngagements: number };
  integrity: { overClaimedPops: number; ladderPops: number; replacedPops: number };
};

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const VERDICTS: Verdict[] = ['good', 'mid', 'weak', 'pending'];

export function normalizeScorecard(raw: unknown): Scorecard | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, any>;
  const signals = Array.isArray(r.signals) ? r.signals.filter((s: any) => s && typeof s.key === 'string').map((s: any): ScorecardSignal => ({
    key: s.key, label: String(s.label ?? s.key), count: num(s.count), of: num(s.of),
    share: typeof s.share === 'number' ? s.share : null,
    verdict: VERDICTS.includes(s.verdict) ? s.verdict : 'pending', note: String(s.note ?? ''),
  })) : [];
  return {
    version: num(r.version, 1), updatedAtMillis: num(r.updatedAtMillis),
    window: { startMillis: num(r.window?.startMillis), endMillis: typeof r.window?.endMillis === 'number' ? r.window.endMillis : null, days: num(r.window?.days) },
    installs: num(r.installs), signals,
    loop: { engagedPops: num(r.loop?.engagedPops), grewPops: num(r.loop?.grewPops), repostRateGrew: r.loop?.repostRateGrew ?? null, repostRateNotGrew: r.loop?.repostRateNotGrew ?? null, ratio: r.loop?.ratio ?? null },
    discovery: { interception: num(r.discovery?.interception), profile: num(r.discovery?.profile), other: num(r.discovery?.other) },
    organic: { referralInstalls: num(r.organic?.referralInstalls), offPromptPops: num(r.organic?.offPromptPops), humanPops: num(r.organic?.humanPops), promptDays: num(r.organic?.promptDays) },
    activity: { activeLast7d: num(r.activity?.activeLast7d), humanPops: num(r.activity?.humanPops), humanEngagements: num(r.activity?.humanEngagements) },
    integrity: { overClaimedPops: num(r.integrity?.overClaimedPops), ladderPops: num(r.integrity?.ladderPops), replacedPops: num(r.integrity?.replacedPops) },
  };
}

/** The world-readable scorecard the beta function publishes every 15 minutes. */
export function useBetaScorecard(): { scorecard: Scorecard | null; state: 'loading' | 'ready' | 'missing' | 'error' } {
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  useEffect(() => onSnapshot(doc(db, 'public', 'betaScorecard'), snapshot => {
    const card = snapshot.exists() ? normalizeScorecard(snapshot.data()) : null;
    setScorecard(card); setState(card ? 'ready' : 'missing');
  }, () => setState('error')), []);
  return { scorecard, state };
}
