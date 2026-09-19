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

export default function Backdrop({ theme }: { theme: LandingTheme }) {
  return <div className="pl-backdrop" aria-hidden="true">
    {theme.background !== null && <div className="pl-backdrop-art" style={{ backgroundImage: `url(${(theme.background as unknown as { uri?: string })?.uri ?? theme.background})` }} />}
    <div className="pl-dotmap" />
    <Sprinkles />
  </div>
}
