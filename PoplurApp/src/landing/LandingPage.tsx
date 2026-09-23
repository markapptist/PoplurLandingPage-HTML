import { Asset } from 'expo-asset';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { sendBetaInviteEmail } from '@/services/betaEmailService';
import { saveBetaSignupEmail } from '@/services/betaSignupService';
import './landing.css';
import { useBetaScorecard, type Scorecard } from './useBetaScorecard';
import { useLivePops } from './useLivePops';
import Showcase, { IPhone, SCREENS, SHOWCASE_STEPS } from './Showcase';
import Lockup from './Lockup';
import ShaderText from './ShaderText';
import { HERO_SPOTS, nextHeroSpot, pickHeroSpot, type HeroSpot } from './heroSpot';
import { armLandingPop, landingPop, landingPopReady } from './landingPop';
import ReadBadge from './ReadBadge';
import { useReadAloud } from './useReadAloud';
import { pickCurrent } from './spy';
import { clamp01, easeOut, onScrollFrame, reducedMotion } from './scroll';
import AnimatedNumber from './AnimatedNumber';
import Backdrop from './Backdrop';
import { useDemoMode, useDemoPops, useDemoScorecard } from './demo';
import ColourBadge from './ColourBadge';
import DottedWorld from './DottedWorld';
import RadioBadge from './RadioBadge';
import { useLandingAudio } from './useLandingAudio';
import { randomLandingThemeId, themeById, type LandingThemeId } from './themes';

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

// The hero's headline flips through the product, one claim at a time — the
// promise first, then what each chapter below goes on to show.
const HERO_TITLES = [
  'Posts on a world map that spread as people engage.',
  'Reach is earned per post, not per account.',
  'Inside a radius, you are in the feed.',
  'See what is popping around you.',
  'One live pop per place.',
  'AI tells you where to post.',
  'Found without followers.',
];
const HERO_TITLE_MS = 4200;
// The tour's stops, in page order, and its pace: long enough to read a chapter.
// It ends where it began: once every section has had its turn the page comes
// to rest on the sign-up, so an idle visit is left looking at "Join the beta".
const TOUR_STOPS = ['beta', 'live', 'features', ...SHOWCASE_STEPS.map(step => step.id), 'beta'];
const TOUR_FIRST_MS = 900;
const TOUR_STEP_MS = 4200;
const TOUR_CANCEL_EVENTS = ['wheel', 'touchmove', 'keydown'] as const;
const HERO_FLIP_MS = 700;

