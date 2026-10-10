// The beta invite, in the landing page's own clothes (landing/landing.css, the
// default theme), carried by the two clay mail objects — the mailbox and the
// airmail envelope, rendered from the app's own models
// (poplur-clay-map/public/navigator-sprites, /sprites). The mailbox is the
// y-24 p16 render, the three-quarter seen from slightly below, the owner's pick.
//
// It comes in four designs and the sender rolls one per email
// (pickBetaInviteVariant), the way the landing rolls a theme per visit:
//   pink      — the landing's default theme: pink canvas, white ink, white pills
//   paper     — the landing's white card language; pink only as the accent
//   night     — the app's own black and pink; the mailbox lit on dark
//   postcard  — the envelope is the hero, airmail stripes, buttons side by side
//
// And it comes in two stages, because the store links are gated behind the
// tester agreement (app/nda.tsx, app/api/nda+api.ts):
//   nda       — one button: read and sign the agreement (a signed, expiring link)
//   links     — the TestFlight and Google Play buttons, sent once they have signed
// Same designs and images for both; only the words and the buttons change.
//
// Everything is tables and inline styles because it is an email. Rows that
// sit side by side at 600 px are "hybrid" blocks (inline-block with a
// max-width) so they stack on a phone instead of squeezing the copy.

import { NDA_SECTIONS, NDA_SUBTITLE, NDA_SUMMARY, NDA_TITLE, NDA_PARTIES, type NdaAcceptance } from '@/nda/betaTesterNda';
import { PLATFORM_LABEL, TASK_RESULTS, RATINGS, roundByNumber, type BetaReport } from '@/report/betaTestPlan';
import { BUG_PLATFORM_LABEL, bugSeverity, type BugReport } from '@/bugs/bugReport';

export const betaInviteFrom = 'Poplur <hello@poplur.ca>';

export type BetaInviteStage = 'nda' | 'links';

export const BETA_INVITE_SUBJECTS: Record<BetaInviteStage, string> = {
  nda: 'Your Poplur beta: sign the tester agreement to unlock your links',
  links: 'Your Poplur beta links',
};
export const BETA_INVITE_PREVIEWS: Record<BetaInviteStage, string> = {
  nda: 'One minute of reading, then TestFlight for iPhone and Google Play for Android.',
  links: 'Your links are inside: TestFlight for iPhone, the beta on Google Play for Android.',
};
/** The older names, for callers that predate the two stages. */
export const betaInviteSubject = BETA_INVITE_SUBJECTS.links;
export const betaInvitePreview = BETA_INVITE_PREVIEWS.links;

export const ndaReceiptSubject = 'Your signed Poplur beta tester agreement';

// The pictures live on the site itself (PoplurApp/public/emails → poplur.ca/emails/…),
// where every mail client can fetch them. They had travelled as inline
// attachments by content id, and Gmail on the phone showed none of them.
export const BETA_INVITE_IMAGES = {
  icon: { path: 'emails/icon.png', file: 'assets/images/landing/app-icon.png' },
  mailbox: { path: 'emails/mailbox.png', file: 'assets/emails/mailbox.png' },
  envelope: { path: 'emails/envelope.png', file: 'assets/emails/envelope.png' },
  // The platform marks on the buttons, from the app's own icon font
  // (Ionicons logo-apple / logo-android), in the two button inks.
  appleWhite: { path: 'emails/apple-white.png', file: 'assets/emails/apple-white.png' },
  appleInk: { path: 'emails/apple-ink.png', file: 'assets/emails/apple-ink.png' },
  androidWhite: { path: 'emails/android-white.png', file: 'assets/emails/android-white.png' },
  androidInk: { path: 'emails/android-ink.png', file: 'assets/emails/android-ink.png' },
} as const;

export type BetaInviteImageKey = keyof typeof BETA_INVITE_IMAGES;

export const BETA_INVITE_ASSET_ORIGIN = 'https://www.poplur.ca';

/** Every image as an absolute URL on the site. */
export function betaInviteHostedImages(origin = BETA_INVITE_ASSET_ORIGIN): Record<BetaInviteImageKey, string> {
  const base = origin.replace(/\/+$/, '');
  const out = {} as Record<BetaInviteImageKey, string>;
  for (const key of Object.keys(BETA_INVITE_IMAGES) as BetaInviteImageKey[]) out[key] = `${base}/${BETA_INVITE_IMAGES[key].path}`;
  return out;
}

export const BETA_INVITE_VARIANTS = ['pink', 'paper', 'night', 'postcard'] as const;
export type BetaInviteVariant = (typeof BETA_INVITE_VARIANTS)[number];

export function isBetaInviteVariant(value: unknown): value is BetaInviteVariant {
  return typeof value === 'string' && (BETA_INVITE_VARIANTS as readonly string[]).includes(value);
}

/** One of the four, at random. The sender calls this once per email so the
 *  design that went out can be logged and answered for. */
export function pickBetaInviteVariant(random: () => number = Math.random): BetaInviteVariant {
  return BETA_INVITE_VARIANTS[Math.floor(random() * BETA_INVITE_VARIANTS.length)] ?? 'pink';
}

type BetaInviteEmailOptions = {
  androidUrl?: string;
  iosUrl?: string;
  /** Which design. Omitted, the template rolls one. */
  variant?: BetaInviteVariant;
  /** Which stage. Omitted, the links (the older behaviour). */
  stage?: BetaInviteStage;
  /** The signing link; required for the `nda` stage. */
  ndaUrl?: string;
  /** The tester's report page (app/report.tsx); shown in the `links` stage when given. */
  reportUrl?: string;
  /** The bug form (app/bug.tsx); shown in the `links` stage when given. */
  bugUrl?: string;
  /** The beta Discord's invite. Given, the `nda` stage leads with it: Discord first,
   *  then the agreement (the runbook's Discord → #nda → Tester role → install). */
  discordUrl?: string;
  /** A src per image. Missing keys fall back to the hosted copies on the site;
   *  an empty string leaves that image out. */
  images?: Partial<Record<BetaInviteImageKey, string>>;
  /** The older call shape: the icon's src alone. */
  logoSrc?: string;
};

const defaultIosUrl = 'https://testflight.apple.com/join/Q4v1ChjU';
// Play's opt-in link is keyed by the app's applicationId
// (Poplur2025-Android/app/build.gradle.kts). It had pointed at com.poplur.app,
// a package that does not exist.
// Play Console → Internal testing → Testers → "Copy link" (21 Sep 2026). The generic
// apps/testing/<package> page only serves open and closed tracks; an internal
// track's opt-in is this per-track link, and it works only for an address on
// the track's tester list.
const defaultAndroidUrl = 'https://play.google.com/apps/internaltest/4701549713059994223';

