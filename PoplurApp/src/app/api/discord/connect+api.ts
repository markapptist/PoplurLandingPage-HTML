// GET /api/discord/connect?t=<nda token> — "Connect Discord" on the agreement
// page: sends the tester to Discord to authorise `identify guilds.join`, with
// their agreement token in the signed state so the callback can bring them back.

import { verifyNdaToken } from '@/server/betaNda.server';
import { discordConnectAvailable, oauthAuthorizeUrl } from '@/server/discord.server';
import { siteOrigin } from '@/server/site.server';

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('t') ?? '';
  const check = verifyNdaToken(token);
  if (!check.ok) return Response.redirect(`${siteOrigin()}/nda?t=${encodeURIComponent(token)}`, 302);
  if (!discordConnectAvailable()) return Response.redirect(`${siteOrigin()}/nda?t=${encodeURIComponent(token)}&discord=off`, 302);
  const url = oauthAuthorizeUrl(siteOrigin(), token);
  return url ? Response.redirect(url, 302) : Response.redirect(`${siteOrigin()}/nda?t=${encodeURIComponent(token)}&discord=off`, 302);
}
