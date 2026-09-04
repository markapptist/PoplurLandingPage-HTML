const RUNNER_ORIGIN = 'http://127.0.0.1:8096';
const REQUEST_TIMEOUT_MS = 4_000;
const COMMAND_TIMEOUT_MS = 12 * 60 * 1_000;
const MAX_FRAME_BYTES = 8 * 1024 * 1024;

export type SyntheticRunnerStatus = 'offline' | 'paused' | 'starting' | 'live' | 'completed' | 'error';
export type SyntheticCohortMode = 'five-actor-readonly' | 'five-actor-live';
export type SyntheticRunnerMode = SyntheticCohortMode | 'first-user-v1' | 'first-user-shared-v1' | null;
export type SyntheticActivityReport = 'cloud' | 'local' | 'production';

/** One thing a synthetic user does, as the local runner describes it. */
export type SyntheticActivity = {
  id: string;
  label: string;
  detail: string;
  reported: SyntheticActivityReport;
};

export type SyntheticRunnerActor = {
  actorId: string;
  actor: string;
  status: SyntheticRunnerStatus;
  sessionId: string;
  currentScreen: string;
  action: string;
  lastFrameSequence: number;
  lastFrameAtMs: number;
  frameSuppressed: boolean;
  frameCount: number;
  handle: string;
  persona: string;
  place: string;
  uid: string;
  email: string;
  signedInAtMs: number;
  postsPublished: number;
  lastPostId: string;
  lastPostAtMs: number;
  viewsGiven: number;
  likesGiven: number;
  dmsSent: number;
  lastError: string;
};

/**
 * Shown when the local runner is offline, so the Test Center can still say
 * what each mode does. The runner's own `activities` list wins when present;
 * keep this in step with scripts/synthetic-live-actions.mjs.
 */
export const SYNTHETIC_ACTIVITY_FALLBACK: Record<SyntheticCohortMode, SyntheticActivity[]> = {
  'five-actor-readonly': [
    { id: 'app-open', label: 'Open Poplur and sign in', detail: 'Fresh isolated browser, then email + password sign-in with the actor’s own beta account.', reported: 'cloud' },
    { id: 'screen-view', label: 'Land on the Feed', detail: 'Watch the TV feed and whatever is currently intercepting the actor’s radius.', reported: 'cloud' },
    { id: 'open-map', label: 'Open the Map', detail: 'Arrow the cube to the Map and look at the pins in reach.', reported: 'cloud' },
    { id: 'open-profile', label: 'Open the Profile', detail: 'Arrow the cube to Profile and check their own posts and radius.', reported: 'cloud' },
    { id: 'open-hold-menu', label: 'Hold the cube for the menu', detail: 'Long-press the cube, look at the hold menu, then Escape back.', reported: 'cloud' },
    { id: 'idle', label: 'Pause between actions', detail: 'Human-paced dwell, then the cycle repeats.', reported: 'cloud' },
  ],
  'five-actor-live': [
    { id: 'app-open', label: 'Open Poplur and sign in', detail: 'Fresh isolated browser, then email + password sign-in with the actor’s own beta account.', reported: 'cloud' },
    { id: 'screen-view', label: 'Land on the Feed', detail: 'Watch the TV feed and whatever is currently intercepting the actor’s radius.', reported: 'cloud' },
    { id: 'open-map', label: 'Open the Map', detail: 'Arrow the cube to the Map and look at the pins in reach.', reported: 'cloud' },
    { id: 'open-profile', label: 'Open the Profile', detail: 'Arrow the cube to Profile and check their own posts and radius.', reported: 'cloud' },
    { id: 'open-hold-menu', label: 'Hold the cube for the menu', detail: 'Long-press the cube, look at the hold menu, then Escape back.', reported: 'cloud' },
    { id: 'open-camera', label: 'Open the Camera', detail: 'Arrow the cube to Camera; the browser supplies a fake camera device.', reported: 'local' },
    { id: 'capture-photo', label: 'Capture a photo', detail: 'Press the cube to capture, then choose “Use original” in the Post composer.', reported: 'local' },
    { id: 'choose-location', label: 'Pick the spot on the Map', detail: 'Tap “Use this spot” in the Map picker at the actor’s own managed city (Toronto, London or New York).', reported: 'local' },
    { id: 'publish-post', label: 'Publish the post', detail: 'Confirm “I can share this”, press “Post to TV”, wait for the upload to finish. This creates a real public post tagged synthetic.', reported: 'production' },
    { id: 'verify-post', label: 'Find the post on the Map', detail: 'Return to the Map and confirm their own pin is there.', reported: 'cloud' },
    { id: 'view-post', label: 'Watch another tester’s post', detail: 'Dwell on an intercepting post in the Feed. A real view grows that post’s radius.', reported: 'production' },
    { id: 'like-post', label: 'Like it', detail: 'Like the post once per account. A real like grows its radius by about a kilometre.', reported: 'production' },
    { id: 'send-dm', label: 'Message the poster', detail: 'Hold the cube, open View Profile on the post they just liked, press Message and send one short note. One DM per poster, at most three per run; the thread is real and lands in that owner’s Mail.', reported: 'production' },
    { id: 'idle', label: 'Pause between actions', detail: 'Human-paced dwell, then the cycle repeats. Each actor posts again every 20 minutes, up to four posts per run.', reported: 'cloud' },
  ],
};

