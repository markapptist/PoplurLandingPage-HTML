import test from 'node:test'
import assert from 'node:assert/strict'
import { createLandingAudio } from './landingAudio.ts'

const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve() }
const stationList = [
  { name: 'First', url: 'https://radio.example/first' },
  { name: 'Second', url: 'https://radio.example/second' },
]
class Media extends EventTarget {
  paused = true
  muted = false
  ended = false
  currentTime = 0
  src = ''
  volume = 1
  attempts = []
  nextPlay = null
  beforePlay = () => {}
  play() {
    this.beforePlay()
    this.attempts.push({ muted: this.muted, src: this.src })
    this.paused = false
    return this.nextPlay?.() ?? Promise.resolve()
  }
  pause() { this.paused = true }
  getAttribute(name) { return this[name] }
}
function setup(t) {
  const hero = new Media(), radio = new Media()
  let state
  const audio = createLandingAudio(radio, value => { state = value })
  t.after(() => audio.dispose())
  hero.beforePlay = () => assert.equal(radio.paused, true, 'radio must stop before hero starts')
  radio.beforePlay = () => assert.equal(hero.paused, true, 'hero must stop before radio starts')
  audio.setHero(hero)
  return { hero, radio, audio, state: () => state }
}

test('arrival tries hero sound and never starts radio over the hero', async t => {
  const { hero, radio, audio, state } = setup(t)
  audio.setStations(stationList)
  await flush()
  assert.equal(hero.attempts[0].muted, false)
  assert.equal(state().heroSound, true)
  assert.equal(radio.attempts.length, 0)
  audio.toggleHero()
  await flush()
  assert.equal(hero.muted, true)
  assert.equal(radio.attempts.length, 0, 'muting hero must not start radio')
})

test('scrolling away hands off to radio and returning resumes hero exclusively', async t => {
  const { hero, radio, audio, state } = setup(t)
  audio.setStations(stationList)
  await flush()
  audio.setOnHero(false)
  await flush()
  assert.equal(hero.paused, true)
  assert.equal(state().radio, 'on')
  assert.equal(radio.volume, 0.55)
  audio.setOnHero(true)
  await flush()
  assert.equal(radio.paused, true)
  assert.equal(state().heroSound, true)
  assert.equal(state().radio, 'waiting')
})

test('late station results cannot interrupt the hero', async t => {
  const { radio, audio, state } = setup(t)
  audio.setOnHero(false)
  assert.equal(state().radio, 'tuning')
  audio.setOnHero(true)
  audio.setStations(stationList)
  await flush()
  assert.equal(radio.attempts.length, 0)
  assert.equal(state().heroSound, true)
})

test('late radio play completion cannot restart radio after returning to hero', async t => {
  const { radio, audio, state } = setup(t)
  let finish
  radio.nextPlay = () => new Promise(resolve => { finish = resolve })
  audio.setStations(stationList)
  audio.setOnHero(false)
  audio.setOnHero(true)
  finish()
  await flush()
  assert.equal(radio.paused, true)
  assert.equal(state().radio, 'waiting')
})

test('audible autoplay rejection falls back to picture and retries on a gesture', async t => {
  const { hero, radio, audio, state } = setup(t)
  hero.nextPlay = () => hero.muted ? Promise.resolve() : Promise.reject({ name: 'NotAllowedError' })
  audio.replayHero()
  await flush()
  assert.equal(hero.muted, true)
  assert.equal(state().heroSound, false)
  assert.equal(radio.attempts.length, 0)
  hero.nextPlay = () => Promise.resolve()
  audio.gesture()
  await flush()
  assert.equal(hero.muted, false)
  assert.equal(state().heroSound, true)
  audio.toggleHero()
  await flush()
  audio.gesture()
  assert.equal(hero.muted, true, 'later gestures respect an explicit mute')
})

