// Reading the page out loud, one section at a time.
//
// The page already knows which section the reader is on — the chapter spy that
// drives the nav highlight and the scroll pop. This reads THAT section, and
// follows when they scroll to the next one, rather than starting at the top
// and talking over wherever they actually are.
//
// The voice is the browser's own (speechSynthesis): no key, no network, no
// cost, and on a Mac or an iPhone it is a Siri voice. Chrome and Safari report
// word boundaries as they speak, which is what lights the current word; the
// engines that do not (some Android builds) get an even-paced estimate instead,
// so the highlight still moves with the voice rather than sitting still.
//
// THE HIGHLIGHT NEVER TOUCHES THE DOM. The first version wrapped every word in
// a span, which broke the page: React owns this markup, and rewriting a
// paragraph's children under it left the chapters that hold the live 3D
// objects unable to re-render. Ranges and the CSS custom highlight API mark
// the same words without changing a single node, so React never notices. A
// browser without that API still reads aloud; it just does not light the word.

const HIGHLIGHT_NAME = 'poplur-read'
/** Elements whose text is worth hearing; the rest of a section is furniture. */
const READABLE = 'h1, h2, h3, p, li'
/** Roughly the pace of an English voice at rate 1, for engines with no boundaries. */
const MS_PER_CHARACTER = 62

export type ReadAloudHandle = { stop: () => void }

type HighlightRegistry = { set: (name: string, highlight: unknown) => void; delete: (name: string) => void }
type HighlightCtor = new (...ranges: Range[]) => unknown

function registry(): HighlightRegistry | null {
  const css = (window as unknown as { CSS?: { highlights?: HighlightRegistry } }).CSS
  return css?.highlights && typeof Highlighter() === 'function' ? css.highlights : null
}
function Highlighter(): HighlightCtor | undefined {
  return (window as unknown as { Highlight?: HighlightCtor }).Highlight
}

export function speechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
}

/** One spoken word: where it starts in the utterance, and where it sits on the page. */
type Word = { at: number; node: Text; start: number; end: number }

/** The text a section is read as, and where each word lives — read only; the
 *  page's own markup is left exactly as React wrote it. */
function passageFor(root: HTMLElement): { text: string; words: Word[] } {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>(READABLE))
    .filter(el => !el.closest('[data-read-skip]') && (el.textContent ?? '').trim().length > 1)
    // The hero holds seven headlines and shows one; the six behind it are
    // marked aria-hidden, and reading them ran the whole set together.
    .filter(el => !el.closest('[aria-hidden="true"]'))
  const words: Word[] = []
  let text = ''
  for (const block of blocks) {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      if (node.parentElement?.closest('[aria-hidden="true"], [data-read-skip]')) continue
      const value = node.nodeValue ?? ''
      for (const match of value.matchAll(/\S+/g)) {
        const start = match.index ?? 0
        words.push({ at: text.length, node, start, end: start + match[0].length })
        text += `${match[0]} `
      }
    }
    // A pause between blocks, so a heading does not run into its paragraph.
    text = `${text.trimEnd().replace(/[.!?]+$/, '')}. `
  }
  return { text: text.trim(), words }
}

/** Reads one section aloud and lights each word as the voice reaches it. */
export function readSection(root: HTMLElement, { onStart, onDone, onBlocked, rate = 1 }: {
  onStart?: () => void; onDone?: () => void; onBlocked?: () => void; rate?: number
} = {}): ReadAloudHandle {
  if (!speechAvailable()) { onBlocked?.(); return { stop: () => {} } }
  const { text, words } = passageFor(root)
  if (!text || !words.length) { onDone?.(); return { stop: () => {} } }

  const engine = window.speechSynthesis
  const highlights = registry()
  const Ctor = Highlighter()
  let lit = -1, stopped = false, started = false, heardBoundary = false
  let timer: number | undefined, startTimer: number | undefined
  const light = (index: number) => {
    if (index === lit || index < 0 || index >= words.length) return
    lit = index
    if (!highlights || !Ctor) return
    const word = words[index]
    try {
      const range = document.createRange()
      range.setStart(word.node, word.start)
      range.setEnd(word.node, word.end)
      highlights.set(HIGHLIGHT_NAME, new Ctor(range))
    } catch { /* React may have replaced the text since speech began. */ }
  }
  const clear = () => {
    window.clearInterval(timer)
    window.clearTimeout(startTimer)
    try { highlights?.delete(HIGHLIGHT_NAME) } catch { /* nothing to clear */ }
  }
  const finish = (blocked: boolean) => {
    if (stopped) return
    stopped = true
    clear()
    if (blocked) {
      // A pending queue is not evidence of sound. Release it so a fresh tap
      // can retry, and never leave radio muted behind a silent utterance.
      engine.cancel()
      onBlocked?.()
    } else onDone?.()
  }
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = rate
  utterance.volume = 1
  utterance.lang = document.documentElement.lang || 'en-CA'
  // An empty voice list is normal during startup. Use the engine's default
  // immediately; waiting for voiceschanged loses the activating tap on iOS.
  const voices = engine.getVoices()
  utterance.voice = voices.find(voice => voice.lang === utterance.lang && voice.localService)
    ?? voices.find(voice => voice.lang.startsWith('en') && voice.localService) ?? null
  utterance.onstart = () => {
    if (stopped || started) return
    started = true
    window.clearTimeout(startTimer)
    onStart?.()
    light(0)
    const began = performance.now()
    timer = window.setInterval(() => {
      if (stopped || heardBoundary) return
      const elapsed = (performance.now() - began) * rate
      let index = 0
      while (index + 1 < words.length && words[index + 1].at * MS_PER_CHARACTER <= elapsed) index++
      light(index)
    }, 90)
  }
  utterance.onboundary = event => {
    if (stopped || !started) return
    heardBoundary = true
    window.clearInterval(timer)
    let index = 0
    while (index + 1 < words.length && words[index + 1].at <= event.charIndex) index++
    light(index)
  }
  utterance.onend = () => finish(false)
  utterance.onerror = () => finish(true)

  startTimer = window.setTimeout(() => { if (!started) finish(true) }, 4000)
  try {
    engine.cancel()
    // cancel() clears the queue but does not reset a paused synthesizer.
    engine.resume()
    engine.speak(utterance)
  } catch { finish(true) }

  return { stop: () => {
    if (stopped) return
    stopped = true
    clear()
    engine.cancel()
  } }
}

