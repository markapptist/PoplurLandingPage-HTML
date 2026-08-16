import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import * as THREE from 'three';

import { PoplurPerformanceManager } from '@/performance/poplurPerformanceManager';

type ParticleBurstProps = {
  active?: boolean;
  triggerCount?: number;
};

type ConfettiPiece = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  born: number;
  life: number;
};

type SmokePuff = {
  mesh: THREE.Sprite;
  velocity: THREE.Vector3;
  born: number;
  life: number;
  startScale: number;
  endScale: number;
};

const COLORS = ['#ff0a8a', '#ff49b6', '#fff7fb', '#5df5d0', '#ffd26b'];

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function createSmokeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);

  const gradient = context.createRadialGradient(64, 64, 2, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(255, 210, 238, 0.5)');
  gradient.addColorStop(0.32, 'rgba(255, 10, 138, 0.32)');
  gradient.addColorStop(0.72, 'rgba(78, 8, 66, 0.14)');
  gradient.addColorStop(1, 'rgba(78, 8, 66, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function ParticleBurst({ active = true, triggerCount = 0 }: ParticleBurstProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const confettiRef = useRef<ConfettiPiece[]>([]);
  const smokeRef = useRef<SmokePuff[]>([]);
  const activeRef = useRef(active);
  const latestTriggerRef = useRef(triggerCount);
  const setActiveRef = useRef<(active: boolean) => void>(() => {});
  const requestBurstRef = useRef<() => void>(() => {});

  useEffect(() => {
    activeRef.current = active;
    setActiveRef.current(active);
  }, [active]);

  useEffect(() => {
    latestTriggerRef.current = triggerCount;
    requestBurstRef.current();
  }, [triggerCount]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 100);
    const initialPolicy = PoplurPerformanceManager.policy;
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: initialPolicy.mode === 'FULL',
      canvas,
    });
    const smokeTexture = createSmokeTexture();
    const confettiGeometry = new THREE.PlaneGeometry(0.055, 0.024);

    camera.position.z = 6;
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, initialPolicy.maximumPixelRatio),
    );

    function resize() {
      const width = window.innerWidth || 1;
      const height = window.innerHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }

    function burst(density: number, maxObjects: number) {
      clearParticles();
      const originY = window.innerWidth < 700 ? 0.95 : 0.76;
      const origin = new THREE.Vector3(0, originY, 0);
      const confettiCount = Math.min(
        Math.floor(52 * density),
        Math.max(0, maxObjects - Math.ceil(15 * density)),
      );
      const smokeCount = Math.min(
        Math.ceil(15 * density),
        Math.max(0, maxObjects - confettiCount),
      );

      for (let i = 0; i < confettiCount; i += 1) {
        const material = new THREE.MeshBasicMaterial({
          color: COLORS[i % COLORS.length],
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(confettiGeometry, material);
        mesh.position.copy(origin);
        mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        mesh.scale.setScalar(randomBetween(0.78, 1.45));
        scene.add(mesh);
        confettiRef.current.push({
          mesh,
          velocity: new THREE.Vector3(
            randomBetween(-1.45, 1.45),
            randomBetween(1.25, 2.65),
            randomBetween(-0.28, 0.28),
          ),
          spin: new THREE.Vector3(
            randomBetween(-7, 7),
            randomBetween(-9, 9),
            randomBetween(-6, 6),
          ),
          born: performance.now(),
          life: randomBetween(1250, 1850),
        });
      }

      for (let i = 0; i < smokeCount; i += 1) {
        const material = new THREE.SpriteMaterial({
          map: smokeTexture,
          color: i % 2 ? '#ff49b6' : '#4a0a3b',
          transparent: true,
          opacity: 0.26,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        const mesh = new THREE.Sprite(material);
        mesh.position.set(randomBetween(-0.4, 0.4), originY + randomBetween(-0.08, 0.08), -0.14);
        scene.add(mesh);
        smokeRef.current.push({
          mesh,
          velocity: new THREE.Vector3(randomBetween(-0.18, 0.18), randomBetween(0.16, 0.42), 0),
          born: performance.now(),
          life: randomBetween(1300, 2300),
          startScale: randomBetween(0.18, 0.34),
          endScale: randomBetween(0.72, 1.18),
        });
      }
    }

    function disposeConfetti(piece: ConfettiPiece) {
      scene.remove(piece.mesh);
      // All pieces share confettiGeometry; disposing it per piece invalidated
      // the surviving meshes. It is released once when the renderer unmounts.
      const material = piece.mesh.material;
      if (Array.isArray(material)) material.forEach((item) => item.dispose());
      else material.dispose();
    }

    function disposeSmoke(puff: SmokePuff) {
      scene.remove(puff.mesh);
      const material = puff.mesh.material;
      if (Array.isArray(material)) material.forEach((item) => item.dispose());
      else material.dispose();
    }

    function clearParticles() {
      confettiRef.current.forEach(disposeConfetti);
      smokeRef.current.forEach(disposeSmoke);
      confettiRef.current = [];
      smokeRef.current = [];
    }

    let animationId = 0;
    let wakeTimer = 0;
    let seenTrigger = latestTriggerRef.current;
    let rendererActive = false;
    let disposed = false;
    let targetFPS = initialPolicy.targetFPS;
    let particleDensity = initialPolicy.particleDensityMultiplier;
    let maxParticleObjects = initialPolicy.maxParticleObjects;
    let particlesAllowed = initialPolicy.particlesAllowed;
    let lastFrameTime = performance.now();

    function cancelLoop() {
      if (animationId) cancelAnimationFrame(animationId);
      if (wakeTimer) window.clearTimeout(wakeTimer);
      animationId = 0;
      wakeTimer = 0;
    }

    function scheduleNextFrame(immediate = false) {
      if (disposed || !rendererActive || animationId || wakeTimer) return;
      const delay = immediate ? 0 : Math.max(0, 1000 / targetFPS - 2);
      wakeTimer = window.setTimeout(() => {
        wakeTimer = 0;
        if (!disposed && rendererActive) animationId = requestAnimationFrame(animate);
      }, delay);
    }

    function animate(now: number) {
      animationId = 0;
      if (disposed || !rendererActive) return;
      const interval = now - lastFrameTime;
      const dt = Math.min(interval / 1000, 0.05);
      lastFrameTime = now;
      PoplurPerformanceManager.reportFrameInterval(interval);

      if (!activeRef.current) {
        clearParticles();
      }

      if (latestTriggerRef.current !== seenTrigger) {
        seenTrigger = latestTriggerRef.current;
        if (seenTrigger > 0 && activeRef.current && particlesAllowed) {
          burst(particleDensity, maxParticleObjects);
        }
      }

      confettiRef.current = confettiRef.current.filter((piece) => {
        const age = now - piece.born;
        const t = age / piece.life;
        if (t >= 1) {
          disposeConfetti(piece);
          return false;
        }
        piece.velocity.y -= 2.4 * dt;
        piece.mesh.position.addScaledVector(piece.velocity, dt);
        piece.mesh.rotation.x += piece.spin.x * dt;
        piece.mesh.rotation.y += piece.spin.y * dt;
        piece.mesh.rotation.z += piece.spin.z * dt;
        const material = piece.mesh.material as THREE.MeshBasicMaterial;
        material.opacity = Math.max(0, 1 - t);
        return true;
      });

      smokeRef.current = smokeRef.current.filter((puff) => {
        const age = now - puff.born;
        const t = age / puff.life;
        if (t >= 1) {
          disposeSmoke(puff);
          return false;
        }
        puff.mesh.position.addScaledVector(puff.velocity, dt);
        const scale = puff.startScale + (puff.endScale - puff.startScale) * t;
        puff.mesh.scale.set(scale, scale, scale);
        const material = puff.mesh.material as THREE.SpriteMaterial;
        material.opacity = 0.26 * Math.sin(Math.PI * t);
        return true;
      });

      renderer.render(scene, camera);
      if (confettiRef.current.length > 0 || smokeRef.current.length > 0) {
        scheduleNextFrame();
      } else {
        rendererHandle.setDemand(false);
      }
    }

    resize();
    const rendererHandle = PoplurPerformanceManager.registerRenderer({
      id: 'LandingParticleBurst',
      heavy: true,
      priority: 40,
      demanded: false,
      onActiveChange: (isActive, policy) => {
        rendererActive = isActive;
        targetFPS = policy.targetFPS;
        particleDensity = policy.particleDensityMultiplier;
        maxParticleObjects = policy.maxParticleObjects;
        particlesAllowed = policy.particlesAllowed;
        renderer.setPixelRatio(
          Math.min(window.devicePixelRatio || 1, policy.maximumPixelRatio),
        );
        resize();
        if (!particlesAllowed) {
          clearParticles();
          cancelLoop();
          // The policy may change while a burst owns the lease. Drop demand as
          // well as the objects so EMERGENCY mode cannot reserve a dead canvas.
          queueMicrotask(() => {
            if (!disposed) rendererHandle.setDemand(false);
          });
          return;
        }
        if (isActive) {
          lastFrameTime = performance.now();
          scheduleNextFrame(true);
        } else {
          cancelLoop();
        }
      },
      releaseInactiveResources: clearParticles,
    });

    const requestBurst = () => {
      if (!activeRef.current || latestTriggerRef.current <= seenTrigger) return;
      if (!PoplurPerformanceManager.policy.particlesAllowed) {
        seenTrigger = latestTriggerRef.current;
        clearParticles();
        rendererHandle.setDemand(false);
        return;
      }
      rendererHandle.setDemand(true);
      if (rendererActive) scheduleNextFrame(true);
    };
    requestBurstRef.current = requestBurst;
    setActiveRef.current = (isActive) => {
      if (isActive) requestBurst();
      else {
        seenTrigger = latestTriggerRef.current;
        clearParticles();
        rendererHandle.setDemand(false);
        cancelLoop();
      }
    };
    window.addEventListener('resize', resize);

    return () => {
      disposed = true;
      rendererHandle.dispose();
      cancelLoop();
      requestBurstRef.current = () => {};
      setActiveRef.current = () => {};
      window.removeEventListener('resize', resize);
      clearParticles();
      confettiGeometry.dispose();
      smokeTexture.dispose();
      renderer.dispose();
      // This React-owned canvas is reused during StrictMode effect replay, so
      // release Three resources and its large backing store without poisoning
      // the canvas via WEBGL_lose_context.
      canvas.width = 1;
      canvas.height = 1;
    };
  }, []);

  return (
    <View pointerEvents="none" style={styles.container}>
      <canvas ref={canvasRef} style={styles.canvas} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    zIndex: 4,
  },
  canvas: {
    width: '100%',
    height: '100%',
    display: 'block',
  } as any,
});