const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const PINK = '#ff2d96';
const INK = '#111114';
const INK_2 = '#5c5c66';
const INK_3 = '#9a9aa3';

export function getBetaInviteLinks(options: BetaInviteEmailOptions = {}) {
  return {
    androidUrl: options.androidUrl ?? defaultAndroidUrl,
    iosUrl: options.iosUrl ?? defaultIosUrl,
  };
}

export function getBetaInviteImageSources(options: BetaInviteEmailOptions = {}): Record<BetaInviteImageKey, string> {
  const sources = {} as Record<BetaInviteImageKey, string>;
  const hosted = betaInviteHostedImages();
  for (const key of Object.keys(BETA_INVITE_IMAGES) as BetaInviteImageKey[]) {
    const given = options.images?.[key];
    sources[key] = given !== undefined ? given : hosted[key];
  }
  if (options.logoSrc !== undefined && options.images?.icon === undefined) sources.icon = options.logoSrc;
  return sources;
}

// ---------------------------------------------------------------- the words

type Mark = 'apple' | 'android' | null;
type Button = { label: string; href: string; mark: Mark };
type Content = {
  eyebrow: string;
  title: string;
  lede: string;
  buttons: Button[];
  tags: string[];
  notes: { strong: string; body: string }[];
  reply: string;
  foot: string;
};

function contentFor(stage: BetaInviteStage, links: { iosUrl: string; androidUrl: string }, ndaUrl: string, reportUrl = '', discordUrl = '', bugUrl = ''): Content {
  const tags = ['iOS · TestFlight', 'Android · Google Play', 'Toronto first'];
  const foot = 'You asked for beta access at';
  if (stage === 'nda' && discordUrl) {
    return {
      eyebrow: 'Private beta',
      title: 'Two steps and<br>you are in.',
      lede: 'The beta runs in a small Discord: that is where the builds, the weekly check-ins and the other testers are. Join it, then read and sign the short tester agreement — a minute, no account — and your TestFlight and Google&nbsp;Play links unlock.',
      buttons: [
        { label: 'Join the beta Discord', href: discordUrl, mark: null },
        { label: 'Read and sign the tester agreement', href: ndaUrl, mark: null },
      ],
      tags,
      notes: [
        { strong: 'In the Discord.', body: 'Say hi in #welcome. Once your agreement is in you get the Tester role, which opens #focus-group, #bugs and the voice chats.' },
        { strong: 'The agreement.', body: 'What you see in the beta stays in the group; no screenshots outside it; we may use your feedback; the app is unfinished and may break; you can leave at any time; it is voluntary and separate from any school or job. The signing link in this email is yours alone and works for 14 days.' },
      ],
      reply: 'Questions? Reply to this email or ask in #welcome.',
      foot,
    };
  }
  if (stage === 'nda') {
    return {
      eyebrow: 'Private beta',
      title: 'One thing before<br>your links.',
      lede: 'Poplur is pre-release. Read the short tester agreement and sign it with your name — a minute, no account — and your TestFlight and Google&nbsp;Play links unlock on the spot and land in your inbox.',
      buttons: [{ label: 'Read and sign the tester agreement', href: ndaUrl, mark: null }],
      tags,
      notes: [
        { strong: 'What it says.', body: 'What you see in the beta stays in the group; no screenshots outside it; we may use your feedback; the app is unfinished and may break; you can leave at any time; it is voluntary and separate from any school or job.' },
        { strong: 'After you sign.', body: 'The links appear right there, and a signed copy and the links arrive by email. The signing link in this email is yours alone and works for 14 days.' },
      ],
      reply: 'Questions about the agreement? Reply to this email.',
      foot,
    };
  }
  return {
    eyebrow: 'Private beta',
    title: 'Your beta access<br>is ready.',
    lede: 'Thanks for signing. Install Poplur once; every beta update after that arrives through TestFlight or Google&nbsp;Play.',
    buttons: [
      { label: 'Get Poplur for iPhone', href: links.iosUrl, mark: 'apple' },
      { label: 'Get Poplur for Android', href: links.androidUrl, mark: 'android' },
    ],
    tags,
    notes: [
      { strong: 'Future updates.', body: 'New iPhone builds land in TestFlight and Android updates through Google Play. Keep this email: the links work again if you ever need to reinstall.' },
      { strong: 'What to try first.', body: 'Open Poplur where you are, see what is popping around you, and post something for the next person who arrives. Share locally and discover what connects with people nearby.' },
      ...(reportUrl ? [{ strong: 'Your test reports.', body: `Four short reports over the beta, ten points each on the points board, five minutes apiece. The first is due Sat 10 Oct. <a href="${reportUrl}" style="color:inherit;font-weight:600;">Open your report page</a> — the link is yours alone; keep it.` }] : []),
      ...(bugUrl ? [{ strong: 'Found a bug?', body: `Send it the moment you hit it, with a screenshot: <a href="${bugUrl}" style="color:inherit;font-weight:600;">the bug form</a>. No sign-in, no account. A confirmed bug is five points, and the first person to report it gets them.` }] : []),
    ],
    reply: 'Have feedback? Reply to this email. Every note shapes the beta.',
    foot,
  };
}

export function createBetaInviteText(options: BetaInviteEmailOptions = {}) {
  const { androidUrl, iosUrl } = getBetaInviteLinks(options);
  const stage = options.stage ?? 'links';
  if (stage === 'nda' && options.discordUrl) {
    return [
      'Two steps and you are in the Poplur beta.',
      '',
      'The beta runs in a small Discord: that is where the builds, the weekly check-ins and the other testers are. Join it, then read and sign the short tester agreement — a minute, no account — and your TestFlight and Google Play links unlock.',
      '',
      `1. Join the beta Discord: ${options.discordUrl}`,
      `2. Read and sign the tester agreement: ${options.ndaUrl ?? ''}`,
      '',
      'Once your agreement is in you get the Tester role, which opens #focus-group, #bugs and the voice chats.',
      '',
      'The agreement, in short: what you see in the beta stays in the group; no screenshots outside it; we may use your feedback; the app is unfinished and may break; you can leave at any time; it is voluntary and separate from any school or job. The signing link is yours alone and works for 14 days.',
      '',
      'Questions? Reply to this email or ask in #welcome.',
      '',
      'Poplur · Toronto beta',
      'You asked for beta access at poplur.ca.',
    ].join('\n');
  }
  if (stage === 'nda') {
    return [
      'One thing before your Poplur beta links.',
      '',
      'Poplur is pre-release. Read the short tester agreement and sign it with your name — a minute, no account — and your TestFlight and Google Play links unlock on the spot and land in your inbox.',
      '',
      `Read and sign the tester agreement: ${options.ndaUrl ?? ''}`,
      '',
      'What it says: what you see in the beta stays in the group; no screenshots outside it; we may use your feedback; the app is unfinished and may break; you can leave at any time; it is voluntary and separate from any school or job.',
      '',
      'The signing link is yours alone and works for 14 days. Questions? Reply to this email.',
      '',
      'Poplur · Toronto beta',
      'You asked for beta access at poplur.ca.',
    ].join('\n');
  }
  return [
    'Your Poplur beta access is ready.',
    '',
    'Thanks for signing. Install Poplur once; every beta update after that arrives through TestFlight or Google Play.',
    '',
    `iPhone (TestFlight): ${iosUrl}`,
    `Android (Google Play): ${androidUrl}`,
    '',
    'What to try first: open Poplur where you are, see what is popping around you, and post something for the next person who arrives. Share locally and discover what connects with people nearby.',
    '',
    ...(options.reportUrl ? [`Your test reports: four short reports over the beta, ten points each on the points board. The first is due Sat 10 Oct. Your report page (yours alone, keep it): ${options.reportUrl}`, ''] : []),
    ...(options.bugUrl ? [`Found a bug? Send it the moment you hit it, with a screenshot — no sign-in needed: ${options.bugUrl}`, ''] : []),
    'Have feedback? Reply to this email. Every note shapes the beta.',
    '',
    'Poplur · Toronto beta',
    'You asked for beta access at poplur.ca.',
  ].join('\n');
}

