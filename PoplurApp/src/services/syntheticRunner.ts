const RUNNER_ORIGIN = 'http://127.0.0.1:8096';
const REQUEST_TIMEOUT_MS = 4_000;
const COMMAND_TIMEOUT_MS = 6 * 60 * 1_000;
const MAX_FRAME_BYTES = 8 * 1024 * 1024;

export type SyntheticRunnerStatus = 'offline' | 'paused' | 'starting' | 'live' | 'error';

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
};

export type SyntheticRunnerState = {
  ok: true;
  enabled: boolean;
  status: SyntheticRunnerStatus;
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
  return status === 'paused' || status === 'starting' || status === 'live' || status === 'error'
    ? status
    : 'offline';
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

async function runnerCommand(enabled: boolean): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), COMMAND_TIMEOUT_MS);
  try {
    const response = await fetch(`${RUNNER_ORIGIN}/api/runner/command`, {
      method: 'POST',
      cache: 'no-store',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ enabled }),
      signal: controller.signal,
    });
    const body = record(await response.json().catch(() => ({})));
    if (!response.ok || body.ok !== true) throw new Error('Local runner command was rejected.');
  } finally {
    clearTimeout(timeout);
  }
}

export async function readSyntheticRunnerState(): Promise<SyntheticRunnerState> {
  const row = record(await runnerGet('/api/runner/state'));
  if (row.ok !== true) throw new Error('Local runner state is unavailable.');
  return {
    ok: true,
    enabled: row.enabled === true,
    status: runnerStatus(row.status),
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
export async function setSyntheticRunnerEnabled(enabled: boolean): Promise<SyntheticRunnerState> {
  await runnerCommand(enabled);
  return readSyntheticRunnerState();
}
