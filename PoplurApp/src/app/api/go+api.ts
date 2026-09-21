// GET /api/go?to=ios|android|form|report&t=<report token>[&r=<round>]
//
// The links a tester is given (store buttons on the signed /nda page and in
// the links email, the weekly Google Form, the report page) pass through
// here so the funnel sees the click: TestFlight → store_ios, Google Play →
// store_android, the form → form_opened for that round, the report page →
// report_opened. Then a redirect to the real destination.
//
// The token is the tester's own report token (betaReport.server.ts), which
// already rides in their links email. A bad or missing token still redirects
// — nobody is kept from the store over bookkeeping — it just records nothing.

import { getBetaInviteLinks } from '@/emails/betaInviteEmail';
import { REPORT_FORM_URL, roundByNumber } from '@/report/betaTestPlan';
import { recordTesterEvent, type FunnelStage } from '@/server/betaFunnel.server';
import { verifyReportToken } from '@/server/betaReport.server';
import { siteOrigin } from '@/server/site.server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const to = url.searchParams.get('to') ?? '';
  const token = url.searchParams.get('t');
  const round = roundByNumber(Number(url.searchParams.get('r')));
  const links = getBetaInviteLinks();

  let destination: string | null = null;
  let stage: FunnelStage | null = null;
  if (to === 'ios') { destination = links.iosUrl; stage = 'store_ios'; }
  else if (to === 'android') { destination = links.androidUrl; stage = 'store_android'; }
  else if (to === 'form') { destination = round?.formUrl || REPORT_FORM_URL || null; stage = 'form_opened'; }
  else if (to === 'report') { destination = `${siteOrigin()}/report${token ? `?t=${encodeURIComponent(token)}` : ''}${round ? `${token ? '&' : '?'}r=${round.number}` : ''}`; stage = 'report_opened'; }
  if (!destination || !stage) {
    return Response.json({ error: to === 'form' ? 'There is no form for that week yet.' : 'Unknown destination.' }, { status: to === 'form' ? 404 : 400 });
  }

  const check = verifyReportToken(token);
  if (check.ok) {
    await recordTesterEvent(check.email, stage, {
      ...(round ? { round: round.number } : {}),
      userAgent: (request.headers.get('user-agent') ?? '').slice(0, 200),
    });
  }
  return Response.redirect(destination, 302);
}
