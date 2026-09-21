// POST /api/visit {path, referrer?} — the landing beacon (components/VisitBeacon).
//
// Counts a visit against the anonymous `pv` cookie (set here if missing) in
// betaVisitors, so the funnel starts before an email exists. Nothing personal
// is stored: the path, the referrer's origin, the user agent. Always 204,
// even when the store is not configured — a beacon never shows an error.

import { recordVisit } from '@/server/betaFunnel.server';
import { visitorFor } from '@/server/betaVisitor.server';

const TRACKED = /^\/(\?|$|nda|report|explore)/;

export async function POST(request: Request) {
  let body: { path?: unknown; referrer?: unknown } = {};
  try { body = (await request.json()) as typeof body; } catch { /* an empty beacon still counts */ }
  const path = typeof body.path === 'string' && body.path.startsWith('/') ? body.path.slice(0, 200) : '/';
  let referrer: string | null = null;
  if (typeof body.referrer === 'string' && body.referrer) {
    try { referrer = new URL(body.referrer).origin; } catch { referrer = null; }
  }
  const visitor = visitorFor(request);
  const headers = new Headers();
  if (visitor.setCookie) headers.set('Set-Cookie', visitor.setCookie);
  if (TRACKED.test(path)) {
    await recordVisit(visitor.id, { path, referrer, userAgent: request.headers.get('user-agent') });
  }
  return new Response(null, { status: 204, headers });
}
