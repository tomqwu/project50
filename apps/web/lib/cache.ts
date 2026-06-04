/**
 * Tiny TTL cache for hot, low-volatility read paths.
 *
 * Backend: an in-process `Map` with per-entry expiry. The active backend is
 * env-pluggable (see "Swapping in Redis" below); the default in-memory backend
 * is used whenever no external cache is configured.
 *
 * ## Per-instance limitation
 *
 * The default backend lives in the memory of a single Node process. In a
 * multi-instance / serverless deployment each instance keeps its own copy, so:
 *   - cache hit rates are per-instance (a cold instance always misses), and
 *   - `invalidate(key)` only clears the entry on the instance that runs it —
 *     other instances keep serving their copy until its TTL expires.
 *
 * Because of that we only cache data that is safe to serve slightly stale,
 * always with a short TTL so staleness is bounded even without invalidation.
 * Never cache user-private / auth-sensitive reads through this layer.
 *
 * ## Swapping in Redis (shared backend)
 *
 * To get a cluster-wide cache (and cluster-wide invalidation), set `CACHE_URL`
 * to a Redis connection string and implement {@link CacheBackend} on top of a
 * Redis client. The {@link cached}/{@link invalidate}/{@link clearCache} API is
 * already expressed against that interface, so call sites do not change. No
 * Redis dependency is bundled today — the interface is the integration seam:
 *
 * ```ts
 * // lib/cache.redis.ts (illustrative — not shipped)
 * import { createClient } from "redis";
 * const client = createClient({ url: process.env.CACHE_URL });
 * export const redisBackend: CacheBackend = {
 *   get: async (k) => { const v = await client.get(k); return v == null ? undefined : JSON.parse(v); },
 *   set: async (k, v, ttlMs) => { await client.set(k, JSON.stringify(v), { PX: ttlMs }); },
 *   delete: async (k) => { await client.del(k); },
 *   clear: async () => { await client.flushDb(); },
 * };
 * ```
 *
 * Then construct the cache with `new TtlCache({ backend: redisBackend })` when
 * `process.env.CACHE_URL` is set. With Redis, `delete`/expiry are authoritative
 * across all instances and the per-instance caveats above no longer apply.
 */

/** Returns the current time in epoch milliseconds. Injectable for tests. */
export type Clock = () => number;

/**
 * Storage seam for the cache. The in-memory backend implements this, and a
 * Redis-backed implementation can be dropped in behind `CACHE_URL` without
 * changing any call sites. Methods may be async so a network backend fits.
 */
export interface CacheBackend {
  get<T>(key: string): T | undefined | Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs: number): void | Promise<void>;
  delete(key: string): void | Promise<void>;
  clear(): void | Promise<void>;
}

interface Entry {
  value: unknown;
  /** Epoch ms at which this entry expires (exclusive). */
  expiresAt: number;
}

/**
 * In-memory {@link CacheBackend}: a `Map` with per-entry expiry, evaluated
 * lazily against the injected {@link Clock} on read.
 */
export class MemoryBackend implements CacheBackend {
  private readonly store = new Map<string, Entry>();
  constructor(private readonly clock: Clock) {}

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (entry === undefined) return undefined;
    if (this.clock() >= entry.expiresAt) {
      // Expired: evict eagerly so the Map does not grow unbounded.
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: this.clock() + ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

export interface TtlCacheOptions {
  /** Time source in epoch ms. Defaults to `Date.now`; override in tests. */
  clock?: Clock;
  /** Storage backend. Defaults to {@link MemoryBackend}. */
  backend?: CacheBackend;
}

/**
 * TTL cache exposing a memoizing {@link get} plus point invalidation and a full
 * clear. Concurrent `get`s for the same key share a single in-flight loader so
 * a cache miss does not stampede the underlying source.
 */
export class TtlCache {
  private readonly backend: CacheBackend;
  /** In-flight loaders, keyed by cache key, to de-duplicate concurrent misses. */
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(options: TtlCacheOptions = {}) {
    const clock = options.clock ?? Date.now;
    this.backend = options.backend ?? new MemoryBackend(clock);
  }

  /**
   * Return the cached value for `key` if present and unexpired; otherwise run
   * `loader`, store the result for `ttlMs`, and return it. Concurrent callers
   * for the same key await the same loader. `loader` rejections are not cached.
   *
   * A loader that resolves to `undefined` is treated as "nothing to cache": the
   * value is returned but not stored, so a subsequent call re-runs the loader.
   * Use this to avoid caching "absent" results (e.g. an unknown profile) that
   * should become visible as soon as the underlying row exists.
   */
  async get<T>(
    key: string,
    ttlMs: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    const hit = await this.backend.get<T>(key);
    if (hit !== undefined) return hit;

    const pending = this.inFlight.get(key) as Promise<T> | undefined;
    if (pending !== undefined) return pending;

    const promise = (async () => {
      const value = await loader();
      if (value !== undefined) await this.backend.set(key, value, ttlMs);
      return value;
    })();
    this.inFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      this.inFlight.delete(key);
    }
  }

  /** Drop the entry for `key` (no-op if absent). */
  async invalidate(key: string): Promise<void> {
    await this.backend.delete(key);
  }

  /** Remove every entry. Primarily a test helper. */
  async clear(): Promise<void> {
    await this.backend.clear();
  }
}

/**
 * Process-wide default cache instance used by app read paths. Backed by the
 * in-memory backend; swap in a Redis backend here behind `CACHE_URL` to share
 * state across instances.
 */
export const cache = new TtlCache();

/**
 * Memoize an async read under `key` for `ttlMs` using the shared {@link cache}.
 *
 * @example
 * const profile = await cached(`profile:${handle}`, 30_000, () =>
 *   loadProfile(handle),
 * );
 */
export function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  return cache.get(key, ttlMs, loader);
}

/** Invalidate a single key in the shared {@link cache}. */
export function invalidate(key: string): Promise<void> {
  return cache.invalidate(key);
}

/** Clear the shared {@link cache}. Intended for tests. */
export function clearCache(): Promise<void> {
  return cache.clear();
}
