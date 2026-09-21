// Firestore over REST, for the site's API routes.
//
// The Admin SDK does not survive Metro's server bundle on Vercel (its module
// graph comes apart: "Cannot read properties of undefined (reading
// 'AppErrorCode')"), so the funnel talks to Firestore's REST API directly: a
// service-account JWT signed with node:crypto, exchanged for an access token
// (cached for its lifetime), then plain document reads, queries and commits.
// No dependency to bundle.

declare const require: any;
const { createSign } = require('node:crypto');

declare const Buffer: any;

export type ServiceAccount = { project_id: string; client_email: string; private_key: string };

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/datastore';

let tokenCache: { token: string; expiresAt: number; key: string } | null = null;

const b64url = (input: any): string => Buffer.from(input).toString('base64url');

/** An access token for the service account, minted at most once an hour. */
export async function accessToken(account: ServiceAccount): Promise<string> {
  const override = process.env.BETA_FUNNEL_TOKEN; // local runs: a gcloud token instead of a key
  if (override) return override;
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.key === account.client_email && tokenCache.expiresAt - 60 > now) return tokenCache.token;
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: account.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const assertion = `${header}.${claims}.${b64url(signer.sign(account.private_key))}`;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`token exchange ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: body.access_token, expiresAt: now + body.expires_in, key: account.client_email };
  return body.access_token;
}

// ---- value encoding ------------------------------------------------------

type FsValue = Record<string, unknown>;

export function encode(value: unknown): FsValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (typeof value === 'object') return { mapValue: { fields: encodeFields(value as Record<string, unknown>) } };
  return { stringValue: String(value) };
}

export function encodeFields(obj: Record<string, unknown>): Record<string, FsValue> {
  const out: Record<string, FsValue> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = encode(v);
  return out;
}

export function decode(value: FsValue | undefined): unknown {
  if (!value) return undefined;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (((value.arrayValue as { values?: FsValue[] }).values) ?? []).map(decode);
  if ('mapValue' in value) return decodeFields(((value.mapValue as { fields?: Record<string, FsValue> }).fields) ?? {});
  return undefined;
}

export function decodeFields(fields: Record<string, FsValue>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = decode(v);
  return out;
}

// ---- documents -----------------------------------------------------------

export type Doc = { name: string; fields: Record<string, unknown>; updateTime: string } | null;

export class Firestore {
  private account: ServiceAccount;
  private base: string;
  private root: string;
  constructor(account: ServiceAccount, projectId: string = account.project_id) {
    this.account = account;
    this.root = `projects/${projectId}/databases/(default)/documents`;
    this.base = `https://firestore.googleapis.com/v1/${this.root}`;
  }

  private async call(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await accessToken(this.account);
    return fetch(path.startsWith('http') ? path : `${this.base}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
  }

  docName(collection: string, id: string): string { return `${this.root}/${collection}/${id}`; }

  async get(collection: string, id: string): Promise<Doc> {
    const res = await this.call(`/${collection}/${encodeURIComponent(id)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`get ${collection}/${id}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    const body = (await res.json()) as { name: string; fields?: Record<string, FsValue>; updateTime: string };
    return { name: body.name, fields: decodeFields(body.fields ?? {}), updateTime: body.updateTime };
  }

  /** Set the whole document, guarded: `expect` is the updateTime read before
   *  (or null for "must not exist"). Returns false on a lost race (409). */
  async setGuarded(collection: string, id: string, fields: Record<string, unknown>, expect: string | null | undefined): Promise<boolean> {
    const write: Record<string, unknown> = {
      update: { name: this.docName(collection, id), fields: encodeFields(fields) },
      ...(expect === undefined ? {} : { currentDocument: expect === null ? { exists: false } : { updateTime: expect } }),
    };
    const res = await this.call(`https://firestore.googleapis.com/v1/${this.root}:commit`, { method: 'POST', body: JSON.stringify({ writes: [write] }) });
    if (res.status === 409) return false;
    if (!res.ok) throw new Error(`commit ${collection}/${id}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return true;
  }

  /** Merge fields into a document (create if missing). */
  async merge(collection: string, id: string, fields: Record<string, unknown>): Promise<void> {
    const mask = Object.keys(fields).map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
    const res = await this.call(`/${collection}/${encodeURIComponent(id)}?${mask}`, { method: 'PATCH', body: JSON.stringify({ fields: encodeFields(fields) }) });
    if (!res.ok) throw new Error(`merge ${collection}/${id}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }

  async delete(collection: string, id: string): Promise<void> {
    const res = await this.call(`/${collection}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw new Error(`delete ${collection}/${id}: ${res.status}`);
  }

  /** Every document in a collection, newest `orderBy` first. */
  async list(collection: string, orderBy: string, limit: number): Promise<NonNullable<Doc>[]> {
    const res = await this.call(`https://firestore.googleapis.com/v1/${this.root}:runQuery`, {
      method: 'POST',
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }], orderBy: [{ field: { fieldPath: orderBy }, direction: 'DESCENDING' }], limit } }),
    });
    if (!res.ok) throw new Error(`query ${collection}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    const rows = (await res.json()) as { document?: { name: string; fields?: Record<string, FsValue>; updateTime: string } }[];
    return rows.filter(r => r.document).map(r => ({ name: r.document!.name, fields: decodeFields(r.document!.fields ?? {}), updateTime: r.document!.updateTime }));
  }

  async count(collection: string): Promise<number> {
    const res = await this.call(`https://firestore.googleapis.com/v1/${this.root}:runAggregationQuery`, {
      method: 'POST',
      body: JSON.stringify({ structuredAggregationQuery: { structuredQuery: { from: [{ collectionId: collection }] }, aggregations: [{ alias: 'n', count: {} }] } }),
    });
    if (!res.ok) return 0;
    const rows = (await res.json()) as { result?: { aggregateFields?: { n?: FsValue } } }[];
    return Number(decode(rows[0]?.result?.aggregateFields?.n) ?? 0);
  }
}
