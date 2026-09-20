import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import ClayObject from './ClayObject';
import ShaderText from './ShaderText';
import { centreBell, onScrollFrame, reducedMotion } from './scroll';

// Every chapter shows one of the app's own clay objects, live (ClayObject):
// the globe, the reach trophy, the Feed's TV, the pin, the Kodak, the Store's
// bag — the same GLBs the app's navigator cube wears — laid out beside its
// copy: right of it, left of it, above it or below it, so scrolling reads as
// a walk past six different arrangements and the object is never over the
// words. The iPhone frame stays for the hero when there is no TV spot; its
// screens are real renders of the app, never a drawn stand-in.

export type ShowcaseStep = {
  id: string;
  /** short toolbar name */
  nav: string;
  eyebrow: string;
  title: string;
  body: string;
  fine?: string;
  /** the app's clay object for this chapter: a GLB under public/models/landing */
  model: string;
  /** what the object is, for a screen reader */
  object: string;
};

/** Where a step's object stands relative to its copy, and how it is turned. */
export type Pose = {
  side: 'right' | 'left' | 'top' | 'bottom';
  /** starting turn, degrees, and lean toward the camera, radians */
  yaw: number; pitch: number;
};

// Real renders only: the clay map from the map surface, the runner's recorded
// app frames (a signed-in session, phone-sized), and approved Good Copy stills.
// The hero's phone (when there is no TV spot) wears these.
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
    model: '/models/landing/poplur-globe-lite.glb', object: 'The Poplur globe' },
  { id: 'radius', nav: 'Radius', eyebrow: 'Every pop has a radius', title: 'Reach is earned per post, not per account.',
    body: 'A pop starts with a 5 km radius. As people engage, the radius grows — all the way to the whole world. Left alone, it decays and the pop disappears. Someone with no following can be seen by everyone around them.',
    fine: 'Earned reach can be claimed on your next pop, once. It is never minted by posting more.',
    model: '/models/landing/poplur_cube_trophy.glb', object: 'The reach trophy' },
  { id: 'feed', nav: 'Feed', eyebrow: 'Found without followers', title: 'Inside a radius, you are in the feed.',
    body: 'Whether or not you follow the poster. Discovery is interception, not subscription: the feed is what has reached where you stand.',
    model: '/models/landing/clay_tv_navigator.glb', object: 'The Feed television' },
  { id: 'place', nav: 'Place', eyebrow: 'Post from where you stand', title: 'One live pop per place.',
    body: 'Free posting is where you are. Post again within 5 km of your own pop and it replaces it, carrying its reach forward — the map stays honest about who was actually there.',
    fine: 'Posting anywhere else is a placement, and placements are paid.',
    model: '/models/landing/poplur_pin_lite.glb', object: 'The map pin' },
  { id: 'types', nav: 'Post types', eyebrow: 'More than photos', title: 'Photos, carousels, video, music, podcasts.',
    body: 'Games and apps are designed into the same post pipeline. AI tools help people make posts and recommend where to post, by comparing how similar content has spread in different regions.',
    model: '/models/landing/poplur_camera_kodak.glb', object: 'The camera' },
  { id: 'business', nav: 'Business', eyebrow: 'For businesses', title: 'Reach the people who can walk in.',
    body: 'A café posts the same way anyone does; its pop reaches the people nearby. Businesses pay to extend a radius or to place a pop somewhere they are not.',
    model: '/models/landing/poplur_cube_shopping_bag.glb', object: 'The Store bag' },
];

// One pose per step in SHOWCASE_STEPS order: right, left, above, below, left,
// right — six arrangements, each object starting from its own turn, so the
// walk down the page never repeats a picture.
export const POSES: readonly Pose[] = [
  { side: 'right',  yaw: -28, pitch: 0.16 },
  { side: 'left',   yaw: 24,  pitch: 0.2 },
  { side: 'top',    yaw: -12, pitch: 0.26 },
  { side: 'bottom', yaw: 34,  pitch: 0.12 },
  { side: 'left',   yaw: -40, pitch: 0.18 },
  { side: 'right',  yaw: 18,  pitch: 0.22 },
];

export const poseForStep = (index: number): Pose => POSES[index % POSES.length];

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
      return <article key={step.id} id={step.id} ref={el => { refs.current[i] = el; }} data-side={pose.side} className="pl-step">
        <div className="pl-step-copy">
          <div className="pl-eyebrow">{step.eyebrow}</div>
          <ShaderText as="h2">{step.title}</ShaderText>
          <p>{step.body}</p>
          {step.fine && <p className="pl-fine">{step.fine}</p>}
        </div>
        <div className="pl-step-object">
          <ClayObject model={step.model} label={step.object} yaw={pose.yaw} pitch={pose.pitch} />
        </div>
      </article>;
    })}
  </section>;
}