export type SyntheticRunnerState = {
  ok: true;
  mode: SyntheticRunnerMode;
  cohortId: string;
  activities: SyntheticActivity[];
  enabled: boolean;
  status: SyntheticRunnerStatus;
  completed: boolean;
  startedAtMs: number;
  completedAtMs: number;
  runId: string;
  identity: { actorId: string; email: string; handle: string } | null;
  result: {
    postId: string;
    radiusMeters: number;
    mapVerified: boolean;
    feedEligible: boolean;
    feedVerified: boolean;
    profileChecked: false;
  } | null;
  error: string;
  actors: SyntheticRunnerActor[];
};

export type SyntheticRunnerFrame = {
  sequence: number;
  capturedAtMs: number;
  screen: string;
  action: string;
  frameSuppressed: boolean;
  imageUrl: string;
};

const text = (value: unknown, maximum = 120): string => typeof value === 'string'
  ? value.trim().replace(/\s+/g, ' ').slice(0, maximum)
  : '';

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object'
  ? value as Record<string, unknown>
  : {};

const integer = (value: unknown, maximum = Number.MAX_SAFE_INTEGER): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(maximum, Math.round(parsed))) : 0;
};

const runnerStatus = (value: unknown): SyntheticRunnerStatus => {
  const status = text(value, 16);
  return status === 'paused' || status === 'starting' || status === 'live'
    || status === 'completed' || status === 'error'
    ? status
    : 'offline';
};

const runnerMode = (value: unknown): SyntheticRunnerMode => {
  const mode = text(value, 32);
  return mode === 'five-actor-readonly' || mode === 'five-actor-live'
    || mode === 'first-user-v1' || mode === 'first-user-shared-v1'
    ? mode
    : null;
};

export const isCohortMode = (mode: SyntheticRunnerMode): mode is SyntheticCohortMode => mode === 'five-actor-readonly' || mode === 'five-actor-live';

const activity = (value: unknown): SyntheticActivity | null => {
  const row = record(value);
  const id = text(row.id, 40);
  const label = text(row.label, 80);
  const detail = text(row.detail, 240);
  const reported = text(row.reported, 16);
  if (!id || !label || (reported !== 'cloud' && reported !== 'local' && reported !== 'production')) return null;
  return { id, label, detail, reported };
};

const identity = (value: unknown): SyntheticRunnerState['identity'] => {
  const row = record(value);
  const actorId = text(row.actorId, 80);
  const email = text(row.email, 180);
  const handle = text(row.handle, 80);
  return actorId && email && handle ? { actorId, email, handle } : null;
};

const actor = (value: unknown): SyntheticRunnerActor | null => {
  const row = record(value);
  const actorId = text(row.actorId, 80);
  const label = text(row.actor, 80);
  if (!actorId || !label) return null;
  return {
    actorId,
    actor: label,
    status: runnerStatus(row.status),
    sessionId: text(row.sessionId, 120),
    currentScreen: text(row.currentScreen, 64),
    action: text(row.action, 80),
    lastFrameSequence: integer(row.lastFrameSequence, 10_000_000),
    lastFrameAtMs: integer(row.lastFrameAtMs),
    frameSuppressed: row.frameSuppressed === true,
    frameCount: integer(row.frameCount, 120),
    handle: text(row.handle, 80),
    persona: text(row.persona, 80),
    place: text(row.place, 80),
    uid: text(row.uid, 128),
    email: text(row.email, 180),
    signedInAtMs: integer(row.signedInAtMs),
    postsPublished: integer(row.postsPublished, 10_000),
    lastPostId: text(row.lastPostId, 128),
    lastPostAtMs: integer(row.lastPostAtMs),
    viewsGiven: integer(row.viewsGiven, 100_000),
    likesGiven: integer(row.likesGiven, 100_000),
    dmsSent: integer(row.dmsSent, 1_000),
    lastError: text(row.lastError, 200),
  };
};

export function syntheticRunnerFrameUrl(actorId: string, sequence: number): string {
  return `${RUNNER_ORIGIN}/api/runner/frame/${encodeURIComponent(actorId)}?sequence=${integer(sequence, 10_000_000)}`;
}

const frame = (value: unknown, actorId: string): SyntheticRunnerFrame | null => {
  const row = record(value);
  const sequence = integer(row.sequence, 10_000_000);
  const capturedAtMs = integer(row.capturedAtMs);
  if (!sequence || !capturedAtMs) return null;
  return {
    sequence,
    capturedAtMs,
    screen: text(row.screen, 64),
    action: text(row.action, 80),
    frameSuppressed: row.frameSuppressed === true,
    imageUrl: syntheticRunnerFrameUrl(actorId, sequence),
  };
};

