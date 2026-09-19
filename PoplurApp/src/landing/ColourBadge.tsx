import { Image } from 'expo-image'
import { useEffect, useRef, useState } from 'react'
import { LANDING_THEMES, type LandingTheme, type LandingThemeId } from './themes'

// The colour badge: a swatch of the current theme in the toolbar; tap it for
// the app's nine profile themes, each shown by its own thumbnail.
export default function ColourBadge({ theme, onChange }: { theme: LandingTheme; onChange: (id: LandingThemeId) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close)
  }, [open])
  return <div ref={ref} className="pl-colour">
    <button type="button" className="pl-badge pl-colour-btn" onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open} aria-label={`Colour: ${theme.name}. Change theme`}>
      <i className="pl-swatch" style={{ background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent2})` }} />
      <span>{theme.name}</span>
    </button>
    {open && <div className="pl-colour-menu" role="listbox" aria-label="Themes">
      {LANDING_THEMES.map(t => <button key={t.id} type="button" role="option" aria-selected={t.id === theme.id} className={`pl-colour-item${t.id === theme.id ? ' is-current' : ''}`}
        onClick={() => { onChange(t.id); setOpen(false) }}>
        {t.thumb !== null ? <Image source={t.thumb} style={{ width: 36, height: 36, borderRadius: 10 }} contentFit="cover" />
          : <i className="pl-swatch big" style={{ background: `linear-gradient(135deg, ${t.accent}, ${t.accent2})` }} />}
        <span>{t.name}</span>
      </button>)}
    </div>}
  </div>
}
