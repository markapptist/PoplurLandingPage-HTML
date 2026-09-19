// One rAF-throttled scroll loop for every scroll-linked effect on the page —
// the Apple product-page grammar: things scale, tilt and fade with the scroll
// position, not on a timer.
type Frame = (scrollY: number, viewportH: number) => void
const frames = new Set<Frame>()
let raf = 0
let armed = false
function pump() {
  raf = 0
  const y = window.scrollY, h = window.innerHeight
  frames.forEach(f => f(y, h))
}
function schedule() { if (!raf) raf = requestAnimationFrame(pump) }
export function onScrollFrame(frame: Frame): () => void {
  frames.add(frame)
  if (!armed && typeof window !== 'undefined') {
    armed = true
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
  }
  schedule()
  return () => { frames.delete(frame) }
}
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
/** 0 when `el`'s top reaches `from` (fraction of viewport height), 1 when it reaches `to`. */
export function progressOf(el: Element, from: number, to: number, viewportH: number): number {
  const r = el.getBoundingClientRect()
  const start = viewportH * from, end = viewportH * to
  return clamp01((start - r.top) / (start - end))
}
/** A bell around the point where the element's centre crosses the viewport centre. */
export function centreBell(el: Element, viewportH: number, halfWidth = 0.32): number {
  const r = el.getBoundingClientRect()
  const d = Math.abs((r.top + r.height / 2) - viewportH / 2) / (viewportH * halfWidth)
  return clamp01(1 - d)
}
export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
