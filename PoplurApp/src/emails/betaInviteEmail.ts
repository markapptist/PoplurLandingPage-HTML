export const betaInviteSubject = 'Your Poplur beta links are here';
export const betaInvitePreview =
  'Download Poplur on iOS or Android and start exploring what is happening nearby.';
export const betaInviteFrom = 'Poplur <hello@poplur.ca>';

type BetaInviteEmailOptions = {
  androidUrl?: string;
  iosUrl?: string;
};

const defaultIosUrl = 'https://testflight.apple.com/join/poplur-beta';
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
    'Poplur helps you see what is happening around the places you care about, from real people who are there.',
    '',
    `iOS beta: ${iosUrl}`,
    `Android beta: ${androidUrl}`,
    '',
    'Thanks for helping shape Poplur.',
    'The Poplur team',
  ].join('\n');
}

export function createBetaInviteHtml(options: BetaInviteEmailOptions = {}) {
  const { androidUrl, iosUrl } = getBetaInviteLinks(options);

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
              <td style="background:#15151f;padding:30px 30px 34px;">
                <div style="font-size:13px;font-weight:700;letter-spacing:0;text-transform:uppercase;color:#9ee8d5;">Poplur beta access</div>
                <h1 style="margin:16px 0 0;font-size:36px;line-height:1.08;color:#ffffff;font-weight:800;letter-spacing:0;">Your beta links are ready.</h1>
                <p style="margin:16px 0 0;font-size:17px;line-height:1.55;color:#e6e8ef;">Thanks for joining early. Use the links below to install Poplur and start exploring what is happening around real places.</p>
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
                      <a href="${iosUrl}" style="display:block;background:#15151f;border-radius:8px;color:#ffffff;font-size:16px;font-weight:800;line-height:54px;text-align:center;text-decoration:none;">Get Poplur for iOS</a>
                    </td>
                  </tr>
                  <tr>
                    <td style="height:12px;line-height:12px;">&nbsp;</td>
                  </tr>
                  <tr>
                    <td>
                      <a href="${androidUrl}" style="display:block;background:#24d7a4;border-radius:8px;color:#08120f;font-size:16px;font-weight:800;line-height:54px;text-align:center;text-decoration:none;">Get Poplur for Android</a>
                    </td>
                  </tr>
                </table>
                <div style="margin:28px 0 0;padding:18px;border:1px solid #e8ebf1;border-radius:8px;background:#fafbfc;">
                  <p style="margin:0;font-size:15px;line-height:1.55;color:#3c414d;"><strong>What to try first:</strong> open Poplur near a favorite place, check what people are sharing there, and post something useful for the next person who arrives.</p>
                </div>
                <p style="margin:26px 0 0;font-size:15px;line-height:1.55;color:#596071;">Have feedback? Reply to this email. We are building Poplur with early users and every note helps.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 30px;background:#f8f9fb;border-top:1px solid #e8ebf1;">
                <p style="margin:0;font-size:13px;line-height:1.5;color:#777f90;">You received this because you requested Poplur beta access from the website.</p>
                <p style="margin:10px 0 0;font-size:13px;line-height:1.5;color:#777f90;">Poplur</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
