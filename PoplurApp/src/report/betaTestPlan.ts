// The beta test reports as data: three rounds, each a short series of tests a
// tester runs on their own phone, plus the questions the YC application needs
// answered. The page (app/report.tsx), the receipt emails and the record all
// read this file.
//
// Rounds and dates follow the Discord pins (v8, 6 Oct 2026: day 0 Sat 10 Oct,
// reports due Sat 17, 24 and 31 Oct; 10 points, 5 if late but in before the
// next one is due). The questions are built around the beta scorecard in
// .codex/yc-w27-runbook.md: why people open it on their own (organic pull),
// whether a like made a pop spread and the owner post again (the loop), where
// liked pops were found (discovery by radius), referrals, and permission to
// quote — asked in EVERY round, because the day-14 pull is Sat 24 Oct and the
// numbers go into the form before 27 Oct. Bump REPORT_VERSION when a test or
// question changes so old reports stay readable.

export const REPORT_VERSION = '2026-10-10';

/** The Google Form that takes the reports (built by scripts/build-report-form-script.mjs →
 *  .codex/beta-focus-group/poplur-beta-report-form.gs). Set, /report and the report
 *  links in email send testers there; empty, the site's own form is used. */
export const REPORT_FORM_URL = '';
export const REPORT_POINTS = 10;
export const REPORT_POINTS_LATE = 5;

export type TaskResult = 'worked' | 'failed' | 'skipped';
export const TASK_RESULTS: { value: TaskResult; label: string; short: string }[] = [
  { value: 'worked', label: 'Worked', short: 'ok' },
  { value: 'failed', label: 'Didn’t work', short: 'FAIL' },
  { value: 'skipped', label: 'Couldn’t try', short: 'skip' },
];

export type ReportTask = {
  id: string;
  title: string;
  /** What to do, one or two sentences. */
  steps: string;
  /** What should happen if the app is right. */
  expect: string;
};

export type ReportQuestion = { id: string; question: string; hint?: string; /** Must be answered: every report carries feedback. */ required?: boolean };

export type ReportRound = {
  number: 1 | 2 | 3;
  name: string;
  /** Toronto end of the due day, as UTC. */
  dueAt: string;
  dueLabel: string;
  /** The week's Google Form (made 21 Sep 2026 in apptistinc@gmail.com's
   *  Forms): the report page links it through /api/go so the funnel sees it
   *  opened, and scripts/import-form-responses.mjs reads its responses by
   *  `formId`. */
  formUrl?: string;
  formId?: string;
  blurb: string;
  tasks: ReportTask[];
  questions: ReportQuestion[];
};

/** Bugs and friction: every report carries these. Screenshots go to #bugs. */
const BUG_QUESTIONS: ReportQuestion[] = [
  { id: 'broke', question: 'What broke, froze or looked wrong?', hint: 'Where you were in the app and what you expected instead. Write “nothing” if nothing did. Screenshots go in #bugs on Discord.', required: true },
  { id: 'confused', question: 'What confused you, even for a second?', required: true },
];

/** What the YC application needs, asked every round (see the header). Ids are
 *  stable so the three rounds can be read side by side per tester. */
const YC_QUESTIONS: ReportQuestion[] = [
  { id: 'opened-why', question: 'The last time you opened Poplur without anyone telling you to: why did you open it?', hint: 'One or two sentences in your own words. “I didn’t” is a fine answer.', required: true },
  { id: 'opens-own', question: 'How many times this week did you open Poplur on your own, not for a prompt or a check-in?', hint: 'None, 1–2, 3–5, or most days.', required: true },
  { id: 'loop', question: 'Did a like make one of your pops spread further? If it did, did that make you want to post again?', hint: 'Which pop, and roughly how far it got.', required: true },
  { id: 'found-where', question: 'The pops you liked this week: where did you find them?', hint: 'The feed, the map, a notification, or someone’s profile. A rough split is fine.', required: true },
  { id: 'told', question: 'Did you tell anyone about Poplur this week? Did they install it?', hint: 'Their Discord username if they joined; referrals count for both of you.' },
  { id: 'quote', question: 'May we quote you by first name in our YC application? (yes / no)', required: true },
];

