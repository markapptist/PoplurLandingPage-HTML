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
  const words: Word[] = []
  let text = ''
  for (const block of blocks) {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      const value = node.nodeValue ?? ''
      for (const match of value.matchAll(/\S+/g)) {
        const start = match.index ?? 0
        words.push({ at: text.length, node, start, end: start + match[0].length })
        text += `${match[0]} `
      }
    }
    // A pause between blocks, so a heading does not run into its paragraph.
    text = `${text.trimEnd()}. `
  }
  return { text: text.trim(), words }
}

/** Reads one section aloud and lights each word as the voice reaches it. */
export function readSection(root: HTMLElement, { onDone, rate = 1 }: { onDone?: () => void; rate?: number } = {}): ReadAloudHandle {
  if (!speechAvailable()) { onDone?.(); return { stop: () => {} } }
  const { text, words } = passageFor(root)
  if (!text || !words.length) { onDone?.(); return { stop: () => {} } }

  const highlights = registry()
  const Ctor = Highlighter()
  let lit = -1
  let timer: number | null = null
  let stopped = false
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
    } catch { /* the node moved under us; the next word will land */ }
  }
  const clear = () => {
    lit = -1
    try { highlights?.delete(HIGHLIGHT_NAME) } catch { /* nothing to clear */ }
    if (timer !== null) { window.clearInterval(timer); timer = null }
  }

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = rate
  utterance.lang = document.documentElement.lang || 'en-CA'
  let heardBoundary = false
  utterance.onboundary = event => {
    if (stopped) return
    heardBoundary = true
    if (timer !== null) { window.clearInterval(timer); timer = null }
    let index = 0
    while (index + 1 < words.length && words[index + 1].at <= event.charIndex) index += 1
    light(index)
  }
  utterance.onend = () => { if (!stopped) { clear(); onDone?.() } }
  utterance.onerror = () => { if (!stopped) { clear(); onDone?.() } }

  // Engines without boundary events: pace the highlight by the text's length,
  // which drifts a little but never leaves the reader staring at a dead page.
  const started = performance.now()
  timer = window.setInterval(() => {
    if (stopped || heardBoundary) return
    const elapsed = (performance.now() - started) * rate
    let index = 0
    while (index + 1 < words.length && words[index + 1].at * MS_PER_CHARACTER <= elapsed) index += 1
    light(index)
  }, 90)

  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)

  return {
    stop: () => {
      stopped = true
      clear()
      try { window.speechSynthesis.cancel() } catch { /* already quiet */ }
    },
  }
}

/**
 * The reader is on unless this visitor turned it off. Browsers will not speak
 * before a gesture, so "on by default" means armed: the voice starts at the
 * first touch, click or key, not the instant the page paints.
 */
const READING_KEY = 'poplur.landing.read'

export function readingPreference(): boolean {
  try { return window.localStorage.getItem(READING_KEY) !== 'off' } catch { return true }
}

export function rememberReadingPreference(on: boolean): void {
  try { window.localStorage.setItem(READING_KEY, on ? 'on' : 'off') } catch { /* private mode */ }
}

/** Calls back on the first gesture a browser accepts as permission to speak. */
export function onFirstGesture(run: () => void): () => void {
  if (typeof document === 'undefined') return () => {}
  const types = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown', 'scroll'] as const
  const off = () => { for (const type of types) document.removeEventListener(type, once) }
  const once = () => { off(); run() }
  for (const type of types) document.addEventListener(type, once, { passive: true })
  return off
}
