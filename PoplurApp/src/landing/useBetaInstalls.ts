import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '@/services/firebase';

/** The live installs count: `public/betaInstalls`, rewritten by a Cloud
 *  Function the moment a human account's profile is created or deleted
 *  (functions/src/betaInstalls.ts in Poplur2025-iOS), world-readable by the
 *  Firestore rules. Humans only, since the beta window start; no ids. */
export type BetaInstalls = { installs: number; startMillis: number; updatedAtMillis: number };

export function useBetaInstalls(): { installs: BetaInstalls | null; state: 'loading' | 'ready' | 'error' } {
  const [installs, setInstalls] = useState<BetaInstalls | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => onSnapshot(doc(db, 'public', 'betaInstalls'), snapshot => {
    const d = snapshot.data();
    if (d) setInstalls({ installs: Number(d.installs ?? 0), startMillis: Number(d.startMillis ?? 0), updatedAtMillis: Number(d.updatedAtMillis ?? 0) });
    setState('ready');
  }, () => setState('error')), []);
  return { installs, state };
}
