// POST /api/bug — a bug report from a tester, with screenshots.
//
// On the site rather than in a Google Form because Google makes anyone
// attaching a file sign in to a Google account. A tester arrives with the
// signed link from their beta email (the same token the report page uses), so
// the report is bound to the address that signed the agreement; the pinned
// link has no token and then the page asks for that address instead.
//
// The record is email, as it is for the agreement and the reports: the report
// goes to BETA_NDA_RECORDS_TO (or BETA_EMAIL_REPLY_TO) with the screenshots
// attached and the JSON beside them, and the tester gets a short receipt.

import { BETA_INVITE_ASSET_ORIGIN, betaInviteHostedImages, createBugReceiptHtml, createBugReceiptText, createBugReportHtml, createBugReportText, bugReportSubject } from '@/emails/betaInviteEmail';
import {
  BUG_MAX_SHOTS, BUG_MAX_SHOT_BYTES, BUG_MAX_TOTAL_BYTES, BUG_SHOT_TYPES, BUG_VERSION,
  dataUrlBytes, isBugArea, isBugFrequency, isBugImpact,
  type BugPlatform, type BugReport, type BugShot,
} from '@/bugs/bugReport';
import { recordTesterEvent } from '@/server/betaFunnel.server';
import { verifyReportToken } from '@/server/betaReport.server';
import { replyToAddress, sendWithResend, type ResendAttachment } from '@/server/resend.server';

declare const Buffer: any;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim().slice(0, max) : '');

type BugRequest = Record<string, unknown>;

/** A screenshot the page sent: a data URL of a type we can attach, within the size cap. */
function readShot(value: unknown, index: number): BugShot | { error: string } {
  if (!value || typeof value !== 'object') return { error: 'A screenshot did not arrive in one piece. Try attaching it again.' };
  const { name, type, dataUrl } = value as { name?: unknown; type?: unknown; dataUrl?: unknown };
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return { error: 'A screenshot did not arrive in one piece. Try attaching it again.' };
  const kind = typeof type === 'string' ? type : '';
  if (!(BUG_SHOT_TYPES as readonly string[]).includes(kind)) return { error: 'Screenshots need to be a photo file — JPEG, PNG or WebP.' };
  const bytes = dataUrlBytes(dataUrl);
  if (bytes > BUG_MAX_SHOT_BYTES) return { error: 'One screenshot is too big even after shrinking. Try a single screen rather than a recording.' };
  const safe = (typeof name === 'string' ? name : '').replace(/[^\w.\-]+/g, '-').slice(0, 60) || `screenshot-${index + 1}`;
  const ext = kind === 'image/png' ? 'png' : kind === 'image/webp' ? 'webp' : 'jpg';
  return { name: /\.(jpe?g|png|webp)$/i.test(safe) ? safe : `${safe}.${ext}`, type: kind, dataUrl };
}

