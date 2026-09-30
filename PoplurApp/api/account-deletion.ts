import type { IncomingMessage, ServerResponse } from 'node:http';

// A standalone Vercel Node endpoint: no Expo runtime and no account mutation.
// Requests are sent only to the existing support/records inbox. Ownership must
// be checked by support before any deletion is carried out.
type Request = IncomingMessage & { body?: unknown };
const MAX_BODY = 4096;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const attempts = new Map<string, { count: number; expires: number }>();
const scopes: Record<string, string> = {
  account: 'Account and its data', posts: 'Own posts only; keep account',
  'profile-media': 'Profile media only; keep account',
};
const emailPattern = /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/;
const oneHeader = (v: string | string[] | undefined) => typeof v === 'string' ? v : '';
const escape = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function allowedOrigin(req: Request): boolean {
  const origin = oneHeader(req.headers.origin);
  if (origin === 'https://www.poplur.ca' || origin === 'https://poplur.ca') return true;
  if (process.env.VERCEL_URL && origin === `https://${process.env.VERCEL_URL}`) return true;
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    try { const url = new URL(origin); return url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname); }
    catch { return false; }
  }
  return false;
}

function admit(req: Request, now = Date.now()): boolean {
  for (const [key, value] of attempts) if (value.expires <= now) attempts.delete(key);
  // The Vercel edge supplies this IP; arbitrary client forwarding headers are
  // ignored when running outside Vercel (including local verification).
  const ip = process.env.VERCEL
    ? oneHeader(req.headers['x-vercel-forwarded-for']).split(',')[0].trim() || oneHeader(req.headers['x-real-ip'])
    : req.socket?.remoteAddress;
  const key = ip || 'unknown';
  const previous = attempts.get(key);
  if (previous && previous.count >= MAX_ATTEMPTS) return false;
  if (!previous && attempts.size >= 2048) return false;
  attempts.set(key, { count: (previous?.count || 0) + 1, expires: previous?.expires || now + WINDOW_MS });
  return true;
}

async function fields(req: Request): Promise<Record<string, string>> {
  const length = Number(oneHeader(req.headers['content-length']));
  if (Number.isFinite(length) && length > MAX_BODY) throw new Error('large');
  let raw = '';
  if (typeof req.body === 'string') raw = req.body;
  else if (Buffer.isBuffer(req.body)) raw = req.body.toString('utf8');
  else if (req.body && typeof req.body === 'object') {
    if (Buffer.byteLength(JSON.stringify(req.body)) > MAX_BODY) throw new Error('large');
    const out: Record<string, string> = Object.create(null);
    for (const [key, value] of Object.entries(req.body)) {
      if (typeof value !== 'string') throw new Error('invalid');
      out[key] = value;
    }
    return out;
  } else {
    let bytes = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > MAX_BODY) throw new Error('large');
      chunks.push(buffer);
    }
    raw = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.byteLength(raw) > MAX_BODY) throw new Error('large');
  const params = new URLSearchParams(raw);
  const out: Record<string, string> = Object.create(null);
  for (const [key, value] of params) {
    if (Object.hasOwn(out, key)) throw new Error('invalid');
    out[key] = value;
  }
  return out;
}

function respond(res: ServerResponse, status: number, title: string, message: string): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)} — Poplur</title><style>body{margin:0;padding:40px 20px;background:#f6f6f8;color:#111114;font:16px/1.6 -apple-system,BlinkMacSystemFont,Arial,sans-serif}main{max-width:640px;margin:auto;padding:28px;border:1px solid #e7e7ec;border-radius:22px;background:white}h1{font-size:28px;line-height:1.2}a{color:#b31267}a:focus-visible{outline:3px solid #146fbd;outline-offset:4px}</style><main><h1>${escape(title)}</h1><p>${escape(message)}</p><p><a href="/delete-account">Back to account deletion</a></p></main></html>`);
}

export default async function handler(req: Request, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return respond(res, 405, 'Send a deletion request', 'Use the form on the account-deletion page.');
  }
  if (!allowedOrigin(req)) return respond(res, 403, 'Request not sent', 'Open the account-deletion page on poplur.ca and try again.');
  if (!oneHeader(req.headers['content-type']).toLowerCase().startsWith('application/x-www-form-urlencoded')) {
    return respond(res, 415, 'Request not sent', 'Use the form on the account-deletion page.');
  }
  if (!admit(req)) {
    res.setHeader('Retry-After', String(WINDOW_MS / 1000));
    return respond(res, 429, 'Please wait', 'Too many attempts. Try again in 15 minutes.');
  }
  let body: Record<string, string>;
  try { body = await fields(req); }
  catch (error) { return respond(res, (error as Error).message === 'large' ? 413 : 400, 'Request not sent', 'The request was invalid or too long. Return to the form and try again.'); }
  if (body.website || Object.keys(body).some(key => !['email', 'scope', 'details', 'website'].includes(key))) {
    return respond(res, 400, 'Request not sent', 'Use the form on the account-deletion page.');
  }
  const email = (body.email || '').trim();
  const scope = scopes[body.scope || ''];
  const details = (body.details || '').trim();
  if (!emailPattern.test(email) || email.length > 254 || !Object.hasOwn(scopes, body.scope || '') || !scope || details.length > 500) {
    return respond(res, 400, 'Request not sent', 'Enter your account email, choose what to delete, and keep optional details under 500 characters.');
  }
  const recipient = (process.env.BETA_NDA_RECORDS_TO || process.env.BETA_EMAIL_REPLY_TO || '').trim();
  const key = process.env.RESEND_API_KEY;
  if (!key || !emailPattern.test(recipient)) return respond(res, 503, 'Request service unavailable', 'Your request has not been sent. Please try again later, or use Delete account in the app.');
  const text = `Poplur deletion request (ownership NOT verified)\nReceived: ${new Date().toISOString()}\nAccount email: ${email}\nRequested removal: ${scope}\nDetails: ${details || '(none)'}\n\nNo account or data was deleted. Verify ownership before processing. Do not ask for a password. This support email needs to be handled under the approved support-retention policy.`;
  try {
    const sent = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.BETA_EMAIL_FROM || 'Poplur <hello@poplur.ca>', to: recipient, reply_to: email, subject: 'Poplur account / data deletion request — ownership unverified', text, html: `<pre>${escape(text)}</pre>` }),
    });
    if (!sent.ok) throw new Error('delivery');
  } catch { return respond(res, 502, 'Request not sent', 'Poplur could not send your request. Please try again later. Your account has not been deleted.'); }
  return respond(res, 200, 'Deletion request received', 'Your request was sent to Poplur support. Your account and data have not yet been deleted. Poplur will contact you at the email you supplied to verify ownership before processing.');
}
