#!/usr/bin/env node
// One-shot setup of the Poplur beta Discord through the bot (21 Sep 2026), idempotent:
//   role   Tester (pink, listed separately)
//   text   #welcome (everyone: read + post), #nda (everyone: read only),
//          #focus-group and #bugs (Tester only), #poplur-desk (nobody but admins; the bot posts there)
//   voice  focus-group (Tester only)
//   invite a permanent, 100-use invite to #welcome
//   default channel → #welcome
// Prints the values the site needs (DISCORD_GUILD_ID, DISCORD_TESTER_ROLE_ID,
// DISCORD_NOTIFY_CHANNEL_ID, BETA_DISCORD_INVITE). Token from the keychain
// item 'Poplur Discord Bot' (or DISCORD_BOT_TOKEN). Never prints the token.
import { execFileSync } from 'node:child_process';

const API = 'https://discord.com/api/v10';
const token = process.env.DISCORD_BOT_TOKEN || execFileSync('security', ['find-generic-password', '-s', 'Poplur Discord Bot', '-a', 'local-owner', '-w'], { encoding: 'utf8' }).trim();
const GUILD_NAME = process.env.DISCORD_GUILD_NAME || 'Poplur';
const VIEW = 1n << 10n, SEND = 1n << 11n, HISTORY = 1n << 16n, CONNECT = 1n << 20n, SPEAK = 1n << 21n, ADD_REACTIONS = 1n << 6n, ATTACH = 1n << 15n, EMBED = 1n << 14n;

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json', 'X-Audit-Log-Reason': 'Poplur beta setup', ...(init.headers ?? {}) } });
  if (res.status === 429) { const j = await res.json(); await new Promise(r => setTimeout(r, (j.retry_after ?? 1) * 1000)); return api(path, init); }
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.status === 204 ? null : res.json();
}

const me = await api('/users/@me');
const guilds = await api('/users/@me/guilds');
const guild = guilds.find(g => g.name.toLowerCase() === GUILD_NAME.toLowerCase()) ?? (guilds.length === 1 ? guilds[0] : null);
if (!guild) { console.error(`The bot ${me.username} is not in a server called "${GUILD_NAME}". Servers it is in: ${guilds.map(g => g.name).join(', ') || 'none'}. Authorise it into the Poplur server first.`); process.exit(1); }
const G = guild.id;
console.log(`bot @${me.username} · server "${guild.name}" (${G})`);

// Role
const roles = await api(`/guilds/${G}/roles`);
const everyone = roles.find(r => r.id === G);
let tester = roles.find(r => r.name === 'Tester');
if (!tester) { tester = await api(`/guilds/${G}/roles`, { method: 'POST', body: JSON.stringify({ name: 'Tester', color: 0xff2d96, hoist: true, mentionable: true, permissions: '0' }) }); console.log('created role Tester'); } else console.log('role Tester exists');

// Channels
const existing = await api(`/guilds/${G}/channels`);
const byName = (name, type) => existing.find(c => c.name === name && c.type === type);
const allow = (id, bits, type = 0) => ({ id, type, allow: bits.toString(), deny: '0' });
const deny = (id, bits, type = 0) => ({ id, type, allow: '0', deny: bits.toString() });
const ensure = async (name, type, overwrites, topic) => {
  let ch = byName(name, type);
  if (!ch) { ch = await api(`/guilds/${G}/channels`, { method: 'POST', body: JSON.stringify({ name, type, permission_overwrites: overwrites, ...(topic ? { topic } : {}) }) }); console.log(`created ${type === 2 ? '🔊' : '#'}${name}`); }
  else { await api(`/channels/${ch.id}`, { method: 'PATCH', body: JSON.stringify({ permission_overwrites: overwrites, ...(topic ? { topic } : {}) }) }); console.log(`updated ${type === 2 ? '🔊' : '#'}${name}`); }
  return ch;
};
const everyoneCan = allow(everyone.id, VIEW | HISTORY | SEND | ADD_REACTIONS | ATTACH | EMBED);
const everyoneReads = { id: everyone.id, type: 0, allow: (VIEW | HISTORY | ADD_REACTIONS).toString(), deny: SEND.toString() };
const testersOnly = [deny(everyone.id, VIEW), allow(tester.id, VIEW | HISTORY | SEND | ADD_REACTIONS | ATTACH | EMBED)];
const welcome = await ensure('welcome', 0, [everyoneCan], 'Start here: ask for your invite at https://www.poplur.ca/#beta, sign the tester agreement from the email, and the Tester role lands on its own.');
const nda = await ensure('nda', 0, [everyoneReads], 'The tester agreement. Your personal signing link is in your Poplur invite email.');
const focus = await ensure('focus-group', 0, testersOnly, 'Testers: the daily prompt, questions, standings every Monday.');
const bugs = await ensure('bugs', 0, testersOnly, 'One bug per message with a screenshot. ✅ from Mark = confirmed, 5 pts, first reporter.');
const voice = await ensure('focus-group', 2, [deny(everyone.id, VIEW | CONNECT), allow(tester.id, VIEW | CONNECT | SPEAK)]);
const desk = await ensure('poplur-desk', 0, [deny(everyone.id, VIEW), deny(tester.id, VIEW), allow(me.id, VIEW | SEND | HISTORY, 1)], 'Poplur only: the site posts here when someone signs or becomes a Tester.');

// Default channel + invite
await api(`/guilds/${G}`, { method: 'PATCH', body: JSON.stringify({ system_channel_id: welcome.id }) });
const invites = await api(`/channels/${welcome.id}/invites`);
let invite = invites.find(i => i.max_age === 0 && i.max_uses === 100 && i.inviter?.id === me.id);
if (!invite) { invite = await api(`/channels/${welcome.id}/invites`, { method: 'POST', body: JSON.stringify({ max_age: 0, max_uses: 100, unique: true }) }); console.log('created invite'); } else console.log('invite exists');

console.log('\nSet on Vercel (poplur-app, Production):');
console.log(`DISCORD_GUILD_ID=${G}`);
console.log(`DISCORD_TESTER_ROLE_ID=${tester.id}`);
console.log(`DISCORD_NOTIFY_CHANNEL_ID=${desk.id}`);
console.log(`BETA_DISCORD_INVITE=https://discord.gg/${invite.code}`);
console.log(`(plus DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET from the developer portal)`);
console.log(`\nchannels: welcome ${welcome.id} · nda ${nda.id} · focus-group ${focus.id} · bugs ${bugs.id} · voice ${voice.id}`);
