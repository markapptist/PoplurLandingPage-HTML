import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '@/services/firebase';

/** The live beta tester count: `public/betaSignups`, written by the site's
 *  server after every sign-up and signing (server/betaFunnel.server.ts) and
 *  world-readable by the Firestore rules. The page listens, so the number
 *  moves the moment someone signs. On mount it also asks /api/beta-count
 *  once, which recounts and rewrites the document, so a stale or missing
 *  document heals on the next visit. */
export type BetaCount = { signedUp: number; signed: number; updatedAt: string };

export function useBetaCount(): { count: BetaCount | null; state: 'loading' | 'ready' | 'error' } {
  const [count, setCount] = useState<BetaCount | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'public', 'betaSignups'), snapshot => {
      const d = snapshot.data();
      if (!d) { setState('ready'); return; }
      setCount({ signedUp: Number(d.signedUp ?? 0), signed: Number(d.signed ?? 0), updatedAt: String(d.updatedAt ?? '') });
      setState('ready');
    }, () => setState('error'));
    fetch('/api/beta-count').catch(() => { /* the listener is the source; this only refreshes it */ });
    return () => unsubscribe();
  }, []);
  return { count, state };
}
