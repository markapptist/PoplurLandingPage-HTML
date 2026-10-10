// The beta test reports, filed on the site.
//
// GET  /api/report?t=…             — is this report link good? Answers the
//                                    masked address and which round is on.
//                                    Without a token: which round is on.
// POST /api/report {t?, email?, name, discord?, platform, device, osVersion,
//                   round, results[], ratings, answers}
//                                  — records the report: a receipt to the
//                                    tester and a copy to Poplur with the
//                                    JSON attached, then when it arrived, whether
//                                    it was late and what is next in the answer.
//
// A report that arrives through the tester's signed link (the one in their
// links email) is `verified`; the pinned Discord link has no token, so a
// report from there carries a typed email and is marked unverified in the
// copy Poplur keeps. As with the NDA, the record is the email to
// BETA_NDA_RECORDS_TO (or BETA_EMAIL_REPLY_TO) — no database write from here.

import { BETA_INVITE_ASSET_ORIGIN, betaInviteHostedImages, createReportReceiptHtml, createReportReceiptText, reportReceiptSubject } from '@/emails/betaInviteEmail';
import { RATINGS, REPORT_ROUNDS, REPORT_VERSION, TASK_RESULTS, currentRound, isLate, roundByNumber, type BetaReport, type Platform, type RatingId, type TaskResult } from '@/report/betaTestPlan';
import { recordTesterEvent } from '@/server/betaFunnel.server';
import { maskEmail } from '@/server/betaNda.server';
import { verifyReportToken, type ReportTokenCheck } from '@/server/betaReport.server';
import { replyToAddress, sendWithResend } from '@/server/resend.server';

declare const Buffer: any;

const REASONS: Record<Exclude<ReportTokenCheck, { ok: true }>['reason'], string> = {
  missing: 'This page needs the report link from your beta email.',
  malformed: 'That report link is not complete. Open it from your beta email again.',
  'bad-signature': 'That report link is not one we issued. Open the one in your beta email.',
  expired: 'That report link has expired. Ask in the focus-group Discord for a new one.',
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function roundSummary(n: number) {
  const r = roundByNumber(n);
  return r ? { number: r.number, name: r.name, dueLabel: r.dueLabel, dueAt: r.dueAt } : null;
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('t');
  const round = currentRound();
  if (!token) return Response.json({ ok: true, verified: false, round: round.number, version: REPORT_VERSION });
  const check = verifyReportToken(token);
  if (!check.ok) return Response.json({ ok: false, reason: check.reason, error: REASONS[check.reason] }, { status: 400 });
  await recordTesterEvent(check.email, 'report_opened', { round: round.number });
  return Response.json({ ok: true, verified: true, email: maskEmail(check.email), round: round.number, version: REPORT_VERSION });
}

type FileRequest = {
  t?: unknown; email?: unknown; name?: unknown; discord?: unknown; platform?: unknown; device?: unknown; osVersion?: unknown;
  round?: unknown; results?: unknown; ratings?: unknown; answers?: unknown;
};

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim().slice(0, max) : '');