// ---------------------------------------------------------------- pieces

function img(src: string, attrs: string): string {
  return src ? `<img src="${src}" ${attrs}>` : '';
}

/** A pill button. `extra` lands on the cell, e.g. a border or the landing's
 *  3 px clay shadow (.pl-cta); Outlook drops both and still shows a button. */
function pill(label: string, href: string, bg: string, color: string, extra = '', mark = ''): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:0 auto;">
    <tr>
      <td align="center" style="background:${bg};border-radius:999px;${extra}">
        <a href="${href}" style="display:block;padding:15px 30px;min-width:250px;color:${color};font-family:${FONT};font-size:16px;font-weight:600;line-height:20px;text-align:center;text-decoration:none;border-radius:999px;">${markImg(mark)}${label}</a>
      </td>
    </tr>
  </table>`;
}

/** The platform mark that leads a button label, 18 px on the text line. */
function markImg(src: string): string {
  return src ? `<img src="${src}" width="18" height="18" alt="" style="display:inline-block;width:18px;height:18px;vertical-align:-3px;margin:0 9px 0 0;border:0;">` : '';
}

function tags(labels: string[], color: string, border: string): string {
  const cells = labels.map(label => `<td style="padding:0 4px;"><span style="display:inline-block;padding:6px 12px;border:1px solid ${border};border-radius:999px;font-family:${FONT};font-size:12px;line-height:14px;color:${color};white-space:nowrap;">${label}</span></td>`).join('');
  return `<table role="presentation" cellspacing="0" cellpadding="0" align="center"><tr>${cells}</tr></table>`;
}

/** Two blocks side by side where they fit, stacked where they do not: the
 *  hybrid pattern mail clients honour without media queries. The gap lives
 *  inside the first block — to its right when side by side, below it when
 *  stacked — so the sum of the max widths must fit the container at a 600 px
 *  viewport, where the card has already lost 32 px to the body padding
 *  (a 600 card is 568 wide there, a 560 card 528). */
function sideBySide(left: string, leftMax: number, right: string, rightMax: number, pad = 18): string {
  return `<div style="font-size:0;line-height:0;text-align:left;">
    <div style="display:inline-block;width:100%;max-width:${leftMax}px;vertical-align:top;"><div style="padding:0 ${pad}px ${pad}px 0;">${left}</div></div>
    <div style="display:inline-block;width:100%;max-width:${rightMax}px;vertical-align:top;">${right}</div>
  </div>`;
}

function gap(px: number): string {
  return `<tr><td style="height:${px}px;line-height:${px}px;font-size:1px;">&nbsp;</td></tr>`;
}

function notes(content: Content, strong: string, body: string): string {
  return content.notes.map((note, i) => `<p style="margin:${i ? 14 : 0}px 0 0;color:${body};"><strong style="color:${strong};font-weight:700;">${note.strong}</strong> ${note.body}</p>`).join('\n');
}

function brand(src: string, size: number, color: string, fontSize: number): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0">
    <tr>
      <td valign="middle" style="padding-right:10px;">${img(src, `width="${size}" height="${size}" alt="" style="display:block;width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.27)}px;border:0;"`)}</td>
      <td valign="middle" style="font-family:${FONT};font-size:${fontSize}px;line-height:${fontSize + 2}px;font-weight:800;letter-spacing:-0.02em;color:${color};">Poplur</td>
    </tr>
  </table>`;
}

