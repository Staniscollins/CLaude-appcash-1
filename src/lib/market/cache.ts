interface Entry<T> {
  value: T;
  expires: number;
}

/**
 * Small in-memory TTL cache with in-flight request de-duplication. It lives on
 * `globalThis` so hot reloads in development keep the warm cache.
 */
class TtlCache {
  private store = new Map<string, Entry<unknown>>();
  private inflight = new Map<string, Promise<unknown>>();

  constructor(private maxEntries = 2000) {}

  get<T>(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number) {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expires: Date.now() + ttlMs });
  }

  async wrap<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;
    const pending = this.inflight.get(key) as Promise<T> | undefined;
    if (pending) return pending;
    const promise = load()
      .then((value) => {
        this.set(key, value, ttlMs);
        return value;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }

  clear() {
    this.store.clear();
  }
}

const globalForCache = globalThis as unknown as { __lumenCache?: TtlCache };

export const cache = (globalForCache.__lumenCache ??= new TtlCache());

export const TTL = {
  quote: 20_000,
  intraday: 60_000,
  daily: 15 * 60_000,
  history: 30 * 60_000,
  summary: 60 * 60_000,
  financials: 6 * 60 * 60_000,
  search: 10 * 60_000,
  news: 10 * 60_000,
  movers: 2 * 60_000,
} as const;