export async function POST(request: Request) {
  let body: BugRequest;
  try {
    body = (await request.json()) as BugRequest;
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  // Who: the signed link from their beta email, else a typed address.
  let email = '';
  let verified = false;
  if (typeof body.t === 'string' && body.t) {
    const check = verifyReportToken(body.t);
    if (check.ok) { email = check.email; verified = true; }
  }
  if (!verified) {
    email = str(body.email, 120).toLowerCase();
    if (!EMAIL_PATTERN.test(email)) return Response.json({ error: 'Enter the email address you signed the tester agreement with.' }, { status: 400 });
  }

  const name = str(body.name, 80);
  if (name.length < 2) return Response.json({ error: 'Enter your name, so the points land on the right person.' }, { status: 400 });
  const discord = str(body.discord, 64) || null;

  const platform: BugPlatform | null = body.platform === 'ios' || body.platform === 'android' ? body.platform : null;
  if (!platform) return Response.json({ error: 'Pick iPhone or Android.' }, { status: 400 });
  const device = str(body.device, 60);
  const osVersion = str(body.osVersion, 40);
  if (!device) return Response.json({ error: 'Which phone is it? (“iPhone 13”, “Pixel 7”, “Galaxy A03”…)' }, { status: 400 });
  if (!osVersion) return Response.json({ error: 'Which OS version? Settings → General → About on iPhone, Settings → About phone on Android.' }, { status: 400 });
  const appVersion = str(body.appVersion, 40) || null;

  if (!isBugArea(body.area)) return Response.json({ error: 'Pick where in the app it happened.' }, { status: 400 });
  if (!isBugFrequency(body.frequency)) return Response.json({ error: 'Say how often it happens.' }, { status: 400 });
  if (!isBugImpact(body.impact)) return Response.json({ error: 'Say whether you could carry on.' }, { status: 400 });

  const doing = text(body.doing, 2000);
  const expected = text(body.expected, 2000);
  const happened = text(body.happened, 2000);
  if (!doing) return Response.json({ error: 'Say what you were doing when it happened.' }, { status: 400 });
  if (!expected) return Response.json({ error: 'Say what you expected to happen.' }, { status: 400 });
  if (!happened) return Response.json({ error: 'Say what happened instead.' }, { status: 400 });
  const extra = text(body.extra, 2000) || null;

  const rawShots = Array.isArray(body.shots) ? body.shots.slice(0, BUG_MAX_SHOTS) : [];
  const shots: BugShot[] = [];
  let totalBytes = 0;
  for (let i = 0; i < rawShots.length; i += 1) {
    const shot = readShot(rawShots[i], i);
    if ('error' in shot) return Response.json({ error: shot.error }, { status: 400 });
    totalBytes += dataUrlBytes(shot.dataUrl);
    if (totalBytes > BUG_MAX_TOTAL_BYTES) return Response.json({ error: 'Those screenshots are too big together. Send the clearest one or two.' }, { status: 413 });
    shots.push(shot);
  }

  if (!process.env.RESEND_API_KEY) {
    return Response.json({ error: 'Email service is not configured. Set RESEND_API_KEY on the server.' }, { status: 503 });
  }

  const forwarded = request.headers.get('x-forwarded-for');
  const report: BugReport = {
    bugVersion: BUG_VERSION,
    receivedAt: new Date().toISOString(),
    verified,
    email,
    name,
    discord,
    platform,
    device,
    osVersion,
    appVersion,
    area: body.area,
    doing,
    expected,
    happened,
    frequency: body.frequency,
    impact: body.impact,
    extra,
    shots: shots.map(s => ({ name: s.name, bytes: dataUrlBytes(s.dataUrl) })),
    ip: forwarded ? forwarded.split(',')[0].trim() : request.headers.get('x-real-ip'),
    userAgent: request.headers.get('user-agent'),
  };

  const images = betaInviteHostedImages(process.env.BETA_EMAIL_ASSET_ORIGIN || BETA_INVITE_ASSET_ORIGIN);
  const replyTo = replyToAddress();
  const recordsTo = process.env.BETA_NDA_RECORDS_TO || replyTo;

  const attachments: ResendAttachment[] = shots.map(shot => ({
    filename: shot.name,
    content: shot.dataUrl.slice(shot.dataUrl.indexOf(',') + 1),
    contentType: shot.type,
  }));
  attachments.push({
    filename: `poplur-bug-${report.receivedAt.slice(0, 10)}-${email.replace(/[^a-z0-9]+/gi, '-')}.json`,
    content: Buffer.from(JSON.stringify(report, null, 2), 'utf8').toString('base64'),
    contentType: 'application/json',
  });

  // Poplur's copy is the record; if it cannot go out, the tester is told.
  const record = recordsTo
    ? await sendWithResend({
        to: recordsTo,
        replyTo: email,
        subject: bugReportSubject(report),
        html: createBugReportHtml(report, { images }),
        text: createBugReportText(report),
        attachments,
      })
    : null;
  if (record && !record.ok) return Response.json({ error: record.error }, { status: 502 });

  const receipt = await sendWithResend({
    to: email,
    replyTo,
    subject: 'Bug report received — thank you',
    html: createBugReceiptHtml(report, { images }),
    text: createBugReceiptText(report),
  });

  await recordTesterEvent(email, 'bug_filed', {
    area: report.area, impact: report.impact, frequency: report.frequency,
    platform: report.platform, shots: shots.length, verified,
  });

  return Response.json({
    ok: true,
    receivedAt: report.receivedAt,
    shots: shots.length,
    emailed: { record: record ? record.ok : false, receipt: receipt.ok },
  });
}
