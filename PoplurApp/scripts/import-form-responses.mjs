#!/usr/bin/env node
// Stamp Google Form responses on the beta funnel as `form_filed`.
//
// Each week's Google Form writes its responses to a Sheet. Share that Sheet
// (Viewer) with the service account in FIREBASE_SERVICE_ACCOUNT, then:
//
//   FIREBASE_SERVICE_ACCOUNT="$(cat beta-site-key.json)" \
//   node scripts/import-form-responses.mjs --sheet <spreadsheetId> --round 1
//
// The form must collect email addresses (Settings → Responses → Collect
// email addresses): the "Email Address" column is the join key. Rows already
// stamped (same round, same submission time) are skipped, so re-running is
// free. Nothing else from the form is copied — the answers stay in the Sheet.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { GoogleAuth } from 'google-auth-library';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]] : [])).filter(Boolean));
const sheetId = args.sheet;
const round = Number(args.round);
if (!sheetId || !Number.isInteger(round) || round < 1) {
  console.error('usage: node scripts/import-form-responses.mjs --sheet <spreadsheetId> --round <1-4> [--range Form Responses 1!A:Z]');
  process.exit(2);
}

const raw = process.env.FIREBASE_SERVICE_ACCOUNT || (process.env.FIREBASE_SERVICE_ACCOUNT_FILE && readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_FILE, 'utf8'));
if (!raw) { console.error('Set FIREBASE_SERVICE_ACCOUNT (JSON or base64) or FIREBASE_SERVICE_ACCOUNT_FILE.'); process.exit(2); }
const credentials = JSON.parse(raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));

const auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
const token = await auth.getAccessToken();
const range = encodeURIComponent(args.range || 'A:Z');
const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`, { headers: { Authorization: `Bearer ${token}` } });
if (!res.ok) { console.error(`Sheets API ${res.status}: ${await res.text()}`); process.exit(1); }
const { values = [] } = await res.json();
if (values.length < 2) { console.log('No responses yet.'); process.exit(0); }

const header = values[0].map(h => String(h).trim().toLowerCase());
const emailCol = header.findIndex(h => h === 'email address' || h === 'email');
const timeCol = header.findIndex(h => h === 'timestamp');
if (emailCol < 0) { console.error(`No "Email Address" column. Columns: ${values[0].join(' | ')}`); process.exit(1); }

const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
const db = getFirestore(app);
const ORDER = ['visited','email_entered','invite_delivered','invite_opened','invite_clicked','nda_opened','nda_signed','links_delivered','links_opened','links_clicked','store_ios','store_android','report_opened','form_opened','form_filed','report_filed'];

let stamped = 0, skipped = 0, unknown = 0;
for (const row of values.slice(1)) {
  const email = String(row[emailCol] ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { unknown += 1; continue; }
  const submitted = timeCol >= 0 ? String(row[timeCol] ?? '') : '';
  const id = createHash('sha256').update(email).digest('hex').slice(0, 32);
  const ref = db.collection('betaFunnel').doc(id);
  const at = new Date().toISOString();
  const done = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const data = snap.data() ?? {};
    const events = Array.isArray(data.events) ? data.events : [];
    if (events.some(e => e.stage === 'form_filed' && e.detail?.round === round && e.detail?.submitted === submitted)) return false;
    const event = { stage: 'form_filed', at, detail: { round, submitted, sheet: sheetId } };
    const next = [...events, event].slice(-400);
    const stages = new Set(next.map(e => e.stage));
    const furthest = [...ORDER].reverse().find(s => stages.has(s)) ?? 'form_filed';
    const stageAt = { ...(data.stageAt ?? {}) };
    if (!stageAt.form_filed) stageAt.form_filed = at;
    tx.set(ref, { email, ...(snap.exists ? {} : { firstSeenAt: at }), lastSeenAt: at, lastStage: 'form_filed', furthestStage: furthest, furthestIndex: ORDER.indexOf(furthest), stageAt, eventCount: next.length, events: next }, { merge: true });
    return true;
  });
  if (done) stamped += 1; else skipped += 1;
}
console.log(`round ${round}: ${stamped} stamped, ${skipped} already there, ${unknown} rows without a usable email`);