function shell(bg: string, subject: string, preview: string, body: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>${subject}</title>
  </head>
  <!-- Gmail on the phone repaints light mail for its dark mode: light
       backgrounds darken, dark text lightens, pink stays pink. That is
       legible and it cannot be switched off from inside the mail; the
       night design, dark to begin with, goes through untouched. The
       blend-mode trick that tried to cancel the repaint inverted the
       pictures instead — green clay — and is gone. -->
  <body style="margin:0;padding:0;background:${bg};font-family:${FONT};-webkit-font-smoothing:antialiased;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${bg};">${preview}</div>
    ${body}
  </body>
</html>`;
}

type Src = Record<BetaInviteImageKey, string>;
type Design = { src: Src; content: Content; subject: string; preview: string };

/** The mark file for a button, in the ink the button needs. */
function markFor(src: Src, mark: Mark, tone: 'white' | 'ink'): string {
  if (mark === 'apple') return tone === 'white' ? src.appleWhite : src.appleInk;
  if (mark === 'android') return tone === 'white' ? src.androidWhite : src.androidInk;
  return '';
}

/** The buttons stacked, each in its own row, `style(button, i)` choosing the look. */
function stackedButtons(d: Design, style: (button: Button, i: number) => string): string {
  return d.content.buttons.map((button, i) => `${i ? gap(i === 1 ? 14 : 12) : ''}<tr><td align="center">${style(button, i)}</td></tr>`).join('\n');
}

// ---------------------------------------------------------------- designs

/** pink — the landing's default theme: pink canvas, white ink, white pills. */
function pinkDesign(d: Design): string {
  const { src, content } = d;
  const white = '#ffffff';
  return shell(PINK, d.subject, d.preview, `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${PINK};">
      <tr>
        <td align="center" style="padding:36px 16px 40px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;">
            <tr><td align="center" style="padding:0 0 26px;">${brand(src.icon, 40, white, 22)}</td></tr>
            <tr><td align="center" style="padding:0 0 10px;">${img(src.mailbox, `width="150" alt="A pink clay Poplur mailbox with its flag up" style="display:block;width:150px;max-width:50%;height:auto;border:0;"`)}</td></tr>
            <tr><td align="center" style="padding:6px 0 0;font-family:${FONT};font-size:12px;line-height:16px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.78);">${content.eyebrow}</td></tr>
            <tr><td align="center" style="padding:12px 0 0;"><h1 style="margin:0;font-family:${FONT};font-size:40px;line-height:1.04;font-weight:800;letter-spacing:-0.03em;color:${white};">${content.title}</h1></td></tr>
            <tr><td align="center" style="padding:16px 24px 0;font-family:${FONT};font-size:17px;line-height:1.5;color:rgba(255,255,255,0.9);">${content.lede}</td></tr>
            ${gap(30)}
            ${stackedButtons(d, b => pill(b.label, b.href, white, INK, 'box-shadow:0 3px 0 rgba(0,0,0,0.18);', markFor(src, b.mark, 'ink')))}
            <tr><td align="center" style="padding:22px 0 0;">${tags(content.tags, 'rgba(255,255,255,0.9)', 'rgba(255,255,255,0.4)')}</td></tr>
            ${gap(34)}
            <tr>
              <td style="background:${white};border-radius:22px;padding:24px 26px;">
                ${sideBySide(img(src.envelope, `width="104" alt="A striped Poplur airmail envelope" style="display:block;width:104px;height:auto;border:0;"`), 122, `<div style="font-family:${FONT};font-size:15px;line-height:1.55;color:${INK_2};">${notes(content, INK, INK_2)}</div>`, 380)}
              </td>
            </tr>
            <tr><td align="center" style="padding:28px 24px 0;font-family:${FONT};font-size:15px;line-height:1.5;color:rgba(255,255,255,0.86);">${content.reply}</td></tr>
            <tr><td align="center" style="padding:34px 24px 0;font-family:${FONT};font-size:12px;line-height:1.5;color:rgba(255,255,255,0.7);"><span style="font-weight:700;color:${white};">Poplur</span> · Toronto beta<br>${content.foot} <a href="https://www.poplur.ca" style="color:${white};text-decoration:underline;">poplur.ca</a>.</td></tr>
          </table>
        </td>
      </tr>
    </table>`);
}

/** paper — the landing's white card language; pink only as the accent. */
function paperDesign(d: Design): string {
  const { src, content } = d;
  return shell('#f6f6f8', d.subject, d.preview, `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f6f8;">
      <tr>
        <td align="center" style="padding:32px 16px 40px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid rgba(17,17,20,0.08);border-radius:22px;">
            <tr>
              <td style="padding:24px 32px 0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td valign="middle">${brand(src.icon, 34, INK, 19)}</td>
                    <td align="right" valign="middle" style="font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${PINK};">${content.eyebrow}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr><td align="center" style="padding:34px 32px 0;">${img(src.mailbox, `width="140" alt="A pink clay Poplur mailbox with its flag up" style="display:block;width:140px;height:auto;border:0;"`)}</td></tr>
            <tr><td align="center" style="padding:18px 32px 0;"><h1 style="margin:0;font-family:${FONT};font-size:40px;line-height:1.04;font-weight:700;letter-spacing:-0.035em;color:${INK};">${content.title}</h1></td></tr>
            <tr><td align="center" style="padding:16px 40px 0;font-family:${FONT};font-size:17px;line-height:1.5;color:${INK_2};">${content.lede}</td></tr>
            ${gap(30)}
            ${stackedButtons(d, (b, i) => i === 0
              ? pill(b.label, b.href, PINK, '#ffffff', '', markFor(src, b.mark, 'white'))
              : pill(b.label, b.href, '#ffffff', INK, 'border:1px solid rgba(17,17,20,0.16);', markFor(src, b.mark, 'ink')))}
            <tr><td align="center" style="padding:20px 0 0;">${tags(content.tags, INK_2, 'rgba(17,17,20,0.12)')}</td></tr>
            ${gap(34)}
            <tr>
              <td style="padding:0 32px;">
                <div style="border-top:1px solid rgba(17,17,20,0.08);padding-top:22px;">
                ${sideBySide(img(src.envelope, `width="100" alt="A striped Poplur airmail envelope" style="display:block;width:100px;height:auto;border:0;"`), 116, `<div style="font-family:${FONT};font-size:15px;line-height:1.55;color:${INK_2};">${notes(content, INK, INK_2)}</div>`, 380)}
                </div>
              </td>
            </tr>
            <tr><td style="padding:26px 32px 0;font-family:${FONT};font-size:15px;line-height:1.5;color:${INK_2};">${content.reply}</td></tr>
            <tr><td style="padding:28px 32px 28px;font-family:${FONT};font-size:12px;line-height:1.5;color:${INK_3};"><span style="font-weight:700;color:${INK};">Poplur</span> · Toronto beta · ${content.foot} <a href="https://www.poplur.ca" style="color:${INK_2};text-decoration:underline;">poplur.ca</a>.</td></tr>
          </table>
        </td>
      </tr>
    </table>`);
}

/** night — the app's own black and pink; the mailbox lit on dark. */
function nightDesign(d: Design): string {
  const { src, content } = d;
  const black = '#0b0b0e';
  const grey = '#c9c9d1';
  return shell(black, d.subject, d.preview, `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${black};">
      <tr>
        <td align="center" style="padding:0 16px 40px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;">
            <tr><td style="background:${PINK};height:6px;line-height:6px;font-size:1px;border-radius:0 0 6px 6px;">&nbsp;</td></tr>
            <tr><td align="center" style="padding:30px 0 26px;">${brand(src.icon, 40, '#ffffff', 22)}</td></tr>
            <tr><td align="center">${img(src.mailbox, `width="160" alt="A pink clay Poplur mailbox with its flag up" style="display:block;width:160px;height:auto;border:0;"`)}</td></tr>
            <tr><td align="center" style="padding:16px 0 0;font-family:${FONT};font-size:12px;line-height:16px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${PINK};">${content.eyebrow}</td></tr>
            <tr><td align="center" style="padding:12px 0 0;"><h1 style="margin:0;font-family:${FONT};font-size:40px;line-height:1.04;font-weight:800;letter-spacing:-0.03em;color:#ffffff;">${content.title}</h1></td></tr>
            <tr><td align="center" style="padding:16px 24px 0;font-family:${FONT};font-size:17px;line-height:1.5;color:${grey};">${content.lede}</td></tr>
            ${gap(30)}
            ${stackedButtons(d, (b, i) => i === 0
              ? pill(b.label, b.href, '#ffffff', INK, '', markFor(src, b.mark, 'ink'))
              : pill(b.label, b.href, PINK, '#ffffff', '', markFor(src, b.mark, 'white')))}
            <tr><td align="center" style="padding:22px 0 0;">${tags(content.tags, grey, 'rgba(255,255,255,0.22)')}</td></tr>
            ${gap(34)}
            <tr>
              <td style="background:#17171c;border-radius:22px;padding:24px 26px;">
                ${sideBySide(img(src.envelope, `width="104" alt="A striped Poplur airmail envelope" style="display:block;width:104px;height:auto;border:0;"`), 122, `<div style="font-family:${FONT};font-size:15px;line-height:1.55;color:${grey};">${notes(content, '#ffffff', grey)}</div>`, 380)}
              </td>
            </tr>
            <tr><td align="center" style="padding:28px 24px 0;font-family:${FONT};font-size:15px;line-height:1.5;color:${grey};">${content.reply}</td></tr>
            <tr><td align="center" style="padding:34px 24px 0;font-family:${FONT};font-size:12px;line-height:1.5;color:#7c7c88;"><span style="font-weight:700;color:#ffffff;">Poplur</span> · Toronto beta<br>${content.foot} <a href="https://www.poplur.ca" style="color:${grey};text-decoration:underline;">poplur.ca</a>.</td></tr>
          </table>
        </td>
      </tr>
    </table>`);
}

/** postcard — the envelope is the hero, airmail stripes on top, buttons side
 *  by side, the mailbox tucked in the corner. The stripes are a gradient;
 *  a client without gradients (Outlook) shows a solid dark bar. */
function postcardDesign(d: Design): string {
  const { src, content } = d;
  const stripes = `repeating-linear-gradient(135deg, ${PINK} 0 14px, ${INK} 14px 28px)`;
  const button = (b: Button, bg: string, mark: string, padding = '15px 12px') =>
    `<a href="${b.href}" style="display:block;background:${bg};border-radius:999px;padding:${padding};color:#ffffff;font-family:${FONT};font-size:15px;font-weight:600;line-height:20px;text-align:center;text-decoration:none;white-space:nowrap;">${markImg(mark)}${b.label}</a>`;
  const [first, second] = content.buttons;
  const buttonsRow = second
    ? sideBySide(button(first, PINK, markFor(src, first.mark, 'white')), 254, button(second, INK, markFor(src, second.mark, 'white')), 254, 12)
    : `<table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:0 auto;"><tr><td style="min-width:250px;">${button(first, PINK, markFor(src, first.mark, 'white'), '15px 34px')}</td></tr></table>`;
  return shell(PINK, d.subject, d.preview, `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${PINK};">
      <tr>
        <td align="center" style="padding:36px 16px 40px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:22px;">
            <tr><td style="height:12px;line-height:12px;font-size:1px;background:${INK};background-image:${stripes};border-radius:22px 22px 0 0;">&nbsp;</td></tr>
            <tr>
              <td style="padding:26px 30px 0;">
                ${sideBySide(
                  img(src.envelope, `width="208" alt="A striped Poplur airmail envelope" style="display:block;width:208px;max-width:100%;height:auto;border:0;"`), 230,
                  `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td valign="middle" style="font-family:${FONT};font-size:12px;line-height:16px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${PINK};">${content.eyebrow}</td>
                      <td align="right" valign="middle">
                        <table role="presentation" cellspacing="0" cellpadding="0" align="right"><tr><td style="border:1px dashed rgba(17,17,20,0.28);padding:6px;">${img(src.icon, `width="34" height="34" alt="" style="display:block;width:34px;height:34px;border-radius:8px;border:0;"`)}</td></tr></table>
                      </td>
                    </tr>
                  </table>
                  <h1 style="margin:12px 0 0;font-family:${FONT};font-size:34px;line-height:1.06;font-weight:700;letter-spacing:-0.035em;color:${INK};">${content.title}</h1>
                  <p style="margin:12px 0 0;font-family:${FONT};font-size:15px;line-height:1.5;color:${INK_2};">${content.lede}</p>`, 278, 22)}
              </td>
            </tr>
            ${gap(26)}
            <tr><td style="padding:0 30px;">${buttonsRow}</td></tr>
            <tr><td align="center" style="padding:18px 0 0;">${tags(content.tags, INK_2, 'rgba(17,17,20,0.12)')}</td></tr>
            ${gap(28)}
            <tr>
              <td style="padding:0 30px;">
                <div style="border-top:1px dashed rgba(17,17,20,0.2);padding-top:22px;">
                ${sideBySide(`<div style="font-family:${FONT};font-size:15px;line-height:1.55;color:${INK_2};">${notes(content, INK, INK_2)}<p style="margin:18px 0 0;">${content.reply}</p></div>`, 368, img(src.mailbox, `width="110" alt="A pink clay Poplur mailbox with its flag up" style="display:block;width:110px;height:auto;border:0;"`), 140)}
                </div>
              </td>
            </tr>
            <tr><td style="padding:22px 30px 26px;font-family:${FONT};font-size:12px;line-height:1.5;color:${INK_3};"><span style="font-weight:700;color:${INK};">Poplur</span> · Toronto beta · ${content.foot} <a href="https://www.poplur.ca" style="color:${INK_2};text-decoration:underline;">poplur.ca</a>.</td></tr>
          </table>
        </td>
      </tr>
    </table>`);
}

