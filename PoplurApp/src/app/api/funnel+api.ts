// GET /api/funnel?k=<FUNNEL_KEY> — everything app/funnel.tsx shows.
//
// FUNNEL_KEY on Vercel is the only door; the page keeps it on the device.
// Without the key set, or with the wrong one, nothing about the funnel is
// answered — not even whether the store is configured.

import { timingSafeEqual } from 'node:crypto';
import { FUNNEL_ORDER, STAGE_LABELS, funnelSummary, storeStatus } from '@/server/betaFunnel.server';

function keyOk(given: string | null): boolean {
  const key = process.env.FUNNEL_KEY;
  if (!key || !given) return false;
  const a = Buffer.from(given), b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!process.env.FUNNEL_KEY) return Response.json({ error: 'The funnel is not enabled. Set FUNNEL_KEY on the server.' }, { status: 503 });
  if (!keyOk(new URL(request.url).searchParams.get('k'))) return Response.json({ error: 'That key is not right.' }, { status: 401 });
  const summary = await funnelSummary();
  return Response.json({ ...summary, store: storeStatus(), order: FUNNEL_ORDER, labels: STAGE_LABELS }, { headers: { 'Cache-Control': 'no-store' } });
}
