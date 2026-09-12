import { useCallback, useSyncExternalStore } from 'react';

const KEY = 'poplur.testCenter.panels.v1';
const DEFAULTS = { sim: false, lab: false, diag: false, showSimRows: false, catalogue: false, analytics: false } as const;
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

/** Collapse and switch state for the page's folds, persisted in one
 *  localStorage key. `ready` is false during the server render and the
 *  hydration render (both use DEFAULTS) and true once the stored record is
 *  the snapshot, so a subscription that depends on a fold being closed can
 *  wait for the real value (spec §4.5). */
export function useDeskPanels() {
  const open = useSyncExternalStore(subscribe, readPanels, serverPanels);        // server HTML + hydration render: DEFAULTS; then the stored record
  const ready = useSyncExternalStore(noopSubscribe, () => true, () => false);    // the use-color-scheme.web.ts gate: false until the client snapshot is in
  const set = useCallback((id: PanelKey, value: boolean) => writePanels({ ...readPanels(), [id]: value }), []);
  const toggle = useCallback((id: PanelKey) => set(id, !readPanels()[id]), [set]);
  return { open, ready, set, toggle };
}
