// GET /api/beta-count — how many beta testers have signed up (entered an
// email) and signed the tester agreement. Recomputes the counts from the
// funnel records and rewrites the world-readable `public/betaSignups`
// document the landing page listens to, so a page load also heals a stale
// number. Counts only; nothing here identifies a tester.

import { funnelConfigured, publishBetaCount } from '@/server/betaFunnel.server';

export async function GET() {
  if (!funnelConfigured()) return Response.json({ error: 'The beta count is not enabled on this server.' }, { status: 503 });
  try {
    const count = await publishBetaCount();
    if (!count) return Response.json({ error: 'The beta count is not enabled on this server.' }, { status: 503 });
    return Response.json(count, { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message.slice(0, 200) : 'Could not count.' }, { status: 502 });
  }
}
