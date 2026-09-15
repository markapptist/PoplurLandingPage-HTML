#!/usr/bin/env node
// Keeps the five-actor-live synthetic cohort posting throughout the day.
//
// This is deliberately a SEPARATE process from synthetic-app-runner.mjs and
// never touches that file, its process, or its source. It only ever talks to
// the runner's own public local HTTP surface (GET /health, GET /state,
// POST /command) — the exact same control surface any human operator or the
// production test-control UI already uses. It does not start the runner's
// node process if that process is not running; the runner is owned and
// developed elsewhere, and this script's only job is to keep POKING it once
// it exists.
//
// Why polling + periodic refresh, not "start once and leave it": a live run
// only posts 4 times per actor (LIVE_MAX_POSTS_PER_ACTOR in
// synthetic-live-actions.mjs), staggered 20 minutes apart. After roughly
// 80-90 minutes every actor has exhausted its post allowance and the run
// just sits there liking/DM'ing forever without publishing anything new.
// "Throughout the day" therefore means periodically re-issuing the SAME
// enable command the app's own /command handler already treats as
// idempotent: sending {enabled:true, mode:'five-actor-live'} while a run is
// live pauses it and starts a clean one, resetting every actor's post
// counter. This script just does that on a schedule instead of a human
// clicking a button every couple of hours.
//
// Respecting concurrent human/manual control: this only acts when the
// current run looks DONE (every actor has hit its post cap) or STALE (older
// than the refresh interval) or the runner has been idle/paused/errored past
// a grace period. A run that a person just started manually is left alone
// until it has had time to actually post.

import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, appendFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOST = '127.0.0.1';
const PORT = Number(process.env.POPLUR_SYNTHETIC_RUNNER_PORT || 8097);
const BASE = `http://${HOST}:${PORT}`;

// How often we check in on the runner. Cheap — just an HTTP call.
const CHECK_INTERVAL_MS = Number(process.env.POPLUR_SCHEDULER_CHECK_MS || 5 * 60_000);
// How long a live run gets to run before we refresh it for a new batch, even
// if it hasn't technically exhausted every actor's post cap yet.
const REFRESH_INTERVAL_MS = Number(process.env.POPLUR_SCHEDULER_REFRESH_MS || 2 * 60 * 60_000);
// If the runner is off/paused/errored, wait this long before we intervene —
// long enough that a person actively restarting it by hand isn't fought.
const IDLE_GRACE_MS = Number(process.env.POPLUR_SCHEDULER_IDLE_GRACE_MS || 3 * 60_000);
const LIVE_MAX_POSTS_PER_ACTOR = 4;

const LOG_DIR = join(homedir(), '.poplur');
const LOG_FILE = join(LOG_DIR, 'synthetic-scheduler.log');
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

function log(line) {
  const stamped = `${new Date().toISOString()} ${line}`;
  console.log(stamped);
  try { appendFileSync(LOG_FILE, stamped + '\n'); } catch { /* best effort */ }
}

function ownerKeychainToken() {
  try {
    return execFileSync('/usr/bin/security', ['find-generic-password', '-s', 'Poplur Test Control', '-a', 'local-owner', '-w'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5_000,
    }).trim();
  } catch {
    return '';
  }
}

function fileToken(path) {
  try { return readFileSync(path, 'utf8').trim(); } catch { return ''; }
}

function resolveToken() {
  return process.env.POPLUR_TEST_CONTROL_TOKEN
    || ownerKeychainToken()
    || fileToken(join(homedir(), '.poplur', 'test-control-token'));
}

