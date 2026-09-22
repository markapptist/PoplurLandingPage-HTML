import { useCallback, useEffect, useRef, useState } from 'react'
import { createLandingAudio, INITIAL_AUDIO, type Station } from './landingAudio'

const SEARCH = 'https://de1.api.radio-browser.info/json/stations/search?geo_lat=43.6532&geo_long=-79.3832&geo_distance=90000&hidebroken=true&order=clickcount&reverse=true&limit=16'

export function useLandingAudio(onHero: boolean) {
  const [state, setState] = useState(INITIAL_AUDIO)
  const controller = useRef<ReturnType<typeof createLandingAudio> | null>(null)
  const reloadStations = useRef<(() => void) | null>(null)
  const video = useRef<HTMLVideoElement | null>(null)
  const onHeroRef = useRef(onHero)
  onHeroRef.current = onHero
  const setHero = useCallback((element: HTMLVideoElement | null) => {
    video.current = element
    controller.current?.setHero(element)
  }, [])
  useEffect(() => {
    const radio = document.createElement('audio')
    radio.preload = 'none'
    radio.setAttribute('aria-hidden', 'true')
    document.body.appendChild(radio)
    const audio = createLandingAudio(radio, setState)
    controller.current = audio
    audio.setVisible(!document.hidden)
    audio.setOnHero(onHeroRef.current)
    audio.setHero(video.current)
    const abort = new AbortController()
    // Fetch candidates while the hero plays, but reserve playback for the
    // section handoff. A slow fetch cannot start radio over the hero.
    const loadStations = () => fetch(SEARCH, { signal: abort.signal }).then(response => {
      if (!response.ok) throw new Error('Station search failed')
      return response.json()
    }).then((list: Station[]) => {
      if (!abort.signal.aborted) audio.setStations(Array.isArray(list) ? list : [])
    }).catch(() => { if (!abort.signal.aborted) audio.setStations([]) })
    reloadStations.current = loadStations
    loadStations()
    const gesture = (event: Event) => {
      // A sound button handles its own gesture exactly once, including keys.
      if (event.target instanceof Element && event.target.closest('[data-landing-audio-control]')) return
      audio.gesture()
    }
    const visibility = () => audio.setVisible(!document.hidden)
    document.addEventListener('click', gesture)
    document.addEventListener('keydown', gesture)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      abort.abort()
      audio.dispose()
      controller.current = null
      reloadStations.current = null
      radio.remove()
      document.removeEventListener('click', gesture)
      document.removeEventListener('keydown', gesture)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [])
  useEffect(() => { controller.current?.setOnHero(onHero) }, [onHero])
  const setSpeaking = useCallback((value: boolean) => { controller.current?.setSpeaking(value) }, [])
  return {
    state, setHero, setSpeaking,
    toggleHero: () => controller.current?.toggleHero(),
    replayHero: () => controller.current?.replayHero(),
    toggleRadio: () => {
      if (state.radio === 'failed') reloadStations.current?.()
      controller.current?.toggleRadio()
    },
  }
}
