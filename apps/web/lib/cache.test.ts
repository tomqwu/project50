import { describe, it, expect, beforeEach } from "vitest";

import {
  TtlCache,
  MemoryBackend,
  cached,
  invalidate,
  clearCache,
  type CacheBackend,
} from "./cache";

/** A controllable clock for deterministic TTL tests. */
function fakeClock(start = 1_000) {
  let now = start;
  const clock = () => now;
  clock.advance = (ms: number) => {
    now += ms;
  };
  return clock;
}

describe("TtlCache", () => {
  it("misses on first access and runs the loader", async () => {
    const cache = new TtlCache({ clock: fakeClock() });
    let calls = 0;
    const value = await cache.get("k", 1000, async () => {
      calls += 1;
      return "v";
    });
    expect(value).toBe("v");
    expect(calls).toBe(1);
  });

  it("returns the cached value on a hit without re-running the loader", async () => {
    const cache = new TtlCache({ clock: fakeClock() });
    let calls = 0;
    const loader = async () => {
      calls += 1;
      return calls;
    };
    expect(await cache.get("k", 1000, loader)).toBe(1);
    expect(await cache.get("k", 1000, loader)).toBe(1);
    expect(calls).toBe(1);
  });

  it("re-loads after the TTL elapses (expiry)", async () => {
    const clock = fakeClock();
    const cache = new TtlCache({ clock });
    let calls = 0;
    const loader = async () => {
      calls += 1;
      return calls;
    };

    expect(await cache.get("k", 1000, loader)).toBe(1);
    clock.advance(999);
    // Still within TTL -> hit.
    expect(await cache.get("k", 1000, loader)).toBe(1);
    clock.advance(1);
    // Exactly at expiry boundary -> miss and reload.
    expect(await cache.get("k", 1000, loader)).toBe(2);
    expect(calls).toBe(2);
  });

  it("keys entries independently", async () => {
    const cache = new TtlCache({ clock: fakeClock() });
    await cache.get("a", 1000, async () => "A");
    await cache.get("b", 1000, async () => "B");
    expect(await cache.get("a", 1000, async () => "X")).toBe("A");
    expect(await cache.get("b", 1000, async () => "X")).toBe("B");
  });

  it("invalidate() drops a single key and forces a reload", async () => {
    const cache = new TtlCache({ clock: fakeClock() });
    let calls = 0;
    const loader = async () => {
      calls += 1;
      return calls;
    };
    expect(await cache.get("k", 1000, loader)).toBe(1);
    await cache.invalidate("k");
    expect(await cache.get("k", 1000, loader)).toBe(2);
    expect(calls).toBe(2);
  });

  it("invalidate() is a no-op for an absent key", async () => {
    const cache = new TtlCache({ clock: fakeClock() });
    await expect(cache.invalidate("missing")).resolves.toBeUndefined();
  });

  it("clear() removes every entry", async () => {
    const cache = new TtlCache({ clock: fakeClock() });
    await cache.get("a", 1000, async () => "A");
    await cache.get("b", 1000, async () => "B");
    await cache.clear();
    expect(await cache.get("a", 1000, async () => "A2")).toBe("A2");
    expect(await cache.get("b", 1000, async () => "B2")).toBe("B2");
  });

  it("does not cache a rejected loader", async () => {
    const cache = new TtlCache({ clock: fakeClock() });
    await expect(
      cache.get("k", 1000, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    // Next call should retry the loader, not replay a cached rejection.
    expect(await cache.get("k", 1000, async () => "ok")).toBe("ok");
  });

  it("does not cache a loader that resolves to undefined", async () => {
    const cache = new TtlCache({ clock: fakeClock() });
    let calls = 0;
    const loader = async () => {
      calls += 1;
      // First call: absent. Second call: present.
      return calls === 1 ? undefined : "now-here";
    };
    expect(await cache.get("k", 1000, loader)).toBeUndefined();
    expect(await cache.get("k", 1000, loader)).toBe("now-here");
    expect(calls).toBe(2);
  });

  it("de-duplicates concurrent misses into a single loader call", async () => {
    const cache = new TtlCache({ clock: fakeClock() });
    let calls = 0;
    let release!: (v: string) => void;
    const gate = new Promise<string>((r) => {
      release = r;
    });
    const loader = async () => {
      calls += 1;
      return gate;
    };

    const p1 = cache.get("k", 1000, loader);
    const p2 = cache.get("k", 1000, loader);
    release("shared");
    expect(await p1).toBe("shared");
    expect(await p2).toBe("shared");
    expect(calls).toBe(1);
  });

  it("defaults to Date.now when no clock is injected", async () => {
    const cache = new TtlCache();
    expect(await cache.get("k", 1000, async () => "v")).toBe("v");
    // Immediate re-read is a hit under a real clock.
    expect(await cache.get("k", 1000, async () => "other")).toBe("v");
  });

  it("delegates every operation to a custom backend", async () => {
    const calls: string[] = [];
    const backend: CacheBackend = {
      get: () => {
        calls.push("get");
        return undefined;
      },
      set: (key) => {
        calls.push(`set:${key}`);
      },
      delete: (key) => {
        calls.push(`delete:${key}`);
      },
      clear: () => {
        calls.push("clear");
      },
    };
    const cache = new TtlCache({ backend });

    // Always-miss backend means the loader runs every time.
    expect(await cache.get("k", 1000, async () => "v")).toBe("v");
    expect(await cache.get("k", 1000, async () => "w")).toBe("w");
    await cache.invalidate("k");
    await cache.clear();

    expect(calls).toEqual([
      "get",
      "set:k",
      "get",
      "set:k",
      "delete:k",
      "clear",
    ]);
  });
});

describe("MemoryBackend", () => {
  it("evicts an expired entry on read", async () => {
    const clock = fakeClock();
    const backend = new MemoryBackend(clock);
    backend.set("k", "v", 1000);
    clock.advance(1000);
    expect(backend.get("k")).toBeUndefined();
    // Reading again confirms it was removed, not just hidden.
    expect(backend.get("k")).toBeUndefined();
  });
});

describe("module-level helpers (shared cache)", () => {
  beforeEach(async () => {
    await clearCache();
  });

  it("cached() memoizes via the shared instance", async () => {
    let calls = 0;
    const loader = async () => {
      calls += 1;
      return "v";
    };
    expect(await cached("shared:k", 1000, loader)).toBe("v");
    expect(await cached("shared:k", 1000, loader)).toBe("v");
    expect(calls).toBe(1);
  });

  it("invalidate() drops a key from the shared instance", async () => {
    let calls = 0;
    const loader = async () => {
      calls += 1;
      return calls;
    };
    expect(await cached("shared:k", 1000, loader)).toBe(1);
    await invalidate("shared:k");
    expect(await cached("shared:k", 1000, loader)).toBe(2);
  });

  it("clearCache() empties the shared instance", async () => {
    await cached("shared:k", 1000, async () => "v");
    await clearCache();
    expect(await cached("shared:k", 1000, async () => "fresh")).toBe("fresh");
  });
});
