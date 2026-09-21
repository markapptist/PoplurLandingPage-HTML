// POST /api/send-beta-email {email}: the first mail of the beta hand-off.
//
// It no longer carries the store links. It carries one signed, expiring link
// to the tester agreement (app/nda.tsx); signing there (api/nda+api.ts) is
// what releases the TestFlight and Google Play links — on the page and in a
// second email. The token is bound to this address, so only the inbox that
// receives this mail can sign as it.

import {
  BETA_INVITE_ASSET_ORIGIN,
  BETA_INVITE_SUBJECTS,
  betaInviteHostedImages,
  createBetaInviteHtml,
  createBetaInviteText,
  isBetaInviteVariant,
  pickBetaInviteVariant,
} from '@/emails/betaInviteEmail';
import { linkVisitor, recordTesterEvent } from '@/server/betaFunnel.server';
import { createNdaToken, ndaTokenConfigured } from '@/server/betaNda.server';
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
  if (!ndaTokenConfigured()) {
    return Response.json({ error: 'The tester agreement link cannot be signed. Set BETA_NDA_SECRET on the server.' }, { status: 503 });
  }

  // The pictures are fetched from the site (public/emails); BETA_EMAIL_ASSET_ORIGIN
  // points a preview deployment at itself.
  const images = betaInviteHostedImages(process.env.BETA_EMAIL_ASSET_ORIGIN || BETA_INVITE_ASSET_ORIGIN);
  // One of the four designs per email, rolled here so the answer knows which.
  const variant = isBetaInviteVariant(body.variant) ? body.variant : pickBetaInviteVariant();
  const ndaUrl = `${siteOrigin()}/nda?t=${encodeURIComponent(createNdaToken(email))}`;

  const sent = await sendWithResend({
    to: email,
    replyTo: replyToAddress(),
    subject: BETA_INVITE_SUBJECTS.nda,
    html: createBetaInviteHtml({ images, variant, stage: 'nda', ndaUrl }),
    text: createBetaInviteText({ stage: 'nda', ndaUrl }),
    tag: 'invite',
  });

  if (!sent.ok) return Response.json({ error: sent.error }, { status: 502 });

  // The funnel: this address entered, from this visitor (server/betaFunnel.server.ts).
  const visitorId = readVisitorId(request);
  const funnel = await recordTesterEvent(email, 'email_entered', { variant, resendId: sent.id }, visitorId);
  if (visitorId) await linkVisitor(visitorId, email);

  return Response.json({ id: sent.id, ok: true, variant, stage: 'nda', recorded: funnel.recorded });
}