async function getJSON(path, { auth = false, timeoutMs = 8_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = auth ? { 'x-poplur-local-runner-token': resolveToken() } : {};
    const response = await fetch(`${BASE}${path}`, { headers, signal: controller.signal });
    const body = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    return { ok: false, status: 0, body: null, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

// A start answers only once every actor's browser is up (> 15 s on a cold
// shell), which the old fixed timeout logged as "start failed: HTTP 0 null"
// while the run went on regardless.
async function postCommand(command, timeoutMs = 15_000) {
  const token = resolveToken();
  if (!token) return { ok: false, status: 0, body: null, error: 'No local runner token available (keychain + env + file all empty).' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${BASE}/command`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-poplur-local-runner-token': token },
      body: JSON.stringify(command),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    return { ok: false, status: 0, body: null, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

// Tracks how long the runner has been sitting in an idle-ish state, purely
// in this process's memory. Restarting the scheduler resets the grace
// clock, which just means one extra check cycle of patience — never a
// problem, since the interval is short relative to the grace period.
let idleSinceMs = null;

// A live runner refuses a second start ("The live cohort runner is already
// active" — 85 refreshes failed that way between 3 and 13 Sep, so no run was
// ever refreshed). Stop it first, let the browsers close, then start.
async function restartBatch() {
  const stop = await postCommand({ enabled: false });
  if (!stop.ok) { log(`stop failed: HTTP ${stop.status} ${JSON.stringify(stop.body) || stop.error}`); return false; }
  await new Promise(resolve => setTimeout(resolve, 5_000));
  const result = await postCommand({ enabled: true, mode: 'five-actor-live' }, 180_000);
  log(result.ok ? `fresh run started: ${JSON.stringify(result.body?.status ? { status: result.body.status } : result.body)}` : `refresh failed: HTTP ${result.status} ${JSON.stringify(result.body) || result.error}`);
  return result.ok;
}

async function tick() {
  const health = await getJSON('/health');
  if (!health.ok || !health.body) {
    log(`runner unreachable on ${BASE} (${health.error || `HTTP ${health.status}`}) — not starting it myself, waiting for it to come up`);
    idleSinceMs = null; // don't count "not even running" against the idle grace period
    return;
  }

  const { status, mode } = health.body;

  if (status === 'starting') {
    log(`runner is starting (mode=${mode}) — leaving it alone this tick`);
    idleSinceMs = null;
    return;
  }

  if (status === 'live') {
    idleSinceMs = null;
    const state = await getJSON('/state', { auth: true });
    if (!state.ok || !state.body) {
      log(`runner reports live but /state was unreachable (${state.error || `HTTP ${state.status}`}) — skipping this tick`);
      return;
    }
    const { startedAtMs, actors = [] } = state.body;
    const ageMs = startedAtMs ? Date.now() - startedAtMs : 0;
    const allPosted = actors.length > 0 && actors.every(actor => (actor.postsPublished ?? 0) >= LIVE_MAX_POSTS_PER_ACTOR);
    const stale = REFRESH_INTERVAL_MS > 0 && ageMs >= REFRESH_INTERVAL_MS;
    // The runner never retries an actor that errored (a sign-in against a
    // dev server that was still booting after a reboot, 14–15 Sep), so a run
    // can sit "live" with three dead actors for hours. Treat that like an
    // idle runner: give it the grace period, then restart the batch.
    const errored = actors.filter(actor => actor.status === 'error');
    if (errored.length && ageMs >= IDLE_GRACE_MS) {
      log(`${errored.length} actor(s) in error ${Math.round(ageMs / 60_000)}min into this run (${errored.map(a => a.actorId).join(' ')}) — restarting the batch`);
      await restartBatch();
      return;
    }
    if (allPosted || stale) {
      log(`current run ${allPosted ? 'has posted its full batch' : `is stale (${Math.round(ageMs / 60_000)}min old)`} — starting a fresh batch`);
      await restartBatch();
    } else {
      const publishedSummary = actors.map(a => `${a.actorId}:${a.postsPublished ?? 0}/${LIVE_MAX_POSTS_PER_ACTOR}`).join(' ');
      log(`live and healthy (${Math.round(ageMs / 60_000)}min into this run) — ${publishedSummary}`);
    }
    return;
  }

  // status is 'paused', 'error', or anything else off-live: only act after
  // it has sat that way for the grace period, so a human mid-restart isn't
  // fought.
  if (idleSinceMs == null) idleSinceMs = Date.now();
  const idleForMs = Date.now() - idleSinceMs;
  if (idleForMs < IDLE_GRACE_MS) {
    log(`runner is ${status} (idle ${Math.round(idleForMs / 1_000)}s, grace period ${Math.round(IDLE_GRACE_MS / 1_000)}s) — waiting before intervening`);
    return;
  }
  log(`runner has been ${status} for ${Math.round(idleForMs / 60_000)}min — starting five-actor-live`);
  const result = await postCommand({ enabled: true, mode: 'five-actor-live' }, 180_000);
  log(result.ok ? `run started: ${JSON.stringify(result.body?.status ? { status: result.body.status } : result.body)}` : `start failed: HTTP ${result.status} ${JSON.stringify(result.body) || result.error}`);
  if (result.ok) idleSinceMs = null;
}

async function main() {
  log(`synthetic-live-scheduler starting — check every ${Math.round(CHECK_INTERVAL_MS / 60_000)}min, refresh a run after ${Math.round(REFRESH_INTERVAL_MS / 60_000)}min, idle grace ${Math.round(IDLE_GRACE_MS / 60_000)}min, target ${BASE}`);
  // Run forever. launchd's KeepAlive is a crash safety net, not the primary
  // loop — this process paces itself so a crash-restart doesn't turn into a
  // tight loop hammering the runner.
  for (;;) {
    try {
      await tick();
    } catch (error) {
      log(`tick failed unexpectedly: ${error instanceof Error ? error.stack || error.message : String(error)}`);
    }
    await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL_MS));
  }
}

main();
