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
// SHA-256 of the exact text signed. Keep BETA_NDA_RECORDS_TO pointed at an
// inbox that is kept. The funnel (server/betaFunnel.server.ts) also notes the
// link being opened and the signature, when the store is configured.

import {
  BETA_INVITE_ASSET_ORIGIN,
  BETA_INVITE_SUBJECTS,
  betaInviteHostedImages,
  createBetaInviteHtml,
  createBetaInviteText,
  createNdaReceiptHtml,
  createNdaReceiptText,
  ndaReceiptSubject,
  pickBetaInviteVariant,
} from '@/emails/betaInviteEmail';
import { NDA_VERSION, type NdaAcceptance } from '@/nda/betaTesterNda';
import { REPORT_FORM_URL } from '@/report/betaTestPlan';
import { recordTesterEvent, rememberDiscordPending } from '@/server/betaFunnel.server';
import { addTesterRole, discordConfig, discordConnectAvailable, findMemberByUsername, notifyPoplur, readDiscordCookie } from '@/server/discord.server';
import { maskEmail, ndaSha256, verifyNdaToken, type NdaTokenCheck } from '@/server/betaNda.server';
import { createReportToken } from '@/server/betaReport.server';
import { replyToAddress, sendWithResend } from '@/server/resend.server';
import { siteOrigin } from '@/server/site.server';

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
  await recordTesterEvent(check.email, 'nda_opened', { userAgent: (request.headers.get('user-agent') ?? '').slice(0, 200) });
  const connected = readDiscordCookie(request);
  return Response.json({
    ok: true, email: maskEmail(check.email), version: NDA_VERSION,
    discord: { connect: discordConnectAvailable(), username: connected ? connected.username : null },
  });
}

type SignRequest = { t?: unknown; name?: unknown; discord?: unknown; referredBy?: unknown; androidEmail?: unknown; agree?: unknown; adult?: unknown };

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
  const referredBy = typeof body.referredBy === 'string' && body.referredBy.trim() ? body.referredBy.trim().slice(0, 64) : null;
  const androidEmail = typeof body.androidEmail === 'string' && body.androidEmail.trim() ? body.androidEmail.trim().toLowerCase().slice(0, 120) : null;
  if (androidEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(androidEmail)) {
    return Response.json({ error: 'The Google account email for Android does not look like an email address.' }, { status: 400 });
  }
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
    referredBy,
    androidEmail,
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
    tag: 'nda-receipt',
  });
  if (!receipt.ok) return Response.json({ error: receipt.error }, { status: 502 });

  const record = recordsTo
    ? await sendWithResend({
        to: recordsTo,
        subject: `Signed: ${acceptance.name} · ${acceptance.email}`,
        html: createNdaReceiptHtml(acceptance, { forPoplur: true, images }),
        text: createNdaReceiptText(acceptance, { forPoplur: true }),
        tag: 'record',
      })
    : null;

  // The tester's own report page (app/report.tsx) travels with the links.
  // Every link the tester gets passes through /api/go with their report token,
  // so the funnel sees which store they chose and when the report page opened.
  const reportToken = createReportToken(acceptance.email);
  const go = (to: string) => `${siteOrigin()}/api/go?to=${to}&t=${encodeURIComponent(reportToken)}`;
  const reportUrl = REPORT_FORM_URL || go('report');
  const bugUrl = go('bug');
  const storeLinks = { iosUrl: go('ios'), androidUrl: go('android') };
  const variant = pickBetaInviteVariant();
  const links = await sendWithResend({
    to: acceptance.email,
    replyTo,
    subject: BETA_INVITE_SUBJECTS.links,
    html: createBetaInviteHtml({ images, variant, stage: 'links', reportUrl, bugUrl, ...storeLinks }),
    text: createBetaInviteText({ stage: 'links', reportUrl, bugUrl, ...storeLinks }),
    tag: 'links',
  });

  await recordTesterEvent(acceptance.email, 'nda_signed', {
    name: acceptance.name, discord: acceptance.discord, ndaVersion: acceptance.ndaVersion,
    receiptId: receipt.id, linksId: links.ok ? links.id : null, linksSent: links.ok,
  });

  // The Tester role: the connected account first, else the typed username, else
  // remembered for the sweep. Never a reason to fail the signature.
  let tester: 'granted' | 'pending' | 'off' | 'failed' = 'off';
  let testerAs: string | null = null;
  if (discordConfig()) {
    tester = 'failed';
    try {
      const connected = readDiscordCookie(request);
      const member = connected ?? (acceptance.discord ? await findMemberByUsername(acceptance.discord) : null);
      if (member && (await addTesterRole(member.id))) {
        tester = 'granted';
        testerAs = member.username;
        await recordTesterEvent(acceptance.email, 'discord_tester', { discordId: member.id, username: member.username, via: connected ? 'connect' : 'username' });
        await notifyPoplur(`✅ **${acceptance.name}** (@${member.username}) signed the tester agreement and is now a Tester.`);
      } else if (acceptance.discord) {
        tester = 'pending';
        await rememberDiscordPending(acceptance.email, acceptance.discord, acceptance.name);
        await notifyPoplur(`📝 **${acceptance.name}** signed the tester agreement as @${acceptance.discord}, who is not in the server yet — the role lands when they join.`);
      } else {
        await notifyPoplur(`📝 **${acceptance.name}** signed the tester agreement with no Discord account given.`);
      }
    } catch (error) {
      console.error('[nda] discord hand-off failed:', error);
    }
  }

  return Response.json({
    ok: true,
    signedAt: acceptance.signedAt,
    version: acceptance.ndaVersion,
    links: storeLinks,
    reportUrl,
    bugUrl,
    discord: { tester, as: testerAs },
    emailed: { receipt: receipt.ok, links: links.ok, record: record ? record.ok : false },
  });
}
