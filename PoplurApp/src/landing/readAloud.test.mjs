import test from 'node:test'
import assert from 'node:assert/strict'
import { createPageReader, readSection } from './readAloud.ts'

function setup(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  class Element {
    constructor(hidden = false) { this.hidden = hidden }
    closest() { return this.hidden ? this : null }
  }
  globalThis.Element = Element
  const block = (...words) => ({
    textContent: words.map(w => w.text).join(''), closest: () => null,
    nodes: words.map(w => ({ nodeValue: w.text, parentElement: new Element(w.hidden) })),
  })
  const root = (...blocks) => ({ querySelectorAll: () => blocks })
  const top = root(block({ text: 'Hello neighbours' }, { text: 'Hidden headline', hidden: true }))
  const beta = root(block({ text: 'Join the beta.' }))
  const listeners = new Map(), storage = new Map()
  const document = {
    hidden: false, documentElement: { lang: 'en-CA' },
    getElementById: id => ({ top, beta })[id],
    createTreeWalker: b => { let at = 0; return { nextNode: () => b.nodes[at++] ?? null } },
    addEventListener: (type, callback) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type).add(callback)
    },
    removeEventListener: (type, callback) => listeners.get(type)?.delete(callback),
  }
  const utterances = []
  const engine = {
    paused: true, pending: false, cancelCount: 0, resumeCount: 0,
    getVoices: () => [],
    cancel() { this.cancelCount++; this.pending = false },
    resume() { this.resumeCount++; this.paused = false },
    speak(utterance) { utterances.push(utterance); this.pending = true },
  }
  globalThis.document = document
  globalThis.NodeFilter = { SHOW_TEXT: 4 }
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text } }
  globalThis.window = {
    speechSynthesis: engine,
    setTimeout: (...args) => setTimeout(...args), clearTimeout: id => clearTimeout(id),
    setInterval: (...args) => setInterval(...args), clearInterval: id => clearInterval(id),
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
  }
  const emit = (type, control = false) => {
    for (const callback of [...(listeners.get(type) ?? [])]) callback({ target: new Element(control) })
  }
  let state
  const speaking = []
  const reader = createPageReader(value => { state = value }, value => speaking.push(value))
  t.after(() => reader.dispose())
  return { reader, state: () => state, speaking, utterances, engine, emit, document, storage, top, listeners }
}

test('first click speaks synchronously with an empty voice list; only start marks it reading', t => {
  const { emit, utterances, state, speaking, engine } = setup(t)
  emit('click')
  assert.equal(utterances.length, 1, 'speech must be submitted before the tap handler returns')
  assert.equal(utterances[0].text, 'Hello neighbours.', 'hidden hero headlines are omitted')
  assert.equal(utterances[0].volume, 1)
  assert.equal(engine.paused, false, 'a previously paused engine must resume')
  assert.equal(state().status, 'starting')
  assert.ok(!speaking.includes(true), 'queued speech must not mute the radio')
  utterances[0].onstart()
  assert.equal(state().status, 'speaking')
  assert.equal(speaking.at(-1), true)
  emit('click'); emit('touchend'); emit('keydown')
  assert.equal(utterances.length, 1, 'later gestures cannot restart active speech')
  utterances[0].onend()
  assert.equal(state().status, 'done')
  assert.equal(speaking.at(-1), false)
})

test('touchend activates speech; touch pointerdown and scrolling cannot consume it', t => {
  const { emit, utterances } = setup(t)
  emit('pointerdown'); emit('wheel'); emit('scroll')
  assert.equal(utterances.length, 0)
  emit('touchend')
  assert.equal(utterances.length, 1)
})

test('first tap on armed reader starts it; active tap stops and remembers off', t => {
  const { reader, utterances, emit, state, storage } = setup(t)
  emit('click', true)
  assert.equal(utterances.length, 0, 'the document handler must not double-handle audio buttons')
  reader.toggle()
  assert.equal(utterances.length, 1)
  utterances[0].onstart()
  reader.toggle()
  assert.equal(state().status, 'off')
  assert.equal(storage.get('poplur.landing.read'), 'off')
  emit('click'); reader.setSection('beta')
  assert.equal(utterances.length, 1, 'explicit off survives gestures and section changes')
  reader.toggle()
  assert.equal(utterances.length, 2)
  assert.equal(utterances[1].text, 'Join the beta.')
})

test('silent pending speech times out, releases audio and retries with a fresh utterance', t => {
  const { reader, utterances, engine, state, speaking } = setup(t)
  reader.toggle()
  assert.equal(engine.pending, true)
  t.mock.timers.tick(4000)
  assert.equal(state().status, 'blocked')
  assert.equal(engine.pending, false)
  assert.ok(!speaking.includes(true))
  reader.toggle()
  assert.equal(utterances.length, 2)
  assert.notEqual(utterances[0], utterances[1])
  utterances[0].onstart()
  assert.equal(state().status, 'starting', 'late start from expired attempt is ignored')
  utterances[1].onstart()
  assert.equal(state().status, 'speaking')
})

test('speech errors release audio and can retry on the next real gesture', t => {
  const { emit, utterances, state, speaking } = setup(t)
  emit('click')
  utterances[0].onerror({ error: 'not-allowed' })
  assert.equal(state().status, 'blocked')
  assert.equal(speaking.at(-1), false)
  emit('keydown')
  assert.equal(utterances.length, 2)
  utterances[1].onstart()
  assert.equal(state().status, 'speaking')
})

test('section changes cancel old speech and ignore late callbacks', t => {
  const { reader, emit, utterances, state, speaking } = setup(t)
  emit('click'); utterances[0].onstart()
  reader.setSection('beta')
  assert.equal(utterances.length, 2)
  assert.equal(speaking.at(-1), false)
  utterances[0].onend(); utterances[0].onerror({ error: 'canceled' })
  assert.equal(state().status, 'starting')
  utterances[1].onstart()
  assert.equal(state().status, 'speaking')
  reader.setSection('beta')
  assert.equal(utterances.length, 2)
})

test('hidden pages stop speaking and disposal removes retries and listeners', t => {
  const { reader, emit, utterances, document, speaking, listeners } = setup(t)
  emit('click'); utterances[0].onstart()
  document.hidden = true; emit('visibilitychange')
  assert.equal(speaking.at(-1), false)
  emit('click'); assert.equal(utterances.length, 1)
  document.hidden = false; emit('visibilitychange')
  assert.equal(utterances.length, 2)
  reader.dispose()
  emit('click'); t.mock.timers.tick(10000)
  assert.equal(utterances.length, 2)
  assert.equal([...listeners.values()].reduce((sum, set) => sum + set.size, 0), 0)
})

test('no highlights advance before speech starts and stopped timers cannot finish a new read', t => {
  const { top, utterances } = setup(t)
  let started = 0, done = 0, blocked = 0
  const handle = readSection(top, { onStart: () => started++, onDone: () => done++, onBlocked: () => blocked++ })
  handle.stop()
  t.mock.timers.tick(5000)
  utterances[0].onstart(); utterances[0].onend()
  assert.equal(started + done + blocked, 0)
})
