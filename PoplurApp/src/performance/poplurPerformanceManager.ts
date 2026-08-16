import { AppState, Platform } from 'react-native';

import { poplurAssetCache } from './poplurAssetCache';

export type PoplurPerformanceMode = 'FULL' | 'REDUCED' | 'LOW_POWER' | 'EMERGENCY';
export type PoplurThermalCondition =
  | 'unavailable'
  | 'nominal'
  | 'fair'
  | 'serious'
  | 'critical';
export type PoplurMemoryPressure = 'normal' | 'warning' | 'critical';
export type PoplurPhysicsQuality = 'full' | 'reduced' | 'minimal' | 'paused';

export type PoplurPerformancePolicy = {
  mode: PoplurPerformanceMode;
  targetFPS: number;
  particlesAllowed: boolean;
  particleDensityMultiplier: number;
  dynamicShadowsAllowed: boolean;
  postProcessingAllowed: boolean;
  physicsQuality: PoplurPhysicsQuality;
  maximumPreferredTextureResolution: number;
  modelTextureCacheBudgetBytes: number;
  decorativeRenderingAllowed: boolean;
  expensiveVideoBackedTexturesAllowed: boolean;
  maxActiveHeavyRenderers: 1;
  maxActiveLightRenderers: number;
  maxParticleObjects: number;
  maximumPixelRatio: number;
};

export type PoplurPerformanceSnapshot = PoplurPerformancePolicy & {
  thermalCondition: PoplurThermalCondition;
  memoryPressure: PoplurMemoryPressure;
  isForeground: boolean;
  isCurrent3DSceneVisible: boolean;
  activeHeavyRendererCount: number;
  activeLightRendererCount: number;
  visibleRendererCount: number;
  currentRenderer: string | null;
  memoryWarningCount: number;
  lowPowerMode: boolean;
  cacheEstimatedBytes: number;
  cacheLimitBytes: number;
  cachedAssetCount: number;
};

type RendererRegistration = {
  id: string;
  heavy: boolean;
  priority: number;
  visible: boolean;
  demanded: boolean;
  active: boolean;
  requestOrder: number;
  onActiveChange: (active: boolean, policy: PoplurPerformancePolicy) => void;
  releaseInactiveResources?: () => void;
};

export type PoplurRendererHandle = {
  setVisible(visible: boolean): void;
  setDemand(demanded: boolean): void;
  dispose(): void;
};

const MB = 1024 * 1024;
const MODE_SEVERITY: Record<PoplurPerformanceMode, number> = {
  FULL: 0,
  REDUCED: 1,
  LOW_POWER: 2,
  EMERGENCY: 3,
};

const MODE_FROM_SEVERITY: PoplurPerformanceMode[] = [
  'FULL',
  'REDUCED',
  'LOW_POWER',
  'EMERGENCY',
];

function hardwareTier() {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return 'mid' as const;
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  const memory = nav.deviceMemory ?? 4;
  const cores = nav.hardwareConcurrency ?? 4;
  if (memory <= 3 || cores <= 4 || nav.connection?.saveData) return 'low' as const;
  if (memory >= 8 && cores >= 8) return 'high' as const;
  return 'mid' as const;
}

function baseCacheBudgetBytes() {
  const tier = hardwareTier();
  if (tier === 'low') return 150 * MB;
  if (tier === 'high') return 450 * MB;
  return 300 * MB;
}