// All the titles are stacked in one grid cell, so the block is as tall as the
// longest and nothing below it jumps; the current one flips up into place and
// the one before flips away. Under reduced motion they simply change.
function HeroTitle() {
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState<number | null>(null);
  useEffect(() => {
    const tick = setInterval(() => setIndex(i => { setLeaving(i); return (i + 1) % HERO_TITLES.length; }), HERO_TITLE_MS);
    return () => clearInterval(tick);
  }, []);
  useEffect(() => {
    if (leaving === null) return;
    const done = setTimeout(() => setLeaving(null), HERO_FLIP_MS);
    return () => clearTimeout(done);
  }, [leaving]);
  return <h1 className="pl-hero-titles">
    {HERO_TITLES.map((title, i) => <span key={title} aria-hidden={i !== index} className={`pl-hero-title${i === index ? ' is-in' : i === leaving ? ' is-out' : ''}`}>
      <ShaderText as="span">{title}</ShaderText>
    </span>)}
  </h1>;
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// The product hero, Apple-style: the TV spot fills the first screen (the
// phone stands in without one), the eyebrow, the flipping headline and the
// offer sit bottom-left. As you scroll, everything eases away.
//
// The visible chapter owns audio: the hero attempts sound immediately, and
// radio takes over only after the reader leaves this section.
function Hero({ onSpotEnded, audio }: { onSpotEnded: () => void; audio: ReturnType<typeof useLandingAudio> }) {
  const firstRunDone = useRef(false);
  const ref = useRef<HTMLElement | null>(null);
  const phoneRef = useRef<HTMLDivElement | null>(null);
  const copyRef = useRef<HTMLDivElement | null>(null);
  const sound = audio.state.heroSound;
  // Which spot this visit plays is rolled on the client after mount (the
  // server cannot know), so the video mounts a beat after the page does.
  const [chosen, setChosen] = useState<HeroSpot | null>(null);
  useEffect(() => { setChosen(pickHeroSpot()); }, []);
  useEffect(() => {
    const el = ref.current; if (!el || reducedMotion()) return;
    return onScrollFrame((y, h) => {
      const p = easeOut(clamp01(y / (h * 0.9)));
      if (phoneRef.current) phoneRef.current.style.transform = `translateY(${-p * 90}px) scale(${1.04 - p * 0.14}) rotateY(${-16 + p * 10}deg) rotateX(${5 - p * 3}deg)`;
      if (phoneRef.current) phoneRef.current.style.opacity = String(1 - p * 0.9);
      if (copyRef.current) { copyRef.current.style.opacity = String(1 - p * 1.4); copyRef.current.style.transform = `translateY(${p * 40}px)`; }
    });
  }, []);
  const ended = () => {
    // The first spot to finish hands over to the page tour, once. Then the
    // hero rolls on to another spot rather than looping the same one, so the
    // clips a visitor sees are the whole set, not whichever one they landed on.
    if (!firstRunDone.current) {
      firstRunDone.current = true;
      onSpotEnded();
    }
    setChosen(current => nextHeroSpot(current?.id ?? null));
  };
  const hasSpots = HERO_SPOTS.length > 0;
  const spot = chosen ? Asset.fromModule(chosen.video).uri : null;
  const poster = chosen ? Asset.fromModule(chosen.poster).uri : undefined;
  return <header ref={ref} className={`pl-hero${hasSpots ? ' has-spot' : ''}`} id="top">
    {hasSpots
      ? (spot && <video key={chosen?.id} ref={audio.setHero} className="pl-hero-video" src={spot} poster={poster} playsInline preload="auto" aria-label="People using Poplur" onEnded={ended} onClick={audio.replayHero} />)
      : <div className="pl-hero-stage">
        <div ref={phoneRef} className="pl-hero-phone"><IPhone screens={[SCREENS.map]} active={0} /></div>
      </div>}
    <div ref={copyRef} className="pl-hero-lockup wrap">
      <div className="pl-hero-text">
        <div className="pl-eyebrow">Poplur</div>
        <HeroTitle />
        <p className="pl-hero-sub">Free on iPhone and Android · Toronto beta. Every pop starts with a 5 km radius.</p>
        <div className="pl-hero-actions">
          <button className="pl-cta accent" onClick={() => scrollTo('beta')}>Join the beta</button>
          {hasSpots && <button type="button" className={`pl-sound${sound ? ' is-on' : ''}`} aria-pressed={sound}
            data-landing-audio-control onClick={audio.toggleHero}>
            <svg viewBox="0 0 32 32" width="16" height="16" aria-hidden="true">
              <path d="M6 12h4l6-5v18l-6-5H6z" fill="currentColor" />
              {sound
                ? <><path d="M20 11a6 6 0 0 1 0 10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /><path d="M23 8a10 10 0 0 1 0 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></>
                : <path d="M20 11l7 10M27 11l-7 10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />}
            </svg>
            <span>{sound ? 'Sound on' : 'Tap for sound'}</span>
          </button>}
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

// Every number here counts to its value the app's way (AnimatedNumber): a
// scorecard that moves rolls its digits and pips as it goes.
function ScorecardCard({ scorecard, state, demo }: { scorecard: Scorecard | null; state: string; demo: boolean }) {
  return <div className="pl-card" aria-live="polite">
    <div className="pl-card-head">
      <h3>The beta scorecard{demo && <span className="pl-demo" title="Scripted numbers — not the beta">demo</span>}</h3>
      <span className="pl-meta">{scorecard ? `updated ${fmtAgo(scorecard.updatedAtMillis)} · since ${fmtWhen(scorecard.window.startMillis)}` : state === 'loading' ? 'loading…' : 'first numbers land on the next tick'}</span>
    </div>
    <div className="pl-kpis">
      <div className="pl-kpi"><b>{scorecard ? <AnimatedNumber value={scorecard.installs} /> : '—'}</b><span>people in the beta</span></div>
      <div className="pl-kpi"><b>{scorecard ? <AnimatedNumber value={scorecard.activity.activeLast7d} /> : '—'}</b><span>active in the last 7 days</span></div>
      <div className="pl-kpi"><b>{scorecard ? <AnimatedNumber value={scorecard.activity.humanPops} /> : '—'}</b><span>pops posted by people</span></div>
    </div>
    {scorecard && scorecard.installs === 0 && <p className="pl-empty-state">
      Nobody is in the beta yet — the first invites have not gone out. Every number here counts people only; the first
      ones land within 24 hours of the first sign-up and refresh every fifteen minutes.
    </p>}
    <table className="pl-table">
      <thead><tr><th>Signal</th><th>Count</th><th>Share</th><th>Read</th></tr></thead>
      <tbody>
        {(scorecard?.signals ?? []).map(s => <tr key={s.key}>
          <td>{s.label}<span className="pl-note">{s.note}</span></td>
          <td className="num"><b><AnimatedNumber value={s.count} /></b> / <AnimatedNumber value={s.of} /></td>
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

// Live from the posts collection: the counts roll as pops land, each landing
// ripples on the world (DottedWorld). In demo mode scripted pops land too.
function WorldCard({ demo }: { demo: boolean }) {
  const live = useLivePops(400);
  const scripted = useDemoPops(demo);
  const pops = useMemo(() => (scripted.length ? [...scripted, ...live.pops] : live.pops), [scripted, live.pops]);
  const state = live.state;
  const real = pops.filter(p => !p.synthetic).length;
  const day = Date.now() - 86_400_000;
  const recent = pops.filter(p => p.createdAtMillis >= day).length;
  // When the newest pop landed — the proof the feed is live, re-read every
  // half minute so "just now" ages honestly between snapshots.
  const newest = pops.reduce((max, p) => Math.max(max, p.createdAtMillis), 0);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => { const tick = setInterval(() => setClock(Date.now()), 30_000); return () => clearInterval(tick); }, []);
  return <div className="pl-card pl-card-world">
    <div className="pl-card-head">
      <h3>Pops on the map right now{demo && <span className="pl-demo" title="Scripted pops are landing alongside the real ones">demo</span>}</h3>
      <span className="pl-meta">
        {state === 'ready' ? <><span className="pl-live-pill"><i /> live</span> <AnimatedNumber value={pops.length} /> live · <AnimatedNumber value={recent} /> in the last 24 h{newest > 0 && <> · last landed <span className="pl-last-landed" data-at={newest}>{fmtAgo(newest, clock)}</span></>}</> : state === 'error' ? 'unavailable' : 'loading…'}
      </span>
    </div>
    <DottedWorld pops={pops} state={state} />
    <div className="pl-legend"><span><i /> <AnimatedNumber value={real} /> by people</span><span><i className="sim" /> <AnimatedNumber value={pops.length - real} /> synthetic harness</span></div>
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
    try { await saveBetaSignupEmail(normalized); await sendBetaInviteEmail(normalized); setNote({ tone: 'ok', text: 'Sent — check your inbox. The Discord and the short tester agreement are in there; sign it and your links unlock.' }); setEmail(''); }
    catch (error) { setNote({ tone: 'err', text: error instanceof Error ? error.message : 'Unable to send beta links right now.' }); }
    finally { setBusy(false); }
  }
  return <section id="beta" className="pl-signup pl-signup-top">
    <div className="wrap">
      <div className="pl-eyebrow">Private beta</div>
      <ShaderText as="h2">Join the beta.</ShaderText>
      <p>iPhone and Android. Enter your email and we will send you the tester agreement; sign it with your name and your links unlock — TestFlight for iOS, Google Play for Android.</p>
      <form className="pl-form" onSubmit={submit}>
        {/* The field is the one thing on this screen to act on, so it wears
            the house shader as its hint (the same recipe as the headlines,
            in the theme's accents so it reads on the white field), a thick
            border with a breathing glow, and a shadow. The hint is a real
            label over an empty field, so a tap on it lands in the input and
            it leaves the moment a character is typed. */}
        <label className="pl-field">
          <input type="email" inputMode="email" autoComplete="email" placeholder="" value={email} onChange={e => setEmail(e.target.value)} disabled={busy} aria-label="Email address" />
          {!email && <ShaderText as="span" className="pl-field-hint">you@example.com</ShaderText>}
        </label>
        <button type="submit" className="pl-cta accent" disabled={busy}>{busy ? 'Sending…' : 'Send me the beta'}</button>
      </form>
      {note && <p className={`pl-form-note ${note.tone}`}>{note.text}</p>}
      <div className="pl-pills"><span>iOS · TestFlight</span><span>Android · Google Play</span><span>Toronto first</span></div>
    </div>
  </section>;
}

export default function LandingPage() {
  const demo = useDemoMode();
  const live = useBetaScorecard();
  const scripted = useDemoScorecard(demo);
  const scorecard = demo ? scripted : live.scorecard;
  const state = demo ? (scripted ? 'ready' : 'loading') : live.state;
  const [themeId, setThemeId] = useState<LandingThemeId>('default');
  // The page wears a different theme on every load (themes.ts): the server
  // renders the default, the client rolls on mount. A pick from the colour
  // badge lasts the visit only.
  useEffect(() => { setThemeId(randomLandingThemeId()); }, []);
  const theme = themeById(themeId);
  const changeTheme = (id: LandingThemeId) => setThemeId(id);
  const inkMode = /^#f/i.test(theme.ink) ? 'light' : 'dark';
  // The chapter under the reader — one answer (spy.ts) that both the nav's
  // highlight and the scroll pop use. The pop plays on every change after the
  // first read (landing on the page is not a pop), and only once the page
  // has had a real gesture to unlock sound with (landingPop.ts).
  const [current, setCurrent] = useState<string | null>(null);
  const audio = useLandingAudio(HERO_SPOTS.length > 0 && (current === null || current === 'top'));
  const currentRef = useRef<string | null>(null);
  const settledRef = useRef(false);
  useEffect(() => armLandingPop(), []);
  const reader = useReadAloud(current ?? 'top', audio.setSpeaking);
  // The tour: when the spot has played, the page walks itself section to
  // section — each stop a snap, each snap a pop — until the reader takes the
  // wheel (a scroll, a touch, a key), which ends it at once.
  const tourTimer = useRef<number | null>(null);
  const stopTour = useCallback(() => {
    if (tourTimer.current !== null) { window.clearTimeout(tourTimer.current); tourTimer.current = null; }
    for (const type of TOUR_CANCEL_EVENTS) document.removeEventListener(type, stopTour);
  }, []);
  const startTour = useCallback(() => {
    if (reducedMotion() || tourTimer.current !== null) return;
    let at = 0;
    const step = () => {
      const id = TOUR_STOPS[at++];
      if (!id) { stopTour(); return; }
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      tourTimer.current = window.setTimeout(step, TOUR_STEP_MS);
    };
    tourTimer.current = window.setTimeout(step, TOUR_FIRST_MS);
    for (const type of TOUR_CANCEL_EVENTS) document.addEventListener(type, stopTour, { passive: true });
  }, [stopTour]);
  useEffect(() => stopTour, [stopTour]);
  useEffect(() => {
    const ids = ['top', 'beta', 'live', 'features', ...SHOWCASE_STEPS.map(step => step.id)];
    return onScrollFrame((_y, h) => {
      const boxes = ids.flatMap(id => { const el = document.getElementById(id); return el ? [{ id, top: el.getBoundingClientRect().top }] : []; });
      const next = pickCurrent(boxes, h);
      if (next === currentRef.current) return;
      // Landing on the page is not a pop. But the page is usually silent for
      // the first few sections — sound cannot start before a gesture — and
      // swallowing one more change after it finally can meant the first thing
      // a visitor heard was the second section they scrolled past. So the
      // "first read" is spent the moment sound is actually available.
      if (settledRef.current) landingPop();
      if (landingPopReady()) settledRef.current = true;
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
    // The page snaps section to section (hero, sign-up, live, each chapter — see
    // `scroll-snap-align` in landing.css). The root element is the scroller once
    // the body is unlocked, so the snap type lives there, and leaves with the rest.
    const previousSnap = document.documentElement.style.scrollSnapType;
    document.documentElement.style.scrollSnapType = 'y mandatory';
    // No scrollbar while the landing is up (`html.pl-root` in landing.css): the
    // page snaps section to section and a bar read as chrome down the side of a
    // full-bleed spot. Scrolling itself is untouched; other routes keep theirs.
    document.documentElement.classList.add('pl-root');
    return () => {
      targets.forEach((el, i) => { el.style.background = previous[i].background; el.style.height = previous[i].height; el.style.overflow = previous[i].overflow; el.style.display = previous[i].display; });
      document.documentElement.style.scrollSnapType = previousSnap;
      document.documentElement.classList.remove('pl-root');
    };
  }, [theme.bg]);
  return <div className="pl" data-ink={inkMode} style={themeVars}>
    <Backdrop theme={theme} />
    {/* Over the video the toolbar is just its controls: while the hero is the chapter under the
        reader (spy.ts) its pill, scrim and blur go, and they come back as the page scrolls on. */}
    <nav className={`pl-nav${HERO_SPOTS.length > 0 && (current === null || current === 'top') ? ' is-over-video' : ''}`}>
      <div className="pl-nav-pill">
        <a className="pl-brand" href="#" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
          <Image source={ICON} style={{ width: 28, height: 28, borderRadius: 8 }} contentFit="cover" />
          <Image source={WORDMARK} style={{ width: 78, height: 26 }} contentFit="contain" accessibilityLabel="Poplur" />
        </a>
        <div className="pl-nav-links">
          <a href="#live" className={current === 'live' ? 'is-current' : undefined} onClick={e => { e.preventDefault(); scrollTo('live'); }}>Live</a>
          {SHOWCASE_STEPS.slice(0, 5).map(f => <a key={f.id} href={`#${f.id}`} className={current === f.id ? 'is-current' : undefined} onClick={e => { e.preventDefault(); scrollTo(f.id); }}>{f.nav}</a>)}
        </div>
        <div className="pl-nav-tools">
          {reader.state.available && <ReadBadge state={reader.state} onToggle={reader.toggle} />}
          <RadioBadge state={audio.state} onToggle={audio.toggleRadio} />
          <ColourBadge theme={theme} onChange={changeTheme} />
          <button className="pl-cta" onClick={() => scrollTo('beta')}>Join the beta</button>
        </div>
      </div>
    </nav>

    <Hero onSpotEnded={startTour} audio={audio} />

    <Signup />

    <section id="live" className="pl-live">
      <Lockup eyebrow="Live from the beta" title="The numbers, as they happen." sub="A private beta in Toronto, opt-in only. We are testing whether the radius works — do people post, do they come back, does a pop grow when a neighbour likes it, do people find pops by being inside them. Published every fifteen minutes from the same data the team sees." />
      <div className="wrap">
        <div className="pl-cards">
          <Reveal><ScorecardCard scorecard={scorecard} state={state} demo={demo} /></Reveal>
          <Reveal delay={120}><WorldCard demo={demo} /></Reveal>
        </div>
      </div>
    </section>

    <Lockup id="features" eyebrow="How it works" title="Reach, without followers." sub="Six things a pop does that a post never could." />

    <Showcase />

    {/* The footer is the header again — the same bar, the same classes, so the
        two cannot drift: brand, the chapter pills, and the way in. The legal
        line sits small beneath it. */}
    <footer className="pl-footer">
      <div className="pl-nav-pill pl-footer-pill">
        <a className="pl-brand" href="#" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
          <Image source={ICON} style={{ width: 28, height: 28, borderRadius: 8 }} contentFit="cover" />
          <Image source={WORDMARK} style={{ width: 78, height: 26 }} contentFit="contain" accessibilityLabel="Poplur" />
        </a>
        <div className="pl-nav-links">
          <a href="#live" className={current === 'live' ? 'is-current' : undefined} onClick={e => { e.preventDefault(); scrollTo('live'); }}>Live</a>
          {SHOWCASE_STEPS.slice(0, 5).map(f => <a key={f.id} href={`#${f.id}`} className={current === f.id ? 'is-current' : undefined} onClick={e => { e.preventDefault(); scrollTo(f.id); }}>{f.nav}</a>)}
        </div>
        <div className="pl-nav-tools">
          <button className="pl-cta" onClick={() => scrollTo('beta')}>Join the beta</button>
        </div>
      </div>
      <p className="pl-footer-legal">Poplur™ is confidential pre-release software of Apptist Inc., Toronto. · © 2026 Apptist Inc.</p>
    </footer>
  </div>;
}
