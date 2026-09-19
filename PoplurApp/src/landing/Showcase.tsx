import { Image } from 'expo-image';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import ShaderText from './ShaderText';
import { centreBell, onScrollFrame, reducedMotion } from './scroll';

// One iPhone that travels with the chapters: pinned to the screen while the
// feature copy scrolls past, but never parked in one corner — each chapter
// poses it somewhere else (right, left, above the copy, below it) on its own
// slant, and the screen inside changes with the step. The frame is CSS; every
// screen is a real render of the app (approved Good Copy stills today, device
// captures as they arrive) — never a drawn stand-in.

export type ShowcaseStep = {
  id: string;
  /** short toolbar name */
  nav: string;
  eyebrow: string;
  title: string;
  body: string;
  fine?: string;
  /** a real app screen (390×845), or null while a capture is still owed */
  screen: number | null;
};

/** Where the phone stands for a step, and which way the copy makes room. */
export type Pose = {
  /** the side of the copy the phone is on */
  side: 'right' | 'left' | 'top' | 'bottom';
  /** offsets from the stage centre, in vw / vh */
  x: number; y: number;
  /** the slant, in degrees */
  rz: number; ry: number; rx: number;
  scale: number;
};

// Real renders only: the clay map from the map surface, the runner's recorded
// app frames (a signed-in session, phone-sized), and approved Good Copy stills.
export const SCREENS = {
  map: require('@/assets/images/landing/screens/map.jpg'),
  radius: require('@/assets/images/landing/screens/radius.jpg'),
  feed: require('@/assets/images/landing/screens/feed.jpg'),
  place: require('@/assets/images/landing/screens/place.jpg'),
  types: require('@/assets/images/landing/screens/types.jpg'),
  store: require('@/assets/images/landing/screens/store.jpg'),
  splash: require('@/assets/images/landing/screens/splash.png'),
};

export const SHOWCASE_STEPS: ShowcaseStep[] = [
  { id: 'map', nav: 'Map', eyebrow: 'The map is the home screen', title: 'See what is popping around you.',
    body: 'A stylised 3D clay world with live weather and time of day. Every pop sits on the map where it was made — you see what is near, claim ground, and watch pops spread.',
    screen: SCREENS.map },
  { id: 'radius', nav: 'Radius', eyebrow: 'Every pop has a radius', title: 'Reach is earned per post, not per account.',
    body: 'A pop starts with a 5 km radius. As people engage, the radius grows — all the way to the whole world. Left alone, it decays and the pop disappears. Someone with no following can be seen by everyone around them.',
    fine: 'Earned reach can be claimed on your next pop, once. It is never minted by posting more.', screen: SCREENS.radius },
  { id: 'feed', nav: 'Feed', eyebrow: 'Found without followers', title: 'Inside a radius, you are in the feed.',
    body: 'Whether or not you follow the poster. Discovery is interception, not subscription: the feed is what has reached where you stand.',
    screen: SCREENS.feed },
  { id: 'place', nav: 'Place', eyebrow: 'Post from where you stand', title: 'One live pop per place.',
    body: 'Free posting is where you are. Post again within 5 km of your own pop and it replaces it, carrying its reach forward — the map stays honest about who was actually there.',
    fine: 'Posting anywhere else is a placement, and placements are paid.', screen: SCREENS.place },
  { id: 'types', nav: 'Post types', eyebrow: 'More than photos', title: 'Photos, carousels, video, music, podcasts.',
    body: 'Games and apps are designed into the same post pipeline. AI tools help people make posts and recommend where to post, by comparing how similar content has spread in different regions.',
    screen: SCREENS.types },
  { id: 'business', nav: 'Business', eyebrow: 'For businesses', title: 'Reach the people who can walk in.',
    body: 'A café posts the same way anyone does; its pop reaches the people nearby. Businesses pay to extend a radius or to place a pop somewhere they are not.',
    screen: SCREENS.store },
];

