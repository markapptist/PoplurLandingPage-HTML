export type Station = { name?: string; url?: string; url_resolved?: string }
export type AudioState = {
  heroSound: boolean
  radio: 'waiting' | 'off' | 'tuning' | 'on' | 'blocked' | 'failed'
  radioEnabled: boolean
  station: string
}
export const INITIAL_AUDIO: AudioState = { heroSound: false, radio: 'waiting', radioEnabled: true, station: '' }

// One owner for both players: stop the outgoing source before starting the
// incoming one. Late stream loads and play() promises cannot steal ownership.
export function createLandingAudio(radio: HTMLAudioElement, report: (state: AudioState) => void) {
  let state = { ...INITIAL_AUDIO }
  let hero: HTMLVideoElement | null = null
  let onHero = true, visible = true, disposed = false, heroMuted = false
  let heroBlocked = false, heroAttempt = 0, radioAttempt = 0
  let stations: Station[] = [], stationIndex = 0, stationsReady = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const update = (patch: Partial<AudioState>) => {
    state = { ...state, ...patch }
    if (!disposed) report(state)
  }
  const wantsHero = () => !disposed && visible && onHero
  const wantsRadio = () => !disposed && visible && !onHero && state.radioEnabled
  const stopRadio = () => {
    radioAttempt++
    clearTimeout(timer)
    radio.pause()
  }
  const stopHero = () => { heroAttempt++; hero?.pause() }

  const playHero = () => {
    const video = hero
    if (!video || !wantsHero()) return
    stopRadio()
    const attempt = ++heroAttempt
    heroBlocked = false
    if (video.ended) video.currentTime = 0
    video.volume = 1
    video.muted = heroMuted
    const current = () => attempt === heroAttempt && video === hero && wantsHero()
    video.play().then(() => {
      if (!current()) { if (!wantsHero() || video !== hero) video.pause(); return }
      heroBlocked = false
      update({ heroSound: !video.muted })
    }).catch(error => {
      if (!current()) return
      update({ heroSound: false })
      if (error?.name !== 'NotAllowedError' || heroMuted) return
      // Keep the picture moving when audible autoplay is blocked. The next
      // real gesture retries sound; a deliberate mute is never undone.
      heroBlocked = true
      video.muted = true
      video.play().catch(() => { /* A gesture can also start the picture. */ })
    })
  }

  const playRadio = () => {
    if (!wantsRadio()) return
    stopHero()
    stopRadio()
    if (!stationsReady) { update({ radio: 'tuning' }); return }
    const station = stations[stationIndex]
    if (!station) { update({ radio: 'failed' }); return }
    const attempt = radioAttempt
    const url = station.url_resolved || station.url || ''
    if (radio.getAttribute('src') !== url) radio.src = url
    radio.volume = 0.55
    update({ radio: 'tuning', station: station.name?.trim() || 'Live' })
    const current = () => attempt === radioAttempt && wantsRadio()
    const next = () => {
      if (!current()) return
      stationIndex++
      playRadio()
    }
    timer = setTimeout(next, 6000)
    radio.play().then(() => {
      if (!current()) { if (!wantsRadio()) radio.pause(); return }
      clearTimeout(timer)
      update({ radio: 'on' })
    }).catch(error => {
      if (!current()) return
      clearTimeout(timer)
      if (error?.name === 'NotAllowedError') update({ radio: 'blocked' })
      else next()
    })
  }

  const reconcile = () => {
    // Both stops are synchronous; neither player can overlap the other.
    stopHero()
    stopRadio()
    update({ heroSound: false, radio: !state.radioEnabled ? 'off' : 'waiting' })
    if (wantsHero()) playHero()
    else if (wantsRadio()) playRadio()
  }
  const onRadioError = () => {
    if (!wantsRadio() || (state.radio !== 'on' && state.radio !== 'tuning')) return
    stationIndex++
    playRadio()
  }
  radio.addEventListener('error', onRadioError)
  return {
    setHero(video: HTMLVideoElement | null) {
      if (hero === video) return
      stopHero()
      hero = video
      heroBlocked = false
      if (video) reconcile()
    },
    setOnHero(value: boolean) {
      if (onHero === value) return
      onHero = value
      reconcile()
    },
    setVisible(value: boolean) {
      if (visible === value) return
      visible = value
      reconcile()
    },
    setStations(list: Station[]) {
      stations = list.filter(s => /^https:/.test(s.url_resolved || s.url || ''))
      stationIndex = 0
      stationsReady = true
      if (wantsRadio()) playRadio()
    },
    gesture() {
      if (heroBlocked && wantsHero()) playHero()
      if (state.radio === 'blocked' && wantsRadio()) playRadio()
    },
    toggleHero() {
      heroMuted = state.heroSound
      heroBlocked = false
      playHero()
    },
    replayHero: playHero,
    toggleRadio() {
      if (state.radio === 'blocked' || state.radio === 'failed') {
        stationIndex = 0
        if (wantsRadio()) playRadio()
        return
      }
      update({ radioEnabled: !state.radioEnabled })
      reconcile()
    },
    dispose() {
      disposed = true
      stopHero()
      stopRadio()
      radio.removeEventListener('error', onRadioError)
    },
  }
}
