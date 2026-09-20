import { Asset } from 'expo-asset';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import {
  PLATFORM_LABEL,
  RATINGS,
  REPORT_POINTS,
  REPORT_ROUNDS,
  TASK_RESULTS,
  roundByNumber,
  type Platform as Phone,
  type RatingId,
  type ReportRound,
  type TaskResult,
} from '@/report/betaTestPlan';
import './../report/report.css';

// /report?t=… — a beta tester's test report: one of four short rounds, each a
// series of tests to run on their own phone plus a few questions. The link in
// the links email carries a token bound to the tester's address
// (server/betaReport.server.ts); the pinned Discord link has none, and then
// the page asks for the email instead. Filing goes to api/report+api.ts,
// which emails a receipt and keeps Poplur's copy. Web only, plain DOM.
const ICON = require('@/assets/images/landing/app-icon.png');
const WORDMARK = require('@/assets/images/landing/wordmark.png');

type Check = { ok: true; verified: boolean; email?: string; round: number } | { ok: false; error: string };
type Filed = { receivedAt: string; round: number; late: boolean; points: number; next: { number: number; name: string; dueLabel: string } | null };
type Answered = { result: TaskResult; note: string };
type Identity = { name: string; email: string; discord: string; platform: Phone | ''; device: string; osVersion: string };
type Draft = { results: Record<string, Answered>; ratings: Record<RatingId, number | null>; answers: Record<string, string> };

const IDENTITY_KEY = 'poplur-report-identity-v1';
const SENT_KEY = 'poplur-report-sent-v1';
const draftKey = (round: number) => `poplur-report-draft-v1-${round}`;
const emptyDraft = (): Draft => ({ results: {}, ratings: { overall: null, ease: null, speed: null }, answers: {} });
const emptyIdentity = (): Identity => ({ name: '', email: '', discord: '', platform: '', device: '', osVersion: '' });

function readJson<T>(key: string, fallback: T): T {
  try { const raw = window.localStorage.getItem(key); return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback; } catch { return fallback; }
}
function writeJson(key: string, value: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode, full, or blocked: the page still works */ }
}
function readSent(): number[] {
  try { const raw = window.localStorage.getItem(SENT_KEY); const v = raw ? (JSON.parse(raw) as unknown) : []; return Array.isArray(v) ? v.filter(n => typeof n === 'number') : []; } catch { return []; }
}

