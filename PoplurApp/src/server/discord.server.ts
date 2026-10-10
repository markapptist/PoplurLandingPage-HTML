// The beta Discord, from the site's server: the Tester role handed out the
// moment someone signs the agreement, and a note to Poplur when it happens.
//
// Two ways a signer is matched to a Discord account, in this order:
//   1. They pressed "Connect Discord" on the agreement page (api/discord/connect →
//      Discord OAuth2 → api/discord/callback). That gives the exact account id,
//      and the callback also puts them in the server if they are not in it yet
//      (`guilds.join`), so signing before joining still works.
//   2. They typed a Discord username. The server searches the guild's members
//      for it; a miss is kept in `betaDiscordPending` and swept (api/discord/sweep)
//      until they join.
// Everything here is optional: with no DISCORD_BOT_TOKEN nothing is attempted
// and signing works as before. The role is found by NAME ("Tester", or
// DISCORD_TESTER_ROLE_NAME) unless DISCORD_TESTER_ROLE_ID is set, so the only
// secret to configure is the bot token (10 Oct 2026: Mark wants the role
// automatic on signing; the guild id is set from the invite).

import { openPayload, signPayload } from '@/server/betaNda.server';

declare const require: any;
const { randomBytes } = require('node:crypto');

const API = 'https://discord.com/api/v10';

export type DiscordConfig = { botToken: string; guildId: string; testerRoleId: string | null; testerRoleName: string; clientId: string | null; clientSecret: string | null; notifyChannelId: string | null };

export function discordConfig(): DiscordConfig | null {
  const botToken = process.env.DISCORD_BOT_TOKEN, guildId = process.env.DISCORD_GUILD_ID;
  if (!botToken || !guildId) return null;
  const testerRoleId = process.env.DISCORD_TESTER_ROLE_ID || null, testerRoleName = (process.env.DISCORD_TESTER_ROLE_NAME || 'Tester').trim();
  return { botToken, guildId, testerRoleId, testerRoleName, clientId: process.env.DISCORD_CLIENT_ID || null, clientSecret: process.env.DISCORD_CLIENT_SECRET || null, notifyChannelId: process.env.DISCORD_NOTIFY_CHANNEL_ID || null };
}

/** "Connect Discord" is offered only when the OAuth2 half is configured too. */
export function discordConnectAvailable(): boolean {
  const c = discordConfig();
  return !!(c && c.clientId && c.clientSecret);
}

