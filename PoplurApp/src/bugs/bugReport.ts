// A bug report as data, so the page (app/bug.tsx) and the route
// (app/api/bug+api.ts) agree on the questions and the limits.
//
// Built 22 Sep 2026. It lives on the site rather than in a Google Form because
// Google makes anyone attaching a file sign in to a Google account, and half
// the testers are on iPhones with no reason to have one.

export const BUG_VERSION = '2026-09-22';

/** Where in the app it happened. The list is the tester's vocabulary, not the code's. */
export const BUG_AREAS = [
  'Signing up or signing in',
  'Location or notification permission',
  'Map',
  'Feed',
  'Camera',
  'Posting (the composer)',
  'Picking a spot on the map',
  'Profile',
  'Notifications',
  'Somewhere else',
] as const;
export type BugArea = (typeof BUG_AREAS)[number];

export const BUG_FREQUENCIES = ['Every time', 'Most times', 'Once or twice', 'Only the first time', 'I have not tried again'] as const;
export type BugFrequency = (typeof BUG_FREQUENCIES)[number];

export const BUG_IMPACTS = [
  'Annoying, but I carried on',
  'It stopped me doing what I was trying to do',
  'The app crashed or froze',
] as const;
export type BugImpact = (typeof BUG_IMPACTS)[number];

export type BugPlatform = 'ios' | 'android';
export const BUG_PLATFORM_LABEL: Record<BugPlatform, string> = { ios: 'iPhone', android: 'Android' };

/** Screenshots: three at most, and small enough to travel as email attachments.
 *  The page downscales before it uploads, so these are a backstop, not the plan. */
export const BUG_MAX_SHOTS = 3;
export const BUG_MAX_SHOT_BYTES = 1_500_000;
export const BUG_MAX_TOTAL_BYTES = 3_500_000;
export const BUG_SHOT_MAX_EDGE = 1400;
export const BUG_SHOT_QUALITY = 0.82;
export const BUG_SHOT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type BugShot = { name: string; type: string; dataUrl: string };

export type BugReport = {
  bugVersion: string;
  receivedAt: string;
  /** Came through a tester's own signed link. */
  verified: boolean;
  email: string;
  name: string;
  discord: string | null;
  platform: BugPlatform;
  device: string;
  osVersion: string;
  appVersion: string | null;
  area: BugArea;
  doing: string;
  expected: string;
  happened: string;
  frequency: BugFrequency;
  impact: BugImpact;
  extra: string | null;
  shots: { name: string; bytes: number }[];
  ip: string | null;
  userAgent: string | null;
};

export function isBugArea(value: unknown): value is BugArea {
  return typeof value === 'string' && (BUG_AREAS as readonly string[]).includes(value);
}
export function isBugFrequency(value: unknown): value is BugFrequency {
  return typeof value === 'string' && (BUG_FREQUENCIES as readonly string[]).includes(value);
}
export function isBugImpact(value: unknown): value is BugImpact {
  return typeof value === 'string' && (BUG_IMPACTS as readonly string[]).includes(value);
}

/** "The app crashed" and "it stopped me" jump the queue in the subject line. */
export function bugSeverity(report: Pick<BugReport, 'impact'>): 'blocker' | 'crash' | 'annoyance' {
  if (report.impact === 'The app crashed or froze') return 'crash';
  if (report.impact === 'It stopped me doing what I was trying to do') return 'blocker';
  return 'annoyance';
}

/** A data URL's decoded byte length, without decoding it. */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return 0;
  const body = dataUrl.slice(comma + 1);
  const padding = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((body.length * 3) / 4) - padding);
}
