import { describe, it, expect, beforeEach } from "vitest";
import {
  recordFailure,
  recordSuccess,
  isLockedOut,
  resetLockout,
  suspiciousThrottle,
  LOCKOUT_CONFIG,
} from "./lockout";

beforeEach(() => {
  resetLockout();
});

describe("isLockedOut", () => {
  it("reports not locked for an unknown key", () => {
    expect(isLockedOut("a", 1_000)).toEqual({
      locked: false,
      retryAfterSeconds: 0,
    });
  });

  it("stays unlocked while failures are under the threshold", () => {
    for (let i = 0; i < LOCKOUT_CONFIG.maxFailures - 1; i++) {
      recordFailure("a", 1_000);
    }
    expect(isLockedOut("a", 1_000).locked).toBe(false);
  });

  it("locks the key once maxFailures is reached", () => {
    for (let i = 0; i < LOCKOUT_CONFIG.maxFailures; i++) {
      recordFailure("a", 1_000);
    }
    const res = isLockedOut("a", 1_000);
    expect(res.locked).toBe(true);
    // Locked for the full cooldown from the locking failure.
    expect(res.retryAfterSeconds).toBe(
      Math.ceil(LOCKOUT_CONFIG.lockoutMs / 1000),
    );
  });
});

describe("recordFailure window", () => {
  it("only counts failures within the rolling window", () => {
    // One failure at t=1000.
    recordFailure("a", 1_000);
    // The window elapses before the next failures, so the counter resets and
    // we never reach the threshold.
    const later = 1_000 + LOCKOUT_CONFIG.windowMs;
    for (let i = 0; i < LOCKOUT_CONFIG.maxFailures - 1; i++) {
      recordFailure("a", later);
    }
    expect(isLockedOut("a", later).locked).toBe(false);
  });

  it("counts failures that all fall inside the window toward the lock", () => {
    for (let i = 0; i < LOCKOUT_CONFIG.maxFailures; i++) {
      // Spread within the window (each 1ms apart).
      recordFailure("a", 1_000 + i);
    }
    expect(isLockedOut("a", 1_000 + LOCKOUT_CONFIG.maxFailures).locked).toBe(
      true,
    );
  });
});

describe("lockout cooldown expiry", () => {
  it("unlocks after the cooldown elapses and reports decreasing retryAfter", () => {
    for (let i = 0; i < LOCKOUT_CONFIG.maxFailures; i++) {
      recordFailure("a", 1_000);
    }
    // Halfway through the cooldown it is still locked, with a smaller retryAfter.
    const half = 1_000 + LOCKOUT_CONFIG.lockoutMs / 2;
    const mid = isLockedOut("a", half);
    expect(mid.locked).toBe(true);
    expect(mid.retryAfterSeconds).toBe(
      Math.ceil(LOCKOUT_CONFIG.lockoutMs / 2 / 1000),
    );

    // After the cooldown it is unlocked.
    const after = 1_000 + LOCKOUT_CONFIG.lockoutMs;
    expect(isLockedOut("a", after).locked).toBe(false);
  });

  it("clears expired state on the next check so the key starts fresh", () => {
    for (let i = 0; i < LOCKOUT_CONFIG.maxFailures; i++) {
      recordFailure("a", 1_000);
    }
    const after = 1_000 + LOCKOUT_CONFIG.lockoutMs;
    // First check after expiry clears it.
    expect(isLockedOut("a", after).locked).toBe(false);
    // A single fresh failure must not immediately re-lock.
    recordFailure("a", after);
    expect(isLockedOut("a", after).locked).toBe(false);
  });
});

describe("recordSuccess", () => {
  it("clears accumulated failures for the key", () => {
    for (let i = 0; i < LOCKOUT_CONFIG.maxFailures - 1; i++) {
      recordFailure("a", 1_000);
    }
    recordSuccess("a");
    // After a success the counter is reset: one more failure is not enough.
    recordFailure("a", 1_000);
    expect(isLockedOut("a", 1_000).locked).toBe(false);
  });

  it("is a no-op for an unknown key", () => {
    expect(() => recordSuccess("never-seen")).not.toThrow();
    expect(isLockedOut("never-seen", 1_000).locked).toBe(false);
  });
});

describe("key isolation", () => {
  it("tracks separate keys independently", () => {
    for (let i = 0; i < LOCKOUT_CONFIG.maxFailures; i++) {
      recordFailure("a", 1_000);
    }
    expect(isLockedOut("a", 1_000).locked).toBe(true);
    expect(isLockedOut("b", 1_000).locked).toBe(false);
  });
});

describe("injectable clock", () => {
  it("defaults now to Date.now() when omitted", () => {
    recordFailure("clock");
    expect(isLockedOut("clock").locked).toBe(false);
  });
});

describe("suspiciousThrottle", () => {
  it("allows activity under the burst limit", () => {
    const res = suspiciousThrottle("k", { limit: 3, windowMs: 1_000, now: 0 });
    expect(res.suspicious).toBe(false);
    expect(res.retryAfterSeconds).toBe(0);
  });

  it("flags activity once the burst limit is exceeded", () => {
    const opts = { limit: 2, windowMs: 10_000, now: 0 };
    expect(suspiciousThrottle("k", opts).suspicious).toBe(false);
    expect(suspiciousThrottle("k", opts).suspicious).toBe(false);
    const res = suspiciousThrottle("k", opts);
    expect(res.suspicious).toBe(true);
    expect(res.retryAfterSeconds).toBe(10);
  });

  it("defaults now to Date.now() when omitted", () => {
    const res = suspiciousThrottle("k2", { limit: 1, windowMs: 1_000 });
    expect(res.suspicious).toBe(false);
  });
});
