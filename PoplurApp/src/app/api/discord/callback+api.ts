// GET /api/discord/callback?code=&state= — back from Discord. Exchanges the
// code, learns who they are, puts them in the server if they are not in it
// (no role yet: the role comes with the signature), and sends them back to
// their agreement page with a signed cookie naming the connected account.

import { discordCookie, exchangeCode, identify, joinGuild, openOauthState } from '@/server/discord.server';
import { siteOrigin } from '@/server/site.server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ndaToken = openOauthState(url.searchParams.get('state'));
  const origin = siteOrigin();
  const back = (extra: string) => `${origin}/nda?t=${encodeURIComponent(ndaToken ?? '')}${extra}`;
  if (!ndaToken) return Response.redirect(`${origin}/nda?discord=state`, 302);
  const code = url.searchParams.get('code');
  if (!code) return Response.redirect(back('&discord=denied'), 302);
  const grant = await exchangeCode(origin, code);
  if (!grant) return Response.redirect(back('&discord=failed'), 302);
  const user = await identify(grant.accessToken);
  if (!user) return Response.redirect(back('&discord=failed'), 302);
  const joined = await joinGuild(user.id, grant.accessToken);
  const headers = new Headers({ Location: back(`&discord=${joined === 'failed' ? 'connected' : joined}`) });
  headers.set('Set-Cookie', discordCookie(user, url.protocol === 'https:'));
  return new Response(null, { status: 302, headers });
}
