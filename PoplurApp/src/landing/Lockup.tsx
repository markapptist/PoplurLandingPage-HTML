import { useEffect, useRef } from 'react'
import ShaderText from './ShaderText'

// A chapter opener the Apple way: a small eyebrow, a giant headline, air
// around it, revealed as it scrolls into the middle of the screen.
export default function Lockup({ eyebrow, title, sub, id }: { eyebrow: string; title: string; sub?: string; id?: string }) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const io = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) el.classList.add('in') }), { threshold: 0.35 })
    io.observe(el); return () => io.disconnect()
  }, [])
  return <div ref={ref} id={id} className="pl-lockup">
    <div className="pl-eyebrow">{eyebrow}</div>
    <ShaderText as="h2">{title}</ShaderText>
    {sub && <p>{sub}</p>}
  </div>
}
