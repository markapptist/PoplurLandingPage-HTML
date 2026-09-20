import { useEffect, useRef } from 'react'
import type { LandingTheme } from './themes'

// The pre-login welcome, behind the whole page: the theme colour (or its
// art), the welcome's white dot lattice (WelcomeComponents.swift
// DottedMapOverlay: 6 pt dots, 10 pt apart, every seventh bright), and the
// falling clay sprinkles from the web pre-login flow (startAuthConfetti),
// ported with its colours, sizes and physics — only the birth rate is lower,
// because this is a page and not a 214 pt panel.

const SPRINKLE_COLORS = ['#FF2D55', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#AF52DE']

export function Sprinkles({ birthRate = 6 }: { birthRate?: number }) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    type P = { el: HTMLDivElement; age: number; life: number; x: number; y: number; vx: number; vy: number; ax: number; ay: number; rotation: number; rotationSpeed: number; scale: number; alpha: number }
    const particles: P[] = []
    const worldScale = 1
    let last = performance.now(); let carry = 0; let raf = 0
    const place = (p: P) => {
      const t = p.age, x = p.x + p.vx * t + 0.5 * p.ax * t * t, y = p.y + p.vy * t + 0.5 * p.ay * t * t
      const scale = Math.max(0.2, p.scale - 0.03 * t), alpha = Math.max(0, Math.min(1, p.alpha - 0.05 * t))
      p.el.style.transform = `translate3d(${x}px,${y}px,0) rotate(${p.rotation + p.rotationSpeed * t}rad) scale(${scale})`
      p.el.style.opacity = String(alpha)
    }
    const spawn = (prefillAge = 0) => {
      const width = el.clientWidth || 1200, height = el.clientHeight || 800
      const life = 9 + Math.random() * 5
      const speed = (24 + Math.random() * 40) * worldScale, spread = (Math.random() - 0.5) * (Math.PI / 5)
      const d = document.createElement('div'); d.className = 'pl-sprinkle'
      d.style.background = SPRINKLE_COLORS[(Math.random() * SPRINKLE_COLORS.length) | 0]
      el.appendChild(d)
      const p: P = { el: d, age: Math.min(prefillAge, life - 0.001), life, x: -40 + Math.random() * (width + 80), y: prefillAge ? Math.random() * height : -24,
        vx: Math.sin(spread) * speed, vy: Math.cos(spread) * speed, ax: 4 * worldScale, ay: 6 * worldScale,
        rotation: (Math.random() - 0.5) * Math.PI, rotationSpeed: 0.9, scale: 0.6 + Math.random() * 0.5, alpha: 0.9 + Math.random() * 0.2 }
      particles.push(p); place(p)
    }
    const initial = reducedMotion ? 36 : Math.round(birthRate * 8)
    for (let i = 0; i < initial; i++) spawn(Math.random() * 9)
    if (reducedMotion) return () => { particles.forEach(p => p.el.remove()) }
    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now; carry += dt * birthRate
      while (carry >= 1) { spawn(); carry -= 1 }
      for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.age += dt; if (p.age >= p.life) { p.el.remove(); particles.splice(i, 1) } else place(p) }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); particles.forEach(p => p.el.remove()) }
  }, [birthRate])
  return <div ref={ref} className="pl-sprinkles" aria-hidden="true" />
}

// The pre-login's dotted world (poplur-prelogin-flow.html, `wdraw`): the same
// hand-shaped land polygons, the same 9-in-41 dot hash on the same grid, the
// same embossed clay bumps in blue that pulse on a sine and flare white at
// their peak, screen-blended onto the colour. Ported verbatim; only the
// canvas is the page instead of a 390×845 screen — and here the dots do not
// stay put: the same dots travel between formations (the world, radius
// rings, a wave field, a spiral, a scatter, a lattice), holding each for a
// while with a gentle drift, then flowing to the next, staggered from the
// centre out. Under reduced motion they hold the world.
const LAND: [number, number][][] = [
  [[.02,.13],[.08,.08],[.17,.07],[.25,.12],[.31,.20],[.27,.27],[.23,.30],[.21,.38],[.15,.43],[.10,.37],[.06,.34],[.03,.27]],
  [[.20,.04],[.27,.05],[.30,.11],[.27,.17],[.22,.15],[.18,.09]],
  [[.16,.39],[.23,.40],[.29,.47],[.31,.57],[.28,.68],[.25,.79],[.22,.91],[.18,.82],[.16,.70],[.13,.56],[.13,.46]],
  [[.39,.18],[.45,.14],[.53,.16],[.56,.23],[.52,.29],[.46,.28],[.40,.24]],
  [[.40,.28],[.51,.27],[.57,.36],[.56,.49],[.52,.62],[.47,.72],[.42,.62],[.38,.47],[.38,.35]],
  [[.51,.14],[.63,.08],[.76,.08],[.89,.14],[.98,.23],[.95,.33],[.87,.36],[.82,.44],[.73,.42],[.68,.37],[.60,.37],[.54,.30],[.51,.23]],
  [[.61,.34],[.68,.37],[.73,.47],[.80,.52],[.78,.59],[.71,.56],[.66,.49]],
  [[.70,.65],[.80,.60],[.90,.64],[.94,.74],[.87,.83],[.76,.81],[.69,.73]],
  [[.93,.40],[.96,.43],[.95,.50],[.92,.48]],
  [[.58,.69],[.60,.73],[.59,.80],[.57,.77]],
]
const inPoly = (x: number, y: number, p: [number, number][]) => {
  let s = false
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const xi = p[i][0], yi = p[i][1], xj = p[j][0], yj = p[j][1]
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-6) + xi) s = !s
  }
  return s
}

