import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, resetRateLimit, clientKey } from "./rate-limit";

beforeEach(() => {
  resetRateLimit();
});

describe("checkRateLimit", () => {
  const opts = { limit: 3, windowMs: 60_000, now: 1_000 };

  it("allows requests under the limit", () => {
    expect(checkRateLimit("a", opts)).toEqual({
      allowed: true,
      remaining: 2,
      retryAfterSeconds: 0,
    });
    expect(checkRateLimit("a", opts)).toEqual({
      allowed: true,
      remaining: 1,
      retryAfterSeconds: 0,
    });
    expect(checkRateLimit("a", opts)).toEqual({
      allowed: true,
      remaining: 0,
      retryAfterSeconds: 0,
    });
  });

  it("blocks requests over the limit with retryAfter", () => {
    checkRateLimit("a", opts);
    checkRateLimit("a", opts);
    checkRateLimit("a", opts);
    // 4th request in the same window, 1s after window start.
    const res = checkRateLimit("a", { ...opts, now: 2_000 });
    expect(res.allowed).toBe(false);
    expect(res.remaining).toBe(0);
    // window ends at 1000 + 60000 = 61000; (61000 - 2000)/1000 = 59
    expect(res.retryAfterSeconds).toBe(59);
  });

  it("resets the window after windowMs elapses", () => {
    checkRateLimit("a", opts);
    checkRateLimit("a", opts);
    checkRateLimit("a", opts);
    expect(checkRateLimit("a", opts).allowed).toBe(false);

    // Advance exactly windowMs from window start → new window.
    const res = checkRateLimit("a", { ...opts, now: 61_000 });
    expect(res).toEqual({
      allowed: true,
      remaining: 2,
      retryAfterSeconds: 0,
    });
  });

  it("tracks separate keys independently", () => {
    checkRateLimit("a", opts);
    checkRateLimit("a", opts);
    checkRateLimit("a", opts);
    expect(checkRateLimit("a", opts).allowed).toBe(false);
    // A different key has its own fresh window.
    expect(checkRateLimit("b", opts).allowed).toBe(true);
  });

  it("defaults now to Date.now() when not provided", () => {
    const res = checkRateLimit("clock", { limit: 1, windowMs: 60_000 });
    expect(res.allowed).toBe(true);
  });
});

describe("clientKey", () => {
  it("uses the first IP from x-forwarded-for", () => {
    const req = new Request("https://x.test", {
      headers: { "x-forwarded-for": "203.0.113.1, 70.41.3.18, 150.172.238.178" },
    });
    expect(clientKey(req)).toBe("203.0.113.1");
  });

  it("falls back to unknown when the header is absent", () => {
    const req = new Request("https://x.test");
    expect(clientKey(req)).toBe("unknown");
  });

  it("falls back to unknown when the header is whitespace-only", () => {
    // Headers normalize a whitespace-only value to "" → the !xff fallback.
    const req = new Request("https://x.test", {
      headers: { "x-forwarded-for": "   " },
    });
    expect(clientKey(req)).toBe("unknown");
  });

  it("falls back to unknown when the first XFF segment is empty", () => {
    // Non-empty header whose leading segment is blank exercises the
    // empty-first-segment branch (header survives normalization).
    const req = new Request("https://x.test", {
      headers: { "x-forwarded-for": ", 70.41.3.18" },
    });
    expect(clientKey(req)).toBe("unknown");
  });
});