export const REPORT_ROUNDS: ReportRound[] = [
  {
    number: 1,
    name: 'First week',
    dueAt: '2026-10-18T03:59:59.000Z',
    dueLabel: 'Sat 17 Oct',
    blurb: 'Getting in, your first pop on the map, and the first like in either direction.',
    tasks: [
      { id: 'install', title: 'Install and sign in', steps: 'Install Poplur from TestFlight (iPhone) or the Google Play testing link (Android). Open it and create your account.', expect: 'You land on the feed with your username set.' },
      { id: 'location', title: 'Allow location', steps: 'The first time Poplur needs your position it asks. Allow it (“While using”).', expect: 'A system permission prompt appeared, and the map centred on where you are.' },
      { id: 'notifications', title: 'Allow notifications', steps: 'Allow notifications when Poplur asks.', expect: 'A system prompt appeared and notifications are on for Poplur in your phone’s settings.' },
      { id: 'map', title: 'See what is around you', steps: 'Open the Map tab and look around your area.', expect: 'Pops show as pins with radius rings, and the map moves smoothly.' },
      { id: 'post', title: 'Post your first pop', steps: 'Open the camera, take a photo or a short clip, review it and post it from where you are.', expect: 'Your pop appears on the map at your position with a 5 km radius.' },
      { id: 'find', title: 'Find your pop', steps: 'On the Map tab, tap your own pop.', expect: 'A card opens with your pop, its radius and how many people it reached.' },
      { id: 'feed', title: 'Scroll the feed', steps: 'Open the Feed tab and scroll for a minute.', expect: 'Pops from people within reach play one after another; nothing stalls or goes blank.' },
      { id: 'profile', title: 'Check your profile', steps: 'Open your profile.', expect: 'Your pop is there and the radius meter shows your reach.' },
      { id: 'like', title: 'Like someone’s pop', steps: 'In the feed or on the map, like a pop that is not yours.', expect: 'Its radius grew (the ring or the km number went up).' },
      { id: 'liked', title: 'Get a like', steps: 'Wait for someone to like one of your pops (ask in #focus-group if it takes long).', expect: 'You got a notification, and your pop’s radius went up.' },
    ],
    questions: [
      ...BUG_QUESTIONS,
      ...YC_QUESTIONS,
      { id: 'referral', question: 'Did a friend refer you? Their Discord username.', hint: 'Referrals count for both of you once this report is in.' },
    ],
  },
  {
    number: 2,
    name: 'Second week',
    dueAt: '2026-10-25T03:59:59.000Z',
    dueLabel: 'Sat 24 Oct',
    blurb: 'How pops spread, the camera, notifications, and coming back on your own.',
    tasks: [
      { id: 'second-place', title: 'Post from a second place', steps: 'Post a pop from somewhere else, then try to post again from that same spot.', expect: 'The second time, Poplur asks whether to keep your existing pop there or replace it, and both buttons are reachable.' },
      { id: 'picker', title: 'Pick a spot on the map', steps: 'While posting, choose a spot on the little map instead of your current position.', expect: 'The map loads, you can move it, and “Use this spot” places the pop there.' },
      { id: 'filters', title: 'Try a camera filter', steps: 'In the camera, swipe through the filters and capture with one on.', expect: 'The filter follows your face, and the capture keeps it.' },
      { id: 'decay', title: 'Watch a radius shrink', steps: 'Look at a pop you posted a day or more ago.', expect: 'Its radius is smaller than when you posted it, and the profile shows the change.' },
      { id: 'resume', title: 'Leave and come back', steps: 'Leave Poplur for an hour or more, then open it again.', expect: 'It comes back where you left it, and the map and feed are current.' },
      { id: 'pushes', title: 'Notifications', steps: 'Look at the notifications Poplur sent you this week.', expect: 'They arrived, they were about your pops, and there were not too many.' },
      { id: 'fresh', title: 'Fresh content', steps: 'Think about the last few times you opened Poplur on your own.', expect: 'There was something new to see each time.' },
      { id: 'heat', title: 'Ten minutes of use', steps: 'Use the app for ten minutes: map, feed, a post.', expect: 'The phone did not get hot, and the battery did not drop more than a few percent.' },
      { id: 'delete', title: 'Delete a pop', steps: 'Delete one of your pops.', expect: 'It disappears from your profile and from the map.' },
    ],
    questions: [
      ...BUG_QUESTIONS,
      ...YC_QUESTIONS,
      { id: 'best-reach', question: 'Your best reach so far: which pop, how far did it get, and how many people saw it?', hint: 'The number on the pop card is enough.' },
      { id: 'recommend', question: 'Would you tell a friend to install it? Why or why not?' },
    ],
  },
  {
    number: 3,
    name: 'Wrap-up',
    dueAt: '2026-11-01T03:59:59.000Z',
    dueLabel: 'Sat 31 Oct',
    blurb: 'Three weeks in: the whole run, and whether Poplur stays on your phone.',
    tasks: [
      { id: 'update', title: 'Updates arrived', steps: 'Check the version you are on now against the one you installed.', expect: 'New builds arrived through TestFlight or Google Play without reinstalling.' },
      { id: 'month-map', title: 'The map today', steps: 'Open the map where you usually are.', expect: 'There is more around you than on day one.' },
      { id: 'radius-story', title: 'Radius still makes sense', steps: 'Look at your pops’ radii after three weeks.', expect: 'You can tell why each one is the size it is.' },
      { id: 'block', title: 'Block and unblock', steps: 'Open a stranger’s profile, block them, then unblock them.', expect: 'Block sits above Message, their pops vanish while blocked, and they come back after.' },
      { id: 'signout', title: 'Sign out and back in', steps: 'Sign out, then sign in again.', expect: 'Your pops, radius and settings are all still there.' },
      { id: 'performance', title: 'Speed', steps: 'Move around the map and scroll the feed for a minute.', expect: 'No stutter, no crash, no blank map.' },
      { id: 'keep', title: 'Keep the app', steps: 'Decide whether Poplur stays on your phone after the beta.', expect: 'It stays (say why either way below).' },
    ],
    questions: [
      ...BUG_QUESTIONS,
      ...YC_QUESTIONS,
      { id: 'best-reach', question: 'Your best reach over the whole beta: which pop, how far did it get, and how many people saw it?' },
      { id: 'keep-why', question: 'Does Poplur stay on your phone after the beta? Why or why not?', required: true },
      { id: 'recommend', question: 'Would you tell a friend to install it? Why or why not?' },
      { id: 'want', question: 'The one thing you wish it did?' },
      { id: 'remove', question: 'What would you remove?' },
    ],
  },
];

