import { Image } from 'expo-image';
import { useEffect, useMemo, useRef, useState } from 'react';

import { sendBetaInviteEmail } from '@/services/betaEmailService';
import { saveBetaSignupEmail } from '@/services/betaSignupService';
import './landing.css';
import { clusterPops, dotRadius, WORLD_H, WORLD_W } from './popWorld';
import { useBetaScorecard, type Scorecard } from './useBetaScorecard';
import { useLivePops } from './useLivePops';
import Showcase, { SHOWCASE_STEPS } from './Showcase';

// Web-only product page: white, sleek, minimal. Plain DOM on purpose — the
// native app never renders this route (see app/index.tsx).

// The shipped app icon and the wordmark the app's own header uses — nothing redrawn.
const ICON = require('@/assets/images/landing/app-icon.png');
const WORDMARK = require('@/assets/images/landing/wordmark.png');

const fmtPct = (share: number | null) => (share === null ? '—' : `${Math.round(share * 100)}%`);
const fmtWhen = (ms: number) => (ms > 0 ? new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const fmtAgo = (ms: number, now = Date.now()) => {
  if (ms <= 0) return '—';
  const m = Math.max(0, Math.round((now - ms) / 60_000));
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1_440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1_440)} d ago`;
};

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function ScorecardCard({ scorecard, state }: { scorecard: Scorecard | null; state: string }) {
  return <div className="pl-card" aria-live="polite">
    <div className="pl-card-head">
      <h3>The beta scorecard</h3>
      <span className="pl-meta">{scorecard ? `updated ${fmtAgo(scorecard.updatedAtMillis)} · since ${fmtWhen(scorecard.window.startMillis)}` : state === 'loading' ? 'loading…' : 'first numbers land on the next tick'}</span>
    </div>
    <div className="pl-kpis">
      <div className="pl-kpi"><b>{scorecard?.installs ?? '—'}</b><span>people in the beta</span></div>
      <div className="pl-kpi"><b>{scorecard?.activity.activeLast7d ?? '—'}</b><span>active in the last 7 days</span></div>
      <div className="pl-kpi"><b>{scorecard?.activity.humanPops ?? '—'}</b><span>pops posted by people</span></div>
    </div>
    {scorecard && scorecard.installs === 0 && <p className="pl-empty-state">
      Nobody is in the beta yet — the student invite has not gone out. Every number here counts people only; the first
      ones land within 24 hours of the first sign-up and refresh every fifteen minutes.
    </p>}
    <table className="pl-table">
      <thead><tr><th>Signal</th><th>Count</th><th>Share</th><th>Read</th></tr></thead>
      <tbody>
        {(scorecard?.signals ?? []).map(s => <tr key={s.key}>
          <td>{s.label}<span className="pl-note">{s.note}</span></td>
          <td className="num"><b>{s.count}</b> / {s.of}</td>
          <td className="num">{fmtPct(s.share)}</td>
          <td><span className={`pl-pill ${s.verdict}`}>{s.verdict}</span></td>
        </tr>)}
        {!scorecard && <tr><td colSpan={4} className="pl-note">{state === 'error' ? 'The scorecard could not be read.' : 'No numbers published yet.'}</td></tr>}
      </tbody>
    </table>
    <p className="pl-foot">
      People only. Poplur runs a labelled synthetic cohort as a pre-launch harness; it is counted apart and never appears here.
      Counts are shown with their denominators — a pending read means the day it measures has not passed yet.
      {scorecard && scorecard.organic.referralInstalls > 0 ? ` ${scorecard.organic.referralInstalls} joined through a referral.` : ''}
    </p>
  </div>;
}

function WorldCard() {
  const { pops, state } = useLivePops(400);
  const clusters = useMemo(() => clusterPops(pops), [pops]);
  const real = pops.filter(p => !p.synthetic).length;
  const day = Date.now() - 86_400_000;
  const recent = pops.filter(p => p.createdAtMillis >= day).length;
  return <div className="pl-card">
    <div className="pl-card-head">
      <h3>Pops on the map right now</h3>
      <span className="pl-meta">{state === 'ready' ? `${pops.length} live · ${recent} in the last 24 h` : state === 'error' ? 'unavailable' : 'loading…'}</span>
    </div>
    <div className="pl-world" role="img" aria-label="Where pops are landing, by region">
      <svg viewBox={`0 0 ${WORLD_W} ${WORLD_H}`} preserveAspectRatio="none">
        {clusters.map(c => {
          const r = dotRadius(c.count); const sim = c.real === 0 && c.sim > 0;
          return <g key={c.key}>
            <circle className={`dot${sim ? ' sim' : ''}`} cx={c.x} cy={c.y} r={r} />
            {c.label && <>
              <text className="lbl" x={c.x + r + 5} y={c.y + 3}>{sim ? `SIM · ${c.label}` : c.label}</text>
              <text className="lbl-meta" x={c.x + r + 5} y={c.y + 15}>{c.count} {c.count === 1 ? 'pop' : 'pops'} · {Math.round(c.peakKm)} km peak</text>
            </>}
          </g>;
        })}
      </svg>
      {state === 'ready' && !pops.length && <div className="pl-empty">No public pops on the map yet.</div>}
    </div>
    <div className="pl-legend"><span><i /> {real} by people</span><span><i className="sim" /> {pops.length - real} synthetic harness</span></div>
  </div>;
}

function Signup() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  async function submit(e?: { preventDefault?: () => void }) {
    e?.preventDefault?.();
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) { setNote({ tone: 'err', text: 'Enter an email address.' }); return; }
    setBusy(true); setNote(null);
    try { await saveBetaSignupEmail(normalized); await sendBetaInviteEmail(normalized); setNote({ tone: 'ok', text: 'Sent — check your inbox for the beta links.' }); setEmail(''); }
    catch (error) { setNote({ tone: 'err', text: error instanceof Error ? error.message : 'Unable to send beta links right now.' }); }
    finally { setBusy(false); }
  }
  return <section id="beta" className="pl-signup">
    <div className="wrap">
      <div className="pl-eyebrow">Private beta</div>
      <h2>Join the beta.</h2>
      <p>iPhone first, through TestFlight. Enter your email and we will send the links. Students: your course Discord has the invite and the tester agreement.</p>
      <form className="pl-form" onSubmit={submit}>
        <input type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} disabled={busy} aria-label="Email address" />
        <button type="submit" className="pl-cta accent" disabled={busy}>{busy ? 'Sending…' : 'Send me the beta'}</button>
      </form>
      {note && <p className={`pl-form-note ${note.tone}`}>{note.text}</p>}
      <div className="pl-pills"><span>iOS · TestFlight</span><span>Android · soon</span><span>Toronto first</span></div>
    </div>
  </section>;
}

export default function LandingPage() {
  const { scorecard, state } = useBetaScorecard();
  // Expo's web shell paints the document black behind the root; this page is
  // white to the edges. Scoped to the mount so the Test Center keeps its own.
  // …and Expo's shell pins `html, body, #root` to 100% height with the body's
  // overflow hidden (its own screens scroll inside RN ScrollViews). A plain
  // document page needs the window to scroll, so unlock it here and put
  // everything back when the landing page unmounts.
  useEffect(() => {
    const root = document.getElementById('root');
    const targets = [document.documentElement, document.body, root].filter((el): el is HTMLElement => !!el);
    const previous = targets.map(el => ({ background: el.style.background, height: el.style.height, overflow: el.style.overflow, display: el.style.display }));
    targets.forEach(el => { el.style.background = '#ffffff'; el.style.height = 'auto'; el.style.overflow = 'visible'; });
    document.body.style.overflow = 'auto';
    if (root) root.style.display = 'block';
    return () => {
      targets.forEach((el, i) => { el.style.background = previous[i].background; el.style.height = previous[i].height; el.style.overflow = previous[i].overflow; el.style.display = previous[i].display; });
    };
  }, []);
  return <div className="pl">
    <nav className="pl-nav">
      <div className="wrap">
        <a className="pl-brand" href="#" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
          <Image source={ICON} style={{ width: 28, height: 28, borderRadius: 8 }} contentFit="cover" />
          <Image source={WORDMARK} style={{ width: 78, height: 26 }} contentFit="contain" accessibilityLabel="Poplur" />
        </a>
        <div className="pl-nav-links">
          <a href="#live" onClick={e => { e.preventDefault(); scrollTo('live'); }}>Live from the beta</a>
          {SHOWCASE_STEPS.slice(0, 4).map(f => <a key={f.id} href={`#${f.id}`} onClick={e => { e.preventDefault(); scrollTo(f.id); }}>{f.eyebrow}</a>)}
        </div>
        <button className="pl-cta" onClick={() => scrollTo('beta')}>Join the beta</button>
      </div>
    </nav>

    <header className="pl-hero">
      <div className="wrap">
        <div className="pl-eyebrow">Poplur</div>
        <h1>Posts on a world map that spread as people engage.</h1>
        <p>Every pop starts with a radius. Everyone inside it can find it — no followers needed. Engagement grows the radius; silence shrinks it.</p>
        <div className="pl-actions">
          <button className="pl-cta" onClick={() => scrollTo('beta')}>Join the beta</button>
          <button className="pl-cta ghost" onClick={() => scrollTo('features')}>See the features</button>
        </div>
      </div>
    </header>

    <section id="live" className="pl-live">
      <div className="wrap">
        <div className="pl-eyebrow">Live from the beta</div>
        <h2>The numbers, as they happen.</h2>
        <p className="pl-lede">A student beta in Toronto, opt-in only. What we are testing is whether the radius works: do people post, do they come back, does a pop grow when a classmate likes it, and do people find pops by being inside them. Published every fifteen minutes from the same data the team sees.</p>
        <div className="pl-cards">
          <ScorecardCard scorecard={scorecard} state={state} />
          <WorldCard />
        </div>
      </div>
    </section>

    <Showcase />

    <Signup />

    <footer className="pl-footer">
      <div className="wrap">
        <span>Poplur™ is confidential pre-release software of Apptist Inc., Toronto.</span>
        <span>© 2026 Apptist Inc.</span>
      </div>
    </footer>
  </div>;
}
