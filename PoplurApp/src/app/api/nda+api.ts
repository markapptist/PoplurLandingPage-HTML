// The beta tester agreement, signed on the site.
//
// GET  /api/nda?t=…                 — is this signing link good? Answers the
//                                     masked address it was issued to.
// POST /api/nda {t, name, discord?, agree, adult}
//                                   — records the acceptance and releases the
//                                     links: a signed copy to the signer, a
//                                     copy to Poplur (BETA_NDA_RECORDS_TO, or
//                                     BETA_EMAIL_REPLY_TO), the links email,
//                                     and the links in the answer.
//
// The record of an acceptance is those two emails: the signer's copy and
// Poplur's, each carrying the name, address, time, agreement version and the
// SHA-256 of the exact text signed. There is no database write from here —
// the server holds no Firebase credentials — so keep BETA_NDA_RECORDS_TO
// pointed at an inbox that is kept.

import {
  BETA_INVITE_ASSET_ORIGIN,
  BETA_INVITE_SUBJECTS,
  betaInviteHostedImages,
  createBetaInviteHtml,
  createBetaInviteText,
  createNdaReceiptHtml,
  createNdaReceiptText,
  getBetaInviteLinks,
  ndaReceiptSubject,
  pickBetaInviteVariant,
} from '@/emails/betaInviteEmail';
import { NDA_VERSION, type NdaAcceptance } from '@/nda/betaTesterNda';
import { maskEmail, ndaSha256, verifyNdaToken, type NdaTokenCheck } from '@/server/betaNda.server';
import { replyToAddress, sendWithResend } from '@/server/resend.server';

const REASONS: Record<Exclude<NdaTokenCheck, { ok: true }>['reason'], string> = {
  missing: 'This page needs the signing link from your invite email.',
  malformed: 'That signing link is not complete. Open it from your invite email again.',
  'bad-signature': 'That signing link is not one we issued. Ask for a new invite at poplur.ca.',
  expired: 'That signing link has expired (they last 14 days). Ask for a new invite at poplur.ca.',
};

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('t');
  const check = verifyNdaToken(token);
  if (!check.ok) return Response.json({ ok: false, reason: check.reason, error: REASONS[check.reason] }, { status: 400 });
  return Response.json({ ok: true, email: maskEmail(check.email), version: NDA_VERSION });
}

type SignRequest = { t?: unknown; name?: unknown; discord?: unknown; agree?: unknown; adult?: unknown };

export async function POST(request: Request) {
  let body: SignRequest;
  try {
    body = (await request.json()) as SignRequest;
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const check = verifyNdaToken(typeof body.t === 'string' ? body.t : null);
  if (!check.ok) return Response.json({ ok: false, reason: check.reason, error: REASONS[check.reason] }, { status: 400 });

  const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
  const discord = typeof body.discord === 'string' && body.discord.trim() ? body.discord.trim().slice(0, 64) : null;
  if (name.length < 2 || name.length > 80 || !/\S\s+\S/.test(name)) {
    return Response.json({ error: 'Sign with your full name — first and last.' }, { status: 400 });
  }
  if (body.agree !== true) return Response.json({ error: 'Confirm that you have read the agreement and agree to it.' }, { status: 400 });
  if (body.adult !== true) return Response.json({ error: 'Confirm that you are at least 18 years old.' }, { status: 400 });

  if (!process.env.RESEND_API_KEY) {
    return Response.json({ error: 'Email service is not configured. Set RESEND_API_KEY on the server.' }, { status: 503 });
  }

  const forwarded = request.headers.get('x-forwarded-for');
  const acceptance: NdaAcceptance = {
    name,
    email: check.email,
    discord,
    signedAt: new Date().toISOString(),
    ndaVersion: NDA_VERSION,
    ndaSha256: ndaSha256(),
    ip: forwarded ? forwarded.split(',')[0].trim() : request.headers.get('x-real-ip'),
    userAgent: request.headers.get('user-agent'),
  };

  const images = betaInviteHostedImages(process.env.BETA_EMAIL_ASSET_ORIGIN || BETA_INVITE_ASSET_ORIGIN);
  const replyTo = replyToAddress();
  const recordsTo = process.env.BETA_NDA_RECORDS_TO || replyTo;

  // The signer's copy first: if this cannot go out, nothing is released.
  const receipt = await sendWithResend({
    to: acceptance.email,
    replyTo,
    subject: ndaReceiptSubject,
    html: createNdaReceiptHtml(acceptance, { images }),
    text: createNdaReceiptText(acceptance),
  });
  if (!receipt.ok) return Response.json({ error: receipt.error }, { status: 502 });

  const record = recordsTo
    ? await sendWithResend({
        to: recordsTo,
        subject: `Signed: ${acceptance.name} · ${acceptance.email}`,
        html: createNdaReceiptHtml(acceptance, { forPoplur: true, images }),
        text: createNdaReceiptText(acceptance, { forPoplur: true }),
      })
    : null;

  const variant = pickBetaInviteVariant();
  const links = await sendWithResend({
    to: acceptance.email,
    replyTo,
    subject: BETA_INVITE_SUBJECTS.links,
    html: createBetaInviteHtml({ images, variant, stage: 'links' }),
    text: createBetaInviteText({ stage: 'links' }),
  });

  return Response.json({
    ok: true,
    signedAt: acceptance.signedAt,
    version: acceptance.ndaVersion,
    links: getBetaInviteLinks(),
    emailed: { receipt: receipt.ok, links: links.ok, record: record ? record.ok : false },
  });
}
