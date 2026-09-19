import { useEffect, useRef, useState } from 'react'

// The pre-login welcome's live radio, verbatim in behaviour: the nearest
// popular stations to Toronto from Radio Browser, by clickcount, tried in turn
// until one plays; never any fuzz. Starts on the first tap (autoplay policy),
// then a speaker badge toggles it.

const SEARCH = 'https://de1.api.radio-browser.info/json/stations/search?geo_lat=43.6532&geo_long=-79.3832&geo_distance=90000&hidebroken=true&order=clickcount&reverse=true&limit=16'
type Station = { name?: string; url?: string; url_resolved?: string }

export default function RadioBadge() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [state, setState] = useState<'off' | 'tuning' | 'on' | 'failed'>('off')
  const [station, setStation] = useState<string>('')
  const stations = useRef<Station[]>([]); const idx = useRef(0); const tuned = useRef(false)

  useEffect(() => {
    const live = document.createElement('audio')
    live.crossOrigin = 'anonymous'; live.preload = 'none'; live.setAttribute('aria-hidden', 'true')
    document.body.appendChild(live); audioRef.current = live
    return () => { live.pause(); live.remove(); audioRef.current = null }
  }, [])

  const tryNext = () => {
    const live = audioRef.current
    if (!live || tuned.current || idx.current >= stations.current.length) { if (!tuned.current) setState('failed'); return }
    const s = stations.current[idx.current++]; const url = (s && (s.url_resolved || s.url)) || ''
    if (!/^https:/.test(url)) return tryNext()
    live.src = url
    const bail = setTimeout(() => { if (!tuned.current) { try { live.pause() } catch { /* */ } tryNext() } }, 4000)
    live.play().then(() => { tuned.current = true; clearTimeout(bail); live.volume = 0.55; setStation(s.name?.trim() || 'Live'); setState('on') })
      .catch(() => { clearTimeout(bail); tryNext() })
  }
  const tune = () => {
    setState('tuning')
    fetch(SEARCH).then(r => r.json()).then((list: Station[]) => { stations.current = list || []; idx.current = 0; tryNext() }).catch(() => setState('failed'))
  }
  const toggle = () => {
    const live = audioRef.current
    if (!live) return
    if (state === 'on') { live.pause(); setState('off'); tuned.current = false; return }
    if (state === 'off' || state === 'failed') { if (stations.current.length && !tuned.current) { idx.current = 0; tryNext() } else tune() }
  }
  const on = state === 'on'
  return <button type="button" className={`pl-badge pl-radio ${on ? 'is-on' : ''}`} onClick={toggle}
    aria-pressed={on} aria-label={on ? `Radio on — ${station}. Turn off` : 'Turn the radio on'} title={on ? station : 'Radio'}>
    <svg viewBox="0 0 32 32" width="18" height="18" aria-hidden="true">
      <path d="M6 12h4l6-5v18l-6-5H6z" fill="currentColor" />
      {on ? <>
        <path d="M20 11a6 6 0 0 1 0 10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M23 8a10 10 0 0 1 0 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </> : <path d="M20 11l7 10M27 11l-7 10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />}
    </svg>
    <span>{state === 'tuning' ? 'Tuning…' : on ? (station || 'Radio') : 'Radio'}</span>
  </button>
}