const DESIGNS: Record<BetaInviteVariant, (d: Design) => string> = {
  pink: pinkDesign,
  paper: paperDesign,
  night: nightDesign,
  postcard: postcardDesign,
};

export function createBetaInviteHtml(options: BetaInviteEmailOptions = {}) {
  const variant = options.variant ?? pickBetaInviteVariant();
  const stage = options.stage ?? 'links';
  if (stage === 'nda' && !options.ndaUrl) throw new Error('The nda stage needs ndaUrl.');
  const content = contentFor(stage, getBetaInviteLinks(options), options.ndaUrl ?? '', options.reportUrl ?? '', options.discordUrl ?? '', options.bugUrl ?? '');
  return DESIGNS[variant]({ src: getBetaInviteImageSources(options), content, subject: BETA_INVITE_SUBJECTS[stage], preview: BETA_INVITE_PREVIEWS[stage] });
}

// ---------------------------------------------------------------- the signed copy

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** The agreement as HTML paragraphs for the signed copy. */
function ndaBodyHtml(): string {
  const p = (t: string) => `<p style="margin:0 0 12px;font-family:${FONT};font-size:14px;line-height:1.6;color:${INK_2};">${t}</p>`;
  const parts = [p(NDA_PARTIES), p(`<strong style="color:${INK};">Plain-language summary (the sections below are what count):</strong> ${NDA_SUMMARY}`)];
  for (const section of NDA_SECTIONS) {
    parts.push(`<h3 style="margin:22px 0 8px;font-family:${FONT};font-size:15px;line-height:1.3;font-weight:700;color:${INK};">${section.heading}</h3>`);
    for (const block of section.blocks) {
      if ('text' in block) parts.push(p(block.text));
      else parts.push(`<ul style="margin:0 0 12px;padding-left:20px;">${block.bullets.map(b => `<li style="margin:0 0 6px;font-family:${FONT};font-size:14px;line-height:1.6;color:${INK_2};">${b}</li>`).join('')}</ul>`);
    }
  }
  return parts.join('\n');
}

