// Server-only helpers for the beta tester agreement (a gate on the store links
// from 20 Sep to 6 Oct 2026; optional since). `signPayload`/`openPayload` also
// sign the report tokens (betaReport.server.ts) that every invite link rides
// on. Imported by the API routes, never by a page: it needs node:crypto.
//
// The signing link in the invite carries a token: the tester's email and the
// minute it was issued, signed with HMAC-SHA256. The secret is BETA_NDA_SECRET
// when set; otherwise it is derived from RESEND_API_KEY, which is already on
// the server and never leaves it, so the gate works with no new configuration.
// A token expires after NDA_TOKEN_TTL_MS and is bound to one address.

import { ndaCanonicalText } from '@/nda/betaTesterNda';

declare const require: any;
// The project's tsconfig carries no Node typings; the route runs on Node.
declare const Buffer: any;

const { createHash, createHmac, timingSafeEqual } = require('node:crypto');

export const NDA_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function secret(): string | null {
  if (process.env.BETA_NDA_SECRET) return process.env.BETA_NDA_SECRET;
  if (process.env.RESEND_API_KEY) return createHash('sha256').update(`poplur-beta-nda:${process.env.RESEND_API_KEY}`).digest('hex');
  return null;
}

export function ndaTokenConfigured(): boolean {
  return secret() !== null;
}

const b64url = (buf: unknown): string => Buffer.from(buf).toString('base64url');
const unb64url = (s: string): string => Buffer.from(s, 'base64url').toString('utf8');

function sign(payload: string): string {
  const key = secret();
  if (!key) throw new Error('The NDA signing secret is not configured.');
  return b64url(createHmac('sha256', key).update(payload).digest());
}

/** `payload` signed: what every link the site issues is made of. */
export function signPayload(payload: string): string {
  return `${b64url(payload)}.${sign(payload)}`;
}

export type OpenedPayload = { ok: true; payload: string } | { ok: false; reason: 'missing' | 'malformed' | 'bad-signature' };

/** The payload back out of a signed token, or why not. Constant-time on the signature. */
export function openPayload(token: string | null | undefined): OpenedPayload {
  if (!token) return { ok: false, reason: 'missing' };
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return { ok: false, reason: 'malformed' };
  const encoded = token.slice(0, dot);
  const given = token.slice(dot + 1);
  let payload: string;
  try { payload = unb64url(encoded); } catch { return { ok: false, reason: 'malformed' }; }
  let expected: string;
  try { expected = sign(payload); } catch { return { ok: false, reason: 'bad-signature' }; }
  const a = Buffer.from(given), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'bad-signature' };
  return { ok: true, payload };
}

/** A token for this address, valid for NDA_TOKEN_TTL_MS from now. */
export function createNdaToken(email: string, issuedAtMs: number = Date.now()): string {
  return signPayload(`${email.trim().toLowerCase()}|${issuedAtMs}`);
}

export type NdaTokenCheck =
  | { ok: true; email: string; issuedAtMs: number }
  | { ok: false; reason: 'missing' | 'malformed' | 'bad-signature' | 'expired' };

export function verifyNdaToken(token: string | null | undefined, nowMs: number = Date.now()): NdaTokenCheck {
  const opened = openPayload(token);
  if (!opened.ok) return opened;
  // Exactly `email|issuedAt`: a token issued for another purpose (server/betaReport.server.ts
  // prefixes its payloads) carries more bars and is not a signing link.
  const parts = opened.payload.split('|');
  if (parts.length !== 2) return { ok: false, reason: 'malformed' };
  const [email, issued] = parts;
  const issuedAtMs = Number(issued);
  if (!Number.isFinite(issuedAtMs) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, reason: 'malformed' };
  if (nowMs - issuedAtMs > NDA_TOKEN_TTL_MS || issuedAtMs - nowMs > 5 * 60 * 1000) return { ok: false, reason: 'expired' };
  return { ok: true, email, issuedAtMs };
}

/** SHA-256 of the agreement's canonical text, stored with every acceptance so
 *  a signed copy can be matched to the exact words that were signed. */
export function ndaSha256(): string {
  return createHash('sha256').update(ndaCanonicalText()).digest('hex');
}

/** "m•••@gmail.com": enough for the signer to recognise the address the link
 *  was issued to, without the page printing it in full before they sign. */
export function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return email;
  return `${user.slice(0, 1)}•••@${domain}`;
}
