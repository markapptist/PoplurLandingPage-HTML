export const betaInviteSubject = 'Your Poplur beta access is ready';
export const betaInvitePreview =
  'Install Poplur once. Future beta updates arrive through TestFlight or Google Play.';
export const betaInviteFrom = 'Poplur <hello@poplur.ca>';

type BetaInviteEmailOptions = {
  androidUrl?: string;
  iosUrl?: string;
  logoSrc?: string;
};

const defaultIosUrl = 'https://testflight.apple.com/join/Q4v1ChjU';
const defaultAndroidUrl = 'https://play.google.com/apps/testing/com.poplur.app';

export function getBetaInviteLinks(options: BetaInviteEmailOptions = {}) {
  return {
    androidUrl: options.androidUrl ?? defaultAndroidUrl,
    iosUrl: options.iosUrl ?? defaultIosUrl,
  };
}

export function createBetaInviteText(options: BetaInviteEmailOptions = {}) {
  const { androidUrl, iosUrl } = getBetaInviteLinks(options);

  return [
    'Welcome to Poplur beta.',
    '',
    'Use the links below to install Poplur on iOS or Android and start exploring what is happening around real places.',
    '',
    `iOS beta: ${iosUrl}`,
    `Android beta: ${androidUrl}`,
    '',
    'Future updates will appear through TestFlight on iOS or Google Play on Android after you join the beta.',
    '',
    'Thanks for helping shape Poplur.',
    'The Poplur team',
  ].join('\n');
}

export function createBetaInviteHtml(options: BetaInviteEmailOptions = {}) {
  const { androidUrl, iosUrl } = getBetaInviteLinks(options);
  const logoSrc = options.logoSrc ?? 'cid:poplur-logo';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${betaInviteSubject}</title>
  </head>
  <body style="margin:0;background:#f3f5f8;color:#15151f;font-family:Avenir Next,Avenir,Inter,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${betaInvitePreview}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5f8;padding:28px 14px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #e4e7ee;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background:#18001f;padding:0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="background:#ff0a8a;height:8px;line-height:8px;font-size:1px;">&nbsp;</td>
                  </tr>
                  <tr>
                    <td style="padding:30px 30px 34px;background:#18001f;">
                      <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
                        <tr>
                          <td width="74" height="74" align="center" valign="middle" style="width:74px;height:74px;">
                            <img src="${logoSrc}" width="74" height="74" alt="Poplur" style="display:block;width:74px;height:74px;border-radius:18px;border:0;outline:none;text-decoration:none;">
                          </td>
                          <td style="padding-left:16px;">
                            <div style="font-size:30px;line-height:1;color:#ffffff;font-weight:900;letter-spacing:0;font-family:Avenir Next,Avenir,Inter,Arial,sans-serif;">Poplur</div>
                          </td>
                        </tr>
                      </table>
                      <div style="font-size:13px;font-weight:800;letter-spacing:0;text-transform:uppercase;color:#9ee8d5;">Poplur beta access</div>
                      <h1 style="margin:16px 0 0;font-size:38px;line-height:1.08;color:#ffffff;font-weight:900;letter-spacing:0;">Your beta access is ready.</h1>
                      <p style="margin:16px 0 0;font-size:17px;line-height:1.55;color:#f5ddea;">Thanks for joining early. Install Poplur once and future beta updates will arrive through TestFlight or Google Play.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:30px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="padding:0 0 18px;">
                      <p style="margin:0;font-size:16px;line-height:1.55;color:#2c303a;">Pick your platform:</p>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <a href="${iosUrl}" style="display:block;background:#18001f;border-radius:8px;color:#ffffff;font-size:16px;font-weight:800;line-height:54px;text-align:center;text-decoration:none;">Get Poplur for iOS</a>
                    </td>
                  </tr>
                  <tr>
                    <td style="height:12px;line-height:12px;">&nbsp;</td>
                  </tr>
                  <tr>
                    <td>
                      <a href="${androidUrl}" style="display:block;background:#ff0a8a;border-radius:8px;color:#ffffff;font-size:16px;font-weight:800;line-height:54px;text-align:center;text-decoration:none;">Get Poplur for Android</a>
                    </td>
                  </tr>
                </table>
                <div style="margin:28px 0 0;padding:18px;border:1px solid #e8ebf1;border-radius:8px;background:#fafbfc;">
                  <p style="margin:0;font-size:15px;line-height:1.55;color:#3c414d;"><strong>Future updates:</strong> once you join the beta, new iOS builds show up in TestFlight and Android updates show up through Google Play. You can reuse these links if you ever need to reinstall.</p>
                </div>
                <div style="margin:12px 0 0;padding:18px;border:1px solid #e8ebf1;border-radius:8px;background:#fafbfc;">
                  <p style="margin:0;font-size:15px;line-height:1.55;color:#3c414d;"><strong>What to try first:</strong> open Poplur near a favorite place, check what people are sharing there, and post something useful for the next person who arrives.</p>
                </div>
                <p style="margin:26px 0 0;font-size:15px;line-height:1.55;color:#596071;">Have feedback? Reply to this email. We are building Poplur with early users and every note helps.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 30px;background:#fff5fb;border-top:1px solid #ffd3e9;">
                <p style="margin:0;font-size:13px;line-height:1.5;color:#777f90;">You received this because you requested Poplur beta access from the website.</p>
                <p style="margin:10px 0 0;font-size:15px;line-height:1.5;color:#18001f;font-weight:900;">Poplur</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
