import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

import { PoplurPerformanceManager } from '@/performance/poplurPerformanceManager';

type PageCubeProps = {
  currentPage: number;
  currentSection: number;
  onSwipePage: (page: number) => void;
  onSwipeSection: (section: number) => void;
  pageLabels: string[];
  triggerCount?: number;
  pageProgress?: number;
};

function createFaceTexture(label: string, foreground: string, accent = '#ff1797') {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = 512;
  canvas.height = 512;
  if (!context) return new THREE.CanvasTexture(canvas);

  const base = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  base.addColorStop(0, '#4a0a3b');
  base.addColorStop(0.45, '#1a071f');
  base.addColorStop(1, '#7b0d52');
  context.fillStyle = base;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const petalCenters = [
    [228, 196],
    [316, 196],
    [228, 284],
    [316, 284],
  ];
  for (const [x, y] of petalCenters) {
    const petal = context.createRadialGradient(x, y, 8, x, y, 92);
    petal.addColorStop(0, accent);
    petal.addColorStop(0.58, '#ee0088');
    petal.addColorStop(1, 'rgba(255, 23, 151, 0)');
    context.fillStyle = petal;
    context.beginPath();
    context.arc(x, y, 92, 0, Math.PI * 2);
    context.fill();
  }

  const glow = context.createRadialGradient(256, 248, 20, 256, 248, 245);
  glow.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
  glow.addColorStop(0.45, 'rgba(255, 23, 151, 0.16)');
  glow.addColorStop(1, 'rgba(255, 23, 151, 0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const shine = context.createLinearGradient(92, 36, 430, 376);
  shine.addColorStop(0, 'rgba(255, 255, 255, 0)');
  shine.addColorStop(0.5, 'rgba(255, 255, 255, 0.24)');
  shine.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.save();
  context.translate(256, 256);
  context.rotate(-0.28);
  context.fillStyle = shine;
  context.fillRect(-260, -190, 520, 82);
  context.restore();

  context.lineWidth = 18;
  context.strokeStyle = 'rgba(255, 73, 182, 0.88)';
  context.strokeRect(18, 18, canvas.width - 36, canvas.height - 36);

  const fontStack = 'Arial Rounded MT Bold, Avenir Next, Inter, system-ui, sans-serif';
  let fontSize = 88;
  context.font = `900 ${fontSize}px ${fontStack}`;
  while (context.measureText(label).width > 350 && fontSize > 52) {
    fontSize -= 4;
    context.font = `900 ${fontSize}px ${fontStack}`;
  }

  context.shadowColor = 'rgba(0, 0, 0, 0.48)';
  context.shadowBlur = 16;
  context.shadowOffsetY = 7;
  context.lineJoin = 'round';
  context.lineWidth = Math.max(10, fontSize * 0.13);
  context.strokeStyle = 'rgba(255, 23, 151, 0.92)';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.strokeText(label, canvas.width / 2, canvas.height / 2);
  context.fillStyle = foreground;
  context.fillText(label, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function PageCube({
  currentPage,
  currentSection,
  onSwipePage,
  onSwipeSection,
  pageLabels,
  triggerCount = 0,
  pageProgress = currentPage,
}: PageCubeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const currentPageRef = useRef(currentPage);
  const currentSectionRef = useRef(currentSection);
  const pageProgressRef = useRef(pageProgress);
  const onSwipePageRef = useRef(onSwipePage);
  const onSwipeSectionRef = useRef(onSwipeSection);
  const triggerPopRef = useRef(false);
  const wakeLoopRef = useRef<() => void>(() => {});

  useEffect(() => {
    currentPageRef.current = Number.isFinite(currentPage) ? currentPage : 0;
    wakeLoopRef.current();
  }, [currentPage]);

  useEffect(() => {
    pageProgressRef.current = Number.isFinite(pageProgress)
      ? Math.max(0, Math.min(1, pageProgress))
      : currentPageRef.current;
    wakeLoopRef.current();
  }, [pageProgress]);

  useEffect(() => {
    currentSectionRef.current = Number.isFinite(currentSection) ? currentSection : 0;
    wakeLoopRef.current();
  }, [currentSection]);

  useEffect(() => {
    onSwipePageRef.current = onSwipePage;
  }, [onSwipePage]);

  useEffect(() => {
    onSwipeSectionRef.current = onSwipeSection;
  }, [onSwipeSection]);

  useEffect(() => {
    if (triggerCount > 0) {
      triggerPopRef.current = true;
      wakeLoopRef.current();
    }
  }, [triggerCount]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const targetCanvas = canvas;
    const initialPolicy = PoplurPerformanceManager.policy;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: initialPolicy.mode === 'FULL',
      canvas,
    });

    const geometrySegments = initialPolicy.mode === 'FULL' ? 8 : initialPolicy.mode === 'REDUCED' ? 6 : 4;
    const geometry = new RoundedBoxGeometry(1.55, 1.55, 1.55, geometrySegments, 0.24);
    const homeTexture = createFaceTexture(pageLabels[0] ?? 'Home', '#fff7fb');
    const betaTexture = createFaceTexture(pageLabels[1] ?? 'Beta', '#fff7fb', '#ff49b6');
    const aboutTexture = createFaceTexture(pageLabels[2] ?? 'About', '#fff7fb', '#ff1797');

    // BoxGeometry face order: [+X, -X, +Y, -Y, +Z(front), -Z(back)]
    // The resting home face is straight-on. Horizontal swipes yaw left to Beta;
    // vertical swipes rotate to About.
    const materials = [
      betaTexture,   // [0] +X  ← Beta
      homeTexture,   // [1] -X
      homeTexture,   // [2] +Y
      aboutTexture,  // [3] -Y  ← About
      homeTexture,   // [4] +Z  ← Home (front face)
      homeTexture,   // [5] -Z
    ].map((map) => new THREE.MeshStandardMaterial({
      map,
      emissive: new THREE.Color('#3a062d'),
      emissiveIntensity: 0.18,
      roughness: 0.22,
      metalness: 0.18,
    }));

    const cube = new THREE.Mesh(geometry, materials);
    const ambient = new THREE.AmbientLight('#ffd4ee', 1.35);
    const key = new THREE.DirectionalLight('#ffffff', 3.1);
    const fill = new THREE.PointLight('#ff1797', 3.2, 8);
    const rim = new THREE.PointLight('#ffffff', 1.1, 5);

    camera.position.z = 4.7;
    key.position.set(2.4, 3, 4);
    fill.position.set(-2, -1.5, 3);
    rim.position.set(1.8, -2.2, 2.6);

    const BASE_X = 0;
    const BASE_Y = 0;
    const BASE_Z = 0;
    cube.rotation.set(BASE_X, BASE_Y, BASE_Z);
    scene.add(ambient, key, fill, rim, cube);
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, initialPolicy.maximumPixelRatio),
    );
    renderer.setSize(118, 118, false);

    // These track the resting rotation for each page/section state.
    // Home:  baseX = BASE_X,        baseY = BASE_Y
    // Beta:  baseX = BASE_X,        baseY = BASE_Y - π/2
    // About: baseX = BASE_X - π/2,  baseY = BASE_Y
    let baseRotationX = BASE_X;
    let baseRotationY = BASE_Y;

    let swipeStart: { x: number; y: number } | null = null;
    let isAnimating = false;

    // Animation state
    let floatElapsed = 0;
    let lastFrameTime = performance.now();
    let popStartTime: number | null = null;
    let rotTarget: {
      startX: number; startY: number;
      endX: number; endY: number;
      startTime: number;
    } | null = null;
    let animFrameId = 0;
    let wakeTimer = 0;
    let scrollSnapFrame = 0;
    let scrollSnapRestore: { element: HTMLElement; previous: string } | null = null;
    let rendererActive = false;
    let disposed = false;
    let targetFPS = initialPolicy.targetFPS;
    let decorativeRenderingAllowed = initialPolicy.decorativeRenderingAllowed;

    function render() {
      renderer.render(scene, camera);
    }

    function scrollNearestPager(nextPage: number) {
      let element: HTMLElement | null = targetCanvas.parentElement;
      while (element) {
        if (element.scrollWidth > element.clientWidth) {
          const prev = element.style.scrollSnapType;
          if (scrollSnapFrame) cancelAnimationFrame(scrollSnapFrame);
          if (scrollSnapRestore) {
            scrollSnapRestore.element.style.scrollSnapType = scrollSnapRestore.previous;
          }
          element.style.scrollSnapType = 'none';
          element.scrollLeft = window.innerWidth * nextPage;
          scrollSnapRestore = { element, previous: prev };
          scrollSnapFrame = requestAnimationFrame(() => {
            scrollSnapFrame = 0;
            if (scrollSnapRestore) {
              scrollSnapRestore.element.style.scrollSnapType = scrollSnapRestore.previous;
              scrollSnapRestore = null;
            }
          });
          return;
        }
        element = element.parentElement;
      }
    }

    function syncBaseRotation() {
      const showingHomeSection = currentPageRef.current === 0 && currentSectionRef.current === 1;
      const nextX = showingHomeSection ? BASE_X - Math.PI / 2 : BASE_X;
      const nextY = BASE_Y - pageProgressRef.current * Math.PI / 2;
      baseRotationX += (nextX - baseRotationX) * 0.2;
      baseRotationY += (nextY - baseRotationY) * 0.2;
      cube.rotation.x += (baseRotationX - cube.rotation.x) * 0.22;
      cube.rotation.y += (baseRotationY - cube.rotation.y) * 0.22;
      cube.rotation.z += (BASE_Z - cube.rotation.z) * 0.22;
      return (
        Math.abs(nextX - baseRotationX) > 0.001 ||
        Math.abs(nextY - baseRotationY) > 0.001 ||
        Math.abs(baseRotationX - cube.rotation.x) > 0.001 ||
        Math.abs(baseRotationY - cube.rotation.y) > 0.001 ||
        Math.abs(BASE_Z - cube.rotation.z) > 0.001
      );
    }

    function animate(now: number) {
      animFrameId = 0;
      if (disposed || !rendererActive) return;
      const dt = Math.min(now - lastFrameTime, 50) / 1000;
      PoplurPerformanceManager.reportFrameInterval(now - lastFrameTime);
      lastFrameTime = now;
      floatElapsed += dt;

      // Gentle float — organic sine wave on Y position
      if (decorativeRenderingAllowed) {
        cube.position.y = Math.sin(floatElapsed * 1.35) * 0.11;
      }

      // Pop
      if (triggerPopRef.current) {
        triggerPopRef.current = false;
        popStartTime = now;
      }
      if (popStartTime !== null) {
        const t = Math.min((now - popStartTime) / 440, 1);
        cube.scale.setScalar(1 + 0.32 * Math.sin(Math.PI * t) * Math.exp(-t * 2.2));
        if (t >= 1) { popStartTime = null; cube.scale.setScalar(1); }
      }

      // Rotation animation (drives both X and Y simultaneously)
      let baseMotionPending = false;
      if (rotTarget) {
        const progress = Math.min((now - rotTarget.startTime) / 320, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        cube.rotation.x = rotTarget.startX + (rotTarget.endX - rotTarget.startX) * eased;
        cube.rotation.y = rotTarget.startY + (rotTarget.endY - rotTarget.startY) * eased;
        if (progress >= 1) {
          baseRotationX = rotTarget.endX;
          baseRotationY = rotTarget.endY;
          rotTarget = null;
          isAnimating = false;
          popStartTime = now;
        }
      } else if (!swipeStart) {
        baseMotionPending = syncBaseRotation();
      }

      render();
      const hasRequiredMotion = Boolean(
        swipeStart || isAnimating || rotTarget || popStartTime !== null || baseMotionPending
      );
      if (decorativeRenderingAllowed || hasRequiredMotion) scheduleNextFrame();
    }

    function cancelLoop() {
      if (animFrameId) cancelAnimationFrame(animFrameId);
      if (wakeTimer) window.clearTimeout(wakeTimer);
      animFrameId = 0;
      wakeTimer = 0;
    }

    function scheduleNextFrame(immediate = false) {
      if (disposed || !rendererActive || animFrameId || wakeTimer) return;
      const delay = immediate ? 0 : Math.max(0, 1000 / targetFPS - 2);
      wakeTimer = window.setTimeout(() => {
        wakeTimer = 0;
        if (!disposed && rendererActive) animFrameId = requestAnimationFrame(animate);
      }, delay);
    }

    function wakeLoop() {
      if (disposed || !rendererActive) return;
      lastFrameTime = performance.now();
      scheduleNextFrame(true);
    }
    wakeLoopRef.current = wakeLoop;

    const rendererHandle = PoplurPerformanceManager.registerRenderer({
      id: 'LandingPageCube',
      // A capped 118px on-demand canvas is intentionally classified as light;
      // the full-screen particle renderer remains the sole heavy 3D lease.
      heavy: false,
      priority: 20,
      onActiveChange: (active, policy) => {
        rendererActive = active;
        targetFPS = policy.targetFPS;
        decorativeRenderingAllowed = policy.decorativeRenderingAllowed;
        renderer.setPixelRatio(
          Math.min(window.devicePixelRatio || 1, policy.maximumPixelRatio),
        );
        renderer.setSize(118, 118, false);
        if (active) wakeLoop();
        else cancelLoop();
      },
    });

    function onPointerDown(event: PointerEvent) {
      if (isAnimating) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest('input, textarea, button, a, [role="button"]')
      ) {
        return;
      }
      wakeLoop();
      swipeStart = { x: event.clientX, y: event.clientY };
      try { targetCanvas.setPointerCapture(event.pointerId); } catch { /* best-effort */ }
    }

    function onPointerMove(event: PointerEvent) {
      if (!swipeStart || isAnimating) return;
      const dx = event.clientX - swipeStart.x;
      const dy = event.clientY - swipeStart.y;
      // Real-time rotation follows the pointer on both axes
      cube.rotation.y = baseRotationY + dx * 0.013;
      cube.rotation.x = baseRotationX + dy * 0.013;
    }

    function onPointerUp(event: PointerEvent) {
      if (!swipeStart) return;
      const dx = event.clientX - swipeStart.x;
      const dy = event.clientY - swipeStart.y;
      swipeStart = null;
      try { targetCanvas.releasePointerCapture(event.pointerId); } catch { /* best-effort */ }

      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      const THRESHOLD = 44;

      // Defaults: snap back to current base
      let endX = baseRotationX;
      let endY = baseRotationY;

      if (absDx >= absDy && absDx > THRESHOLD) {
        // ── Horizontal swipe → change page (left/right) ──
        const cur = currentPageRef.current;
        const next = dx < 0 ? Math.min(1, cur + 1) : Math.max(0, cur - 1);
        if (next !== cur) {
          // Y rotates to new page face; X resets straight-on for the new face
          endX = BASE_X;
          endY = BASE_Y - next * Math.PI / 2;
          currentPageRef.current = next;
          // Also reset section when changing horizontal page
          currentSectionRef.current = 0;
          onSwipeSectionRef.current(0);
          scrollNearestPager(next);
          onSwipePageRef.current(next);
        }
      } else if (absDy > absDx && absDy > THRESHOLD) {
        // ── Vertical swipe → change section (up/down) ──
        if (currentPageRef.current !== 0) {
          rotTarget = {
            startX: cube.rotation.x,
            startY: cube.rotation.y,
            endX,
            endY,
            startTime: performance.now(),
          };
          isAnimating = true;
          return;
        }
        const cur = currentSectionRef.current;
        // swipe UP (dy < 0) → go to section 1 (About); swipe DOWN → back to 0 (Home)
        const next = dy < 0 ? Math.min(1, cur + 1) : Math.max(0, cur - 1);
        if (next !== cur) {
          // X decreases by π/2 when going to About (dy < 0)
          endX = next === 1 ? BASE_X - Math.PI / 2 : BASE_X;
          endY = BASE_Y - pageProgressRef.current * Math.PI / 2;
          currentSectionRef.current = next;
          onSwipeSectionRef.current(next);
        }
      }

      rotTarget = {
        startX: cube.rotation.x,
        startY: cube.rotation.y,
        endX,
        endY,
        startTime: performance.now(),
      };
      isAnimating = true;
    }

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    return () => {
      disposed = true;
      rendererHandle.dispose();
      cancelLoop();
      if (scrollSnapFrame) cancelAnimationFrame(scrollSnapFrame);
      if (scrollSnapRestore) {
        scrollSnapRestore.element.style.scrollSnapType = scrollSnapRestore.previous;
        scrollSnapRestore = null;
      }
      wakeLoopRef.current = () => {};
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      geometry.dispose();
      materials.forEach((m) => m.dispose());
      homeTexture.dispose();
      betaTexture.dispose();
      aboutTexture.dispose();
      renderer.dispose();
      // React reuses this canvas during StrictMode's effect replay. Shrink its
      // backing store after releasing Three resources; forceContextLoss would
      // permanently poison the reused DOM canvas.
      canvas.width = 1;
      canvas.height = 1;
    };
  }, [pageLabels]);

  return (
    <View style={styles.container}>
      <canvas ref={canvasRef} style={styles.canvas} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 118,
    height: 118,
  },
  canvas: {
    width: 118,
    height: 118,
    cursor: 'grab',
    touchAction: 'none', // capture both axes for 2D navigation
  } as any,
});
