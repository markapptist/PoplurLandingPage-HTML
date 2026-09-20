// Server-only helpers for the beta report link. Imported by api/report+api.ts.
//
// A report link carries `report|email|issuedAt`, signed with the same secret as
// the NDA link (betaNda.server.ts). The prefix keeps the two kinds apart: an
// NDA token is exactly `email|issuedAt` and is refused here, and this one is
// refused there. Report links last the whole beta.

import { openPayload, signPayload } from '@/server/betaNda.server';

export const REPORT_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export function createReportToken(email: string, issuedAtMs: number = Date.now()): string {
  return signPayload(`report|${email.trim().toLowerCase()}|${issuedAtMs}`);
}

export type ReportTokenCheck =
  | { ok: true; email: string; issuedAtMs: number }
  | { ok: false; reason: 'missing' | 'malformed' | 'bad-signature' | 'expired' };

export function verifyReportToken(token: string | null | undefined, nowMs: number = Date.now()): ReportTokenCheck {
  const opened = openPayload(token);
  if (!opened.ok) return opened;
  const parts = opened.payload.split('|');
  if (parts.length !== 3 || parts[0] !== 'report') return { ok: false, reason: 'malformed' };
  const [, email, issued] = parts;
  const issuedAtMs = Number(issued);
  if (!Number.isFinite(issuedAtMs) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, reason: 'malformed' };
  if (nowMs - issuedAtMs > REPORT_TOKEN_TTL_MS || issuedAtMs - nowMs > 5 * 60 * 1000) return { ok: false, reason: 'expired' };
  return { ok: true, email, issuedAtMs };
}
