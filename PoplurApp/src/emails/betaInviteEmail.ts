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
// Same copy, links and images in every one.
//
// Everything is tables and inline styles because it is an email. Rows that
// sit side by side at 600 px are "hybrid" blocks (inline-block with a
// max-width) so they stack on a phone instead of squeezing the copy.

export const betaInviteSubject = 'Your Poplur beta access is ready';
export const betaInvitePreview = 'Your links are inside: TestFlight for iPhone, the beta build for Android.';
export const betaInviteFrom = 'Poplur <hello@poplur.ca>';

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
const defaultAndroidUrl = 'https://play.google.com/apps/testing/com.apptists.poplur2025';

const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const PINK = '#ff2d96';
const INK = '#111114';
const INK_2 = '#5c5c66';
const INK_3 = '#9a9aa3';

const COPY = {
  eyebrow: 'Private beta',
  title: 'Your beta access<br>is ready.',
  lede: 'Thanks for joining early. Install Poplur once; every beta update after that arrives through TestFlight or Google&nbsp;Play.',
  ios: 'Get Poplur for iPhone',
  android: 'Get Poplur for Android',
  tags: ['iOS · TestFlight', 'Android · beta', 'Toronto first'],
  updates: 'New iPhone builds land in TestFlight and Android updates through Google Play. Keep this email: the links work again if you ever need to reinstall.',
  first: 'Open Poplur where you are, see what is popping around you, and post something for the next person who arrives. Every pop starts with a 5&nbsp;km radius and spreads as people engage.',
  reply: 'Have feedback? Reply to this email. Every note shapes the beta.',
  foot: 'You asked for beta access at',
};

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

