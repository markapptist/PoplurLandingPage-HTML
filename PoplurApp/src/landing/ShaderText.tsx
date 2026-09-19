import { useEffect, useRef, type ElementType, type ReactNode } from 'react'
import { reducedMotion } from './scroll'

// The app's shader text (PostComposer's .filterNameShader, the share sheet's
// recipe): a slow gradient sweep clipped through the letterforms, with a
// specular band riding over it so the glyphs read as shiny, not just tinted.
// The sweep animates background-position, which repaints every frame, so it
// only runs while the heading is on screen — off screen (and under reduced
// motion) it holds the still frame.
export default function ShaderText({ as = 'h2', children, className = '' }: {
  as?: 'h1' | 'h2' | 'h3' | 'span'
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || reducedMotion() || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(entries => entries.forEach(e => el.classList.toggle('is-live', e.isIntersecting)), { threshold: 0.05 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  const Tag = as as ElementType
  return <Tag ref={ref} className={`pl-shader ${className}`.trim()}>{children}</Tag>
}
