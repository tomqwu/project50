import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Mock the consent gate so each test controls whether the user has consented.
const hasTrackingConsent = vi.fn<() => boolean>();
vi.mock("@/app/_components/CookieConsent", () => ({
  hasTrackingConsent: () => hasTrackingConsent(),
}));

import {
  ANALYTICS_ENDPOINT,
  isAnalyticsActive,
  isAnalyticsConfigured,
  track,
} from "./analytics";

const KEY = "NEXT_PUBLIC_ANALYTICS_KEY";

/** Import a fresh copy of the module (env is read at call time, but the queue
 * lives on `window`, which we reset between tests). */
beforeEach(() => {
  delete process.env[KEY];
  hasTrackingConsent.mockReturnValue(false);
  delete (window as { p50Analytics?: unknown }).p50Analytics;
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env[KEY];
});

describe("isAnalyticsConfigured", () => {
  it("is false with no key", () => {
    expect(isAnalyticsConfigured()).toBe(false);
  });

  it("is false for a blank/whitespace key", () => {
    process.env[KEY] = "   ";
    expect(isAnalyticsConfigured()).toBe(false);
  });

  it("is true when a non-empty key is set", () => {
    process.env[KEY] = "phc_abc";
    expect(isAnalyticsConfigured()).toBe(true);
  });

  it("does not consider consent", () => {
    process.env[KEY] = "phc_abc";
    hasTrackingConsent.mockReturnValue(false);
    expect(isAnalyticsConfigured()).toBe(true);
  });
});

describe("isAnalyticsActive", () => {
  it("is false with neither key nor consent", () => {
    expect(isAnalyticsActive()).toBe(false);
  });

  it("is false with a key but no consent", () => {
    process.env[KEY] = "phc_abc";
    hasTrackingConsent.mockReturnValue(false);
    expect(isAnalyticsActive()).toBe(false);
  });

  it("is false with consent but no key", () => {
    hasTrackingConsent.mockReturnValue(true);
    expect(isAnalyticsActive()).toBe(false);
  });

  it("is true with both key and consent", () => {
    process.env[KEY] = "phc_abc";
    hasTrackingConsent.mockReturnValue(true);
    expect(isAnalyticsActive()).toBe(true);
  });
});

describe("track — no-op paths", () => {
  it("does nothing with no key and no consent", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    track("signup");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(window.p50Analytics).toBeUndefined();
  });

  it("does nothing when configured but not consented", () => {
    process.env[KEY] = "phc_abc";
    hasTrackingConsent.mockReturnValue(false);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    track("upgrade_clicked");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(window.p50Analytics).toBeUndefined();
  });

  it("does nothing when consented but not configured", () => {
    hasTrackingConsent.mockReturnValue(true);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    track("project50_started");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(window.p50Analytics).toBeUndefined();
  });
});

describe("track — active", () => {
  beforeEach(() => {
    process.env[KEY] = "phc_abc";
    hasTrackingConsent.mockReturnValue(true);
  });

  it("queues the event and POSTs to the collector endpoint", () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchSpy);
    vi.spyOn(Date, "now").mockReturnValue(1234);

    track("project50_started", { restarted: false });

    expect(window.p50Analytics).toEqual([
      { event: "project50_started", props: { restarted: false }, ts: 1234 },
    ]);
    expect(fetchSpy).toHaveBeenCalledWith(
      ANALYTICS_ENDPOINT,
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "project50_started", props: { restarted: false }, ts: 1234 }),
        keepalive: true,
      }),
    );
  });

  it("appends successive events to the same queue", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    track("signup");
    track("rule_toggled", { ruleId: "r1", done: true });
    expect(window.p50Analytics).toHaveLength(2);
    expect(window.p50Analytics?.[0]?.event).toBe("signup");
    expect(window.p50Analytics?.[1]?.event).toBe("rule_toggled");
  });

  it("works with no props", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    track("signup");
    expect(window.p50Analytics?.[0]).toMatchObject({ event: "signup" });
    expect(window.p50Analytics?.[0]?.props).toBeUndefined();
  });

  it("swallows a rejected fetch (fire-and-forget)", async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error("network"));
    vi.stubGlobal("fetch", fetchSpy);
    expect(() => track("signup")).not.toThrow();
    expect(window.p50Analytics).toHaveLength(1);
    // Let the rejected promise settle to prove it does not surface.
    await Promise.resolve();
  });

  it("queues even when fetch throws synchronously", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("no fetch");
      }),
    );
    expect(() => track("signup")).not.toThrow();
    expect(window.p50Analytics).toHaveLength(1);
  });

  it("is a no-op on the server (no window)", () => {
    // Active config + consent, but simulate SSR by removing `window`.
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("window", undefined);
    expect(() => track("signup")).not.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