test('a gesture on hero does not consume a later radio autoplay retry', async t => {
  const { radio, audio, state } = setup(t)
  audio.gesture()
  audio.setStations(stationList)
  radio.nextPlay = () => Promise.reject({ name: 'NotAllowedError' })
  audio.setOnHero(false)
  await flush()
  assert.equal(state().radio, 'blocked')
  radio.nextPlay = () => Promise.resolve()
  audio.gesture()
  await flush()
  assert.equal(state().radio, 'on')
  assert.equal(state().station, 'First')
})

test('radio switched off while connecting stays off across sections and gestures', async t => {
  const { radio, audio, state } = setup(t)
  let finish
  radio.nextPlay = () => new Promise(resolve => { finish = resolve })
  audio.setStations(stationList)
  audio.setOnHero(false)
  audio.toggleRadio()
  finish()
  await flush()
  audio.setOnHero(true)
  audio.setOnHero(false)
  audio.gesture()
  assert.equal(state().radioEnabled, false)
  assert.equal(state().radio, 'off')
  assert.equal(radio.paused, true)
  assert.equal(radio.attempts.length, 1)
})

test('broken and insecure stations are skipped without overlapping hero', async t => {
  const { radio, audio, state } = setup(t)
  radio.nextPlay = () => radio.src.endsWith('first') ? Promise.reject({ name: 'NotSupportedError' }) : Promise.resolve()
  audio.setStations([{ name: 'Insecure', url: 'http://radio.example/bad' }, ...stationList])
  audio.setOnHero(false)
  await flush()
  assert.equal(state().radio, 'on')
  assert.equal(state().station, 'Second')
  assert.equal(radio.attempts.length, 2)
})

test('a stalled connection advances, and returning to hero cancels its timer', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { radio, audio, state } = setup(t)
  radio.nextPlay = () => new Promise(() => {})
  audio.setStations(stationList)
  audio.setOnHero(false)
  t.mock.timers.tick(6000)
  assert.equal(radio.attempts.length, 2)
  audio.setOnHero(true)
  t.mock.timers.tick(12000)
  await flush()
  assert.equal(radio.attempts.length, 2)
  assert.equal(state().radio, 'waiting')
})

test('backgrounding pauses both sources and foregrounding restores the active section', async t => {
  const { hero, radio, audio, state } = setup(t)
  audio.setStations(stationList)
  audio.setVisible(false)
  assert.equal(hero.paused, true)
  assert.equal(radio.paused, true)
  audio.setOnHero(false)
  assert.equal(radio.attempts.length, 0)
  audio.setVisible(true)
  await flush()
  assert.equal(state().radio, 'on')
  audio.dispose()
  audio.setStations(stationList)
  audio.gesture()
  assert.equal(radio.paused, true)
})

test('actual narration mutes hero sound, then restores the explicit hero preference', async t => {
  const { hero, audio, state } = setup(t)
  await flush()
  audio.setSpeaking(true)
  await flush()
  assert.equal(hero.muted, true)
  assert.equal(state().heroSound, false)
  audio.setSpeaking(false)
  await flush()
  assert.equal(hero.muted, false)
  audio.toggleHero()
  await flush()
  audio.setSpeaking(true); audio.setSpeaking(false)
  await flush()
  assert.equal(hero.muted, true, 'explicit mute survives narration')
})

test('radio pauses only during actual narration and resumes when it ends or fails', async t => {
  const { radio, audio, state } = setup(t)
  audio.setStations(stationList); audio.setOnHero(false)
  await flush()
  assert.equal(state().radio, 'on')
  audio.setSpeaking(true)
  assert.equal(radio.paused, true)
  assert.equal(state().radio, 'waiting')
  audio.setSpeaking(false)
  await flush()
  assert.equal(state().radio, 'on')
  audio.toggleRadio(); audio.setSpeaking(true); audio.setSpeaking(false)
  assert.equal(radio.paused, true)
  assert.equal(state().radio, 'off', 'explicit radio off survives narration')
})