export function createBetaInviteText(options: BetaInviteEmailOptions = {}) {
  const { androidUrl, iosUrl } = getBetaInviteLinks(options);

  return [
    'Your Poplur beta access is ready.',
    '',
    'Thanks for joining early. Install Poplur once; every beta update after that arrives through TestFlight or Google Play.',
    '',
    `iPhone (TestFlight): ${iosUrl}`,
    `Android (beta): ${androidUrl}`,
    '',
    'What to try first: open Poplur where you are, see what is popping around you, and post something for the next person who arrives. Every pop starts with a 5 km radius and spreads as people engage.',
    '',
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

function tags(color: string, border: string): string {
  const cells = COPY.tags.map(label => `<td style="padding:0 4px;"><span style="display:inline-block;padding:6px 12px;border:1px solid ${border};border-radius:999px;font-family:${FONT};font-size:12px;line-height:14px;color:${color};white-space:nowrap;">${label}</span></td>`).join('');
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

function notes(strong: string, body: string): string {
  return `<p style="margin:0;"><strong style="color:${strong};font-weight:700;">Future updates.</strong> ${COPY.updates}</p>
<p style="margin:14px 0 0;"><strong style="color:${strong};font-weight:700;">What to try first.</strong> ${COPY.first}</p>`.replace(/<p style="margin:0;">/, `<p style="margin:0;color:${body};">`);
}

function brand(src: string, size: number, color: string, fontSize: number): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0">
    <tr>
      <td valign="middle" style="padding-right:10px;">${img(src, `width="${size}" height="${size}" alt="" style="display:block;width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.27)}px;border:0;"`)}</td>
      <td valign="middle" style="font-family:${FONT};font-size:${fontSize}px;line-height:${fontSize + 2}px;font-weight:800;letter-spacing:-0.02em;color:${color};">Poplur</td>
    </tr>
  </table>`;
}

function shell(bg: string, body: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>${betaInviteSubject}</title>
  </head>
  <body style="margin:0;padding:0;background:${bg};font-family:${FONT};-webkit-font-smoothing:antialiased;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${bg};">${betaInvitePreview}</div>
    ${body}
  </body>
</html>`;
}

type Src = Record<BetaInviteImageKey, string>;
type Links = { iosUrl: string; androidUrl: string };

// ---------------------------------------------------------------- designs

/** pink — the landing's default theme: pink canvas, white ink, white pills. */
function pinkDesign(src: Src, { iosUrl, androidUrl }: Links): string {
  const white = '#ffffff';
  return shell(PINK, `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${PINK};">
      <tr>
        <td align="center" style="padding:36px 16px 40px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;">
            <tr><td align="center" style="padding:0 0 26px;">${brand(src.icon, 40, white, 22)}</td></tr>
            <tr><td align="center" style="padding:0 0 10px;">${img(src.mailbox, `width="150" alt="A pink clay Poplur mailbox with its flag up" style="display:block;width:150px;max-width:50%;height:auto;border:0;"`)}</td></tr>
            <tr><td align="center" style="padding:6px 0 0;font-family:${FONT};font-size:12px;line-height:16px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.78);">${COPY.eyebrow}</td></tr>
            <tr><td align="center" style="padding:12px 0 0;"><h1 style="margin:0;font-family:${FONT};font-size:40px;line-height:1.04;font-weight:800;letter-spacing:-0.03em;color:${white};">${COPY.title}</h1></td></tr>
            <tr><td align="center" style="padding:16px 24px 0;font-family:${FONT};font-size:17px;line-height:1.5;color:rgba(255,255,255,0.9);">${COPY.lede}</td></tr>
            ${gap(30)}
            <tr><td align="center">${pill(COPY.ios, iosUrl, white, INK, 'box-shadow:0 3px 0 rgba(0,0,0,0.18);', src.appleInk)}</td></tr>
            ${gap(14)}
            <tr><td align="center">${pill(COPY.android, androidUrl, white, INK, 'box-shadow:0 3px 0 rgba(0,0,0,0.18);', src.androidInk)}</td></tr>
            <tr><td align="center" style="padding:22px 0 0;">${tags('rgba(255,255,255,0.9)', 'rgba(255,255,255,0.4)')}</td></tr>
            ${gap(34)}
            <tr>
              <td style="background:${white};border-radius:22px;padding:24px 26px;">
                ${sideBySide(img(src.envelope, `width="104" alt="A striped Poplur airmail envelope" style="display:block;width:104px;height:auto;border:0;"`), 122, `<div style="font-family:${FONT};font-size:15px;line-height:1.55;color:${INK_2};">${notes(INK, INK_2)}</div>`, 380)}
              </td>
            </tr>
            <tr><td align="center" style="padding:28px 24px 0;font-family:${FONT};font-size:15px;line-height:1.5;color:rgba(255,255,255,0.86);">${COPY.reply}</td></tr>
            <tr><td align="center" style="padding:34px 24px 0;font-family:${FONT};font-size:12px;line-height:1.5;color:rgba(255,255,255,0.7);"><span style="font-weight:700;color:${white};">Poplur</span> · Toronto beta<br>${COPY.foot} <a href="https://www.poplur.ca" style="color:${white};text-decoration:underline;">poplur.ca</a>.</td></tr>
          </table>
        </td>
      </tr>
    </table>`);
}

/** paper — the landing's white card language; pink only as the accent. */
function paperDesign(src: Src, { iosUrl, androidUrl }: Links): string {
  return shell('#f6f6f8', `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f6f8;">
      <tr>
        <td align="center" style="padding:32px 16px 40px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid rgba(17,17,20,0.08);border-radius:22px;">
            <tr>
              <td style="padding:24px 32px 0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td valign="middle">${brand(src.icon, 34, INK, 19)}</td>
                    <td align="right" valign="middle" style="font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${PINK};">${COPY.eyebrow}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr><td align="center" style="padding:34px 32px 0;">${img(src.mailbox, `width="140" alt="A pink clay Poplur mailbox with its flag up" style="display:block;width:140px;height:auto;border:0;"`)}</td></tr>
            <tr><td align="center" style="padding:18px 32px 0;"><h1 style="margin:0;font-family:${FONT};font-size:40px;line-height:1.04;font-weight:700;letter-spacing:-0.035em;color:${INK};">${COPY.title}</h1></td></tr>
            <tr><td align="center" style="padding:16px 40px 0;font-family:${FONT};font-size:17px;line-height:1.5;color:${INK_2};">${COPY.lede}</td></tr>
            ${gap(30)}
            <tr><td align="center">${pill(COPY.ios, iosUrl, PINK, '#ffffff', '', src.appleWhite)}</td></tr>
            ${gap(12)}
            <tr><td align="center">${pill(COPY.android, androidUrl, '#ffffff', INK, 'border:1px solid rgba(17,17,20,0.16);', src.androidInk)}</td></tr>
            <tr><td align="center" style="padding:20px 0 0;">${tags(INK_2, 'rgba(17,17,20,0.12)')}</td></tr>
            ${gap(34)}
            <tr>
              <td style="padding:0 32px;">
                <div style="border-top:1px solid rgba(17,17,20,0.08);padding-top:22px;">
                ${sideBySide(img(src.envelope, `width="100" alt="A striped Poplur airmail envelope" style="display:block;width:100px;height:auto;border:0;"`), 116, `<div style="font-family:${FONT};font-size:15px;line-height:1.55;color:${INK_2};">${notes(INK, INK_2)}</div>`, 380)}
                </div>
              </td>
            </tr>
            <tr><td style="padding:26px 32px 0;font-family:${FONT};font-size:15px;line-height:1.5;color:${INK_2};">${COPY.reply}</td></tr>
            <tr><td style="padding:28px 32px 28px;font-family:${FONT};font-size:12px;line-height:1.5;color:${INK_3};"><span style="font-weight:700;color:${INK};">Poplur</span> · Toronto beta · ${COPY.foot} <a href="https://www.poplur.ca" style="color:${INK_2};text-decoration:underline;">poplur.ca</a>.</td></tr>
          </table>
        </td>
      </tr>
    </table>`);
}

/** night — the app's own black and pink; the mailbox lit on dark. */
function nightDesign(src: Src, { iosUrl, androidUrl }: Links): string {
  const black = '#0b0b0e';
  const grey = '#c9c9d1';
  return shell(black, `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${black};">
      <tr>
        <td align="center" style="padding:0 16px 40px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;">
            <tr><td style="background:${PINK};height:6px;line-height:6px;font-size:1px;border-radius:0 0 6px 6px;">&nbsp;</td></tr>
            <tr><td align="center" style="padding:30px 0 26px;">${brand(src.icon, 40, '#ffffff', 22)}</td></tr>
            <tr><td align="center">${img(src.mailbox, `width="160" alt="A pink clay Poplur mailbox with its flag up" style="display:block;width:160px;height:auto;border:0;"`)}</td></tr>
            <tr><td align="center" style="padding:16px 0 0;font-family:${FONT};font-size:12px;line-height:16px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${PINK};">${COPY.eyebrow}</td></tr>
            <tr><td align="center" style="padding:12px 0 0;"><h1 style="margin:0;font-family:${FONT};font-size:40px;line-height:1.04;font-weight:800;letter-spacing:-0.03em;color:#ffffff;">${COPY.title}</h1></td></tr>
            <tr><td align="center" style="padding:16px 24px 0;font-family:${FONT};font-size:17px;line-height:1.5;color:${grey};">${COPY.lede}</td></tr>
            ${gap(30)}
            <tr><td align="center">${pill(COPY.ios, iosUrl, '#ffffff', INK, '', src.appleInk)}</td></tr>
            ${gap(12)}
            <tr><td align="center">${pill(COPY.android, androidUrl, PINK, '#ffffff', '', src.androidWhite)}</td></tr>
            <tr><td align="center" style="padding:22px 0 0;">${tags(grey, 'rgba(255,255,255,0.22)')}</td></tr>
            ${gap(34)}
            <tr>
              <td style="background:#17171c;border-radius:22px;padding:24px 26px;">
                ${sideBySide(img(src.envelope, `width="104" alt="A striped Poplur airmail envelope" style="display:block;width:104px;height:auto;border:0;"`), 122, `<div style="font-family:${FONT};font-size:15px;line-height:1.55;color:${grey};">${notes('#ffffff', grey)}</div>`, 380)}
              </td>
            </tr>
            <tr><td align="center" style="padding:28px 24px 0;font-family:${FONT};font-size:15px;line-height:1.5;color:${grey};">${COPY.reply}</td></tr>
            <tr><td align="center" style="padding:34px 24px 0;font-family:${FONT};font-size:12px;line-height:1.5;color:#7c7c88;"><span style="font-weight:700;color:#ffffff;">Poplur</span> · Toronto beta<br>${COPY.foot} <a href="https://www.poplur.ca" style="color:${grey};text-decoration:underline;">poplur.ca</a>.</td></tr>
          </table>
        </td>
      </tr>
    </table>`);
}

/** postcard — the envelope is the hero, airmail stripes on top, buttons side
 *  by side, the mailbox tucked in the corner. The stripes are a gradient;
 *  a client without gradients (Outlook) shows a solid dark bar. */
function postcardDesign(src: Src, { iosUrl, androidUrl }: Links): string {
  const stripes = `repeating-linear-gradient(135deg, ${PINK} 0 14px, ${INK} 14px 28px)`;
  const button = (label: string, href: string, bg: string, mark: string) =>
    `<a href="${href}" style="display:block;background:${bg};border-radius:999px;padding:15px 12px;color:#ffffff;font-family:${FONT};font-size:15px;font-weight:600;line-height:20px;text-align:center;text-decoration:none;white-space:nowrap;">${markImg(mark)}${label}</a>`;
  return shell(PINK, `
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
                      <td valign="middle" style="font-family:${FONT};font-size:12px;line-height:16px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${PINK};">${COPY.eyebrow}</td>
                      <td align="right" valign="middle">
                        <table role="presentation" cellspacing="0" cellpadding="0" align="right"><tr><td style="border:1px dashed rgba(17,17,20,0.28);padding:6px;">${img(src.icon, `width="34" height="34" alt="" style="display:block;width:34px;height:34px;border-radius:8px;border:0;"`)}</td></tr></table>
                      </td>
                    </tr>
                  </table>
                  <h1 style="margin:12px 0 0;font-family:${FONT};font-size:34px;line-height:1.06;font-weight:700;letter-spacing:-0.035em;color:${INK};">${COPY.title}</h1>
                  <p style="margin:12px 0 0;font-family:${FONT};font-size:15px;line-height:1.5;color:${INK_2};">${COPY.lede}</p>`, 278, 22)}
              </td>
            </tr>
            ${gap(26)}
            <tr>
              <td style="padding:0 30px;">
                ${sideBySide(button(COPY.ios, iosUrl, PINK, src.appleWhite), 254, button(COPY.android, androidUrl, INK, src.androidWhite), 254, 12)}
              </td>
            </tr>
            <tr><td align="center" style="padding:18px 0 0;">${tags(INK_2, 'rgba(17,17,20,0.12)')}</td></tr>
            ${gap(28)}
            <tr>
              <td style="padding:0 30px;">
                <div style="border-top:1px dashed rgba(17,17,20,0.2);padding-top:22px;">
                ${sideBySide(`<div style="font-family:${FONT};font-size:15px;line-height:1.55;color:${INK_2};">${notes(INK, INK_2)}<p style="margin:18px 0 0;">${COPY.reply}</p></div>`, 368, img(src.mailbox, `width="110" alt="A pink clay Poplur mailbox with its flag up" style="display:block;width:110px;height:auto;border:0;"`), 140)}
                </div>
              </td>
            </tr>
            <tr><td style="padding:22px 30px 26px;font-family:${FONT};font-size:12px;line-height:1.5;color:${INK_3};"><span style="font-weight:700;color:${INK};">Poplur</span> · Toronto beta · ${COPY.foot} <a href="https://www.poplur.ca" style="color:${INK_2};text-decoration:underline;">poplur.ca</a>.</td></tr>
          </table>
        </td>
      </tr>
    </table>`);
}

const DESIGNS: Record<BetaInviteVariant, (src: Src, links: Links) => string> = {
  pink: pinkDesign,
  paper: paperDesign,
  night: nightDesign,
  postcard: postcardDesign,
};

export function createBetaInviteHtml(options: BetaInviteEmailOptions = {}) {
  const variant = options.variant ?? pickBetaInviteVariant();
  return DESIGNS[variant](getBetaInviteImageSources(options), getBetaInviteLinks(options));
}
