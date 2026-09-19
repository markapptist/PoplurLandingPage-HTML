import { Image } from 'expo-image';
import { useEffect, useRef, type CSSProperties } from 'react';
import ShaderText from './ShaderText';
import { centreBell, onScrollFrame, reducedMotion } from './scroll';

// Every chapter has its own iPhone, large, laid out beside its copy — right
// of it, left of it, above it or below it — on its own slant, so scrolling
// reads as a walk past six different arrangements and the phone is never over
// the words. The frame is CSS; every screen is a real render of the app
// (approved Good Copy stills today, device captures as they arrive) — never a
// drawn stand-in.

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

/** Where a step's phone stands relative to its copy, and its slant. */
export type Pose = {
  side: 'right' | 'left' | 'top' | 'bottom';
  /** degrees; small around Z beside text — a big tilt widens the phone into the column next to it */
  rz: number; ry: number; rx: number;
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

// One pose per step in SHOWCASE_STEPS order: right, left, above, below, left,
// right — six arrangements, six slants, so the walk down the page never
// repeats a picture.
export const POSES: readonly Pose[] = [
  { side: 'right',  rz: 2,   ry: -17, rx: 5 },
  { side: 'left',   rz: -6,  ry: 16,  rx: 4 },
  { side: 'top',    rz: -12, ry: 0,   rx: 8 },
  { side: 'bottom', rz: 9,   ry: -8,  rx: -4 },
  { side: 'left',   rz: 7,   ry: 18,  rx: 3 },
  { side: 'right',  rz: -5,  ry: -20, rx: 6 },
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
  const refs = useRef<(HTMLElement | null)[]>([]);
  // Scrubbed by the scroll: a chapter brightens as it nears the middle of the
  // screen and dims as it leaves, so the one you are reading is the one lit.
  useEffect(() => {
    if (reducedMotion()) return
    return onScrollFrame((_y, h) => {
      refs.current.forEach(el => {
        if (!el) return
        el.style.opacity = String(0.3 + centreBell(el, h, 0.55) * 0.7)
      })
    })
  }, [steps.length])
  return <section className="pl-showcase">
    {steps.map((step, i) => {
      const pose = poseForStep(i);
      const slant = { '--rz': pose.rz, '--ry': pose.ry, '--rx': pose.rx } as CSSProperties;
      return <article key={step.id} id={step.id} ref={el => { refs.current[i] = el; }} data-side={pose.side} className="pl-step">
        <div className="pl-step-copy">
          <div className="pl-eyebrow">{step.eyebrow}</div>
          <ShaderText as="h2">{step.title}</ShaderText>
          <p>{step.body}</p>
          {step.fine && <p className="pl-fine">{step.fine}</p>}
        </div>
        <div className="pl-step-phone" style={slant} aria-hidden="true">
          <IPhone screens={[screenForStep(step)]} active={0} />
        </div>
      </article>;
    })}
  </section>;
}