const READING_KEY = 'poplur.landing.read'
export function readingPreference(): boolean {
  try { return window.localStorage.getItem(READING_KEY) !== 'off' } catch { return true }
}
export function rememberReadingPreference(on: boolean): void {
  try { window.localStorage.setItem(READING_KEY, on ? 'on' : 'off') } catch { /* private mode */ }
}

export type ReaderState = {
  available: boolean
  enabled: boolean
  status: 'off' | 'ready' | 'starting' | 'speaking' | 'blocked' | 'done'
}

/** Owns speech outside React effects, so a trusted tap calls speak synchronously. */
export function createPageReader(report: (state: ReaderState) => void, onSpeaking: (value: boolean) => void) {
  let state: ReaderState = {
    available: speechAvailable(), enabled: readingPreference(), status: 'ready',
  }
  if (!state.enabled) state.status = 'off'
  let section = 'top', activated = false, disposed = false, generation = 0
  let handle: ReadAloudHandle | null = null
  const update = (status: ReaderState['status']) => {
    state = { ...state, status }
    if (!disposed) report(state)
  }
  const stop = () => {
    generation++
    handle?.stop()
    handle = null
    onSpeaking(false)
  }
  const start = () => {
    if (disposed || !state.available || !state.enabled || document.hidden) return
    stop()
    const root = document.getElementById(section)
    if (!root) { update('ready'); return }
    const id = generation
    update('starting')
    handle = readSection(root, {
      onStart: () => { if (id === generation && !disposed) { onSpeaking(true); update('speaking') } },
      onDone: () => { if (id === generation && !disposed) { onSpeaking(false); update('done') } },
      onBlocked: () => { if (id === generation && !disposed) { onSpeaking(false); update('blocked') } },
    })
  }
  // A touch pointerdown is too early for iOS activation. touchend/click/key
  // run speech directly, and repeated events cannot restart an active read.
  const gesture = (event: Event) => {
    if (event.target instanceof Element && event.target.closest('[data-landing-audio-control]')) return
    if (state.enabled && (state.status === 'ready' || state.status === 'blocked')) {
      activated = true
      start()
    }
  }
  const types = ['click', 'touchend', 'keydown'] as const
  for (const type of types) document.addEventListener(type, gesture, { passive: true })
  const visibility = () => {
    stop()
    update(state.enabled ? 'ready' : 'off')
    if (!document.hidden && activated) start()
  }
  document.addEventListener('visibilitychange', visibility)
  // Start loading voices without postponing any future gesture.
  if (state.available) window.speechSynthesis.getVoices()
  report(state)
  return {
    setSection(id: string) {
      if (section === id || disposed) return
      section = id
      stop()
      update(state.enabled ? 'ready' : 'off')
      if (activated) start()
    },
    toggle() {
      if (disposed) return
      // An armed or blocked control must start sound on its first tap, not
      // turn the default-on preference off before it ever speaks.
      state = { ...state, enabled: !(state.enabled && (state.status === 'speaking' || state.status === 'starting')) }
      rememberReadingPreference(state.enabled)
      activated = true
      if (state.enabled) start()
      else { stop(); update('off') }
    },
    dispose() {
      disposed = true
      stop()
      for (const type of types) document.removeEventListener(type, gesture)
      document.removeEventListener('visibilitychange', visibility)
    },
  }
}
