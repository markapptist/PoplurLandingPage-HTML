// The beta funnel: who visited, entered an email, opened and clicked the
// invite, signed the agreement, went to a store, and filed a report.
//
// One Firestore collection on the poplur2025 project, `betaFunnel`, one
// document per lower-cased email address, with an append-only `events`
// timeline and a few "latest" fields the /funnel page sorts on. Visitors who
// have not typed an email live under `betaVisitors/{visitorId}` until the
// form links them to an address.
//
// Every write here is best-effort: the site's job is to send the email, sign
// the agreement, take the report. If the store is not configured (no
// FIREBASE_SERVICE_ACCOUNT on Vercel) or a write fails, the route carries on
// and the caller gets `{recorded:false}` — never an error to the tester.
//
// Credentials: FIREBASE_SERVICE_ACCOUNT holds the service-account JSON (or
// its base64), set on Vercel; the store is Firestore over REST
// (server/firestoreRest.server.ts) because the Admin SDK does not survive the
// server bundle. Locally, BETA_FUNNEL_TOKEN=$(gcloud auth print-access-token)
// stands in for the key (never set on Vercel). The phone apps' Firestore
// rules do not allow clients into these collections; only this server writes.

declare const require: any;
const { createHash } = require('node:crypto');

export type FunnelStage =
  | 'visited'
  | 'email_entered'
  | 'invite_delivered'
  | 'invite_opened'
  | 'invite_clicked'
  | 'nda_opened'
  | 'nda_signed'
  | 'links_delivered'
  | 'links_opened'
  | 'links_clicked'
  | 'store_ios'
  | 'store_android'
  | 'report_opened'
  | 'form_opened'
  | 'form_filed'
  | 'report_filed'
  | 'email_bounced'
  | 'email_complained';

/** Funnel order, for the page's columns and for "furthest stage reached". */
export const FUNNEL_ORDER: FunnelStage[] = [
  'visited', 'email_entered', 'invite_delivered', 'invite_opened', 'invite_clicked',
  'nda_opened', 'nda_signed', 'links_delivered', 'links_opened', 'links_clicked',
  'store_ios', 'store_android', 'report_opened', 'form_opened', 'form_filed', 'report_filed',
];

/** What the /funnel page calls each stage. */
export const STAGE_LABELS: Record<FunnelStage, string> = {
  visited: 'Visited', email_entered: 'Email', invite_delivered: 'Invite delivered', invite_opened: 'Invite opened',
  invite_clicked: 'Invite clicked', nda_opened: 'NDA opened', nda_signed: 'Signed', links_delivered: 'Links delivered',
  links_opened: 'Links opened', links_clicked: 'Links clicked', store_ios: 'TestFlight', store_android: 'Google Play',
  report_opened: 'Report opened', form_opened: 'Weekly form', form_filed: 'Form filed', report_filed: 'Report filed',
  email_bounced: 'Bounced', email_complained: 'Complained',
};

export type FunnelEvent = {
  stage: FunnelStage;
  at: string;
  /** Free detail: invite variant, round number, store, user agent, Resend id … */
  detail?: Record<string, string | number | boolean | null>;
};

import { Firestore, type ServiceAccount } from '@/server/firestoreRest.server';

declare const Buffer: any;

/** The last initialisation failure's message, for storeStatus(). */
let initError: string | null = null;

function serviceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  try {
    const parsed = JSON.parse(text) as Partial<ServiceAccount>;
    if (typeof parsed.client_email !== 'string' || typeof parsed.private_key !== 'string' || typeof parsed.project_id !== 'string') return null;
    return parsed as ServiceAccount;
  } catch { return null; }
}

const useToken = (): boolean => !!process.env.BETA_FUNNEL_TOKEN;

export function funnelConfigured(): boolean {
  return serviceAccount() !== null || useToken();
}

/** Why the store is or is not configured — for the /funnel page, never the
 *  value itself: `missing`, `unparsable` (with the raw length and whether it
 *  starts with a brace) or `ok` (with the client email's domain). */
export function storeStatus(): { state: 'ok' | 'missing' | 'unparsable' | 'token'; length?: number; startsWithBrace?: boolean; clientDomain?: string; initError?: string | null } {
  if (useToken()) return { state: 'token', initError };
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return { state: 'missing' };
  const parsed = serviceAccount();
  if (!parsed) return { state: 'unparsable', length: raw.length, startsWithBrace: raw.trim().startsWith('{') };
  return { state: 'ok', length: raw.length, clientDomain: parsed.client_email.split('@')[1] ?? '', initError };
}

let client: Firestore | null = null;

/** The Firestore REST client; null when the site has no credentials. */
function firestore(): Firestore | null {
  if (client) return client;
  const account = serviceAccount() ?? (useToken() ? { project_id: 'poplur2025', client_email: 'token', private_key: '' } : null);
  if (!account) return null;
  client = new Firestore(account, 'poplur2025');
  return client;
}

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** Document ids are a hash of the address: no addresses in paths or logs. */
export function testerId(email: string): string {
  return createHash('sha256').update(normalizeEmail(email)).digest('hex').slice(0, 32);
}

const TESTERS = 'betaFunnel';
const VISITORS = 'betaVisitors';
const MAX_EVENTS = 400;

export type RecordResult = { recorded: boolean };

/** Append one event to a tester's timeline and refresh the summary fields:
 *  read, fold, write guarded by the read's updateTime, retry on a race. */
