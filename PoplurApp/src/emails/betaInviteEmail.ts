// The beta invite, in the landing page's own clothes (landing/landing.css, the
// default theme): hot pink canvas, white ink, white pill buttons wearing the
// clay drop shadow, the black app-icon tile — and the two clay mail objects,
// the mailbox and the airmail envelope, rendered from the app's own models
// (poplur-clay-map/public/navigator-sprites, /sprites).
//
// Everything is tables and inline styles because it is an email. The images
// travel as inline attachments: the sender (app/api/send-beta-email+api.ts)
// attaches each file under its content id and hands `cid:` sources in; the
// preview route and the rendered proof hand hosted or data URIs in instead.

export const betaInviteSubject = 'Your Poplur beta access is ready';
export const betaInvitePreview = 'Your links are inside: TestFlight for iPhone, the beta build for Android.';
export const betaInviteFrom = 'Poplur <hello@poplur.ca>';

export const BETA_INVITE_IMAGES = {
  icon: { contentId: 'poplur-icon', file: 'assets/images/landing/app-icon.png', filename: 'poplur-icon.png' },
  mailbox: { contentId: 'poplur-mailbox', file: 'assets/emails/mailbox.png', filename: 'poplur-mailbox.png' },
  envelope: { contentId: 'poplur-envelope', file: 'assets/emails/envelope.png', filename: 'poplur-envelope.png' },
} as const;

export type BetaInviteImageKey = keyof typeof BETA_INVITE_IMAGES;

type BetaInviteEmailOptions = {
  androidUrl?: string;
  iosUrl?: string;
  /** A src per image. Missing keys fall back to the sender's `cid:` parts; an
   *  empty string leaves that image out (a file the server could not read). */
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

export function getBetaInviteLinks(options: BetaInviteEmailOptions = {}) {
  return {
    androidUrl: options.androidUrl ?? defaultAndroidUrl,
    iosUrl: options.iosUrl ?? defaultIosUrl,
  };
}

export function getBetaInviteImageSources(options: BetaInviteEmailOptions = {}): Record<BetaInviteImageKey, string> {
  const sources = {} as Record<BetaInviteImageKey, string>;
  for (const key of Object.keys(BETA_INVITE_IMAGES) as BetaInviteImageKey[]) {
    const given = options.images?.[key];
    sources[key] = given !== undefined ? given : `cid:${BETA_INVITE_IMAGES[key].contentId}`;
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

function img(src: string, attrs: string): string {
  return src ? `<img src="${src}" ${attrs}>` : '';
}

function pill(label: string, href: string): string {
  // A white pill with the landing's 3 px clay shadow (.pl-cta). Outlook drops
  // the shadow and the radius and still shows a white button with dark text.
  return `<table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:0 auto;">
    <tr>
      <td align="center" style="background:#ffffff;border-radius:999px;box-shadow:0 3px 0 rgba(0,0,0,0.18);">
        <a href="${href}" style="display:block;padding:15px 34px;min-width:250px;color:${INK};font-family:${FONT};font-size:16px;font-weight:600;line-height:20px;text-align:center;text-decoration:none;border-radius:999px;">${label}</a>
      </td>
    </tr>
  </table>`;
}

function tag(label: string): string {
  return `<td style="padding:0 4px;"><span style="display:inline-block;padding:6px 12px;border:1px solid rgba(255,255,255,0.4);border-radius:999px;font-family:${FONT};font-size:12px;line-height:14px;color:rgba(255,255,255,0.9);white-space:nowrap;">${label}</span></td>`;
}

export function createBetaInviteHtml(options: BetaInviteEmailOptions = {}) {
  const { androidUrl, iosUrl } = getBetaInviteLinks(options);
  const src = getBetaInviteImageSources(options);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>${betaInviteSubject}</title>
  </head>
  <body style="margin:0;padding:0;background:${PINK};color:#ffffff;font-family:${FONT};-webkit-font-smoothing:antialiased;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${PINK};">${betaInvitePreview}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${PINK};">
      <tr>
        <td align="center" style="padding:36px 16px 40px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;">

            <tr>
              <td align="center" style="padding:0 0 26px;">
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td valign="middle" style="padding-right:10px;">${img(src.icon, `width="40" height="40" alt="" style="display:block;width:40px;height:40px;border-radius:11px;border:0;"`)}</td>
                    <td valign="middle" style="font-family:${FONT};font-size:22px;line-height:24px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">Poplur</td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td align="center" style="padding:0 0 10px;">${img(src.mailbox, `width="300" alt="A pink clay Poplur mailbox with its flag up" style="display:block;width:300px;max-width:80%;height:auto;border:0;"`)}</td>
            </tr>

            <tr>
              <td align="center" style="padding:6px 0 0;font-family:${FONT};font-size:12px;line-height:16px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.78);">Private beta</td>
            </tr>
            <tr>
              <td align="center" style="padding:12px 0 0;">
                <h1 style="margin:0;font-family:${FONT};font-size:40px;line-height:1.04;font-weight:800;letter-spacing:-0.03em;color:#ffffff;">Your beta access<br>is ready.</h1>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:16px 24px 0;font-family:${FONT};font-size:17px;line-height:1.5;color:rgba(255,255,255,0.9);">Thanks for joining early. Install Poplur once; every beta update after that arrives through TestFlight or Google&nbsp;Play.</td>
            </tr>

            <tr><td style="height:30px;line-height:30px;font-size:1px;">&nbsp;</td></tr>
            <tr><td align="center">${pill('Get Poplur for iPhone', iosUrl)}</td></tr>
            <tr><td style="height:14px;line-height:14px;font-size:1px;">&nbsp;</td></tr>
            <tr><td align="center">${pill('Get Poplur for Android', androidUrl)}</td></tr>

            <tr>
              <td align="center" style="padding:22px 0 0;">
                <table role="presentation" cellspacing="0" cellpadding="0"><tr>${tag('iOS · TestFlight')}${tag('Android · beta')}${tag('Toronto first')}</tr></table>
              </td>
            </tr>

            <tr><td style="height:34px;line-height:34px;font-size:1px;">&nbsp;</td></tr>

            <tr>
              <td style="background:#ffffff;border-radius:22px;padding:24px 26px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td valign="top" width="112" style="padding:2px 18px 0 0;">${img(src.envelope, `width="104" alt="A striped Poplur airmail envelope" style="display:block;width:104px;height:auto;border:0;"`)}</td>
                    <td valign="top" style="font-family:${FONT};font-size:15px;line-height:1.55;color:${INK_2};">
                      <p style="margin:0;"><strong style="color:${INK};font-weight:700;">Future updates.</strong> New iPhone builds land in TestFlight and Android updates through Google Play. Keep this email: the links work again if you ever need to reinstall.</p>
                      <p style="margin:14px 0 0;"><strong style="color:${INK};font-weight:700;">What to try first.</strong> Open Poplur where you are, see what is popping around you, and post something for the next person who arrives. Every pop starts with a 5&nbsp;km radius and spreads as people engage.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td align="center" style="padding:28px 24px 0;font-family:${FONT};font-size:15px;line-height:1.5;color:rgba(255,255,255,0.86);">Have feedback? Reply to this email. Every note shapes the beta.</td>
            </tr>

            <tr>
              <td align="center" style="padding:34px 24px 0;border-top:0;font-family:${FONT};font-size:12px;line-height:1.5;color:rgba(255,255,255,0.7);">
                <span style="font-weight:700;color:#ffffff;">Poplur</span> · Toronto beta<br>You asked for beta access at <a href="https://www.poplur.ca" style="color:#ffffff;text-decoration:underline;">poplur.ca</a>.
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