async function bot(path: string, init: RequestInit = {}): Promise<Response> {
  const c = discordConfig();
  if (!c) throw new Error('Discord is not configured.');
  const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bot ${c.botToken}`, 'Content-Type': 'application/json', 'X-Audit-Log-Reason': 'Poplur beta: signed the tester agreement', ...(init.headers ?? {}) } });
  if (res.status === 429) {
    const wait = Number((await res.json().catch(() => ({}))).retry_after ?? 1);
    await new Promise(r => setTimeout(r, Math.min(5000, wait * 1000)));
    return bot(path, init);
  }
  return res;
}

export type DiscordUser = { id: string; username: string; globalName: string | null };

/** The guild member whose username (or display name) is exactly this, or null. */
export async function findMemberByUsername(username: string): Promise<DiscordUser | null> {
  const c = discordConfig();
  if (!c) return null;
  const wanted = username.trim().replace(/^@/, '').toLowerCase();
  if (!wanted) return null;
  const res = await bot(`/guilds/${c.guildId}/members/search?query=${encodeURIComponent(wanted)}&limit=25`);
  if (!res.ok) return null;
  const members = (await res.json()) as { user: { id: string; username: string; global_name?: string | null }; nick?: string | null }[];
  const exact = members.find(m => m.user.username.toLowerCase() === wanted)
    ?? members.find(m => (m.user.global_name ?? '').toLowerCase() === wanted || (m.nick ?? '').toLowerCase() === wanted);
  return exact ? { id: exact.user.id, username: exact.user.username, globalName: exact.user.global_name ?? null } : null;
}

let _roleId: string | null = null;
/** The Tester role's id: DISCORD_TESTER_ROLE_ID, else the guild role named
 *  DISCORD_TESTER_ROLE_NAME / "Tester" (case-insensitive), remembered per instance. */
export async function testerRoleId(): Promise<string | null> {
  const c = discordConfig();
  if (!c) return null;
  if (c.testerRoleId) return c.testerRoleId;
  if (_roleId) return _roleId;
  const res = await bot(`/guilds/${c.guildId}/roles`);
  if (!res.ok) return null;
  const roles = (await res.json()) as { id: string; name: string }[];
  const wanted = c.testerRoleName.toLowerCase();
  _roleId = roles.find(r => r.name.toLowerCase() === wanted)?.id ?? null;
  return _roleId;
}

/** Give this member the Tester role. True when they now have it. */
export async function addTesterRole(userId: string): Promise<boolean> {
  const c = discordConfig();
  if (!c) return false;
  const roleId = await testerRoleId();
  if (!roleId) return false;
  const res = await bot(`/guilds/${c.guildId}/members/${userId}/roles/${roleId}`, { method: 'PUT' });
  return res.status === 204;
}

/** Put a user in the server with their OAuth2 token (they authorised `guilds.join`).
 *  201 = joined, 204 = already a member. */
export async function joinGuild(userId: string, accessToken: string): Promise<'joined' | 'member' | 'failed'> {
  const c = discordConfig();
  if (!c) return 'failed';
  const res = await bot(`/guilds/${c.guildId}/members/${userId}`, { method: 'PUT', body: JSON.stringify({ access_token: accessToken }) });
  return res.status === 201 ? 'joined' : res.status === 204 ? 'member' : 'failed';
}

/** A line in Poplur's notify channel (DISCORD_NOTIFY_CHANNEL_ID). Best effort. */
export async function notifyPoplur(content: string): Promise<void> {
  const c = discordConfig();
  if (!c || !c.notifyChannelId) return;
  try { await bot(`/channels/${c.notifyChannelId}/messages`, { method: 'POST', body: JSON.stringify({ content, allowed_mentions: { parse: [] } }) }); } catch { /* a missed note is not a failed signature */ }
}

// ---------------------------------------------------------------- OAuth2 (Connect Discord)

export const OAUTH_SCOPES = 'identify guilds.join';

export function oauthRedirectUri(origin: string): string {
  return `${origin.replace(/\/+$/, '')}/api/discord/callback`;
}

/** Where to send the tester to authorise. `ndaToken` rides in the signed state so the
 *  callback can bring them back to their own agreement page. */
export function oauthAuthorizeUrl(origin: string, ndaToken: string): string | null {
  const c = discordConfig();
  if (!c || !c.clientId) return null;
  const state = signPayload(`dcs|${ndaToken}|${randomBytes(8).toString('hex')}`);
  const q = new URLSearchParams({ client_id: c.clientId, response_type: 'code', scope: OAUTH_SCOPES, redirect_uri: oauthRedirectUri(origin), state, prompt: 'none' });
  return `https://discord.com/oauth2/authorize?${q}`;
}

export function openOauthState(state: string | null): string | null {
  const opened = openPayload(state);
  if (!opened.ok) return null;
  const parts = opened.payload.split('|');
  return parts.length === 3 && parts[0] === 'dcs' ? parts[1] : null;
}

export async function exchangeCode(origin: string, code: string): Promise<{ accessToken: string } | null> {
  const c = discordConfig();
  if (!c || !c.clientId || !c.clientSecret) return null;
  const body = new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, grant_type: 'authorization_code', code, redirect_uri: oauthRedirectUri(origin) });
  const res = await fetch(`${API}/oauth2/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: string };
  return json.access_token ? { accessToken: json.access_token } : null;
}

export async function identify(accessToken: string): Promise<DiscordUser | null> {
  const res = await fetch(`${API}/users/@me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const u = (await res.json()) as { id: string; username: string; global_name?: string | null };
  return { id: u.id, username: u.username, globalName: u.global_name ?? null };
}

// ---------------------------------------------------------------- the connected-account cookie

export const DISCORD_COOKIE = 'dc';
const COOKIE_TTL_S = 24 * 60 * 60;

/** After the callback, who they connected as, signed, for the agreement page and the sign call. */
export function discordCookie(user: DiscordUser, secure: boolean): string {
  const value = signPayload(`dc|${user.id}|${user.username}|${Date.now()}`);
  return `${DISCORD_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${COOKIE_TTL_S}; SameSite=Lax; HttpOnly${secure ? '; Secure' : ''}`;
}

export function readDiscordCookie(request: Request): DiscordUser | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name !== DISCORD_COOKIE) continue;
    const opened = openPayload(decodeURIComponent(rest.join('=')));
    if (!opened.ok) return null;
    const parts = opened.payload.split('|');
    if (parts.length !== 4 || parts[0] !== 'dc') return null;
    if (Date.now() - Number(parts[3]) > COOKIE_TTL_S * 1000) return null;
    return { id: parts[1], username: parts[2], globalName: null };
  }
  return null;
}
