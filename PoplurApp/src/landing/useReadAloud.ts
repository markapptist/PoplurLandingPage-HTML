import { useCallback, useEffect, useRef, useState } from 'react'
import { createPageReader, type ReaderState } from './readAloud'

export function useReadAloud(section: string, onSpeaking: (value: boolean) => void) {
  const [state, setState] = useState<ReaderState>({ available: false, enabled: true, status: 'ready' })
  const controller = useRef<ReturnType<typeof createPageReader> | null>(null)
  const sectionRef = useRef(section)
  sectionRef.current = section
  const speakingRef = useRef(onSpeaking)
  speakingRef.current = onSpeaking
  useEffect(() => {
    const reader = createPageReader(setState, value => speakingRef.current(value))
    controller.current = reader
    reader.setSection(sectionRef.current)
    return () => { reader.dispose(); controller.current = null }
  }, [])
  useEffect(() => { controller.current?.setSection(section) }, [section])
  const toggle = useCallback(() => controller.current?.toggle(), [])
  return { state, toggle }
}
