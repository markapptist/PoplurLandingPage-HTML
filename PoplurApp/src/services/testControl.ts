import { auth } from './firebase';

const ENDPOINT = 'https://us-central1-poplur2025.cloudfunctions.net/testActivityControl';

/** Display convenience only. The server repeats this check before it returns a
 * dashboard, so changing client code cannot grant access. */
export const TEST_CONTROL_ADMIN_UIDS = new Set([
  'LiEG6SNtKEZN6eEGeybf0afZnHm1',
  'eoP2Z0ElxIa0Eua7xpFxNlr6tur1',
]);

export type TestActivityRow = {
  id: string;
  label: string;
  screen: string;
  platform: 'native' | 'browser';
  appVersion: string;
  status: 'foreground' | 'background';
  lastActivityAtMs: number;
  state: 'active' | 'away';
};

export type BetaPostRow = {
  id: string;
  label: string;
  place: string;
  postedAtMs: number;
  updatedAtMs: number;
  initialRadiusKm: number;
  radiusKm: number;
  radiusDeltaKm: number;
  viralScore: number;
  viralPerHour: number;
};

export type BetaMapCell = {
  place: string;
  events: number;
  realEvents?: number;
  syntheticEvents?: number;
  latestAtMs: number;
  peakRadiusKm: number;
  velocity: number;
};

export type BetaSimulationEvent = {
  id: string;
  eventId?: string;
  actorId?: string;
  actor: string;
  kind: 'posted' | 'like' | 'view' | 'comment' | 'radius-up' | 'radius-down';
  place: string;
  screen?: string;
  source?: 'synthetic';
  cohortId?: 'beta-sim-v1';
  radiusKm: number;
  eventAtMs: number;
};

export type BetaSyntheticProfile = {
  id: string;
  label: string;
  handle: string;
  persona: string;
  place: string;
  screen: string;
  status: 'live' | 'paused';
  finding: string;
  liked: string;
  improve: string;
  avatarTile: string;
  source: 'synthetic';
  cohortId: 'beta-sim-v1';
};

export type BetaFeedback = {
  id: string;
  label: string;
  finding: string;
  liked: string;
  improve: string;
  createdAtMs: number;
};

export type BetaDashboardCounts = {
  realTesters: number;
  realPosts: number;
  syntheticPersonas: number;
  syntheticEvents: number;
};

export type BetaDashboard = {
  generatedAtMs: number;
  rows: TestActivityRow[];
  posts: BetaPostRow[];
  map: BetaMapCell[];
  simulation: BetaSimulationEvent[];
  syntheticProfiles: BetaSyntheticProfile[];
  simulationEnabled: boolean;
  counts: BetaDashboardCounts;
  feedback: BetaFeedback[];
};

const dashboardCounts = (result: Partial<BetaDashboard>): BetaDashboardCounts => ({
  realTesters: Number(result.counts?.realTesters) || 0,
  realPosts: Number(result.counts?.realPosts) || 0,
  syntheticPersonas: Number(result.counts?.syntheticPersonas) || 0,
  syntheticEvents: Number(result.counts?.syntheticEvents) || 0,
});

type CallableBody<T> = { result?: T; error?: { message?: string } };
const OWNER_PROXY = 'http://127.0.0.1:8096/api/control';

async function call<T>(data: Record<string, unknown>): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to use Test Control Center.');
  const token = await user.getIdToken();
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ data }),
  });
  const body = await response.json().catch(() => ({})) as CallableBody<T>;
  if (!response.ok || body.error) throw new Error(body.error?.message || 'Test Control Center is unavailable.');
  if (!body.result) throw new Error('Test Control Center returned no result.');
  return body.result;
}

/** The local-only owner proxy holds the credential outside the browser bundle. */
async function ownerCall<T>(data: Record<string, unknown>): Promise<T> {
  const response = await fetch(OWNER_PROXY, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data }),
  });
  const body = await response.json().catch(() => ({})) as CallableBody<T>;
  if (!response.ok || body.error || !body.result) {
    throw new Error(body.error?.message || 'The local beta desk connection is unavailable.');
  }
  return body.result;
}

export async function readActivityConsent(): Promise<boolean> {
  const result = await call<{ enabled?: boolean }>({ action: 'getConsent' });
  return result.enabled === true;
}

export async function writeActivityConsent(enabled: boolean): Promise<boolean> {
  const result = await call<{ enabled?: boolean }>({ action: 'setConsent', enabled });
  return result.enabled === true;
}

export async function readActivityDashboard(): Promise<BetaDashboard> {
  const result = await call<Partial<BetaDashboard>>({ action: 'dashboard' });
  return {
    generatedAtMs: Number(result.generatedAtMs) || Date.now(),
    rows: Array.isArray(result.rows) ? result.rows : [],
    posts: Array.isArray(result.posts) ? result.posts : [],
    map: Array.isArray(result.map) ? result.map : [],
    simulation: Array.isArray(result.simulation) ? result.simulation : [],
    syntheticProfiles: Array.isArray(result.syntheticProfiles) ? result.syntheticProfiles : [],
    simulationEnabled: result.simulationEnabled === true,
    counts: dashboardCounts(result),
    feedback: Array.isArray(result.feedback) ? result.feedback : [],
  };
}

export async function readOwnerDashboard(): Promise<BetaDashboard> {
  const result = await ownerCall<Partial<BetaDashboard>>({ action: 'dashboard' });
  return {
    generatedAtMs: Number(result.generatedAtMs) || Date.now(),
    rows: Array.isArray(result.rows) ? result.rows : [],
    posts: Array.isArray(result.posts) ? result.posts : [],
    map: Array.isArray(result.map) ? result.map : [],
    simulation: Array.isArray(result.simulation) ? result.simulation : [],
    syntheticProfiles: Array.isArray(result.syntheticProfiles) ? result.syntheticProfiles : [],
    simulationEnabled: result.simulationEnabled === true,
    counts: dashboardCounts(result),
    feedback: Array.isArray(result.feedback) ? result.feedback : [],
  };
}

export async function setSimulationEnabled(enabled: boolean): Promise<boolean> {
  const result = await call<{ enabled?: boolean }>({ action: 'simulation', enabled });
  return result.enabled === true;
}

export async function setOwnerSimulationEnabled(enabled: boolean): Promise<boolean> {
  const result = await ownerCall<{ enabled?: boolean }>({ action: 'simulation', enabled });
  return result.enabled === true;
}

export async function stepOwnerSimulation(): Promise<{ enabled: boolean }> {
  return ownerCall<{ enabled: boolean }>({ action: 'simulationStep' });
}

export async function submitBetaFeedback(input: { finding: string; liked: string; improve: string }): Promise<void> {
  await call<{ accepted?: boolean }>({ action: 'feedback', ...input });
}
