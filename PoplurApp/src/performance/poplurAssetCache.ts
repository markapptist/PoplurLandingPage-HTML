export type PoplurAssetKind =
  | 'model'
  | 'texture'
  | 'scene'
  | 'decoded-image'
  | 'temporary'
  | 'video-frame';

export type PoplurAssetCacheLimits = {
  maxBytes: number;
  maxEntries: number;
  maxEntriesByKind: Record<PoplurAssetKind, number>;
};

type CacheEntry<T> = {
  key: string;
  kind: PoplurAssetKind;
  value: T;
  estimatedBytes: number;
  lastUsed: number;
  dispose?: (value: T) => void;
};

const MB = 1024 * 1024;

const DEFAULT_LIMITS: PoplurAssetCacheLimits = {
  maxBytes: 300 * MB,
  maxEntries: 96,
  maxEntriesByKind: {
    model: 8,
    texture: 24,
    scene: 2,
    'decoded-image': 32,
    temporary: 28,
    'video-frame': 2,
  },
};

function boundedInteger(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function mergeLimits(
  base: PoplurAssetCacheLimits,
  updates: Partial<PoplurAssetCacheLimits>,
): PoplurAssetCacheLimits {
  const maxEntriesByKind = { ...base.maxEntriesByKind };
  if (updates.maxEntriesByKind) {
    for (const kind of Object.keys(maxEntriesByKind) as PoplurAssetKind[]) {
      maxEntriesByKind[kind] = boundedInteger(
        updates.maxEntriesByKind[kind],
        maxEntriesByKind[kind],
      );
    }
  }
  return {
    maxBytes: boundedInteger(updates.maxBytes, base.maxBytes),
    maxEntries: boundedInteger(updates.maxEntries, base.maxEntries),
    maxEntriesByKind,
  };
}

/**
 * A byte-and-count bounded LRU for resources Poplur owns. This is deliberately
 * not described as a process-memory cap: browsers and native runtimes retain
 * memory outside this cache. Resources admitted here, however, can never grow
 * beyond the configured limits. Over-budget entries are disposed immediately.
 */
export class PoplurAssetCache {
  private entries = new Map<string, CacheEntry<unknown>>();
  private limits: PoplurAssetCacheLimits;
  private estimatedBytes = 0;
  private clock = 0;

  constructor(limits: Partial<PoplurAssetCacheLimits> = {}) {
    this.limits = mergeLimits(DEFAULT_LIMITS, limits);
  }

  configure(limits: Partial<PoplurAssetCacheLimits>) {
    this.limits = mergeLimits(this.limits, limits);
    this.evictUntilWithinLimits();
  }

  get<T>(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    entry.lastUsed = ++this.clock;
    return entry.value as T;
  }

  has(key: string) {
    return this.entries.has(key);
  }

  set<T>(
    key: string,
    value: T,
    options: {
      kind: PoplurAssetKind;
      estimatedBytes: number;
      dispose?: (value: T) => void;
    },
  ): boolean {
    this.delete(key);

    if (!Number.isFinite(options.estimatedBytes) || options.estimatedBytes < 0) {
      options.dispose?.(value);
      return false;
    }
    const estimatedBytes = Math.floor(options.estimatedBytes);
    const kindLimit = this.limits.maxEntriesByKind[options.kind];

    if (
      estimatedBytes > this.limits.maxBytes ||
      this.limits.maxEntries <= 0 ||
      kindLimit <= 0
    ) {
      options.dispose?.(value);
      return false;
    }

    const entry: CacheEntry<T> = {
      key,
      kind: options.kind,
      value,
      estimatedBytes,
      lastUsed: ++this.clock,
      dispose: options.dispose,
    };
    this.entries.set(key, entry as CacheEntry<unknown>);
    this.estimatedBytes += estimatedBytes;
    this.evictUntilWithinLimits(key);

    if (!this.entries.has(key)) {
      // The new value was the only possible eviction candidate. Its disposer
      // has already run in evict(), so callers must not retain it as cached.
      return false;
    }
    return true;
  }

  delete(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    this.entries.delete(key);
    this.estimatedBytes = Math.max(0, this.estimatedBytes - entry.estimatedBytes);
    try {
      entry.dispose?.(entry.value);
    } catch {
      // Cache accounting must remain correct even if a third-party disposer
      // throws while tearing down a GPU resource.
    }
    return true;
  }

  purge(reason = 'manual'): number {
    const released = this.estimatedBytes;
    for (const key of [...this.entries.keys()]) this.delete(key);
    if (typeof __DEV__ !== 'undefined' && __DEV__ && released > 0) {
      console.info(
        `[PoplurPerformance] Purged ${(released / MB).toFixed(1)} MB asset cache (${reason})`,
      );
    }
    return released;
  }

  trimToFraction(fraction: number, reason = 'pressure'): number {
    const boundedFraction = Number.isFinite(fraction)
      ? Math.max(0, Math.min(1, fraction))
      : 0;
    const target = Math.floor(this.limits.maxBytes * boundedFraction);
    const before = this.estimatedBytes;
    while (this.estimatedBytes > target && this.entries.size > 0) {
      const candidate = this.oldestEntry();
      if (!candidate) break;
      this.delete(candidate.key);
    }
    const released = before - this.estimatedBytes;
    if (typeof __DEV__ !== 'undefined' && __DEV__ && released > 0) {
      console.info(
        `[PoplurPerformance] Purged ${(released / MB).toFixed(1)} MB asset cache (${reason})`,
      );
    }
    return released;
  }

  diagnostics() {
    const countByKind = Object.fromEntries(
      (Object.keys(this.limits.maxEntriesByKind) as PoplurAssetKind[]).map((kind) => [
        kind,
        this.countForKind(kind),
      ]),
    ) as Record<PoplurAssetKind, number>;
    return {
      estimatedBytes: this.estimatedBytes,
      limitBytes: this.limits.maxBytes,
      count: this.entries.size,
      countLimit: this.limits.maxEntries,
      countByKind,
    };
  }

  private countForKind(kind: PoplurAssetKind) {
    let count = 0;
    for (const entry of this.entries.values()) if (entry.kind === kind) count += 1;
    return count;
  }

  private oldestEntry(kind?: PoplurAssetKind, protectedKey?: string) {
    let oldest: CacheEntry<unknown> | undefined;
    for (const entry of this.entries.values()) {
      if (entry.key === protectedKey || (kind && entry.kind !== kind)) continue;
      if (!oldest || entry.lastUsed < oldest.lastUsed) oldest = entry;
    }
    return oldest;
  }

  private evictUntilWithinLimits(protectedKey?: string) {
    for (const kind of Object.keys(this.limits.maxEntriesByKind) as PoplurAssetKind[]) {
      while (this.countForKind(kind) > this.limits.maxEntriesByKind[kind]) {
        const candidate = this.oldestEntry(kind, protectedKey) ?? this.oldestEntry(kind);
        if (!candidate) break;
        this.delete(candidate.key);
      }
    }

    while (
      (this.entries.size > this.limits.maxEntries || this.estimatedBytes > this.limits.maxBytes) &&
      this.entries.size > 0
    ) {
      const candidate = this.oldestEntry(undefined, protectedKey) ?? this.oldestEntry();
      if (!candidate) break;
      this.delete(candidate.key);
    }
  }
}

export const poplurAssetCache = new PoplurAssetCache();
