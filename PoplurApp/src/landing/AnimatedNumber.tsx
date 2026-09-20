import { useEffect, useRef, useState } from 'react'
import { playCounterDone, playCounterTick } from './counterSound'
import { reducedMotion } from './scroll'

// A number that counts to its value the way the app's RADIUS card does
// (HomeTwin's AnimatedPostCount): 720 ms, eased 1 − (1 − t)^2.35, a counter
// pip every frame rising with progress, the two-pip chime when it lands.
// Counts from wherever it was to wherever it goes, so a scorecard that moves
// from 3 to 5 rolls 3 → 5, and one arriving from nothing rolls up from 0.
// Under reduced motion it simply changes.

export const COUNT_MS = 720
export const easeCount = (raw: number) => 1 - Math.pow(1 - raw, 2.35)

export default function AnimatedNumber({ value, format = n => Math.round(n).toLocaleString(), className = '' }: {
  value: number
  format?: (n: number) => string
  className?: string
}) {
  const [shown, setShown] = useState(value)
  const [counting, setCounting] = useState(false)
  const from = useRef(value)
  const target = useRef(value)
  useEffect(() => {
    if (value === target.current && shown === value) return
    from.current = shown
    target.current = value
    if (reducedMotion() || typeof requestAnimationFrame === 'undefined') { setShown(value); return }
    setCounting(true)
    const started = performance.now()
    let raf = 0
    const frame = (now: number) => {
      const raw = Math.max(0, Math.min(1, (now - started) / COUNT_MS))
      const eased = easeCount(raw)
      setShown(from.current + (target.current - from.current) * eased)
      playCounterTick(eased)
      if (raw < 1) raf = requestAnimationFrame(frame)
      else { setShown(target.current); setCounting(false); playCounterDone() }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
    // `shown` is the count's own state; only a new `value` should restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return <span className={`pl-count${counting ? ' is-counting' : ''} ${className}`.trim()} data-counter-value={format(shown)}>{format(shown)}</span>
}
