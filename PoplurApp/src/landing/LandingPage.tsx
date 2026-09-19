import { Asset } from 'expo-asset';
import { Image } from 'expo-image';
import React, { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { sendBetaInviteEmail } from '@/services/betaEmailService';
import { saveBetaSignupEmail } from '@/services/betaSignupService';
import './landing.css';
import { useBetaScorecard, type Scorecard } from './useBetaScorecard';
import { useLivePops } from './useLivePops';
import Showcase, { IPhone, SCREENS, SHOWCASE_STEPS } from './Showcase';
import Lockup from './Lockup';
import ShaderText from './ShaderText';
import { HERO_SPOT, HERO_SPOT_POSTER } from './heroSpot';
import { armLandingPop, landingPop } from './landingPop';
import { pickCurrent } from './spy';
import { clamp01, easeOut, onScrollFrame, progressOf, reducedMotion } from './scroll';
import Backdrop from './Backdrop';
import ColourBadge from './ColourBadge';
import DottedWorld from './DottedWorld';
import RadioBadge from './RadioBadge';
import { readLandingThemeId, saveLandingThemeId, themeById, type LandingThemeId } from './themes';

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

// The product hero, Apple-style: the phone fills the first screen, the
// eyebrow and headline sit bottom-left, the offer pill bottom-right. As you
// scroll, the phone settles back and everything eases away.
function Hero() {
  const ref = useRef<HTMLElement | null>(null);
  const phoneRef = useRef<HTMLDivElement | null>(null);
  const copyRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current; if (!el || reducedMotion()) return;
    return onScrollFrame((y, h) => {
      const p = easeOut(clamp01(y / (h * 0.9)));
      if (phoneRef.current) phoneRef.current.style.transform = `translateY(${-p * 90}px) scale(${1.04 - p * 0.14}) rotateY(${-16 + p * 10}deg) rotateX(${5 - p * 3}deg)`;
      if (phoneRef.current) phoneRef.current.style.opacity = String(1 - p * 0.9);
      if (copyRef.current) { copyRef.current.style.opacity = String(1 - p * 1.4); copyRef.current.style.transform = `translateY(${p * 40}px)`; }
    });
  }, []);
  const spot = HERO_SPOT === null ? null : Asset.fromModule(HERO_SPOT).uri;
  const poster = HERO_SPOT_POSTER === null ? undefined : Asset.fromModule(HERO_SPOT_POSTER).uri;
  return <header ref={ref} className={`pl-hero${spot ? ' has-spot' : ''}`} id="top">
    {spot
      ? <video className="pl-hero-video" src={spot} poster={poster} autoPlay muted loop playsInline preload="auto" aria-label="People using Poplur" />
      : <div className="pl-hero-stage">
        <div ref={phoneRef} className="pl-hero-phone"><IPhone screens={[SCREENS.map]} active={0} /></div>
      </div>}
    <div ref={copyRef} className="pl-hero-lockup wrap">
      <div className="pl-hero-text">
        <div className="pl-eyebrow">Poplur</div>
        <ShaderText as="h1">Posts on a world map that spread as people engage.</ShaderText>
        <div className="pl-offer">
          <span>Free on iPhone · Toronto beta<br /><small>Every pop starts with a 5 km radius.</small></span>
          <button className="pl-cta accent" onClick={() => scrollTo('beta')}>Join the beta</button>
        </div>
      </div>
    </div>
  </header>;
}

