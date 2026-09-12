import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
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

/** The selected tab is the URL — `/test-control?tab=testers` — like a site
 *  (spec §0): reload lands on the same tab and browser back/forward walk the
 *  tabs. Unknown or absent → `fallback`.
 *
 *  Why the history entry is pushed by hand: expo-router's linking layer maps a
 *  same-route param change to `replaceState` (fork/useLinking.js, the
 *  historyDelta === 0 branch), so `router.setParams` alone would leave nothing
 *  for back to return to, while a `router.push` would mount a second copy of
 *  the route under a new key (react-navigation/core/useDescriptors.js keys the
 *  screen by route.key) and drop the live stream, the drill-down and the pop
 *  cache with it. So: push a browser entry that keeps the router's own history
 *  id (its in-memory index stays consistent), then `setParams` — the router
 *  replaces the entry it thinks it is on, which is now the pushed one. A tab
 *  popstate is handled by the module's one capture listener (above) and
 *  stopped before the router's listener would reset the root to a re-parsed
 *  state (a new route key again); a popstate that leaves the route is left to
 *  the router. */
export function useUrlTab<Id extends string>(ids: readonly Id[], fallback: Id): [Id, (id: Id) => void] {
  const params = useLocalSearchParams<{ tab?: string | string[] }>();
  const router = useRouter();
  const raw = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const tab = raw !== undefined && (ids as readonly string[]).includes(raw) ? raw as Id : fallback;
  const select = useCallback((next: Id) => {
    if (next === tab) return;
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', next);
      window.history.pushState(window.history.state, '', url);
    }
    router.setParams({ tab: next });
  }, [router, tab]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const pathname = window.location.pathname;
    const onPopState = (event: PopStateEvent) => {
      if (window.location.pathname !== pathname) return;             // leaving the route: the router's turn
      event.stopImmediatePropagation();
      const next = new URL(window.location.href).searchParams.get('tab');
      router.setParams({ tab: next !== null && (ids as readonly string[]).includes(next) ? next : fallback });
    };
    currentPopState = onPopState;
    return () => { if (currentPopState === onPopState) currentPopState = null; };
  }, [router, ids, fallback]);
  return [tab, select];
}

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
