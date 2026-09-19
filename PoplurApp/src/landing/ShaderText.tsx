import type { ElementType, ReactNode } from 'react'

// The app's shader text (PostComposer's .filterNameShader, the share sheet's
// recipe): a gradient clipped through the letterforms with a specular band
// across it, so the glyphs read as shiny, not just tinted. Held still — the
// app sweeps it, the page does not (owner's call, 19 Sep) — which also
// spares the per-frame repaint the sweep costs.
export default function ShaderText({ as = 'h2', children, className = '' }: {
  as?: 'h1' | 'h2' | 'h3' | 'span'
  children: ReactNode
  className?: string
}) {
  const Tag = as as ElementType
  return <Tag className={`pl-shader ${className}`.trim()}>{children}</Tag>
}
