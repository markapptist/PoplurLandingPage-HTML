import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { subscribeRadiusLab, type RadiusLabLink, type RadiusLabState } from '@/services/radiusLab';
import { readSyntheticRunnerState, type SyntheticRunnerState } from '@/services/syntheticRunner';

const KEY = 'poplur.testCenter.panels.v1';
// Only the SIM-rows switch and the two Simulation sub-panels persist here. The
// selected tab is the URL (`?tab=`), never storage — owner decision 12 Sep,
// spec §0 — so there are no fold keys for the operator tools.
const DEFAULTS = { showSimRows: false, catalogue: false, analytics: false } as const;
export type PanelKey = keyof typeof DEFAULTS;
type Panels = Record<PanelKey, boolean>;

// Module-level store: one cached snapshot, one listener set. Filled lazily on
// the first client read. Storage is read here and never in a useState
// initialiser or an effect: `web.output: "server"` means the first render can
// be server-side, and useSyncExternalStore is the one form that keeps the
// server HTML and the hydration render agreeing (spec §4.2, the precedent is
// src/hooks/use-color-scheme.web.ts).
let cache: Panels | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const readPanels = (): Panels => {
  if (cache) return cache;
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Record<string, unknown>>) : {};
    cache = { ...DEFAULTS, ...Object.fromEntries(Object.entries(parsed).filter(([k, v]) => k in DEFAULTS && typeof v === 'boolean')) } as Panels;
  } catch { cache = { ...DEFAULTS }; }                 // storage unavailable or malformed: defaults
  return cache;
};
const writePanels = (next: Panels) => {
  cache = next;
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  listeners.forEach(listener => listener());
};
const serverPanels = (): Panels => DEFAULTS;
const noopSubscribe = () => () => {};

/** The SIM-rows switch and the Simulation sub-panel state, persisted in one
 *  localStorage key. `ready` is false during the server render and the
 *  hydration render (both use DEFAULTS) and true once the stored record is
 *  the snapshot, so anything that must not act on a default it will
 *  immediately contradict can wait for the real value (spec §4.5). */
export function useDeskPanels() {
  const open = useSyncExternalStore(subscribe, readPanels, serverPanels);        // server HTML + hydration render: DEFAULTS; then the stored record
  const ready = useSyncExternalStore(noopSubscribe, () => true, () => false);    // the use-color-scheme.web.ts gate: false until the client snapshot is in
  const set = useCallback((id: PanelKey, value: boolean) => writePanels({ ...readPanels(), [id]: value }), []);
  const toggle = useCallback((id: PanelKey) => set(id, !readPanels()[id]), [set]);
  return { open, ready, set, toggle };
}

/** The tab hook's popstate listener: one, module-level, registered when this
 *  module is evaluated and never removed. It has to precede the router's
 *  (expo-router fork/createMemoryHistory.js `listen`, added by the container's
 *  effect) because Chrome runs window listeners in registration order — the
 *  capture flag does not reorder them at the target — and only the first can
 *  stop the rest. A listener added by the hook's own effect wins on the first
 *  load only (a child's effect commits before its parent's); after any remount
 *  of the route — `Open full page →` and back — it would be registered after
 *  the router's, which would then reset the root on every tab back/forward:
 *  the route remounts, the stream reconnects, the expanded tester, the pop
 *  cache and the open ledger are lost. Route modules evaluate before any
 *  effect commits (sync import mode: at store init in development, during the
 *  first screen render in production), so this listener is first for the life
 *  of the page. The hook only points `currentPopState` at its handler. */
let currentPopState: ((event: PopStateEvent) => void) | null = null;
if (typeof window !== 'undefined') window.addEventListener('popstate', event => currentPopState?.(event), true);

/** One URL key's guard: the raw query value is kept only when it passes. */
export type UrlValidator = (raw: string) => boolean;
type UrlPatch<K extends string> = Partial<Record<K, string | null>>;
type UrlState<K extends string> = Record<K, string | null>;

/** Reads every `key` from a URL's query: an absent or rejected value is the
 *  key's fallback (null when none). Pure — the popstate handler, the render
 *  and the tests share it. */
export function parseUrlState<K extends string>(url: URL | string, keys: readonly K[], validators: Partial<Record<K, UrlValidator>> = {}, fallbacks: Partial<Record<K, string>> = {}): UrlState<K> {
  const params = (typeof url === 'string' ? new URL(url, 'http://localhost') : url).searchParams;
  const out = {} as UrlState<K>;
  for (const key of keys) {
    const raw = params.get(key);
    const validator = validators[key];
    out[key] = raw !== null && (!validator || validator(raw)) ? raw : fallbacks[key] ?? null;
  }
  return out;
}

/** The URL a patch produces: a string sets its key, null deletes it, every
 *  other key stays. Pure; never touches `window`. */
export function nextUrl(url: URL | string, patch: Record<string, string | null | undefined>): URL {
  const next = new URL(typeof url === 'string' ? url : url.href, 'http://localhost');
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined) next.searchParams.delete(key);
    else next.searchParams.set(key, value);
  }
  return next;
}