const torontoTime = (iso: string) => new Date(iso).toLocaleString('en-CA', { timeZone: 'America/Toronto', dateStyle: 'long', timeStyle: 'short' });

/** The signed copy: the acceptance details, then the whole agreement. The
 *  copy Poplur keeps (`forPoplur`) also carries the address and browser the
 *  signature came from. */
export function createNdaReceiptHtml(acceptance: NdaAcceptance, { forPoplur = false, images }: { forPoplur?: boolean; images?: Partial<Record<BetaInviteImageKey, string>> } = {}) {
  const src = getBetaInviteImageSources({ images });
  const row = (k: string, v: string) => `<tr><td style="padding:6px 14px 6px 0;font-family:${FONT};font-size:13px;color:${INK_3};white-space:nowrap;vertical-align:top;">${k}</td><td style="padding:6px 0;font-family:${FONT};font-size:14px;color:${INK};vertical-align:top;word-break:break-all;">${v}</td></tr>`;
  const rows = [
    row('Signed by', esc(acceptance.name)),
    row('Email', esc(acceptance.email)),
    acceptance.discord ? row('Discord', esc(acceptance.discord)) : '',
    acceptance.referredBy ? row('Referred by', esc(acceptance.referredBy)) : '',
    acceptance.androidEmail ? row('Android Google account', esc(acceptance.androidEmail)) : '',
    row('Signed', `${esc(torontoTime(acceptance.signedAt))} (Toronto) · ${esc(acceptance.signedAt)}`),
    row('Agreement version', esc(acceptance.ndaVersion)),
    row('Document hash', `<span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;">${esc(acceptance.ndaSha256)}</span>`),
    forPoplur ? row('From address', esc(acceptance.ip ?? 'unknown')) : '',
    forPoplur ? row('Browser', esc(acceptance.userAgent ?? 'unknown')) : '',
  ].join('');
  const lead = forPoplur
    ? `${esc(acceptance.name)} signed the beta tester agreement on poplur.ca. Their copy went to ${esc(acceptance.email)}, and their beta links followed it.`
    : 'This is your signed copy of the Poplur beta tester agreement. Your beta links are in a separate email. Keep both.';
  return shell('#f6f6f8', ndaReceiptSubject, lead, `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f6f8;">
      <tr>
        <td align="center" style="padding:32px 16px 40px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid rgba(17,17,20,0.08);border-radius:22px;">
            <tr>
              <td style="padding:24px 32px 0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
                  <td valign="middle">${brand(src.icon, 34, INK, 19)}</td>
                  <td align="right" valign="middle" style="font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${PINK};">${forPoplur ? 'Signed · for Poplur' : 'Signed copy'}</td>
                </tr></table>
              </td>
            </tr>
            <tr><td style="padding:26px 32px 0;"><h1 style="margin:0;font-family:${FONT};font-size:28px;line-height:1.1;font-weight:700;letter-spacing:-0.03em;color:${INK};">${NDA_TITLE}</h1><p style="margin:6px 0 0;font-family:${FONT};font-size:13px;color:${INK_3};">${NDA_SUBTITLE}</p></td></tr>
            <tr><td style="padding:16px 32px 0;font-family:${FONT};font-size:15px;line-height:1.55;color:${INK_2};">${lead}</td></tr>
            <tr><td style="padding:18px 32px 0;"><table role="presentation" cellspacing="0" cellpadding="0" style="border-top:1px solid rgba(17,17,20,0.08);border-bottom:1px solid rgba(17,17,20,0.08);padding:10px 0;width:100%;">${rows}</table></td></tr>
            <tr><td style="padding:22px 32px 30px;">${ndaBodyHtml()}</td></tr>
          </table>
        </td>
      </tr>
    </table>`);
}

export function createNdaReceiptText(acceptance: NdaAcceptance, { forPoplur = false }: { forPoplur?: boolean } = {}) {
  const lines = [
    forPoplur ? `${acceptance.name} signed the Poplur beta tester agreement on poplur.ca.` : 'Your signed copy of the Poplur beta tester agreement. Your beta links are in a separate email.',
    '',
    `Signed by: ${acceptance.name}`,
    `Email: ${acceptance.email}`,
    ...(acceptance.discord ? [`Discord: ${acceptance.discord}`] : []),
    ...(acceptance.referredBy ? [`Referred by: ${acceptance.referredBy}`] : []),
    ...(acceptance.androidEmail ? [`Android Google account: ${acceptance.androidEmail}`] : []),
    `Signed: ${acceptance.signedAt}`,
    `Agreement version: ${acceptance.ndaVersion}`,
    `Document hash (SHA-256): ${acceptance.ndaSha256}`,
    ...(forPoplur ? [`From address: ${acceptance.ip ?? 'unknown'}`, `Browser: ${acceptance.userAgent ?? 'unknown'}`] : []),
    '',
  ];
  return lines.join('\n');
}

// ---------------------------------------------------------------- the test report receipt

export function reportReceiptSubject(report: BetaReport, forPoplur = false): string {
  const worked = report.results.filter(r => r.result === 'worked').length;
  return forPoplur
    ? `Report ${report.round} · ${report.name} · ${PLATFORM_LABEL[report.platform]} · ${worked}/${report.results.length} worked${report.late ? ' · late' : ''}${report.verified ? '' : ' · unverified'}`
    : `Report ${report.round} received — thank you`;
}

const resultLabel = (value: string) => TASK_RESULTS.find(r => r.value === value)?.label ?? value;
const resultColor = (value: string) => value === 'worked' ? '#0f8a4e' : value === 'failed' ? '#c8102e' : INK_3;

/** The receipt for a filed test report: what was answered, then the points.
 *  Poplur's copy (`forPoplur`) adds the address and browser it came from; the
 *  API attaches the JSON alongside it. */
