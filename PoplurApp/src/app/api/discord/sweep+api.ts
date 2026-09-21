// POST /api/discord/sweep — give the Tester role to signers whose typed
// username was not in the server when they signed. Idempotent; run it from a
// timer (scripts/discord-sweep.sh under launchd) or by hand. Door: FUNNEL_KEY,
// the operator key the funnel page already uses.

declare const require: any;
const { timingSafeEqual } = require('node:crypto');
declare const Buffer: any;

import { forgetDiscordPending, listDiscordPending, recordTesterEvent } from '@/server/betaFunnel.server';
import { addTesterRole, discordConfig, findMemberByUsername, notifyPoplur } from '@/server/discord.server';

function keyOk(given: string | null): boolean {
  const key = process.env.FUNNEL_KEY;
  if (!key || !given) return false;
  const a = Buffer.from(given), b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!keyOk(new URL(request.url).searchParams.get('k') ?? request.headers.get('x-funnel-key'))) return Response.json({ error: 'That key is not right.' }, { status: 401 });
  if (!discordConfig()) return Response.json({ ok: false, error: 'Discord is not configured.' }, { status: 503 });
  const pending = await listDiscordPending();
  const done: string[] = [];
  for (const p of pending) {
    const member = await findMemberByUsername(p.username);
    if (!member) continue;
    if (!(await addTesterRole(member.id))) continue;
    await forgetDiscordPending(p.id);
    await recordTesterEvent(p.email, 'discord_tester', { discordId: member.id, username: member.username, via: 'sweep' });
    await notifyPoplur(`✅ **${p.name}** (@${member.username}) is now a Tester — signed ${p.signedAt.slice(0, 10)}, joined the server since.`);
    done.push(member.username);
  }
  return Response.json({ ok: true, pending: pending.length, assigned: done });
}
