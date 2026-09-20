import { useEffect, useRef, useState } from 'react'
import { reducedMotion } from './scroll'

// The app's clay objects, live. Each chapter renders the same GLB the app's
// navigator cube wears (copied from poplur-clay-map/public into
// public/models/landing, Draco-compressed, decoder in public/draco), lit the
// way WebGLNavigator lights them — ambient 0xd8d2ff 1.4, a warm key at
// (-2, 3, 4), the pink rim at (3, 1, -3), ACES at 1.06, sRGB out — so the
// object on the page is the object in the app.
//
// One WebGL context per chapter, made only once the chapter is near the
// screen, drawing only while it is on it (and the tab is visible); the
// object turns slowly on its own, a drag turns it by hand. three.js is
// imported on demand so it never rides in the first bundle, and nothing here
// touches the window at import time (the page is server-rendered).

const DRACO_PATH = '/draco/'
const FIT_SIZE = 1.7
const DRAG_GAIN = 0.011
const DRAG_DAMPING = 0.92
const MAX_PIXEL_RATIO = 2

export default function ClayObject({ model, label, yaw = 0, pitch = 0.18, spin = 0.32 }: {
  /** URL of the GLB, e.g. /models/landing/poplur_pin_lite.glb */
  model: string
  label: string
  /** starting turn, degrees */
  yaw?: number
  /** lean toward the camera, radians */
  pitch?: number
  /** idle turn, radians per second */
  spin?: number
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const host = hostRef.current
    if (!host || typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return
    let disposed = false
    let started = false
    let visible = false
    let raf = 0
    let last = 0
    let angle = (yaw * Math.PI) / 180
    let velocity = 0
    let dragging = false
    let dragX = 0
    const still = reducedMotion()
    let stop: (() => void) | null = null

    const start = async () => {
      if (started) return
      started = true
      try {
        const [THREE, { GLTFLoader }, { DRACOLoader }] = await Promise.all([
          import('three'),
          import('three/examples/jsm/loaders/GLTFLoader.js'),
          import('three/examples/jsm/loaders/DRACOLoader.js'),
        ])
        if (disposed) return
        // preserveDrawingBuffer: the loop stops whenever the chapter is off screen,
        // the tab is hidden or motion is reduced, and the last frame must survive
        // that idle — a non-preserved canvas can composite blank until the next draw.
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power', preserveDrawingBuffer: true })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO))
        renderer.outputColorSpace = THREE.SRGBColorSpace
        renderer.toneMapping = THREE.ACESFilmicToneMapping
        renderer.toneMappingExposure = 1.06
        renderer.setClearColor(0x000000, 0)
        const canvas = renderer.domElement
        canvas.style.position = 'absolute'
        canvas.style.inset = '0'
        canvas.style.width = '100%'
        canvas.style.height = '100%'
        host.appendChild(canvas)

        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50)
        camera.position.set(0, 0.15, 4.4)
        camera.lookAt(0, 0, 0)
        scene.add(new THREE.AmbientLight(0xd8d2ff, 1.4))
        const key = new THREE.DirectionalLight(0xfff0dd, 2.2)
        key.position.set(-2, 3, 4)
        scene.add(key)
        const rim = new THREE.DirectionalLight(0xff8ac6, 0.7)
        rim.position.set(3, 1, -3)
        scene.add(rim)
        const group = new THREE.Group()
        group.rotation.x = pitch
        scene.add(group)

        const size = () => {
          const w = Math.max(1, host.clientWidth)
          const h = Math.max(1, host.clientHeight)
          renderer.setSize(w, h, false)
          camera.aspect = w / h
          camera.updateProjectionMatrix()
        }
        size()
        const ro = new ResizeObserver(size)
        ro.observe(host)

        const draco = new DRACOLoader()
        draco.setDecoderPath(DRACO_PATH)
        draco.setWorkerLimit(1)
        const loader = new GLTFLoader()
        loader.setDRACOLoader(draco)
        const gltf = await loader.loadAsync(model)
        if (disposed) { renderer.dispose(); return }
        // Centre the object and fit its longest side to FIT_SIZE, whatever
        // scale the file came in at — the lite models are not normalised.
        const box = new THREE.Box3().setFromObject(gltf.scene)
        const centre = box.getCenter(new THREE.Vector3())
        const extent = box.getSize(new THREE.Vector3())
        const scale = FIT_SIZE / Math.max(extent.x, extent.y, extent.z, 1e-6)
        gltf.scene.position.sub(centre)
        gltf.scene.scale.setScalar(scale)
        gltf.scene.position.multiplyScalar(scale)
        group.add(gltf.scene)
        // What the fit saw, readable from the page: a model whose box is inflated by
        // a stray node shrinks to a speck, and this is how that shows up.
        host.dataset.fit = `${extent.x.toFixed(2)}x${extent.y.toFixed(2)}x${extent.z.toFixed(2)} scale ${scale.toFixed(3)}`
        setReady(true)

        const frame = (now: number) => {
          raf = 0
          if (disposed) return
          const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016)
          last = now
          if (!dragging) {
            angle += velocity + (still ? 0 : spin * dt)
            velocity *= DRAG_DAMPING
          }
          group.rotation.y = angle
          renderer.render(scene, camera)
          if (visible && !document.hidden && (!still || Math.abs(velocity) > 1e-4 || dragging)) raf = requestAnimationFrame(frame)
        }
        const tick = () => { if (!raf) { last = 0; raf = requestAnimationFrame(frame) } }
        const onVisibility = () => { if (!document.hidden && visible) tick() }
        document.addEventListener('visibilitychange', onVisibility)

        const down = (e: PointerEvent) => {
          dragging = true; dragX = e.clientX; velocity = 0
          host.setPointerCapture?.(e.pointerId)
          tick()
        }
        const move = (e: PointerEvent) => {
          if (!dragging) return
          const dx = e.clientX - dragX
          dragX = e.clientX
          angle += dx * DRAG_GAIN
          velocity = dx * DRAG_GAIN
          tick()
        }
        const up = () => { dragging = false; tick() }
        host.addEventListener('pointerdown', down)
        host.addEventListener('pointermove', move)
        host.addEventListener('pointerup', up)
        host.addEventListener('pointercancel', up)

        stop = () => {
          document.removeEventListener('visibilitychange', onVisibility)
          host.removeEventListener('pointerdown', down)
          host.removeEventListener('pointermove', move)
          host.removeEventListener('pointerup', up)
          host.removeEventListener('pointercancel', up)
          ro.disconnect()
          if (raf) cancelAnimationFrame(raf)
          gltf.scene.traverse(obj => {
            const mesh = obj as { geometry?: { dispose(): void }; material?: unknown }
            mesh.geometry?.dispose()
            const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
            for (const m of materials as { dispose(): void; map?: { dispose(): void } | null }[]) { m.map?.dispose(); m.dispose() }
          })
          renderer.dispose()
          canvas.remove()
        }
        // Whoever observed us visible before the load finished gets a frame now.
        tick()
        ;(host as HTMLDivElement & { __tick?: () => void }).__tick = tick
      } catch {
        if (!disposed) setFailed(true)
      }
    }

    const io = new IntersectionObserver(entries => {
      visible = entries.some(e => e.isIntersecting)
      if (visible) {
        if (!started) void start()
        ;(host as HTMLDivElement & { __tick?: () => void }).__tick?.()
      }
    }, { rootMargin: '60% 0px' })
    io.observe(host)

    return () => {
      disposed = true
      io.disconnect()
      stop?.()
    }
  }, [model, yaw, pitch, spin])

  return <div ref={hostRef} className={`pl-clay${ready ? ' is-ready' : ''}${failed ? ' is-failed' : ''}`} role="img" aria-label={label} />
}