// Cards rise into place as they enter, the way product-page media does.
function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { setTimeout(() => el.classList.add('in'), delay); io.disconnect(); } }), { threshold: 0.18 });
    io.observe(el); return () => io.disconnect();
  }, [delay]);
  return <div ref={ref} className="pl-reveal">{children}</div>;
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
  const real = pops.filter(p => !p.synthetic).length;
  const day = Date.now() - 86_400_000;
  const recent = pops.filter(p => p.createdAtMillis >= day).length;
  return <div className="pl-card pl-card-world">
    <div className="pl-card-head">
      <h3>Pops on the map right now</h3>
      <span className="pl-meta">{state === 'ready' ? `${pops.length} live · ${recent} in the last 24 h` : state === 'error' ? 'unavailable' : 'loading…'}</span>
    </div>
    <DottedWorld pops={pops} state={state} />
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
  return <section id="beta" className="pl-signup pl-signup-top">
    <div className="wrap">
      <div className="pl-eyebrow">Private beta</div>
      <ShaderText as="h2">Join the beta.</ShaderText>
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
  const [themeId, setThemeId] = useState<LandingThemeId>('default');
  useEffect(() => { setThemeId(readLandingThemeId()); }, []);
  const theme = themeById(themeId);
  const changeTheme = (id: LandingThemeId) => { setThemeId(id); saveLandingThemeId(id); };
  const inkMode = /^#f/i.test(theme.ink) ? 'light' : 'dark';
  // The chapter under the reader — one answer (spy.ts) that both the nav's
  // highlight and the scroll pop use. The pop plays on every change after the
  // first read (landing on the page is not a pop), and only once the page
  // has had a real gesture to unlock sound with (landingPop.ts).
  const [current, setCurrent] = useState<string | null>(null);
  const currentRef = useRef<string | null>(null);
  const settledRef = useRef(false);
  useEffect(() => armLandingPop(), []);
  useEffect(() => {
    const ids = ['top', 'beta', 'live', ...SHOWCASE_STEPS.map(step => step.id)];
    return onScrollFrame((_y, h) => {
      const boxes = ids.flatMap(id => { const el = document.getElementById(id); return el ? [{ id, top: el.getBoundingClientRect().top }] : []; });
      const next = pickCurrent(boxes, h);
      if (next === currentRef.current) return;
      if (settledRef.current) landingPop();
      settledRef.current = true;
      currentRef.current = next;
      setCurrent(next);
    });
  }, []);
  const themeVars = { '--accent': theme.accent, '--accent-2': theme.accent2, '--ink': theme.ink, '--bg': theme.bg } as CSSProperties;
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
    targets.forEach(el => { el.style.background = theme.bg; el.style.height = 'auto'; el.style.overflow = 'visible'; });
    document.body.style.overflow = 'auto';
    if (root) root.style.display = 'block';
    return () => {
      targets.forEach((el, i) => { el.style.background = previous[i].background; el.style.height = previous[i].height; el.style.overflow = previous[i].overflow; el.style.display = previous[i].display; });
    };
  }, [theme.bg]);
  return <div className="pl" data-ink={inkMode} style={themeVars}>
    <Backdrop theme={theme} />
    <nav className="pl-nav">
      <div className="pl-nav-pill">
        <a className="pl-brand" href="#" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
          <Image source={ICON} style={{ width: 28, height: 28, borderRadius: 8 }} contentFit="cover" />
          <Image source={WORDMARK} style={{ width: 78, height: 26 }} contentFit="contain" accessibilityLabel="Poplur" />
        </a>
        <div className="pl-nav-links">
          <a href="#live" className={current === 'live' ? 'is-current' : undefined} onClick={e => { e.preventDefault(); scrollTo('live'); }}>Live</a>
          {SHOWCASE_STEPS.slice(0, 4).map(f => <a key={f.id} href={`#${f.id}`} className={current === f.id ? 'is-current' : undefined} onClick={e => { e.preventDefault(); scrollTo(f.id); }}>{f.nav}</a>)}
        </div>
        <div className="pl-nav-tools">
          <RadioBadge />
          <ColourBadge theme={theme} onChange={changeTheme} />
          <button className="pl-cta" onClick={() => scrollTo('beta')}>Join the beta</button>
        </div>
      </div>
    </nav>

    <Hero />

    <Signup />

    <section id="live" className="pl-live">
      <Lockup eyebrow="Live from the beta" title="The numbers, as they happen." sub="A student beta in Toronto, opt-in only. We are testing whether the radius works — do people post, do they come back, does a pop grow when a classmate likes it, do people find pops by being inside them. Published every fifteen minutes from the same data the team sees." />
      <div className="wrap">
        <div className="pl-cards">
          <Reveal><ScorecardCard scorecard={scorecard} state={state} /></Reveal>
          <Reveal delay={120}><WorldCard /></Reveal>
        </div>
      </div>
    </section>

    <Lockup id="features" eyebrow="How it works" title="Reach, without followers." sub="Six things a pop does that a post never could." />

    <Showcase />

    <footer className="pl-footer">
      <div className="wrap">
        <span>Poplur™ is confidential pre-release software of Apptist Inc., Toronto.</span>
        <span>© 2026 Apptist Inc.</span>
      </div>
    </footer>
  </div>;
}
