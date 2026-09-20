// Where the site lives, for links the server puts in emails.
// BETA_SITE_ORIGIN points a preview deployment at itself.

import { BETA_INVITE_ASSET_ORIGIN } from '@/emails/betaInviteEmail';

export function siteOrigin(): string {
  return (process.env.BETA_SITE_ORIGIN || BETA_INVITE_ASSET_ORIGIN).replace(/\/+$/, '');
}
