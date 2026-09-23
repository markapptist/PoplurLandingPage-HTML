import type { ReaderState } from './readAloud'

export default function ReadBadge({ state, onToggle }: { state: ReaderState; onToggle: () => void }) {
  const speaking = state.status === 'speaking'
  const active = speaking || state.status === 'starting'
  const label = active ? 'Stop reading' : state.status === 'blocked' ? 'Tap to retry reading aloud' : 'Read this section aloud'
  return <button type="button" className={`pl-badge pl-read ${active ? 'is-on' : ''}`} onClick={onToggle}
    data-landing-audio-control data-read-skip aria-pressed={active} aria-label={label} title={label}>
    <svg viewBox="0 0 32 32" width="18" height="18" aria-hidden="true">
      {/* An open book: what is being read, not a speaker — the radio already owns that shape. */}
      <path d="M4 8c4-1.6 7.3-1.6 11 .8v15c-3.7-2.4-7-2.4-11-.8z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M28 8c-4-1.6-7.3-1.6-11 .8v15c3.7-2.4 7-2.4 11-.8z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      {speaking && <circle cx="16" cy="16" r="2.4" fill="currentColor" />}
    </svg>
    <span>{speaking ? 'Reading' : state.status === 'starting' ? 'Starting…' : state.status === 'blocked' ? 'Tap to read' : 'Read to me'}</span>
  </button>
}
