import type { AudioState } from './landingAudio'

export default function RadioBadge({ state, onToggle }: { state: AudioState; onToggle: () => void }) {
  const on = state.radio === 'on'
  const label = on ? `Radio on — ${state.station}. Turn off`
    : state.radio === 'blocked' ? 'Tap to start radio'
    : state.radio === 'failed' ? 'Retry radio'
    : state.radioEnabled ? 'Radio ready after the hero. Turn off' : 'Turn the radio on'
  return <button type="button" className={`pl-badge pl-radio ${on ? 'is-on' : ''}`} onClick={onToggle}
    data-landing-audio-control aria-pressed={state.radioEnabled} aria-label={label} title={label}>
    <svg viewBox="0 0 32 32" width="18" height="18" aria-hidden="true">
      <path d="M6 12h4l6-5v18l-6-5H6z" fill="currentColor" />
      {on ? <>
        <path d="M20 11a6 6 0 0 1 0 10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M23 8a10 10 0 0 1 0 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </> : <path d="M20 11l7 10M27 11l-7 10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />}
    </svg>
    <span>{state.radio === 'tuning' ? 'Tuning…' : state.radio === 'blocked' ? 'Tap for radio' : on ? (state.station || 'Radio') : 'Radio'}</span>
  </button>
}