export type RatingId = 'overall' | 'ease' | 'speed';
export const RATINGS: { id: RatingId; label: string; low: string; high: string }[] = [
  { id: 'overall', label: 'Overall this week', low: 'Frustrating', high: 'Loved it' },
  { id: 'ease', label: 'Easy to figure out', low: 'Lost', high: 'Obvious' },
  { id: 'speed', label: 'Fast and smooth', low: 'Laggy', high: 'Instant' },
];

export function roundByNumber(n: number): ReportRound | null {
  return REPORT_ROUNDS.find(r => r.number === n) ?? null;
}

/** The round a tester should be filing now: the first one not yet due. Past
 *  the last due date it stays the final round (late reports still count). */
export function currentRound(nowMs: number = Date.now()): ReportRound {
  return REPORT_ROUNDS.find(r => Date.parse(r.dueAt) >= nowMs) ?? REPORT_ROUNDS[REPORT_ROUNDS.length - 1];
}

/** Late = after the round's due day; still worth REPORT_POINTS_LATE as long as
 *  it is in before the next round is due (the board's rule). */
export function pointsFor(round: ReportRound, receivedAtMs: number): { late: boolean; points: number } {
  const late = receivedAtMs > Date.parse(round.dueAt);
  return { late, points: late ? REPORT_POINTS_LATE : REPORT_POINTS };
}

export type Platform = 'ios' | 'android';

/** What a filed report records. The same shape goes into the receipt the
 *  tester gets, the copy Poplur keeps (with a JSON attachment) and the API's answer. */
export type BetaReport = {
  reportVersion: string;
  round: number;
  roundName: string;
  dueAt: string;
  receivedAt: string;
  late: boolean;
  points: number;
  /** Came through a signed link from the tester's own invite. */
  verified: boolean;
  email: string;
  name: string;
  discord: string | null;
  platform: Platform;
  device: string;
  osVersion: string;
  results: { id: string; title: string; result: TaskResult; note: string | null }[];
  ratings: Record<RatingId, number | null>;
  answers: { id: string; question: string; answer: string }[];
  ip: string | null;
  userAgent: string | null;
};

export const PLATFORM_LABEL: Record<Platform, string> = { ios: 'iPhone', android: 'Android' };