export function createReportReceiptHtml(report: BetaReport, { forPoplur = false, images }: { forPoplur?: boolean; images?: Partial<Record<BetaInviteImageKey, string>> } = {}) {
  const src = getBetaInviteImageSources({ images });
  const round = roundByNumber(report.round);
  const row = (k: string, v: string) => `<tr><td style="padding:6px 14px 6px 0;font-family:${FONT};font-size:13px;color:${INK_3};white-space:nowrap;vertical-align:top;">${k}</td><td style="padding:6px 0;font-family:${FONT};font-size:14px;color:${INK};vertical-align:top;word-break:break-word;">${v}</td></tr>`;
  const rows = [
    row('Report', `${report.round} · ${esc(report.roundName)} (due ${esc(round?.dueLabel ?? report.dueAt)})`),
    row('From', `${esc(report.name)} · ${esc(report.email)}${report.discord ? ` · Discord ${esc(report.discord)}` : ''}`),
    row('Phone', `${PLATFORM_LABEL[report.platform]} · ${esc(report.device)} · ${esc(report.osVersion)}`),
    row('Received', `${esc(torontoTime(report.receivedAt))} (Toronto)${report.late ? ' · <b style="color:#c8102e;">late</b>' : ''}`),
    row('Points', `${report.points} pending on the board${report.verified ? '' : ' · <b>unverified link</b> (filed without a signed link; match the email to an NDA)'}`),
    forPoplur ? row('From address', esc(report.ip ?? 'unknown')) : '',
    forPoplur ? row('Browser', esc(report.userAgent ?? 'unknown')) : '',
  ].join('');
  const tasks = report.results.map(r => `
    <tr>
      <td style="padding:8px 12px 8px 0;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${resultColor(r.result)};white-space:nowrap;vertical-align:top;">${esc(resultLabel(r.result))}</td>
      <td style="padding:8px 0;font-family:${FONT};font-size:14px;color:${INK};vertical-align:top;">${esc(r.title)}${r.note ? `<div style="margin-top:3px;font-size:13px;color:${INK_2};">${esc(r.note)}</div>` : ''}</td>
    </tr>`).join('');
  const ratings = RATINGS.map(r => `${esc(r.label)}: <b>${report.ratings[r.id] ?? '—'}</b>/5`).join(' &nbsp;·&nbsp; ');
  const answers = report.answers.filter(a => a.answer.trim()).map(a => `<p style="margin:0 0 10px;font-family:${FONT};font-size:14px;line-height:1.55;color:${INK_2};"><b style="color:${INK};">${esc(a.question)}</b><br>${esc(a.answer)}</p>`).join('');
  const lead = forPoplur
    ? `${esc(report.name)} filed test report ${report.round} (${esc(report.roundName)}) on poplur.ca. The JSON is attached.`
    : `Thank you — report ${report.round} is in. ${report.late ? `It arrived after ${esc(round?.dueLabel ?? 'the due day')}, so it counts for ${report.points} points.` : `${report.points} points go on the board with Saturday's standings.`} Here is what you sent.`;
  return shell('#f6f6f8', reportReceiptSubject(report, forPoplur), lead, `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f6f8;">
      <tr>
        <td align="center" style="padding:32px 16px 40px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid rgba(17,17,20,0.08);border-radius:22px;">
            <tr>
              <td style="padding:24px 32px 0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
                  <td valign="middle">${brand(src.icon, 34, INK, 19)}</td>
                  <td align="right" valign="middle" style="font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${PINK};">${forPoplur ? 'Report · for Poplur' : 'Report received'}</td>
                </tr></table>
              </td>
            </tr>
            <tr><td style="padding:26px 32px 0;"><h1 style="margin:0;font-family:${FONT};font-size:28px;line-height:1.1;font-weight:700;letter-spacing:-0.03em;color:${INK};">Test report ${report.round}: ${esc(report.roundName)}</h1></td></tr>
            <tr><td style="padding:16px 32px 0;font-family:${FONT};font-size:15px;line-height:1.55;color:${INK_2};">${lead}</td></tr>
            <tr><td style="padding:18px 32px 0;"><table role="presentation" cellspacing="0" cellpadding="0" style="border-top:1px solid rgba(17,17,20,0.08);border-bottom:1px solid rgba(17,17,20,0.08);padding:10px 0;width:100%;">${rows}</table></td></tr>
            <tr><td style="padding:22px 32px 0;"><h2 style="margin:0 0 6px;font-family:${FONT};font-size:16px;font-weight:700;color:${INK};">The tests</h2><table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;">${tasks}</table></td></tr>
            <tr><td style="padding:22px 32px 0;font-family:${FONT};font-size:14px;color:${INK_2};"><b style="color:${INK};">Ratings.</b> ${ratings}</td></tr>
            <tr><td style="padding:18px 32px 30px;">${answers || `<p style="margin:0;font-family:${FONT};font-size:14px;color:${INK_3};">No written answers.</p>`}</td></tr>
          </table>
        </td>
      </tr>
    </table>`);
}

export function createReportReceiptText(report: BetaReport, { forPoplur = false }: { forPoplur?: boolean } = {}) {
  const round = roundByNumber(report.round);
  const lines = [
    forPoplur ? `${report.name} filed test report ${report.round} (${report.roundName}) on poplur.ca. The JSON is attached.` : `Thank you — report ${report.round} (${report.roundName}) is in. ${report.points} points pending on the board${report.late ? ' (late)' : ''}.`,
    '',
    `From: ${report.name} · ${report.email}${report.discord ? ` · Discord ${report.discord}` : ''}`,
    `Phone: ${PLATFORM_LABEL[report.platform]} · ${report.device} · ${report.osVersion}`,
    `Received: ${report.receivedAt}${report.late ? ' (late)' : ''} · due ${round?.dueLabel ?? report.dueAt}`,
    `Verified link: ${report.verified ? 'yes' : 'no'}`,
    ...(forPoplur ? [`From address: ${report.ip ?? 'unknown'}`, `Browser: ${report.userAgent ?? 'unknown'}`] : []),
    '',
    'The tests:',
    ...report.results.map(r => `- [${resultLabel(r.result)}] ${r.title}${r.note ? ` — ${r.note}` : ''}`),
    '',
    `Ratings: ${RATINGS.map(r => `${r.label} ${report.ratings[r.id] ?? '—'}/5`).join(' · ')}`,
    '',
    ...report.answers.filter(a => a.answer.trim()).flatMap(a => [a.question, a.answer, '']),
  ];
  return lines.join('\n');
}

// ---------------------------------------------------------------- a filed bug

const SEVERITY_MARK: Record<string, string> = { crash: '\u{1F534} Crash', blocker: '\u{1F7E0} Blocker', annoyance: '\u{1F7E1} Annoyance' };

export function bugReportSubject(report: BugReport): string {
  const severity = bugSeverity(report);
  const mark = severity === 'crash' ? 'CRASH' : severity === 'blocker' ? 'BLOCKER' : 'Bug';
  return `${mark}: ${report.area} \u00b7 ${BUG_PLATFORM_LABEL[report.platform]} \u00b7 ${report.name}${report.verified ? '' : ' (unverified)'}`;
}