export async function POST(request: Request) {
  let body: FileRequest;
  try {
    body = (await request.json()) as FileRequest;
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  // Who: a signed link, or a typed address from the pinned link.
  let email = '';
  let verified = false;
  if (typeof body.t === 'string' && body.t) {
    const check = verifyReportToken(body.t);
    if (!check.ok) return Response.json({ ok: false, reason: check.reason, error: REASONS[check.reason] }, { status: 400 });
    email = check.email;
    verified = true;
  } else {
    email = str(body.email, 120).toLowerCase();
    if (!EMAIL_PATTERN.test(email)) return Response.json({ error: 'Enter the email address you signed the tester agreement with.' }, { status: 400 });
  }

  const name = str(body.name, 80);
  if (name.length < 2 || !/\S\s+\S/.test(name)) return Response.json({ error: 'Enter your full name — first and last, as on your tester agreement.' }, { status: 400 });
  const discord = str(body.discord, 64) || null;

  const platform = body.platform === 'ios' || body.platform === 'android' ? (body.platform as Platform) : null;
  if (!platform) return Response.json({ error: 'Pick iPhone or Android.' }, { status: 400 });
  const device = str(body.device, 60);
  const osVersion = str(body.osVersion, 40);
  if (!device) return Response.json({ error: 'Which phone is it? (“iPhone 13”, “Pixel 7”, “Galaxy A03”…)' }, { status: 400 });
  if (!osVersion) return Response.json({ error: 'Which OS version? Settings → General → About on iPhone, Settings → About phone on Android.' }, { status: 400 });

  const round = roundByNumber(Number(body.round));
  if (!round) return Response.json({ error: `Pick a report: 1 to ${REPORT_ROUNDS.length}.` }, { status: 400 });

  // Every test in the round needs an answer; notes are optional but short.
  const given = new Map<string, { result: TaskResult; note: string | null }>();
  if (Array.isArray(body.results)) {
    for (const item of body.results as unknown[]) {
      if (!item || typeof item !== 'object') continue;
      const { id, result, note } = item as { id?: unknown; result?: unknown; note?: unknown };
      if (typeof id !== 'string' || !TASK_RESULTS.some(r => r.value === result)) continue;
      given.set(id, { result: result as TaskResult, note: text(note, 600) || null });
    }
  }
  const results = round.tasks.map(task => {
    const g = given.get(task.id);
    return g ? { id: task.id, title: task.title, result: g.result, note: g.note } : null;
  });
  const missing = round.tasks.filter((_, i) => !results[i]);
  if (missing.length) return Response.json({ error: `Answer every test first — ${missing.length} left: ${missing.map(t => t.title).join(', ')}.` }, { status: 400 });

  const ratingsIn = body.ratings && typeof body.ratings === 'object' ? (body.ratings as Record<string, unknown>) : {};
  const ratings = {} as Record<RatingId, number | null>;
  for (const r of RATINGS) {
    const v = Number(ratingsIn[r.id]);
    ratings[r.id] = Number.isInteger(v) && v >= 1 && v <= 5 ? v : null;
  }
  if (RATINGS.some(r => ratings[r.id] === null)) return Response.json({ error: 'Give the three ratings, 1 to 5.' }, { status: 400 });

  const answersIn = body.answers && typeof body.answers === 'object' ? (body.answers as Record<string, unknown>) : {};
  const answers = round.questions.map(q => ({ id: q.id, question: q.question, answer: text(answersIn[q.id], 2000) }));
  const unanswered = round.questions.filter(q => q.required && !answers.find(a => a.id === q.id)?.answer);
  if (unanswered.length) return Response.json({ error: `Every report needs your feedback — answer: ${unanswered.map(q => q.question).join(' ')}` }, { status: 400 });

  if (!process.env.RESEND_API_KEY) {
    return Response.json({ error: 'Email service is not configured. Set RESEND_API_KEY on the server.' }, { status: 503 });
  }

  const receivedAt = new Date();
  const late = isLate(round, receivedAt.getTime());
  const forwarded = request.headers.get('x-forwarded-for');
  const report: BetaReport = {
    reportVersion: REPORT_VERSION,
    round: round.number,
    roundName: round.name,
    dueAt: round.dueAt,
    receivedAt: receivedAt.toISOString(),
    late,
    verified,
    email,
    name,
    discord,
    platform,
    device,
    osVersion,
    results: results as BetaReport['results'],
    ratings,
    answers,
    ip: forwarded ? forwarded.split(',')[0].trim() : request.headers.get('x-real-ip'),
    userAgent: request.headers.get('user-agent'),
  };

  const images = betaInviteHostedImages(process.env.BETA_EMAIL_ASSET_ORIGIN || BETA_INVITE_ASSET_ORIGIN);
  const replyTo = replyToAddress();
  const recordsTo = process.env.BETA_NDA_RECORDS_TO || replyTo;

  // Poplur's copy first: it is the record. If it cannot go out, nothing counts.
  const record = recordsTo
    ? await sendWithResend({
        to: recordsTo,
        subject: reportReceiptSubject(report, true),
        html: createReportReceiptHtml(report, { forPoplur: true, images }),
        text: createReportReceiptText(report, { forPoplur: true }),
        tag: 'record',
        attachments: [{
          filename: `poplur-report-${report.round}-${email.replace(/[^a-z0-9]+/gi, '-')}-${receivedAt.toISOString().slice(0, 10)}.json`,
          content: Buffer.from(JSON.stringify(report, null, 2), 'utf8').toString('base64'),
          contentType: 'application/json',
        }],
      })
    : null;
  if (record && !record.ok) return Response.json({ error: record.error }, { status: 502 });

  const receipt = await sendWithResend({
    to: email,
    replyTo,
    subject: reportReceiptSubject(report),
    html: createReportReceiptHtml(report, { images }),
    text: createReportReceiptText(report),
    tag: 'report-receipt',
  });

  const funnel = await recordTesterEvent(email, 'report_filed', {
    round: round.number, roundName: round.name, late, verified, platform, device, name,
  });

  return Response.json({
    ok: true,
    recorded: funnel.recorded,
    receivedAt: report.receivedAt,
    round: round.number,
    late,
    next: roundSummary(round.number + 1),
    emailed: { receipt: receipt.ok, record: record ? record.ok : false },
  });
}
