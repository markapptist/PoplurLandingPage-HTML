// The anonymous visitor id: a `pv` cookie the site sets on the first beacon
// and reads back when an email is entered, so a visit and the address it
// became are one row on the funnel. HttpOnly, same-site, a year.

import { randomUUID } from 'node:crypto';

export const VISITOR_COOKIE = 'pv';
const VISITOR_TTL_S = 365 * 24 * 60 * 60;
const VISITOR_ID = /^[0-9a-f-]{36}$/i;

export function readVisitorId(request: Request): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === VISITOR_COOKIE) {
      const value = decodeURIComponent(rest.join('='));
      return VISITOR_ID.test(value) ? value.toLowerCase() : null;
    }
  }
  return null;
}

/** The visitor id from the request, or a new one and the header that sets it. */
export function visitorFor(request: Request): { id: string; setCookie: string | null } {
  const existing = readVisitorId(request);
  if (existing) return { id: existing, setCookie: null };
  const id = randomUUID();
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return { id, setCookie: `${VISITOR_COOKIE}=${id}; Path=/; Max-Age=${VISITOR_TTL_S}; SameSite=Lax; HttpOnly${secure}` };
}
