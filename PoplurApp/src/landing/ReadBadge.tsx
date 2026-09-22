export default function ReadBadge({ on, speaking, onToggle }: { on: boolean; speaking: boolean; onToggle: () => void }) {
  const label = on ? 'Reading the section you are on. Stop' : 'Read this page to me'
  return <button type="button" className={`pl-badge pl-read ${on ? 'is-on' : ''}`} onClick={onToggle}
    data-landing-audio-control data-read-skip aria-pressed={on} aria-label={label} title={label}>
    <svg viewBox="0 0 32 32" width="18" height="18" aria-hidden="true">
      {/* An open book: what is being read, not a speaker — the radio already owns that shape. */}
      <path d="M4 8c4-1.6 7.3-1.6 11 .8v15c-3.7-2.4-7-2.4-11-.8z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M28 8c-4-1.6-7.3-1.6-11 .8v15c3.7-2.4 7-2.4 11-.8z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      {speaking && <circle cx="16" cy="16" r="2.4" fill="currentColor" />}
    </svg>
    <span>{on ? (speaking ? 'Reading' : 'Ready') : 'Read to me'}</span>
  </button>
}
