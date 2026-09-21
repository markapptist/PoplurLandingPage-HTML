#!/usr/bin/env node
// Stamp the weekly Google Form responses on the beta funnel as `form_filed`.
//
// The four forms are named in src/report/betaTestPlan.ts (`formId` per
// round). Share each form with the service account in
// FIREBASE_SERVICE_ACCOUNT (Editor — Google Forms' "Add collaborator"), then:
//
//   FIREBASE_SERVICE_ACCOUNT="$(cat service-account.json)" node scripts/import-form-responses.mjs
//   … --round 2         one round only
//   … --sheet <id> --round 1   the older path: a linked response Sheet instead
//
// The forms collect the respondent's email, which is the join key. A response
// already stamped (same round, same response id) is skipped, so re-running is
// free. Nothing else from the form is copied — the answers stay in Forms.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { GoogleAuth } from 'google-auth-library';

const FORMS = { 1: '1HCqkd_nPtua3dAuwKZ7boTsc2JUUpJgKDV4LgJnC3GM', 2: '1aewvmYKHwpVN1ik6Ebxckc2JsIoGeZLWm3ZMz_eMN64', 3: '1HQQTD71SVYoS8huVgQRDItUa47ccyJCiBg0n41OSI6I', 4: '1chqg467jGu94izI_T9PRFjUD-4uQcH-Q7EAfCeX18Xk' };
const ORDER = ['visited','email_entered','invite_delivered','invite_opened','invite_clicked','nda_opened','nda_signed','links_delivered','links_opened','links_clicked','store_ios','store_android','report_opened','form_opened','form_filed','report_filed'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]] : [])).filter(Boolean));
const onlyRound = args.round ? Number(args.round) : null;
if (onlyRound !== null && !FORMS[onlyRound]) { console.error('--round must be 1 to 4'); process.exit(2); }

const raw = process.env.FIREBASE_SERVICE_ACCOUNT || (process.env.FIREBASE_SERVICE_ACCOUNT_FILE && readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_FILE, 'utf8'));
if (!raw) { console.error('Set FIREBASE_SERVICE_ACCOUNT (JSON or base64) or FIREBASE_SERVICE_ACCOUNT_FILE.'); process.exit(2); }
const credentials = JSON.parse(raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
const auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/forms.responses.readonly', 'https://www.googleapis.com/auth/spreadsheets.readonly'] });
const token = await auth.getAccessToken();
const db = getFirestore(getApps()[0] ?? initializeApp({ credential: cert(credentials) }));

/** One stamp per (round, responseId); returns true when it was new. */
async function stamp(email, round, responseId, submitted, source) {
  const id = createHash('sha256').update(email).digest('hex').slice(0, 32);
  const ref = db.collection('betaFunnel').doc(id);
  const at = new Date().toISOString();
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const data = snap.data() ?? {};
    const events = Array.isArray(data.events) ? data.events : [];
    if (events.some(e => e.stage === 'form_filed' && e.detail?.round === round && e.detail?.responseId === responseId)) return false;
    const next = [...events, { stage: 'form_filed', at, detail: { round, responseId, submitted, source } }].slice(-400);
    const stages = new Set(next.map(e => e.stage));
    const furthest = [...ORDER].reverse().find(s => stages.has(s)) ?? 'form_filed';
    const stageAt = { ...(data.stageAt ?? {}) };
    if (!stageAt.form_filed) stageAt.form_filed = at;
    tx.set(ref, { email, ...(snap.exists ? {} : { firstSeenAt: at }), lastSeenAt: at, lastStage: 'form_filed', furthestStage: furthest, furthestIndex: ORDER.indexOf(furthest), stageAt, eventCount: next.length, events: next }, { merge: true });
    return true;
  });
}

async function fromForm(round, formId) {
  let stamped = 0, skipped = 0, unknown = 0, pageToken = '';
  do {
    const res = await fetch(`https://forms.googleapis.com/v1/forms/${formId}/responses${pageToken ? `?pageToken=${pageToken}` : ''}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { console.error(`round ${round}: Forms API ${res.status}: ${(await res.text()).slice(0, 200)}`); return; }
    const body = await res.json();
    for (const r of body.responses ?? []) {
      const email = String(r.respondentEmail ?? '').trim().toLowerCase();
      if (!EMAIL.test(email)) { unknown += 1; continue; }
      if (await stamp(email, round, r.responseId, r.lastSubmittedTime ?? r.createTime ?? '', formId)) stamped += 1; else skipped += 1;
    }
    pageToken = body.nextPageToken ?? '';
  } while (pageToken);
  console.log(`round ${round}: ${stamped} stamped, ${skipped} already there, ${unknown} without a usable email`);
}

async function fromSheet(round, sheetId) {
  const range = encodeURIComponent(args.range || 'A:Z');
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) { console.error(`Sheets API ${res.status}: ${await res.text()}`); process.exit(1); }
  const { values = [] } = await res.json();
  if (values.length < 2) { console.log('No responses yet.'); return; }
  const header = values[0].map(h => String(h).trim().toLowerCase());
  const emailCol = header.findIndex(h => h === 'email address' || h === 'email');
  const timeCol = header.findIndex(h => h === 'timestamp');
  if (emailCol < 0) { console.error(`No "Email Address" column. Columns: ${values[0].join(' | ')}`); process.exit(1); }
  let stamped = 0, skipped = 0, unknown = 0;
  for (const row of values.slice(1)) {
    const email = String(row[emailCol] ?? '').trim().toLowerCase();
    if (!EMAIL.test(email)) { unknown += 1; continue; }
    const submitted = timeCol >= 0 ? String(row[timeCol] ?? '') : '';
    if (await stamp(email, round, `sheet:${submitted}`, submitted, sheetId)) stamped += 1; else skipped += 1;
  }
  console.log(`round ${round} (sheet): ${stamped} stamped, ${skipped} already there, ${unknown} without a usable email`);
}

if (args.sheet) {
  if (!onlyRound) { console.error('--sheet needs --round'); process.exit(2); }
  await fromSheet(onlyRound, args.sheet);
} else {
  for (const [round, formId] of Object.entries(FORMS)) {
    if (onlyRound && Number(round) !== onlyRound) continue;
    await fromForm(Number(round), formId);
  }
}
