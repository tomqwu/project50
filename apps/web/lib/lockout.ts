/**
 * Account lockout + suspicious-activity throttling for abuse prevention (#34).
 *
 * The app's auth is OAuth + a mobile token exchange (no passwords yet), so
 * "account lockout" here means: after N *failed* sensitive attempts for a key
 * (typically a client IP, but any string identifier works) within a rolling
 * window, further attempts are locked for a cooldown that is deliberately
 * LONGER than the short rate-limit window in `@/lib/rate-limit`. This turns a
 * burst of failed attempts (credential stuffing / probing) into a sustained
 * block rather than a per-window slap on the wrist.
 *
 * Design:
 * - `recordFailure` increments a rolling-window failure counter for the key.
 *   Once it reaches `maxFailures`, the key is locked until `now + lockoutMs`.
 * - `isLockedOut` reports whether a key is currently locked and how long the
 *   caller should wait (`retryAfterSeconds`) — call it BEFORE doing work.
 * - `recordSuccess` clears all state for the key (a legitimate success should
 *   forgive prior sporadic failures).
 * - `suspiciousThrottle` is a small fixed-window burst detector for flagging
 *   suspicious activity (it does not itself block; the caller decides).
 *
 * `now` is injectable everywhere so tests don't depend on the wall clock, and
 * `resetLockout()` clears all state between tests.
 *
 * LIMITATION (same as `@/lib/rate-limit`): state lives in a module-level Map,
 * so it is per-process / per-instance. In a multi-instance deployment each
 * instance tracks failures independently (effective tolerance scales with
 * instance count) and state is lost on cold start. For correct distributed
 * lockout, back the `LockoutStore` interface below with a shared store such as
 * Redis (e.g. INCR + EXPIRE for the window counter, plus a `lockedUntil` key
 * with a TTL). The function signatures are intentionally store-agnostic so the
 * in-memory Map can be swapped for a Redis-backed implementation without
 * touching call sites.
 */

export interface LockoutConfig {
  /** Failures within `windowMs` required to trip the lock. */
  maxFailures: number;
  /** Rolling window over which failures accumulate (e.g. 15 min). */
  windowMs: number;
  /** Cooldown the key stays locked once tripped (e.g. 30 min). */
  lockoutMs: number;
}

export const LOCKOUT_CONFIG: LockoutConfig = {
  maxFailures: 5,
  windowMs: 15 * 60_000, // 15 minutes
  lockoutMs: 30 * 60_000, // 30 minutes (> rate-limit window)
};

export interface LockoutStatus {
  locked: boolean;
  retryAfterSeconds: number;
}

interface LockoutState {
  failures: number;
  /** Start of the current rolling failure window. */
  windowStart: number;
  /** Epoch ms until which the key is locked, or undefined when not locked. */
  lockedUntil?: number;
}

/**
 * Minimal store interface. The default implementation is an in-memory Map; a
 * Redis-backed store implementing the same shape can be dropped in for
 * distributed deployments (see file header).
 */
interface LockoutStore {
  get(key: string): LockoutState | undefined;
  set(key: string, state: LockoutState): void;
  delete(key: string): void;
  clear(): void;
}

const store: LockoutStore = new Map<string, LockoutState>();

/**
 * Record a failed sensitive attempt for `key`. Counts failures within the
 * rolling window; on reaching `maxFailures` the key is locked for `lockoutMs`.
 */
export function recordFailure(
  key: string,
  now: number = Date.now(),
  config: LockoutConfig = LOCKOUT_CONFIG,
): void {
  let state = store.get(key);
  if (!state || now - state.windowStart >= config.windowMs) {
    // No prior state, or the rolling window has elapsed → start fresh.
    state = { failures: 0, windowStart: now };
  }

  state.failures += 1;
  if (state.failures >= config.maxFailures) {
    state.lockedUntil = now + config.lockoutMs;
  }
  store.set(key, state);
}

/**
 * Report whether `key` is currently locked. Expired locks are cleared on read
 * so the key starts fresh. Call this BEFORE processing a sensitive request.
 */
export function isLockedOut(
  key: string,
  now: number = Date.now(),
): LockoutStatus {
  const state = store.get(key);
  if (!state || state.lockedUntil === undefined) {
    return { locked: false, retryAfterSeconds: 0 };
  }
  if (now >= state.lockedUntil) {
    // Cooldown elapsed — forget the key so it starts fresh.
    store.delete(key);
    return { locked: false, retryAfterSeconds: 0 };
  }
  return {
    locked: true,
    retryAfterSeconds: Math.ceil((state.lockedUntil - now) / 1000),
  };
}

/** Clear all lockout state for `key` after a legitimate success. */
export function recordSuccess(key: string): void {
  store.delete(key);
}

/** Test helper: clear all lockout + suspicious-activity state. */
export function resetLockout(): void {
  store.clear();
  suspiciousStore.clear();
}

export interface SuspiciousThrottleOptions {
  limit: number;
  windowMs: number;
  now?: number;
}

export interface SuspiciousThrottleResult {
  suspicious: boolean;
  retryAfterSeconds: number;
}

const suspiciousStore = new Map<
  string,
  { count: number; windowStart: number }
>();

/**
 * Lightweight fixed-window burst detector for "suspicious activity". Unlike a
 * hard rate limit it does not block on its own — it flags (`suspicious: true`)
 * once a key exceeds `limit` events within `windowMs`, leaving the policy
 * decision (warn, log, escalate to lockout) to the caller.
 */
export function suspiciousThrottle(
  key: string,
  opts: SuspiciousThrottleOptions,
): SuspiciousThrottleResult {
  const now = opts.now ?? Date.now();
  const { limit, windowMs } = opts;

  let state = suspiciousStore.get(key);
  if (!state || now - state.windowStart >= windowMs) {
    state = { count: 0, windowStart: now };
    suspiciousStore.set(key, state);
  }
  state.count += 1;

  const suspicious = state.count > limit;
  return {
    suspicious,
    retryAfterSeconds: suspicious
      ? Math.ceil((state.windowStart + windowMs - now) / 1000)
      : 0,
  };
}
