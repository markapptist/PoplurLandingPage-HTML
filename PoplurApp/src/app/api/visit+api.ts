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
    // Vercel puts the request's rough location on the headers; nothing finer than a city.
    const h = (name: string) => { const v = request.headers.get(name); if (!v) return null; try { return decodeURIComponent(v).slice(0, 80); } catch { return v.slice(0, 80); } };
    const geo = { city: h('x-vercel-ip-city'), region: h('x-vercel-ip-country-region'), country: h('x-vercel-ip-country') };
    await recordVisit(visitor.id, { path, referrer, userAgent: request.headers.get('user-agent'), geo });
  }
  return new Response(null, { status: 204, headers });
}
