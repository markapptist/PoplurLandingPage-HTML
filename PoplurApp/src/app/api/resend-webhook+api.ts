// POST /api/resend-webhook — Resend's delivery events, stamped on the funnel.
//
// Resend signs webhooks the Svix way: `svix-id`, `svix-timestamp`,
// `svix-signature` headers, HMAC-SHA256 over `${id}.${timestamp}.${body}`
// with the secret after `whsec_`, base64. RESEND_WEBHOOK_SECRET must be set;
// an unsigned or mis-signed call is refused.
//
// Which email an event is about comes from the `poplur` tag the site puts on
// every send (server/resend.server.ts): `invite` (the NDA link), `links`
// (after signing), receipts. Delivered / opened / clicked map to the funnel
// stages for the invite and the links mail; bounces and complaints are
// recorded for any mail so the row shows why a tester went quiet.

declare const require: any;
const { createHmac, timingSafeEqual } = require('node:crypto');
import { recordTesterEvent, type FunnelStage } from '@/server/betaFunnel.server';

declare const Buffer: any;

const TOLERANCE_S = 5 * 60;

type ResendEvent = {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    subject?: string;
    tags?: Record<string, string> | { name: string; value: string }[];
    click?: { link?: string; user_agent?: string };
    bounce?: { type?: string; message?: string };
  };
};

function verify(request: Request, body: string): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const id = request.headers.get('svix-id');
  const timestamp = request.headers.get('svix-timestamp');
  const signatures = request.headers.get('svix-signature');
  if (!secret || !id || !timestamp || !signatures) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > TOLERANCE_S) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest();
  for (const entry of signatures.split(' ')) {
    const [version, value] = entry.split(',');
    if (version !== 'v1' || !value) continue;
    const given = Buffer.from(value, 'base64');
    if (given.length === expected.length && timingSafeEqual(given, expected)) return true;
  }
  return false;
}

function tagOf(tags: NonNullable<ResendEvent['data']>['tags']): string | null {
  if (!tags) return null;
  if (Array.isArray(tags)) return tags.find(t => t.name === 'poplur')?.value ?? null;
  return typeof tags.poplur === 'string' ? tags.poplur : null;
}

const STAGES: Record<string, Partial<Record<'invite' | 'links', FunnelStage>>> = {
  'email.delivered': { invite: 'invite_delivered', links: 'links_delivered' },
  'email.opened': { invite: 'invite_opened', links: 'links_opened' },
  'email.clicked': { invite: 'invite_clicked', links: 'links_clicked' },
};

export async function POST(request: Request) {
  const body = await request.text();
  if (!verify(request, body)) return Response.json({ error: 'Bad signature.' }, { status: 401 });
  let event: ResendEvent;
  try { event = JSON.parse(body) as ResendEvent; } catch { return Response.json({ error: 'Invalid body.' }, { status: 400 }); }

  const type = event.type ?? '';
  const data = event.data ?? {};
  const to = Array.isArray(data.to) ? data.to[0] : data.to;
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return Response.json({ ok: true, ignored: 'no recipient' });
  const tag = tagOf(data.tags);

  let stage: FunnelStage | null = null;
  if (type === 'email.bounced') stage = 'email_bounced';
  else if (type === 'email.complained') stage = 'email_complained';
  else if ((tag === 'invite' || tag === 'links') && STAGES[type]) stage = STAGES[type][tag] ?? null;
  if (!stage) return Response.json({ ok: true, ignored: type });

  const detail: Record<string, string | number | boolean | null> = { resendId: data.email_id ?? null, mail: tag ?? null };
  if (data.click?.link) detail.link = data.click.link.slice(0, 300);
  if (data.bounce?.type) detail.bounce = data.bounce.type;
  const result = await recordTesterEvent(to, stage, detail);
  return Response.json({ ok: true, stage, ...result });
}
