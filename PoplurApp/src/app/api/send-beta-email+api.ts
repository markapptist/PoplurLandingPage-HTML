// POST /api/send-beta-email {email}: the one mail of the beta hand-off.
//
// Since 6 Oct 2026 it carries the beta Discord and the TestFlight and Google
// Play links together, the moment the address is entered. From 20 Sep to
// 6 Oct it carried only a signed link to the tester agreement (app/nda.tsx)
// and signing released the links; that gate is gone. The agreement stays
// readable at /nda and a signing link still in an inbox still works
// (api/nda+api.ts), but nothing waits on it.
//
// Every link passes through /api/go with the tester's report token
// (server/betaReport.server.ts), as the links email always did, so the funnel
// still sees store_ios / store_android / report_opened / bug_opened.
//
// The Discord Tester role: the grant code (server/discord.server.ts, called
// from api/nda+api.ts on signing and api/discord/sweep+api.ts) is kept, but
// it is unconfigured on the site (no DISCORD_BOT_TOKEN / DISCORD_GUILD_ID /
// DISCORD_TESTER_ROLE_ID) and this route collects no Discord username, so
// the role is granted by hand in the server for now.

import {
  BETA_INVITE_ASSET_ORIGIN,
  BETA_INVITE_SUBJECTS,
  betaInviteHostedImages,
  createBetaInviteHtml,
  createBetaInviteText,
  isBetaInviteVariant,
  pickBetaInviteVariant,
} from '@/emails/betaInviteEmail';
import { REPORT_FORM_URL } from '@/report/betaTestPlan';
import { linkVisitor, recordTesterEvent } from '@/server/betaFunnel.server';
import { createReportToken } from '@/server/betaReport.server';
import { readVisitorId } from '@/server/betaVisitor.server';
import { replyToAddress, sendWithResend } from '@/server/resend.server';
import { siteOrigin } from '@/server/site.server';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SendEmailRequest = {
  email?: unknown;
  /** Pins a design instead of rolling one — for checking a design in a real inbox. */
  variant?: unknown;
};

export async function POST(request: Request) {
  let body: SendEmailRequest;

  try {
    body = (await request.json()) as SendEmailRequest;
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

  if (!EMAIL_PATTERN.test(email)) {
    return Response.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  if (!process.env.RESEND_API_KEY) {
    return Response.json(
      { error: 'Email service is not configured. Set RESEND_API_KEY on the server.' },
      { status: 503 },
    );
  }
  // The pictures are fetched from the site (public/emails); BETA_EMAIL_ASSET_ORIGIN
  // points a preview deployment at itself.
  const images = betaInviteHostedImages(process.env.BETA_EMAIL_ASSET_ORIGIN || BETA_INVITE_ASSET_ORIGIN);
  // One of the four designs per email, rolled here so the answer knows which.
  const variant = isBetaInviteVariant(body.variant) ? body.variant : pickBetaInviteVariant();
  // With BETA_DISCORD_INVITE set, the mail leads with the Discord (Mark, 21 Sep: the
  // sign-up must point at the Discord, not straight at the builds).
  const discordUrl = (process.env.BETA_DISCORD_INVITE || '').trim() || undefined;
  // The same links the signed page and the links email hand out: through /api/go
  // with this tester's report token, so the store clicks land in the funnel.
  const reportToken = createReportToken(email);
  const go = (to: string) => `${siteOrigin()}/api/go?to=${to}&t=${encodeURIComponent(reportToken)}`;
  const reportUrl = REPORT_FORM_URL || go('report');
  const bugUrl = go('bug');
  const storeLinks = { iosUrl: go('ios'), androidUrl: go('android') };

  const sent = await sendWithResend({
    to: email,
    replyTo: replyToAddress(),
    subject: BETA_INVITE_SUBJECTS.invite,
    html: createBetaInviteHtml({ images, variant, stage: 'invite', discordUrl, reportUrl, bugUrl, ...storeLinks }),
    text: createBetaInviteText({ stage: 'invite', discordUrl, reportUrl, bugUrl, ...storeLinks }),
    tag: 'invite',
  });

  if (!sent.ok) return Response.json({ error: sent.error }, { status: 502 });

  // The funnel: this address entered, from this visitor, and the links went out
  // with no signature in between (server/betaFunnel.server.ts).
  const visitorId = readVisitorId(request);
  const funnel = await recordTesterEvent(email, 'email_entered', { variant, resendId: sent.id }, visitorId);
  if (visitorId) await linkVisitor(visitorId, email);
  await recordTesterEvent(email, 'links_sent', { resendId: sent.id, discord: !!discordUrl, signed: false });

  return Response.json({ id: sent.id, ok: true, variant, stage: 'invite', discord: !!discordUrl, recorded: funnel.recorded });
}