/** Where dot `i` of `n` stands in each formation, for a `w`×`h` canvas. The
 *  world is the land hash itself (built in wrebuild); the rest are shapes the
 *  product talks in — rings for the radius, a wave field, a spiral, a
 *  scatter, a lattice — all deterministic in `i`, so a formation is the same
 *  picture every time it comes round. */
export type Formation = 'world' | 'rings' | 'wave' | 'spiral' | 'scatter' | 'lattice'
export const FORMATIONS: readonly Formation[] = ['world', 'rings', 'wave', 'spiral', 'scatter', 'lattice']
export const HOLD_MS = 9_000
export const TRAVEL_MS = 2_400
const hash01 = (i: number, salt: number) => { const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453; return x - Math.floor(x) }
export function formationPoint(f: Formation, i: number, n: number, w: number, h: number): [number, number] {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.46
  switch (f) {
    case 'rings': {
      const ring = Math.floor(Math.sqrt(i / n) * 6) + 1, r = (ring / 6.5) * R
      const per = Math.max(8, Math.round(n * ((ring * 2 - 1) / 36))), k = i % per, a = (k / per) * Math.PI * 2 + ring * 0.3
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.62]
    }
    case 'wave': {
      const cols = Math.max(12, Math.round(Math.sqrt(n * (w / h)))), rows = Math.ceil(n / cols)
      const c = i % cols, r = Math.floor(i / cols)
      const x = ((c + 0.5) / cols) * w, base = ((r + 0.5) / rows) * h
      return [x, base + Math.sin((c / cols) * Math.PI * 4 + r * 0.6) * (h / rows) * 1.6]
    }
    case 'spiral': {
      const t = i / n, a = t * Math.PI * 9, r = Math.sqrt(t) * R
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.78]
    }
    case 'scatter': return [hash01(i, 1) * w, hash01(i, 2) * h]
    case 'lattice': {
      const cols = Math.max(12, Math.round(Math.sqrt(n * (w / h)))), c = i % cols, r = Math.floor(i / cols)
      return [((c + 0.5) / cols) * w, ((r + 0.5) / Math.ceil(n / cols)) * h]
    }
    default: return [cx, cy]
  }
}
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

