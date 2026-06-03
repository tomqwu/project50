/**
 * Fixed-window in-memory rate limiter.
 *
 * Pure & testable: the window state lives in a module-level Map keyed by `key`,
 * and `now` is injectable so tests don't depend on the wall clock.
 *
 * LIMITATION: the store is per-process / per-instance. In a multi-instance
 * deployment (e.g. several serverless workers or pods) each instance keeps its
 * own counters, so the effective limit is `limit * instanceCount` and counters
 * reset on cold start. For correct distributed limiting, back this with a shared
 * store such as Redis (e.g. INCR + EXPIRE per window key). This implementation is
 * sufficient for single-instance / best-effort abuse throttling.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
  now?: number;
}

interface WindowState {
  count: number;
  windowStart: number;
}

const store = new Map<string, WindowState>();

/**
 * Check (and record) a request against a fixed-window limit for `key`.
 *
 * Each call increments the counter for the current window. A request is allowed
 * while the count is within `limit`; once exceeded it is blocked and
 * `retryAfterSeconds` tells the caller when the window resets.
 */
export function checkRateLimit(
  key: string,
  opts: RateLimitOptions,
): RateLimitResult {
  const now = opts.now ?? Date.now();
  const { limit, windowMs } = opts;

  let state = store.get(key);
  if (!state || now - state.windowStart >= windowMs) {
    // Start a fresh window (no prior state, or the previous window has elapsed).
    state = { count: 0, windowStart: now };
    store.set(key, state);
  }

  state.count += 1;
  const allowed = state.count <= limit;
  const remaining = Math.max(0, limit - state.count);
  const retryAfterSeconds = allowed
    ? 0
    : Math.ceil((state.windowStart + windowMs - now) / 1000);

  return { allowed, remaining, retryAfterSeconds };
}

/** Test helper: clear all rate-limit state. */
export function resetRateLimit(): void {
  store.clear();
}

/**
 * Derive a client key from a request, using the first IP in `x-forwarded-for`
 * and falling back to "unknown" when the header is absent or empty.
 */
export function clientKey(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (!xff) return "unknown";
  // `split` always yields at least one element, so `[0]` is a string here.
  const first = xff.split(",")[0]!.trim();
  if (first === "") return "unknown";
  return first;
}