async function runnerGet(path: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${RUNNER_ORIGIN}${path}`, {
      method: 'GET',
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Local runner returned HTTP ${response.status}.`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function runnerCommand(enabled: boolean, mode: SyntheticCohortMode): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), COMMAND_TIMEOUT_MS);
  try {
    const response = await fetch(`${RUNNER_ORIGIN}/api/runner/command`, {
      method: 'POST',
      cache: 'no-store',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(enabled ? { enabled, mode } : { enabled }),
      signal: controller.signal,
    });
    const body = record(await response.json().catch(() => ({})));
    if (!response.ok || body.ok !== true) throw new Error('Local runner command was rejected.');
  } finally {
    clearTimeout(timeout);
  }
}

async function onboardingCommand(mode: 'first-user-v1' | 'first-user-shared-v1'): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), COMMAND_TIMEOUT_MS);
  try {
    const response = await fetch(`${RUNNER_ORIGIN}/api/runner/onboarding`, {
      method: 'POST',
      cache: 'no-store',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(mode === 'first-user-v1'
        ? { mode, confirmCreateAccountAndPublicPost: true }
        : { mode, confirmCreateProductionTestAccountAndPublicPost: true }),
      signal: controller.signal,
    });
    const body = record(await response.json().catch(() => ({})));
    if (!response.ok || body.ok !== true) throw new Error('First-user onboarding command was rejected.');
  } finally {
    clearTimeout(timeout);
  }
}

export async function readSyntheticRunnerState(): Promise<SyntheticRunnerState> {
  const row = record(await runnerGet('/api/runner/state'));
  if (row.ok !== true) throw new Error('Local runner state is unavailable.');
  const resultRow = record(row.result);
  const resultPostId = text(resultRow.postId, 128);
  const mode = runnerMode(row.mode);
  return {
    ok: true,
    mode,
    cohortId: text(row.cohortId, 40),
    activities: Array.isArray(row.activities)
      ? row.activities.map(activity).filter((item): item is SyntheticActivity => item !== null).slice(0, 20)
      : isCohortMode(mode) ? SYNTHETIC_ACTIVITY_FALLBACK[mode] : [],
    enabled: row.enabled === true,
    status: runnerStatus(row.status),
    completed: row.completed === true,
    startedAtMs: integer(row.startedAtMs),
    completedAtMs: integer(row.completedAtMs),
    runId: text(row.runId, 120),
    identity: identity(row.identity),
    result: resultPostId ? {
      postId: resultPostId,
      // The radius scale tops out at the Earth's radius (worldRadius.ts in the clay map).
      radiusMeters: integer(resultRow.radiusMeters, 6_371_000),
      mapVerified: resultRow.mapVerified === true,
      feedEligible: resultRow.feedEligible === true,
      feedVerified: resultRow.feedVerified === true,
      profileChecked: false,
    } : null,
    error: text(row.error, 240),
    actors: Array.isArray(row.actors)
      ? row.actors.map(actor).filter((item): item is SyntheticRunnerActor => item !== null).slice(0, 5)
      : [],
  };
}

export async function readSyntheticRunnerFrames(actorId: string): Promise<SyntheticRunnerFrame[]> {
  const safeActorId = text(actorId, 80);
  if (!safeActorId) return [];
  const row = record(await runnerGet(`/api/runner/frames/${encodeURIComponent(safeActorId)}`));
  if (text(row.actorId, 80) !== safeActorId || !Array.isArray(row.frames)) return [];
  return row.frames
    .map(value => frame(value, safeActorId))
    .filter((item): item is SyntheticRunnerFrame => item !== null)
    .sort((left, right) => right.sequence - left.sequence || right.capturedAtMs - left.capturedAtMs)
    .slice(0, 120);
}

export async function readSyntheticRunnerFrameImage(actorId: string, sequence: number): Promise<Blob> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(syntheticRunnerFrameUrl(actorId, sequence), {
      method: 'GET',
      cache: 'no-store',
      headers: { accept: 'image/jpeg' },
      signal: controller.signal,
    });
    const contentType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
    if (!response.ok || contentType !== 'image/jpeg') throw new Error('Local runner frame is unavailable.');
    const image = await response.blob();
    if (!image.size || image.size > MAX_FRAME_BYTES) throw new Error('Local runner frame is outside the safe size bound.');
    return image;
  } finally {
    clearTimeout(timeout);
  }
}

/** Explicit user action only. Callers must never invoke this from a timer or mount effect. */
export async function setSyntheticRunnerEnabled(enabled: boolean, mode: SyntheticCohortMode = 'five-actor-readonly'): Promise<SyntheticRunnerState> {
  await runnerCommand(enabled, mode);
  return readSyntheticRunnerState();
}

/** Explicit one-shot operator action. It can write only to loopback emulators. */
export async function runFirstUserOnboarding(): Promise<SyntheticRunnerState> {
  await onboardingCommand('first-user-v1');
  return readSyntheticRunnerState();
}

/** Explicit one-shot operator action. It creates one tagged tester and post on
 * Poplur production; both remain live and normal Map/Feed rules decide reach. */
export async function runSharedFirstUserOnboarding(): Promise<SyntheticRunnerState> {
  await onboardingCommand('first-user-shared-v1');
  return readSyntheticRunnerState();
}