/** Poplur's copy: everything the tester said, with their screenshots attached. */
export function createBugReportHtml(report: BugReport, { images }: { images?: Partial<Record<BetaInviteImageKey, string>> } = {}) {
  const src = getBetaInviteImageSources({ images });
  const severity = bugSeverity(report);
  const row = (k: string, v: string) => `<tr><td style="padding:6px 14px 6px 0;font-family:${FONT};font-size:13px;color:${INK_3};white-space:nowrap;vertical-align:top;">${k}</td><td style="padding:6px 0;font-family:${FONT};font-size:14px;color:${INK};vertical-align:top;word-break:break-word;">${v}</td></tr>`;
  const block = (title: string, body: string) => `<h3 style="margin:18px 0 4px;font-family:${FONT};font-size:14px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${PINK};">${title}</h3><p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.55;color:${INK};white-space:pre-wrap;">${esc(body)}</p>`;
  const rows = [
    row('Severity', `<b>${SEVERITY_MARK[severity]}</b> \u00b7 ${esc(report.impact)}`),
    row('Where', esc(report.area)),
    row('How often', esc(report.frequency)),
    row('From', `${esc(report.name)} \u00b7 ${esc(report.email)}${report.discord ? ` \u00b7 Discord ${esc(report.discord)}` : ''}${report.verified ? '' : ' \u00b7 <b>unverified link</b>'}`),
    row('Phone', `${BUG_PLATFORM_LABEL[report.platform]} \u00b7 ${esc(report.device)} \u00b7 ${esc(report.osVersion)}${report.appVersion ? ` \u00b7 app ${esc(report.appVersion)}` : ''}`),
    row('Received', `${esc(torontoTime(report.receivedAt))} (Toronto)`),
    row('Screenshots', report.shots.length ? report.shots.map(s => esc(s.name)).join(', ') : 'none'),
    row('From address', esc(report.ip ?? 'unknown')),
    row('Browser', esc(report.userAgent ?? 'unknown')),
  ].join('');
  return shell('#f6f6f8', bugReportSubject(report), `${report.name} reported a bug in ${report.area}.`, `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f6f8;">
      <tr>
        <td align="center" style="padding:32px 16px 40px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid rgba(17,17,20,0.08);border-radius:22px;">
            <tr><td style="padding:24px 32px 0;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
              <td valign="middle">${brand(src.icon, 34, INK, 19)}</td>
              <td align="right" valign="middle" style="font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${PINK};">Bug \u00b7 for Poplur</td>
            </tr></table></td></tr>
            <tr><td style="padding:26px 32px 0;"><h1 style="margin:0;font-family:${FONT};font-size:26px;line-height:1.15;font-weight:700;letter-spacing:-0.02em;color:${INK};">${esc(report.area)}</h1></td></tr>
            <tr><td style="padding:16px 32px 0;"><table role="presentation" cellspacing="0" cellpadding="0" style="border-top:1px solid rgba(17,17,20,0.08);border-bottom:1px solid rgba(17,17,20,0.08);padding:10px 0;width:100%;">${rows}</table></td></tr>
            <tr><td style="padding:6px 32px 30px;">
              ${block('What they were doing', report.doing)}
              ${block('What they expected', report.expected)}
              ${block('What happened instead', report.happened)}
              ${report.extra ? block('Anything else', report.extra) : ''}
            </td></tr>
          </table>
        </td>
      </tr>
    </table>`);
}

export function createBugReportText(report: BugReport) {
  return [
    bugReportSubject(report),
    '',
    `Severity: ${bugSeverity(report)} \u2014 ${report.impact}`,
    `Where: ${report.area}`,
    `How often: ${report.frequency}`,
    `From: ${report.name} \u00b7 ${report.email}${report.discord ? ` \u00b7 Discord ${report.discord}` : ''}${report.verified ? '' : ' (unverified link)'}`,
    `Phone: ${BUG_PLATFORM_LABEL[report.platform]} \u00b7 ${report.device} \u00b7 ${report.osVersion}${report.appVersion ? ` \u00b7 app ${report.appVersion}` : ''}`,
    `Received: ${report.receivedAt}`,
    `Screenshots: ${report.shots.length ? report.shots.map(s => s.name).join(', ') : 'none'}`,
    `From address: ${report.ip ?? 'unknown'} \u00b7 ${report.userAgent ?? 'unknown'}`,
    '',
    'What they were doing:', report.doing, '',
    'What they expected:', report.expected, '',
    'What happened instead:', report.happened, '',
    ...(report.extra ? ['Anything else:', report.extra, ''] : []),
  ].join('\n');
}

/** The tester's receipt: short, and it says what happens next. */
export function createBugReceiptHtml(report: BugReport, { images }: { images?: Partial<Record<BetaInviteImageKey, string>> } = {}) {
  const src = getBetaInviteImageSources({ images });
  const lead = `Thank you \u2014 your report on ${esc(report.area.toLowerCase())} is in.`;
  return shell('#f6f6f8', 'Bug report received \u2014 thank you', lead, `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f6f8;">
      <tr><td align="center" style="padding:32px 16px 40px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid rgba(17,17,20,0.08);border-radius:22px;">
          <tr><td style="padding:24px 32px 0;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
            <td valign="middle">${brand(src.icon, 34, INK, 19)}</td>
            <td align="right" valign="middle" style="font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${PINK};">Bug received</td>
          </tr></table></td></tr>
          <tr><td style="padding:26px 32px 0;"><h1 style="margin:0;font-family:${FONT};font-size:28px;line-height:1.12;font-weight:700;letter-spacing:-0.03em;color:${INK};">Got it \u2014 thank you.</h1></td></tr>
          <tr><td style="padding:14px 32px 0;font-family:${FONT};font-size:15px;line-height:1.6;color:${INK_2};">
            You reported a problem in <b style="color:${INK};">${esc(report.area)}</b>${report.shots.length ? `, with ${report.shots.length} screenshot${report.shots.length === 1 ? '' : 's'}` : ''}. A confirmed bug is worth five points on the board, and the first person to report one gets them.
          </td></tr>
          <tr><td style="padding:14px 32px 30px;font-family:${FONT};font-size:15px;line-height:1.6;color:${INK_2};">
            Found another? Send it the same way \u2014 one report per bug is easier to fix than one long list. If we need to ask you something about this one, we will reply to this email.
          </td></tr>
        </table>
      </td></tr>
    </table>`);
}

export function createBugReceiptText(report: BugReport) {
  return [
    'Got it — thank you.',
    '',
    `You reported a problem in ${report.area}${report.shots.length ? `, with ${report.shots.length} screenshot(s)` : ''}.`,
    'A confirmed bug is worth five points on the board, and the first person to report one gets them.',
    '',
    'Found another? Send it the same way — one report per bug is easier to fix than one long list.',
    '',
    'Poplur · Toronto beta',
  ].join('\n');
}
