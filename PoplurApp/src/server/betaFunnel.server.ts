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
// its base64), set on Vercel. Locally, BETA_FUNNEL_CREDENTIALS=adc uses the
// machine's gcloud application-default login instead (never set on Vercel).
// The phone apps' Firestore rules do not allow clients into these
// collections; only this server, as admin, writes them.

import { createHash } from 'node:crypto';

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

type Firestore = import('firebase-admin/firestore').Firestore;

let cached: Promise<Firestore | null> | null = null;

function serviceAccount(): Record<string, unknown> | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  try { return JSON.parse(text) as Record<string, unknown>; } catch { return null; }
}

const useAdc = (): boolean => process.env.BETA_FUNNEL_CREDENTIALS === 'adc';

export function funnelConfigured(): boolean {
  return serviceAccount() !== null || useAdc();
}

/** The admin Firestore handle, created once per server instance; null when
 *  the site has no credentials. */
async function firestore(): Promise<Firestore | null> {
  if (cached) return cached;
  cached = (async () => {
    const credentials = serviceAccount();
    if (!credentials && !useAdc()) return null;
    try {
      const { getApps, initializeApp, cert, applicationDefault } = await import('firebase-admin/app');
      const { getFirestore } = await import('firebase-admin/firestore');
      const name = 'beta-funnel';
      const existing = getApps().find(app => app.name === name);
      const credential = credentials ? cert(credentials as Parameters<typeof cert>[0]) : applicationDefault();
      const app = existing ?? initializeApp({ credential, projectId: 'poplur2025' }, name);
      return getFirestore(app);
    } catch (error) {
      console.error('[betaFunnel] Firestore unavailable:', error instanceof Error ? error.message : error);
      return null;
    }
  })();
  return cached;
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

/** Append one event to a tester's timeline and refresh the summary fields. */
export async function recordTesterEvent(email: string, stage: FunnelStage, detail?: FunnelEvent['detail'], visitorId?: string | null): Promise<RecordResult> {
  const db = await firestore();
  if (!db) return { recorded: false };
  const address = normalizeEmail(email);
  const ref = db.collection(TESTERS).doc(testerId(address));
  const at = new Date().toISOString();
  const event: FunnelEvent = { stage, at, ...(detail ? { detail } : {}) };
  try {
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const data = snap.data() ?? {};
      const events = Array.isArray(data.events) ? (data.events as FunnelEvent[]) : [];
      const next = [...events, event].slice(-MAX_EVENTS);
      const stages = new Set<FunnelStage>(next.map(e => e.stage));
      const furthest = [...FUNNEL_ORDER].reverse().find(s => stages.has(s)) ?? stage;
      const stageAt = { ...(data.stageAt as Record<string, string> | undefined ?? {}) };
      if (!stageAt[stage]) stageAt[stage] = at;
      tx.set(ref, {
        email: address,
        ...(snap.exists ? {} : { firstSeenAt: at }),
        ...(visitorId ? { visitorId } : {}),
        lastSeenAt: at,
        lastStage: stage,
        furthestStage: furthest,
        furthestIndex: FUNNEL_ORDER.indexOf(furthest),
        stageAt,
        eventCount: next.length,
        events: next,
      }, { merge: true });
    });
    return { recorded: true };
  } catch (error) {
    console.error('[betaFunnel] write failed:', error instanceof Error ? error.message : error);
    return { recorded: false };
  }
}

/** A visit by someone with no email yet: counted per anonymous visitor id.
 *  Returns false when unconfigured so the beacon can stay silent. */
export async function recordVisit(visitorId: string, detail: { path: string; referrer: string | null; userAgent: string | null }): Promise<RecordResult> {
  const db = await firestore();
  if (!db) return { recorded: false };
  const at = new Date().toISOString();
  try {
    const { FieldValue } = await import('firebase-admin/firestore');
    await db.collection(VISITORS).doc(visitorId).set({
      ...(detail.referrer ? { referrer: detail.referrer } : {}),
      ...(detail.userAgent ? { userAgent: detail.userAgent.slice(0, 300) } : {}),
      lastPath: detail.path,
      lastSeenAt: at,
      visits: FieldValue.increment(1),
      firstSeenAt: (await db.collection(VISITORS).doc(visitorId).get()).data()?.firstSeenAt ?? at,
    }, { merge: true });
    return { recorded: true };
  } catch (error) {
    console.error('[betaFunnel] visit write failed:', error instanceof Error ? error.message : error);
    return { recorded: false };
  }
}

/** When an email is entered, the anonymous visitor becomes this tester. */
export async function linkVisitor(visitorId: string, email: string): Promise<void> {
  const db = await firestore();
  if (!db) return;
  try {
    await db.collection(VISITORS).doc(visitorId).set({ testerId: testerId(email), linkedAt: new Date().toISOString() }, { merge: true });
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
  const db = await firestore();
  if (!db) return { configured: false, generatedAt, visitors: 0, testers: [], reached };
  const [visitorCount, snap] = await Promise.all([
    db.collection(VISITORS).count().get().then(r => r.data().count).catch(() => 0),
    db.collection(TESTERS).orderBy('lastSeenAt', 'desc').limit(limit).get(),
  ]);
  const testers: TesterRow[] = snap.docs.map(doc => {
    const d = doc.data();
    const events = Array.isArray(d.events) ? (d.events as FunnelEvent[]) : [];
    const stageAt = (d.stageAt as Partial<Record<FunnelStage, string>> | undefined) ?? {};
    for (const s of FUNNEL_ORDER) if (stageAt[s]) reached[s] += 1;
    return {
      id: doc.id,
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
}