// The phone's tour, one pose per step in SHOWCASE_STEPS order: it starts on
// the right the way the hero left it, crosses to the left, rises above the
// copy, drops below it, and swings back — every stop on a different slant, so
// scrolling reads as the same object moving, not six pictures.
export const POSES: readonly Pose[] = [
  { side: 'right',  x: 22,  y: 0,   rz: 1.5,  ry: -17, rx: 5,  scale: 1 },
  { side: 'left',   x: -24, y: 2,   rz: -9,   ry: 16,  rx: 4,  scale: 0.96 },
  { side: 'top',    x: 0,   y: -24, rz: -14,  ry: 0,   rx: 8,  scale: 0.66 },
  { side: 'bottom', x: 4,   y: 25,  rz: 8,    ry: -8,  rx: -4, scale: 0.74 },
  { side: 'left',   x: -23, y: -2,  rz: 12,   ry: 18,  rx: 3,  scale: 0.98 },
  { side: 'right',  x: 24,  y: 4,   rz: -6,   ry: -20, rx: 6,  scale: 0.94 },
];

export const poseForStep = (index: number): Pose => POSES[index % POSES.length];

/** Which screen the phone shows for a step: its own, else the app's splash —
 *  a real screen, and honest about a capture that has not arrived. */
export const screenForStep = (step: ShowcaseStep) => step.screen ?? SCREENS.splash;

export function IPhone({ screens, active, className = '' }: { screens: readonly number[]; active: number; className?: string }) {
  return <div className={`pl-iphone ${className}`} aria-hidden="true">
    <div className="pl-iphone-screen">
      {screens.map((source, i) => <Image key={i} source={source} contentFit="cover" transition={0}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: i === active ? 1 : 0, transitionProperty: 'opacity', transitionDuration: '480ms' } as never} />)}
    </div>
    <div className="pl-iphone-island" />
  </div>;
}

export default function Showcase({ steps = SHOWCASE_STEPS }: { steps?: ShowcaseStep[] }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);
  useEffect(() => {
    const els = refs.current.filter((el): el is HTMLElement => !!el);
    if (!els.length || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(entries => {
      // The step nearest the middle of the viewport owns the phone.
      let best: { index: number; distance: number } | null = null;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const index = els.indexOf(entry.target as HTMLElement);
        const mid = entry.boundingClientRect.top + entry.boundingClientRect.height / 2;
        const distance = Math.abs(mid - window.innerHeight / 2);
        if (!best || distance < best.distance) best = { index, distance };
      }
      if (best) setActive(best.index);
    }, { threshold: [0.25, 0.5, 0.75], rootMargin: '-10% 0px -10% 0px' });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [steps.length]);
  // Copy is scrubbed by the scroll: each step's block fades and lifts in as
  // it approaches the middle of the screen and falls away after — the phone
  // holds its pose and the words move past it.
  useEffect(() => {
    if (reducedMotion()) return
    return onScrollFrame((_y, h) => {
      refs.current.forEach(el => {
        if (!el) return
        const bell = centreBell(el, h, 0.42)
        const copy = el.firstElementChild as HTMLElement | null
        el.style.opacity = String(0.18 + bell * 0.82)
        if (copy) copy.style.transform = `translateY(${(1 - bell) * 26}px)`
      })
    })
  }, [steps.length])
  const screens = steps.map(screenForStep);
  const pose = poseForStep(active);
  const poseVars = { '--x': pose.x, '--y': pose.y, '--rz': pose.rz, '--ry': pose.ry, '--rx': pose.rx, '--s': pose.scale } as CSSProperties;
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return <section className="pl-showcase">
    <div className="pl-stage" aria-hidden="true">
      <div className="pl-stage-phone" style={poseVars}>
        <IPhone screens={screens} active={active} />
      </div>
      <div className="pl-dots" role="tablist" aria-label="Features" aria-hidden="false">
        {steps.map((step, i) => <button key={step.id} type="button" role="tab" aria-selected={i === active} aria-label={step.nav} className={`pl-dot-btn${i === active ? ' is-on' : ''}`} onClick={() => go(step.id)} />)}
      </div>
    </div>
    <div className="pl-steps">
      {steps.map((step, i) => <article key={step.id} id={step.id} ref={el => { refs.current[i] = el; }} data-side={poseForStep(i).side} className={`pl-step${i === active ? ' is-active' : ''}`}>
        <div className="pl-step-copy">
          <div className="pl-eyebrow">{step.eyebrow}</div>
          <ShaderText as="h2">{step.title}</ShaderText>
          <p>{step.body}</p>
          {step.fine && <p className="pl-fine">{step.fine}</p>}
        </div>
      </article>)}
    </div>
  </section>;
}
