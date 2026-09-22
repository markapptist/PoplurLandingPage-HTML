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

const WORD_CLASS = 'pl-read-word'
const LIVE_CLASS = 'pl-read-now'
/** Elements whose text is worth hearing; the rest of a section is furniture. */
const READABLE = 'h1, h2, h3, p, li'
/** Roughly the pace of an English voice at rate 1, for engines with no boundaries. */
const MS_PER_CHARACTER = 62

export type ReadAloudHandle = { stop: () => void }

export function speechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
}

/** The text a section should be read as, and the spans that carry its words. */
type Passage = { text: string; spans: HTMLElement[]; offsets: number[] }

/** Splits an element's words into spans, once, so one can be lit at a time.
 *  Returns the words in reading order with where each starts in the spoken text. */
function passageFor(root: HTMLElement): Passage {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>(READABLE))
    .filter(el => !el.closest('[data-read-skip]') && el.textContent && el.textContent.trim().length > 1)
  const spans: HTMLElement[] = []
  const offsets: number[] = []
  let text = ''
  for (const block of blocks) {
    if (!block.dataset.readSplit) {
      const words = (block.textContent ?? '').split(/(\s+)/)
      block.textContent = ''
      for (const part of words) {
        if (!part) continue
        if (/^\s+$/.test(part)) { block.appendChild(document.createTextNode(part)); continue }
        const span = document.createElement('span')
        span.className = WORD_CLASS
        span.textContent = part
        block.appendChild(span)
      }
      block.dataset.readSplit = '1'
    }
    for (const span of Array.from(block.querySelectorAll<HTMLElement>(`.${WORD_CLASS}`))) {
      offsets.push(text.length)
      spans.push(span)
      text += `${span.textContent ?? ''} `
    }
    // A pause between blocks, so a heading does not run into its paragraph.
    text = `${text.trimEnd()}. `
  }
  return { text: text.trim(), spans, offsets }
}

/** Reads one section aloud and lights each word as the voice reaches it. */
export function readSection(root: HTMLElement, { onDone, rate = 1 }: { onDone?: () => void; rate?: number } = {}): ReadAloudHandle {
  if (!speechAvailable()) { onDone?.(); return { stop: () => {} } }
  const { text, spans, offsets } = passageFor(root)
  if (!text || !spans.length) { onDone?.(); return { stop: () => {} } }

  let lit = -1
  let timer: number | null = null
  let stopped = false
  const light = (index: number) => {
    if (index === lit || index < 0 || index >= spans.length) return
    spans[lit]?.classList.remove(LIVE_CLASS)
    lit = index
    spans[index].classList.add(LIVE_CLASS)
  }
  const clear = () => {
    spans[lit]?.classList.remove(LIVE_CLASS)
    lit = -1
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
    // The last word whose start the voice has passed.
    let index = 0
    while (index + 1 < offsets.length && offsets[index + 1] <= event.charIndex) index += 1
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
    while (index + 1 < offsets.length && offsets[index + 1] * MS_PER_CHARACTER <= elapsed) index += 1
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
