type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export class SimpleCache<T = unknown> {
  private store = new Map<string, CacheEntry<T>>();

  constructor(private defaultTtlMs = 30_000) {}

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    const expiresAt = Date.now() + (ttlMs ?? this.defaultTtlMs);
    this.store.set(key, { value, expiresAt });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

export const statsCache = new SimpleCache<any>(30_000);

export const invalidateStatsCache = (): void => {
  statsCache.clear();
};