function makePolicy(mode: PoplurPerformanceMode): PoplurPerformancePolicy {
  const cacheScale = mode === 'FULL' ? 1 : mode === 'REDUCED' ? 0.75 : mode === 'LOW_POWER' ? 0.5 : 0.25;
  const cacheBudget = Math.floor(baseCacheBudgetBytes() * cacheScale);
  switch (mode) {
    case 'FULL':
      return {
        mode,
        targetFPS: 30,
        particlesAllowed: true,
        particleDensityMultiplier: 1,
        dynamicShadowsAllowed: true,
        postProcessingAllowed: true,
        physicsQuality: 'full',
        maximumPreferredTextureResolution: 2048,
        modelTextureCacheBudgetBytes: cacheBudget,
        decorativeRenderingAllowed: true,
        expensiveVideoBackedTexturesAllowed: true,
        maxActiveHeavyRenderers: 1,
        maxActiveLightRenderers: 4,
        maxParticleObjects: 96,
        maximumPixelRatio: 2,
      };
    case 'REDUCED':
      return {
        mode,
        targetFPS: 24,
        particlesAllowed: true,
        particleDensityMultiplier: 0.5,
        dynamicShadowsAllowed: false,
        postProcessingAllowed: false,
        physicsQuality: 'reduced',
        maximumPreferredTextureResolution: 1536,
        modelTextureCacheBudgetBytes: cacheBudget,
        decorativeRenderingAllowed: true,
        expensiveVideoBackedTexturesAllowed: true,
        maxActiveHeavyRenderers: 1,
        maxActiveLightRenderers: 3,
        maxParticleObjects: 48,
        maximumPixelRatio: 1.5,
      };
    case 'LOW_POWER':
      return {
        mode,
        targetFPS: 15,
        particlesAllowed: true,
        particleDensityMultiplier: 0.25,
        dynamicShadowsAllowed: false,
        postProcessingAllowed: false,
        physicsQuality: 'minimal',
        maximumPreferredTextureResolution: 1024,
        modelTextureCacheBudgetBytes: cacheBudget,
        decorativeRenderingAllowed: false,
        expensiveVideoBackedTexturesAllowed: false,
        maxActiveHeavyRenderers: 1,
        maxActiveLightRenderers: 2,
        maxParticleObjects: 24,
        maximumPixelRatio: 1,
      };
    case 'EMERGENCY':
      return {
        mode,
        targetFPS: 10,
        particlesAllowed: false,
        particleDensityMultiplier: 0,
        dynamicShadowsAllowed: false,
        postProcessingAllowed: false,
        physicsQuality: 'paused',
        maximumPreferredTextureResolution: 512,
        modelTextureCacheBudgetBytes: cacheBudget,
        decorativeRenderingAllowed: false,
        expensiveVideoBackedTexturesAllowed: false,
        maxActiveHeavyRenderers: 1,
        maxActiveLightRenderers: 1,
        maxParticleObjects: 0,
        maximumPixelRatio: 1,
      };
  }
}

function thermalMode(thermal: PoplurThermalCondition): PoplurPerformanceMode {
  if (thermal === 'critical') return 'EMERGENCY';
  if (thermal === 'serious') return 'LOW_POWER';
  if (thermal === 'fair') return 'REDUCED';
  return 'FULL';
}

function worseMode(...modes: PoplurPerformanceMode[]): PoplurPerformanceMode {
  return MODE_FROM_SEVERITY[Math.max(...modes.map((mode) => MODE_SEVERITY[mode]))];
}

class PoplurPerformanceManagerImpl {
  private listeners = new Set<(snapshot: PoplurPerformanceSnapshot) => void>();
  private renderers = new Map<string, RendererRegistration>();
  private requestOrder = 0;
  private readonly hardwareMode: PoplurPerformanceMode = hardwareTier() === 'low' ? 'REDUCED' : 'FULL';
  private mode: PoplurPerformanceMode = this.hardwareMode;
  private inferredMode: PoplurPerformanceMode = 'FULL';
  private reducedMotion = false;
  private thermalCondition: PoplurThermalCondition = 'unavailable';
  private memoryPressure: PoplurMemoryPressure = 'normal';
  private isForeground = true;
  private lowPowerMode = false;
  private memoryWarningCount = 0;
  private frameIntervals: number[] = [];
  private recoveryWindows = 0;