export default function ReportScreen() {
  const params = useLocalSearchParams<{ t?: string; r?: string }>();
  const token = typeof params.t === 'string' ? params.t : '';
  const [check, setCheck] = useState<Check | 'loading'>('loading');
  const [round, setRound] = useState<number>(1);
  const [sent, setSent] = useState<number[]>([]);
  const [identity, setIdentity] = useState<Identity>(emptyIdentity);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filed, setFiled] = useState<Filed | null>(null);

  // Switching rounds swaps the draft: each round's answers are kept on this device until sent.
  const openRound = (n: number) => { setRound(n); setDraft(readJson(draftKey(n), emptyDraft())); setError(null); };

  useEffect(() => {
    // Everything stored on this device is read once the link is checked, in
    // the response callback: the page is prerendered on the server, where
    // there is no storage, and must hydrate to the same empty form first.
    let live = true;
    fetch(`/api/report?t=${encodeURIComponent(token)}`)
      .then(async r => (await r.json().catch(() => ({}))) as { ok?: boolean; verified?: boolean; email?: string; round?: number; error?: string })
      .then(body => {
        if (!live) return;
        if (!body.ok) { setCheck({ ok: false, error: body.error ?? 'That report link did not check out.' }); return; }
        const sentRounds = readSent();
        setSent(sentRounds);
        setIdentity(readJson(IDENTITY_KEY, emptyIdentity()));
        const asked = Number(params.r);
        const current = body.round ?? 1;
        const next = REPORT_ROUNDS.find(r => r.number >= current && !sentRounds.includes(r.number))?.number ?? current;
        openRound(roundByNumber(asked) ? asked : next);
        setCheck({ ok: true, verified: !!body.verified, email: body.email, round: current });
      })
      .catch(() => { if (live) setCheck({ ok: false, error: 'Could not reach Poplur to check your link. Try again in a moment.' }); });
    return () => { live = false; };
  }, [token, params.r]);

  useEffect(() => { if (check !== 'loading' && check.ok) writeJson(draftKey(round), draft); }, [draft, round, check]);
  useEffect(() => { if (check !== 'loading' && check.ok) writeJson(IDENTITY_KEY, identity); }, [identity, check]);

  const current: ReportRound = useMemo(() => roundByNumber(round) ?? REPORT_ROUNDS[0], [round]);

  if (Platform.OS !== 'web') {
    return <ScrollView contentContainerStyle={{ padding: 24 }}><ThemedText>Open poplur.ca/report in a browser to file a test report.</ThemedText></ScrollView>;
  }

  const setResult = (id: string, result: TaskResult) => setDraft(d => ({ ...d, results: { ...d.results, [id]: { result, note: d.results[id]?.note ?? '' } } }));
  const setNote = (id: string, note: string) => setDraft(d => ({ ...d, results: { ...d.results, [id]: { result: d.results[id]?.result ?? 'skipped', note } } }));
  const setRating = (id: RatingId, v: number) => setDraft(d => ({ ...d, ratings: { ...d.ratings, [id]: v } }));
  const setAnswer = (id: string, v: string) => setDraft(d => ({ ...d, answers: { ...d.answers, [id]: v } }));
  const field = (k: keyof Identity) => (e: React.ChangeEvent<HTMLInputElement>) => setIdentity(i => ({ ...i, [k]: e.target.value }));

  const verified = check !== 'loading' && check.ok && check.verified;
  const answered = current.tasks.filter(t => draft.results[t.id]?.result).length;
  const ratingsDone = RATINGS.every(r => draft.ratings[r.id] !== null);
  const identityDone = identity.name.trim().length >= 2 && (verified || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email.trim())) && !!identity.platform && identity.device.trim().length > 0 && identity.osVersion.trim().length > 0;
  const canSend = identityDone && answered === current.tasks.length && ratingsDone && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const r = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          t: token || undefined,
          email: verified ? undefined : identity.email,
          name: identity.name,
          discord: identity.discord,
          platform: identity.platform,
          device: identity.device,
          osVersion: identity.osVersion,
          round: current.number,
          results: current.tasks.map(t => ({ id: t.id, result: draft.results[t.id]?.result, note: draft.results[t.id]?.note || null })),
          ratings: draft.ratings,
          answers: draft.answers,
        }),
      });
      const body = (await r.json().catch(() => ({}))) as Partial<Filed> & { ok?: boolean; error?: string };
      if (!r.ok || !body.ok || !body.receivedAt) throw new Error(body.error || 'Could not send your report. Try again.');
      const done: Filed = { receivedAt: body.receivedAt, round: body.round ?? current.number, late: !!body.late, points: body.points ?? REPORT_POINTS, next: body.next ?? null };
      setFiled(done);
      const sentNow = Array.from(new Set([...sent, done.round]));
      setSent(sentNow);
      writeJson(SENT_KEY, sentNow);
      try { window.localStorage.removeItem(draftKey(done.round)); } catch { /* fine */ }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your report. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const startNext = (n: number) => { setFiled(null); openRound(n); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  return (
    <div className="rp">
      <div className="rp-card">
        <div className="rp-brand">
          <a href="https://www.poplur.ca"><img className="icon" src={Asset.fromModule(ICON).uri} alt="" /><img className="wordmark" src={Asset.fromModule(WORDMARK).uri} alt="Poplur" /></a>
          <span className="rp-eyebrow">{filed ? 'Received' : 'Beta test report'}</span>
        </div>

        {check === 'loading' && <div className="rp-state">Checking your link…</div>}

        {check !== 'loading' && !check.ok && (
          <div className="rp-state">
            <p>{check.error}</p>
            <p style={{ marginTop: 12 }}><a href="/report">File without a link instead</a> (you will be asked for the email you signed with).</p>
          </div>
        )}

        {check !== 'loading' && check.ok && filed && (
          <>
            <h1 className="rp-title">Report {filed.round} is in.</h1>
            <p className="rp-done">Thank you, {identity.name.trim()}. A copy is on its way to {verified ? check.email : identity.email.trim()}.{filed.late ? ` It arrived after the due day, so it counts for ${filed.points} points.` : ''}</p>
            <div className="rp-points"><b>{filed.points}</b><span>points, on the board with Monday’s standings</span></div>
            {filed.next
              ? <p className="rp-done" style={{ marginTop: 18 }}>Next: report {filed.next.number}, <b>{filed.next.name}</b>, due {filed.next.dueLabel}. <a href="#" onClick={e => { e.preventDefault(); startNext(filed.next!.number); }} style={{ color: 'var(--accent)', fontWeight: 600 }}>See the tests now</a> or come back to this link later.</p>
              : <p className="rp-done" style={{ marginTop: 18 }}>That was the last one. Thank you for the whole month.</p>}
            <p className="rp-note">Received {new Date(filed.receivedAt).toLocaleString()}.</p>
          </>
        )}

        {check !== 'loading' && check.ok && !filed && (
          <form onSubmit={submit}>
            <h1 className="rp-title">Report {current.number}: {current.name}</h1>
            <p className="rp-sub">{current.blurb} About five minutes: run each test on your phone, tap what happened, then the questions. Due <b>{current.dueLabel}</b> for {REPORT_POINTS} points (late still counts for half, until the next one is due).</p>
            {verified
              ? <div className="rp-for">This link belongs to <b>{check.email}</b>. Your report is recorded against that address.</div>
              : <div className="rp-for">No personal link? That is fine: use the <b>email you signed the tester agreement with</b> below, so your points land on the right name.</div>}

            <div className="rp-rounds">
              {REPORT_ROUNDS.map(r => (
                <button type="button" key={r.number} className={`rp-round${r.number === current.number ? ' on' : ''}${sent.includes(r.number) ? ' sent' : ''}`} onClick={() => openRound(r.number)}>
                  <b>{r.number}. {r.name}</b><span>due {r.dueLabel}</span>
                </button>
              ))}
            </div>

            <div className="rp-section">
              <h2>You and your phone</h2>
              <p>Saved on this device, so you only type it once.</p>
              <div className="rp-grid">
                <label className="rp-field"><span>Full name</span><input type="text" autoComplete="name" value={identity.name} onChange={field('name')} disabled={busy} placeholder="As on your tester agreement" required /></label>
                {verified
                  ? <label className="rp-field"><span>Email</span><input type="text" value={check.email} disabled readOnly /></label>
                  : <label className="rp-field"><span>Email</span><input type="email" autoComplete="email" value={identity.email} onChange={field('email')} disabled={busy} placeholder="The one you signed with" required /></label>}
                <label className="rp-field"><span>Discord username</span><input type="text" autoComplete="off" value={identity.discord} onChange={field('discord')} disabled={busy} placeholder="For the standings post" /></label>
                <label className="rp-field"><span>Phone</span>
                  <div className="rp-seg">
                    {(Object.keys(PLATFORM_LABEL) as Phone[]).map(p => <button type="button" key={p} className={identity.platform === p ? 'on' : ''} onClick={() => setIdentity(i => ({ ...i, platform: p }))} disabled={busy}>{PLATFORM_LABEL[p]}</button>)}
                  </div>
                </label>
                <label className="rp-field"><span>Model</span><input type="text" value={identity.device} onChange={field('device')} disabled={busy} placeholder="iPhone 13, Pixel 7, Galaxy A03…" required /></label>
                <label className="rp-field"><span>OS version</span><input type="text" value={identity.osVersion} onChange={field('osVersion')} disabled={busy} placeholder="iOS 18.6 · Android 14" required /></label>
              </div>
            </div>

            <div className="rp-section">
              <h2>The tests</h2>
              <p>{answered} of {current.tasks.length} answered. “Couldn’t try” is a fine answer; say why if you can.</p>
              {current.tasks.map((task, i) => {
                const a = draft.results[task.id];
                return (
                  <div className={`rp-task${a?.result ? ' done' : ''}`} key={task.id}>
                    <div className="rp-task-head"><span className="rp-task-n">{i + 1}</span><h3>{task.title}</h3></div>
                    <p className="rp-task-steps">{task.steps}</p>
                    <p className="rp-task-expect"><b>Expected</b>{task.expect}</p>
                    <div className="rp-seg">
                      {TASK_RESULTS.map(r => (
                        <button type="button" key={r.value} className={`${a?.result === r.value ? 'on' : ''} ${r.value === 'worked' ? 'ok' : r.value === 'failed' ? 'bad' : ''}`} onClick={() => setResult(task.id, r.value)} disabled={busy}>{r.label}</button>
                      ))}
                    </div>
                    {a?.result && a.result !== 'worked' && (
                      <textarea value={a.note} onChange={e => setNote(task.id, e.target.value)} disabled={busy} placeholder={a.result === 'failed' ? 'What happened instead? Where were you in the app?' : 'What stopped you?'} maxLength={600} />
                    )}
                    {a?.result === 'worked' && a.note && (
                      <textarea value={a.note} onChange={e => setNote(task.id, e.target.value)} disabled={busy} maxLength={600} />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="rp-section">
              <h2>How it felt</h2>
              {RATINGS.map(r => (
                <div className="rp-rating" key={r.id}>
                  <span>{r.label}</span>
                  <div className="rp-seg">{[1, 2, 3, 4, 5].map(v => <button type="button" key={v} className={draft.ratings[r.id] === v ? 'on' : ''} onClick={() => setRating(r.id, v)} disabled={busy}>{v}</button>)}</div>
                  <small><span>{r.low}</span><span>{r.high}</span></small>
                </div>
              ))}
            </div>

            <div className="rp-section">
              <h2>In your words</h2>
              <p>Short is fine. Blank is fine too.</p>
              {current.questions.map(q => (
                <label className="rp-q" key={q.id}>
                  <span>{q.question}</span>
                  {q.hint && <em>{q.hint}</em>}
                  <textarea value={draft.answers[q.id] ?? ''} onChange={e => setAnswer(q.id, e.target.value)} disabled={busy} maxLength={2000} />
                </label>
              ))}
            </div>

            <button type="submit" className="rp-cta" disabled={!canSend}>{busy ? 'Sending…' : `Send report ${current.number}`}</button>
            {!canSend && !busy && <p className="rp-note">{!identityDone ? 'Fill in your name, phone, model and OS version first.' : answered < current.tasks.length ? `${current.tasks.length - answered} test${current.tasks.length - answered === 1 ? '' : 's'} still need an answer.` : !ratingsDone ? 'Give the three ratings.' : ''}</p>}
            {error && <p className="rp-note err">{error}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