export async function recordTesterEvent(email: string, stage: FunnelStage, detail?: FunnelEvent['detail'], visitorId?: string | null): Promise<RecordResult> {
  const db = firestore();
  if (!db) return { recorded: false };
  const address = normalizeEmail(email);
  const id = testerId(address);
  const at = new Date().toISOString();
  const event: FunnelEvent = { stage, at, ...(detail ? { detail } : {}) };
  try {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const doc = await db.get(TESTERS, id);
      const data = doc?.fields ?? {};
      const events = Array.isArray(data.events) ? (data.events as FunnelEvent[]) : [];
      const next = [...events, event].slice(-MAX_EVENTS);
      const stages = new Set<FunnelStage>(next.map(e => e.stage));
      const furthest = [...FUNNEL_ORDER].reverse().find(s => stages.has(s)) ?? stage;
      const stageAt = { ...((data.stageAt as Record<string, string> | undefined) ?? {}) };
      if (!stageAt[stage]) stageAt[stage] = at;
      const fields = {
        ...data,
        email: address,
        firstSeenAt: (data.firstSeenAt as string | undefined) ?? at,
        ...(visitorId ? { visitorId } : {}),
        lastSeenAt: at,
        lastStage: stage,
        furthestStage: furthest,
        furthestIndex: FUNNEL_ORDER.indexOf(furthest),
        stageAt,
        eventCount: next.length,
        events: next,
      };
      if (await db.setGuarded(TESTERS, id, fields, doc ? doc.updateTime : null)) return { recorded: true };
    }
    initError = 'write raced four times';
    return { recorded: false };
  } catch (error) {
    initError = error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300);
    console.error('[betaFunnel] write failed:', initError);
    return { recorded: false };
  }
}

/** A visit by someone with no email yet: counted per anonymous visitor id.
 *  Returns false when unconfigured so the beacon can stay silent. */
export async function recordVisit(visitorId: string, detail: { path: string; referrer: string | null; userAgent: string | null }): Promise<RecordResult> {
  const db = firestore();
  if (!db) return { recorded: false };
  const at = new Date().toISOString();
  try {
    const doc = await db.get(VISITORS, visitorId);
    const data = doc?.fields ?? {};
    await db.merge(VISITORS, visitorId, {
      ...(detail.referrer ? { referrer: detail.referrer } : {}),
      ...(detail.userAgent ? { userAgent: detail.userAgent.slice(0, 300) } : {}),
      lastPath: detail.path,
      lastSeenAt: at,
      visits: Number(data.visits ?? 0) + 1,
      firstSeenAt: (data.firstSeenAt as string | undefined) ?? at,
    });
    return { recorded: true };
  } catch (error) {
    initError = error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300);
    console.error('[betaFunnel] visit write failed:', initError);
    return { recorded: false };
  }
}

/** When an email is entered, the anonymous visitor becomes this tester. */
export async function linkVisitor(visitorId: string, email: string): Promise<void> {
  const db = firestore();
  if (!db) return;
  try {
    await db.merge(VISITORS, visitorId, { testerId: testerId(email), linkedAt: new Date().toISOString() });
  } catch { /* best effort */ }
}

export type TesterRow = {
  id: string;
  email: string;
  /** The anonymous visitor this address came from, when the beacon saw them first. */
  visitorId: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  furthestStage: FunnelStage;
  furthestIndex: number;
  stageAt: Partial<Record<FunnelStage, string>>;
  eventCount: number;
  events: FunnelEvent[];
};

export type FunnelSummary = {
  configured: boolean;
  generatedAt: string;
  visitors: number;
  testers: TesterRow[];
  /** How many testers reached each stage (at least once). */
  reached: Record<FunnelStage, number>;
};

/** Everything the /funnel page shows. */
export async function funnelSummary(limit = 500): Promise<FunnelSummary> {
  const generatedAt = new Date().toISOString();
  const reached = Object.fromEntries(FUNNEL_ORDER.map(s => [s, 0])) as Record<FunnelStage, number>;
  const db = firestore();
  if (!db) return { configured: false, generatedAt, visitors: 0, testers: [], reached };
  try {
    const [visitorCount, docs] = await Promise.all([db.count(VISITORS), db.list(TESTERS, 'lastSeenAt', limit)]);
    const testers: TesterRow[] = docs.map(doc => {
      const d = doc.fields;
      const events = Array.isArray(d.events) ? (d.events as FunnelEvent[]) : [];
      const stageAt = (d.stageAt as Partial<Record<FunnelStage, string>> | undefined) ?? {};
      for (const s of FUNNEL_ORDER) if (stageAt[s]) reached[s] += 1;
      return {
        id: doc.name.split('/').pop() ?? '',
        email: String(d.email ?? ''),
        visitorId: typeof d.visitorId === 'string' ? d.visitorId : null,
        firstSeenAt: String(d.firstSeenAt ?? d.lastSeenAt ?? ''),
        lastSeenAt: String(d.lastSeenAt ?? ''),
        furthestStage: (d.furthestStage as FunnelStage) ?? 'email_entered',
        furthestIndex: Number(d.furthestIndex ?? 1),
        stageAt,
        eventCount: Number(d.eventCount ?? events.length),
        events,
      };
    });
    reached.visited = Math.max(reached.visited, visitorCount);
    return { configured: true, generatedAt, visitors: visitorCount, testers, reached };
  } catch (error) {
    initError = error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300);
    console.error('[betaFunnel] summary failed:', initError);
    return { configured: false, generatedAt, visitors: 0, testers: [], reached };
  }
}