  constructor() {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      this.isForeground = !document.hidden;
      document.addEventListener('visibilitychange', () => {
        this.setForeground(!document.hidden, 'Document visibility');
      });
      window.addEventListener('pagehide', () => this.setForeground(false, 'Page hidden'));
      window.addEventListener('pageshow', () => this.setForeground(!document.hidden, 'Page shown'));
      window.addEventListener('poplur-native-thermal', (event) => {
        this.setThermalCondition((event as CustomEvent).detail);
      });
      window.addEventListener('poplur-memory-pressure', (event) => {
        this.reportMemoryPressure((event as CustomEvent).detail);
      });
      window.addEventListener('poplur-low-power-mode', (event) => {
        this.setLowPowerMode(Boolean((event as CustomEvent).detail));
      });
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
      this.reducedMotion = Boolean(reduceMotion?.matches);
      reduceMotion?.addEventListener?.('change', (event) => {
        this.reducedMotion = event.matches;
        this.recomputeMode('Reduced-motion preference');
      });
    } else {
      this.isForeground = AppState.currentState === 'active';
      AppState.addEventListener('change', (state) => {
        this.setForeground(state === 'active', `AppState ${state}`);
      });
    }
    this.applyPolicy();
    if (typeof __DEV__ !== 'undefined' && __DEV__ && typeof globalThis !== 'undefined') {
      (globalThis as typeof globalThis & { __poplurPerformance?: PoplurPerformanceManagerImpl })
        .__poplurPerformance = this;
    }
  }

  get policy() {
    return makePolicy(this.mode);
  }

  get snapshot(): PoplurPerformanceSnapshot {
    const policy = this.policy;
    const active = [...this.renderers.values()].filter((renderer) => renderer.active);
    const cache = poplurAssetCache.diagnostics();
    return {
      ...policy,
      thermalCondition: this.thermalCondition,
      memoryPressure: this.memoryPressure,
      isForeground: this.isForeground,
      isCurrent3DSceneVisible: [...this.renderers.values()].some(
        (renderer) => renderer.heavy && renderer.visible,
      ),
      activeHeavyRendererCount: active.filter((renderer) => renderer.heavy).length,
      activeLightRendererCount: active.filter((renderer) => !renderer.heavy).length,
      visibleRendererCount: [...this.renderers.values()].filter((renderer) => renderer.visible).length,
      currentRenderer: active.find((renderer) => renderer.heavy)?.id ?? active[0]?.id ?? null,
      memoryWarningCount: this.memoryWarningCount,
      lowPowerMode: this.lowPowerMode,
      cacheEstimatedBytes: cache.estimatedBytes,
      cacheLimitBytes: cache.limitBytes,
      cachedAssetCount: cache.count,
    };
  }

  subscribe(listener: (snapshot: PoplurPerformanceSnapshot) => void) {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => { this.listeners.delete(listener); };
  }

  registerRenderer(options: {
    id: string;
    heavy?: boolean;
    priority?: number;
    visible?: boolean;
    demanded?: boolean;
    onActiveChange: (active: boolean, policy: PoplurPerformancePolicy) => void;
    releaseInactiveResources?: () => void;
  }): PoplurRendererHandle {
    const previous = this.renderers.get(options.id);
    if (previous) {
      previous.onActiveChange(false, this.policy);
      previous.releaseInactiveResources?.();
      this.renderers.delete(options.id);
    }
    const registration: RendererRegistration = {
      id: options.id,
      heavy: options.heavy ?? true,
      priority: options.priority ?? 0,
      visible: options.visible ?? true,
      demanded: options.demanded ?? true,
      active: false,
      requestOrder: ++this.requestOrder,
      onActiveChange: options.onActiveChange,
      releaseInactiveResources: options.releaseInactiveResources,
    };
    this.renderers.set(options.id, registration);
    this.reconcileRenderers();

    return {
      setVisible: (visible) => {
        if (registration.visible === visible) return;
        registration.visible = visible;
        if (visible) registration.requestOrder = ++this.requestOrder;
        this.reconcileRenderers();
      },
      setDemand: (demanded) => {
        if (registration.demanded === demanded) return;
        registration.demanded = demanded;
        if (demanded) registration.requestOrder = ++this.requestOrder;
        this.reconcileRenderers();
      },
      dispose: () => {
        if (this.renderers.get(registration.id) !== registration) return;
        if (registration.active) registration.onActiveChange(false, this.policy);
        registration.active = false;
        registration.releaseInactiveResources?.();
        this.renderers.delete(registration.id);
        this.reconcileRenderers();
      },
    };
  }

  setThermalCondition(raw: unknown) {
    const normalized = String(
      typeof raw === 'object' && raw ? (raw as { state?: unknown }).state ?? '' : raw ?? '',
    ).toLowerCase();
    const next: PoplurThermalCondition =
      normalized === 'nominal' || normalized === 'fair' || normalized === 'serious' || normalized === 'critical'
        ? normalized
        : 'unavailable';
    if (next === this.thermalCondition) return;
    this.thermalCondition = next;
    this.recomputeMode('Thermal pressure');
  }

  setLowPowerMode(enabled: boolean) {
    if (enabled === this.lowPowerMode) return;
    this.lowPowerMode = enabled;
    this.recomputeMode('Low power mode');
  }

  reportMemoryPressure(raw: unknown = 'warning') {
    const normalized = String(
      typeof raw === 'object' && raw ? (raw as { level?: unknown }).level ?? '' : raw,
    ).toLowerCase();
    this.memoryPressure = normalized === 'critical' ? 'critical' : 'warning';
    this.memoryWarningCount += 1;
    if (this.memoryPressure === 'critical') poplurAssetCache.purge('critical memory pressure');
    else poplurAssetCache.trimToFraction(0.25, 'memory pressure');
    this.recomputeMode('Memory pressure');
  }

  clearMemoryPressure() {
    if (this.memoryPressure === 'normal') return;
    this.memoryPressure = 'normal';
    this.recomputeMode('Memory recovered');
  }

  /** Web has no standard thermal API. Renderers feed their actual intervals
   * here so sustained missed deadlines can lower quality with hysteresis. */
  reportFrameInterval(intervalMs: number) {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0 || !this.isForeground) return;
    this.frameIntervals.push(intervalMs);
    if (this.frameIntervals.length < 90) return;
    const sorted = [...this.frameIntervals].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    this.frameIntervals = [];
    const deadline = 1000 / this.policy.targetFPS;
    if (median > deadline * 1.65) {
      this.recoveryWindows = 0;
      const severity = Math.min(3, MODE_SEVERITY[this.inferredMode] + 1);
      this.inferredMode = MODE_FROM_SEVERITY[severity];
      this.recomputeMode('Sustained frame pressure');
    } else if (median < deadline * 1.12 && this.inferredMode !== 'FULL') {
      this.recoveryWindows += 1;
      if (this.recoveryWindows >= 12) {
        this.recoveryWindows = 0;
        const severity = Math.max(0, MODE_SEVERITY[this.inferredMode] - 1);
        this.inferredMode = MODE_FROM_SEVERITY[severity];
        this.recomputeMode('Sustained recovery');
      }
    } else {
      this.recoveryWindows = 0;
    }
  }

  private setForeground(foreground: boolean, reason: string) {
    if (foreground === this.isForeground) return;
    this.isForeground = foreground;
    if (!foreground) {
      // Cached resources are inactive by definition. Retain only a small warm
      // set; render/video owners receive an inactive callback below.
      poplurAssetCache.trimToFraction(0.25, 'background');
    }
    this.reconcileRenderers();
    this.log(`${foreground ? 'Resumed' : 'Paused'} renderers: ${reason}`);
  }

  private recomputeMode(reason: string) {
    const memoryMode =
      this.memoryPressure === 'critical'
        ? 'EMERGENCY'
        : this.memoryPressure === 'warning'
          ? 'LOW_POWER'
          : 'FULL';
    const next = worseMode(
      this.hardwareMode,
      this.inferredMode,
      this.reducedMotion ? 'REDUCED' : 'FULL',
      thermalMode(this.thermalCondition),
      this.lowPowerMode ? 'LOW_POWER' : 'FULL',
      memoryMode,
    );
    if (next === this.mode) {
      this.applyPolicy();
      this.emit();
      return;
    }
    const previous = this.mode;
    this.mode = next;
    this.applyPolicy();
    this.reconcileRenderers(true);
    this.log(`Mode changed ${previous} -> ${next}. Reason: ${reason}`);
  }

  private applyPolicy() {
    const policy = this.policy;
    poplurAssetCache.configure({
      maxBytes: policy.modelTextureCacheBudgetBytes,
      maxEntries: policy.mode === 'FULL' ? 96 : policy.mode === 'REDUCED' ? 72 : policy.mode === 'LOW_POWER' ? 40 : 16,
    });
  }

  private reconcileRenderers(forcePolicyUpdate = false) {
    const eligible = [...this.renderers.values()]
      .filter((renderer) => this.isForeground && renderer.visible && renderer.demanded)
      .sort((a, b) => b.priority - a.priority || b.requestOrder - a.requestOrder);
    const heavy = new Set(eligible.filter((renderer) => renderer.heavy).slice(0, 1));
    const light = new Set(
      eligible
        .filter((renderer) => !renderer.heavy)
        .slice(0, this.policy.maxActiveLightRenderers),
    );

    for (const renderer of this.renderers.values()) {
      const shouldBeActive = heavy.has(renderer) || light.has(renderer);
      if (renderer.active === shouldBeActive && !forcePolicyUpdate) continue;
      renderer.active = shouldBeActive;
      renderer.onActiveChange(shouldBeActive, this.policy);
      if (!shouldBeActive) renderer.releaseInactiveResources?.();
      this.log(`${shouldBeActive ? 'Activated' : 'Paused'} renderer: ${renderer.id}`);
    }
    this.emit();
  }

  private emit() {
    const snapshot = this.snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }

  private log(message: string) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.info(`[PoplurPerformance] ${message}`);
    }
  }
}

export const PoplurPerformanceManager = new PoplurPerformanceManagerImpl();