export function DottedWorldCanvas() {
  const ref = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const wm = ref.current
    const wctx = wm?.getContext('2d')
    if (!wm || !wctx) return
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)')
    let ww = 0, wh = 0, wraf = 0
    type Dot = { x: number; y: number; hx: number; hy: number; sx: number; sy: number; tx: number; ty: number; delay: number; radius: number; phase: number }
    let wdots: Dot[] = []
    let formation: Formation = 'world'
    let travelAt = 0, holdUntil = 0
    const wc = (x: number, y: number, r: number, f: string) => { wctx.beginPath(); wctx.arc(x, y, r, 0, Math.PI * 2); wctx.fillStyle = f; wctx.fill() }
    // Send every dot to its place in `next`, staggered from the centre out so
    // the change reads as a flow, not a cut.
    const travel = (next: Formation, now: number) => {
      formation = next
      const n = wdots.length, cx = ww / 2, cy = wh / 2, far = Math.hypot(cx, cy) || 1
      wdots.forEach((d, i) => {
        const [tx, ty] = next === 'world' ? [d.hx, d.hy] : formationPoint(next, i, n, ww, wh)
        d.sx = d.x; d.sy = d.y; d.tx = tx; d.ty = ty
        d.delay = (Math.hypot(d.x - cx, d.y - cy) / far) * 700
      })
      travelAt = now; holdUntil = now + TRAVEL_MS + 700 + HOLD_MS
    }
    const wdraw = (now: number) => {
      cancelAnimationFrame(wraf); wctx.clearRect(0, 0, ww, wh)
      const still = rm.matches
      if (!still && now >= holdUntil) {
        const others = FORMATIONS.filter(f => f !== formation)
        travel(others[Math.floor(Math.random() * others.length)], now)
      }
      for (const d of wdots) {
        if (!still) {
          const t = easeInOut(Math.max(0, Math.min(1, (now - travelAt - d.delay) / TRAVEL_MS)))
          // a breath of drift while holding, so the picture is never quite still
          const drift = t >= 1 ? 1 : 0
          d.x = d.sx + (d.tx - d.sx) * t + drift * Math.sin(now / 1700 + d.phase) * 1.6
          d.y = d.sy + (d.ty - d.sy) * t + drift * Math.cos(now / 2100 + d.phase * 1.3) * 1.2
        }
        const pulse = still ? 0.62 : 0.5 + 0.5 * Math.sin(now / 620 + d.phase)
        const radius = d.radius * (0.86 + pulse * 0.28)
        wc(d.x, d.y + 1.3, radius, 'rgba(8,28,110,' + (0.30 + pulse * 0.22) + ')')
        wc(d.x, d.y - 0.8, radius, 'rgba(196,220,255,' + (0.30 + pulse * 0.34) + ')')
        wc(d.x, d.y, radius * 0.94, 'rgba(116,166,255,' + (0.5 + pulse * 0.4) + ')')
        if (!still && pulse > 0.9) {
          const flare = (pulse - 0.9) * 10
          wc(d.x, d.y, radius * 2.4, 'rgba(255,255,255,' + (flare * 0.16) + ')')
          wc(d.x, d.y, radius * 0.8, 'rgba(240,247,255,' + (flare * 0.85) + ')')
        }
      }
      if (!still && !document.hidden) wraf = requestAnimationFrame(wdraw)
    }
    const onVisibility = () => { if (!document.hidden) wdraw(performance.now()) }
    document.addEventListener('visibilitychange', onVisibility)
    const wrebuild = () => {
      const r = wm.getBoundingClientRect(); ww = r.width >= 50 ? r.width : (innerWidth || 390); wh = r.height >= 50 ? r.height : (innerHeight || 845)
      const pr = Math.min(2, devicePixelRatio || 1); wm.width = Math.round(ww * pr); wm.height = Math.round(wh * pr)
      wctx.setTransform(pr, 0, 0, pr, 0, 0)
      const sp = Math.max(6.5, Math.min(10, ww / 52)); wdots = []; let row = 0
      for (let y = sp * 0.5; y < wh; y += sp, row++) { let col = 0
        for (let x = sp * 0.5; x < ww; x += sp, col++) {
          const nx = x / ww, ny = 0.04 + (y / wh) * 0.88
          if (!LAND.some(p => inPoly(nx, ny, p))) continue
          const h = Math.abs(row * 73 + col * 151 + row * col * 19) % 41
          if (h < 9) wdots.push({ x, y, hx: x, hy: y, sx: x, sy: y, tx: x, ty: y, delay: 0, radius: Math.max(1.55, sp * 0.21), phase: (h * 0.77 + row * 0.19 + col * 0.31) % (Math.PI * 2) })
        } }
      // A rebuild (a resize) lands on the world and holds it a while before travelling on.
      formation = 'world'; travelAt = performance.now() - TRAVEL_MS - 1000; holdUntil = performance.now() + HOLD_MS * 0.6
      wdraw(performance.now())
    }
    addEventListener('resize', wrebuild)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(wrebuild) : null
    ro?.observe(wm)
    wrebuild()
    return () => { cancelAnimationFrame(wraf); removeEventListener('resize', wrebuild); document.removeEventListener('visibilitychange', onVisibility); ro?.disconnect() }
  }, [])
  return <canvas ref={ref} className="pl-worldcanvas" aria-hidden="true" />
}

export default function Backdrop({ theme }: { theme: LandingTheme }) {
  return <div className="pl-backdrop" aria-hidden="true">
    {theme.background !== null && <div className="pl-backdrop-art" style={{ backgroundImage: `url(${(theme.background as unknown as { uri?: string })?.uri ?? theme.background})` }} />}
    <DottedWorldCanvas />
    <Sprinkles />
  </div>
}