/** Route state that IS the URL — `/test-control?tab=reports&day=A&vs=B` —
 *  like a site (spec §0, reports §3.2): reload lands on the same view and
 *  browser back/forward walk every key. A key whose value is absent or
 *  rejected by its validator reads as its fallback (null when none).
 *
 *  Why the history entry is pushed by hand: expo-router's linking layer maps a
 *  same-route param change to `replaceState` (fork/useLinking.js, the
 *  historyDelta === 0 branch), so `router.setParams` alone would leave nothing
 *  for back to return to, while a `router.push` would mount a second copy of
 *  the route under a new key (react-navigation/core/useDescriptors.js keys the
 *  screen by route.key) and drop the live stream, the drill-down and the pop
 *  cache with it. So: push a browser entry that keeps the router's own history
 *  id (its in-memory index stays consistent), then `setParams` — the router
 *  replaces the entry it thinks it is on, which is now the pushed one. A
 *  popstate is handled by the module's one capture listener (above) and
 *  stopped before the router's listener would reset the root to a re-parsed
 *  state (a new route key again); it re-applies EVERY key from the URL, so
 *  back never leaves `day`/`vs` stale; a popstate that leaves the route is
 *  left to the router. `setParams` deletes a key by setting it undefined:
 *  the router merges params and query-string drops undefined values. */
export function useUrlState<K extends string>(keys: readonly K[], validators: Partial<Record<K, UrlValidator>> = {}, fallbacks: Partial<Record<K, string>> = {}): [UrlState<K>, (patch: UrlPatch<K>) => void] {
  const params = useLocalSearchParams() as Record<string, string | string[] | undefined>;
  const router = useRouter();
  // The router's params are re-read per render; the state object is rebuilt
  // only when a value changes, so `select` compares by value and a same-value
  // patch (pressing the selected tab) pushes nothing.
  const serialized = keys.map(key => {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    const validator = validators[key];
    return `${key}=${encodeURIComponent((value !== undefined && (!validator || validator(value)) ? value : fallbacks[key] ?? null) ?? '')}`;
  }).join('&');
  const state = useMemo(() => Object.fromEntries(serialized.split('&').map(pair => {
    const at = pair.indexOf('=');
    return [pair.slice(0, at), pair.length > at + 1 ? decodeURIComponent(pair.slice(at + 1)) : null];
  })) as UrlState<K>, [serialized]);
  const select = useCallback((patch: UrlPatch<K>) => {
    const changed = (Object.keys(patch) as K[]).filter(key => (patch[key] ?? null) !== state[key]);
    if (!changed.length) return;
    const routerPatch: Record<string, string | undefined> = {};
    for (const key of changed) routerPatch[key] = patch[key] ?? undefined;
    if (typeof window !== 'undefined') window.history.pushState(window.history.state, '', nextUrl(window.location.href, routerPatch));
    router.setParams(routerPatch);
  }, [router, state]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const pathname = window.location.pathname;
    const onPopState = (event: PopStateEvent) => {
      if (window.location.pathname !== pathname) return;             // leaving the route: the router's turn
      event.stopImmediatePropagation();
      const restored = parseUrlState(new URL(window.location.href), keys, validators, fallbacks);
      const routerPatch: Record<string, string | undefined> = {};
      for (const key of keys) routerPatch[key] = restored[key] ?? undefined;
      router.setParams(routerPatch);
    };
    currentPopState = onPopState;
    return () => { if (currentPopState === onPopState) currentPopState = null; };
    // `keys`, `validators` and `fallbacks` are module constants at every call site; the handler reads them by closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);
  return [state, select];
}

/** The selected tab alone: `useUrlState(['tab'])` with the id list as its
 *  validator. Unknown or absent → `fallback`. */
export function useUrlTab<Id extends string>(ids: readonly Id[], fallback: Id): [Id, (id: Id) => void] {
  const [state, select] = useUrlState(TAB_KEYS, { tab: raw => (ids as readonly string[]).includes(raw) }, { tab: fallback });
  const tab = state.tab as Id;
  const selectTab = useCallback((next: Id) => select({ tab: next }), [select]);
  return [tab, selectTab];
}
const TAB_KEYS = ['tab'] as const;

const RUNNER_REFRESH_MS = 2_500;
const pageIsVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';

/** The local runner's 2.5 s state poll, lifted to the route so the
 *  Simulation tab's caption and the Today status line read it while the
 *  tab is not mounted (spec §4.4). Loopback only (`/api/runner/state`); the
 *  frame poll stays inside the Simulation body and stops with it. `apply` and
 *  `fail` are the monitor's setter sites once its controls move here. Every
 *  write happens in a promise callback, never in the effect body. */
export function useSyntheticRunnerState() {
  const [state, setState] = useState<SyntheticRunnerState | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (delay = RUNNER_REFRESH_MS) => { if (!cancelled) timer = setTimeout(read, delay); };
    const read = async () => {
      if (cancelled) return;
      if (!pageIsVisible()) { schedule(); return; }
      try {
        const next = await readSyntheticRunnerState();
        if (!cancelled) { setState(next); setError(null); }
      } catch {
        if (!cancelled) { setState(null); setError('The local session runner is offline.'); }
      } finally { schedule(); }
    };
    const onVisibility = () => { if (pageIsVisible()) { if (timer) clearTimeout(timer); schedule(0); } };
    schedule(0);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
    return () => { cancelled = true; if (timer) clearTimeout(timer); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility); };
  }, []);
  const apply = useCallback((next: SyntheticRunnerState, message: string | null = null) => { setState(next); setError(message); }, []);
  const fail = useCallback((message: string) => setError(message), []);
  return { state, error, apply, fail };
}

/** The Radius Lab's pin and cohort for its tab caption, as a subscription
 *  (one connect-time read, then the server's own pushes — spec decision 5),
 *  active only while the Lab tab is NOT selected: on that tab the widget's
 *  own subscription is authoritative, so there is one 8098 EventSource at
 *  any time (spec §4.5). */
export function useRadiusLabSummary(active: boolean) {
  const [state, setState] = useState<RadiusLabState | null>(null);
  const [link, setLink] = useState<RadiusLabLink>('connecting');
  useEffect(() => { if (!active) return; return subscribeRadiusLab(setState, setLink); }, [active]);
  return { state, link };
}
