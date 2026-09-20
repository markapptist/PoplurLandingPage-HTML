import { useEffect, useState } from 'react'
import type { Scorecard, ScorecardSignal, Verdict } from './useBetaScorecard'
import type { LivePop } from './useLivePops'

// Demo mode — `?demo=1` — for seeing the live cards move before there is a
// beta to move them: a scripted scorecard whose numbers climb every few
// seconds and scripted pops landing on the world, through exactly the
// components the real data drives, so the count animation, the counter pips,
// the arrival ripples and the pop are exercised end to end. Both cards say
// "demo" while it is on; nothing here ever touches the published scorecard,
// which counts people only.

export const DEMO_STEP_MS = 3_200
export const DEMO_POP_MS = 5_500
export const DEMO_POPS_KEPT = 80
const DEMO_WINDOW_START = Date.UTC(2026, 8, 16, 4)

export function isDemoMode(): boolean {
  if (typeof window === 'undefined') return false
  try { return new URLSearchParams(window.location.search).get('demo') === '1' } catch { return false }
}

export function useDemoMode(): boolean {
  const [demo, setDemo] = useState(false)
  useEffect(() => { setDemo(isDemoMode()) }, [])
  return demo
}

/** The same six signals the beta function publishes, empty. */
export function emptyDemoScorecard(now = Date.now()): Scorecard {
  const signal = (key: string, label: string, note: string): ScorecardSignal => ({ key, label, note, count: 0, of: 0, share: null, verdict: 'pending' })
  return {
    version: 1, updatedAtMillis: now,
    window: { startMillis: DEMO_WINDOW_START, endMillis: null, days: Math.max(1, Math.round((now - DEMO_WINDOW_START) / 86_400_000)) },
    installs: 0,
    signals: [
      signal('posted24h', 'Posted within 24 h', 'a pop within a day of the account'),
      signal('day7', 'Active on day 7', 'of accounts whose day 7 has passed'),
      signal('day14', 'Active on day 14', 'of accounts whose day 14 has passed'),
      signal('grew', 'Engaged pops that grew', "reach rose after a classmate's like"),
      signal('radius', 'Found by radius', 'feed or map, not a profile visit'),
      signal('unprompted', 'Pops on days with no prompt', 'posted without being asked'),
    ],
    loop: { engagedPops: 0, grewPops: 0, repostRateGrew: null, repostRateNotGrew: null, ratio: null },
    discovery: { interception: 0, profile: 0, other: 0 },
    organic: { referralInstalls: 0, offPromptPops: 0, humanPops: 0, promptDays: 0 },
    activity: { activeLast7d: 0, humanPops: 0, humanEngagements: 0 },
    integrity: { overClaimedPops: 0, ladderPops: 0, replacedPops: 0 },
  }
}

const verdictFor = (count: number, of: number): Verdict => (of === 0 ? 'pending' : count / of >= 0.6 ? 'good' : count / of >= 0.35 ? 'mid' : 'weak')
const bump = (signal: ScorecardSignal, of: number, count: number): ScorecardSignal => {
  const c = Math.min(of, count)
  return { ...signal, of, count: c, share: of ? c / of : null, verdict: verdictFor(c, of) }
}

/** One beat of the demo: a couple of people join, some of them post, the
 *  signals fill in behind them. Pure — `rng` in [0, 1). */
export function advanceDemoScorecard(card: Scorecard, rng: () => number = Math.random, now = Date.now()): Scorecard {
  const joined = 1 + Math.floor(rng() * 2)
  const installs = card.installs + joined
  const humanPops = card.activity.humanPops + 1 + Math.floor(rng() * 3)
  const activeLast7d = Math.min(installs, card.activity.activeLast7d + Math.floor(rng() * 2) + (joined > 1 ? 1 : 0))
  const engaged = card.loop.engagedPops + (rng() < 0.7 ? 1 : 0)
  const grew = Math.min(engaged, card.loop.grewPops + (rng() < 0.55 ? 1 : 0))
  const s = card.signals
  const signals = [
    bump(s[0], installs, s[0].count + (rng() < 0.75 ? joined : joined - 1)),
    bump(s[1], Math.max(0, installs - 3), s[1].count + (rng() < 0.6 ? 1 : 0)),
    bump(s[2], Math.max(0, installs - 8), s[2].count + (rng() < 0.45 ? 1 : 0)),
    bump(s[3], engaged, grew),
    bump(s[4], humanPops, s[4].count + (rng() < 0.65 ? 1 : 0) + (rng() < 0.3 ? 1 : 0)),
    bump(s[5], humanPops, s[5].count + (rng() < 0.5 ? 1 : 0)),
  ]
  return {
    ...card, updatedAtMillis: now, installs, signals,
    loop: { ...card.loop, engagedPops: engaged, grewPops: grew, ratio: engaged ? grew / engaged : null },
    discovery: { ...card.discovery, interception: signals[4].count, profile: Math.max(0, humanPops - signals[4].count) },
    organic: { ...card.organic, humanPops, offPromptPops: signals[5].count, referralInstalls: card.organic.referralInstalls + (rng() < 0.25 ? 1 : 0) },
    activity: { activeLast7d, humanPops, humanEngagements: card.activity.humanEngagements + 1 + Math.floor(rng() * 4) },
  }
}

export function useDemoScorecard(on: boolean): Scorecard | null {
  const [card, setCard] = useState<Scorecard | null>(null)
  useEffect(() => {
    if (!on) { setCard(null); return }
    setCard(emptyDemoScorecard())
    const tick = setInterval(() => setCard(current => advanceDemoScorecard(current ?? emptyDemoScorecard())), DEMO_STEP_MS)
    return () => clearInterval(tick)
  }, [on])
  return card
}

// Where demo pops land: the beta's city first, then a few places the world
// card already knows how to label.
const DEMO_PLACES = [
  { lat: 43.65, lng: -79.38, spread: 0.35, weight: 6 },
  { lat: 49.28, lng: -123.12, spread: 0.3, weight: 1 },
  { lat: 45.5, lng: -73.57, spread: 0.3, weight: 1 },
  { lat: 40.71, lng: -74.01, spread: 0.4, weight: 1 },
  { lat: 51.51, lng: -0.13, spread: 0.3, weight: 1 },
]

/** One scripted pop, somewhere a person might be. Pure. */
export function demoPop(seq: number, rng: () => number = Math.random, now = Date.now()): LivePop {
  const total = DEMO_PLACES.reduce((n, p) => n + p.weight, 0)
  let pick = rng() * total
  let place = DEMO_PLACES[0]
  for (const p of DEMO_PLACES) { pick -= p.weight; if (pick <= 0) { place = p; break } }
  return {
    id: `demo-${seq}`,
    latitude: place.lat + (rng() - 0.5) * 2 * place.spread,
    longitude: place.lng + (rng() - 0.5) * 2 * place.spread,
    radiusKm: 5 + Math.round(rng() * rng() * 60),
    createdAtMillis: now,
    synthetic: false,
  }
}

export function useDemoPops(on: boolean): LivePop[] {
  const [pops, setPops] = useState<LivePop[]>([])
  useEffect(() => {
    if (!on) { setPops([]); return }
    let seq = 0
    const land = () => setPops(current => [demoPop(seq++), ...current].slice(0, DEMO_POPS_KEPT))
    land()
    const tick = setInterval(land, DEMO_POP_MS)
    return () => clearInterval(tick)
  }, [on])
  return pops
}
