/**
 * Unit tests for offline.ts.
 *
 * The real `@react-native-async-storage/async-storage` and
 * `@react-native-community/netinfo` modules are mocked so the module loads in
 * Node; the functional tests inject their own in-memory store / net-checker
 * stubs to assert behaviour deterministically.
 */

// ─── Module mocks (so default-arg imports resolve under Jest) ──────────────────

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
  },
}));

jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: {
    fetch: jest.fn(async () => ({ isConnected: true })),
  },
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import {
  cacheGet,
  cacheSet,
  enqueueMutation,
  getQueue,
  flushQueue,
  isOnline,
  loadProject50StateOffline,
  toggleRuleOffline,
  logActivityOffline,
  syncOnReconnect,
  PROJECT50_STATE_CACHE_KEY,
} from "./offline";
import type { KeyValueStore, NetChecker, QueuedMutation } from "./offline";
import type { ApiClient, Project50State } from "./apiClient";

// ─── Test doubles ─────────────────────────────────────────────────────────────

/** In-memory KeyValueStore backed by a Map; spy-wrapped for assertions. */
function makeStore(initial: Record<string, string> = {}): KeyValueStore & {
  map: Map<string, string>;
} {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    map,
    getItem: jest.fn(async (key: string) => map.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      map.set(key, value);
    }),
  };
}

/** Net checker stub with a settable connectivity value. */
function makeNet(isConnected: boolean | null): NetChecker {
  return { fetch: jest.fn(async () => ({ isConnected })) };
}

const STATE: Project50State = { status: "NONE" };
const ACTIVE_STATE: Project50State = {
  status: "ACTIVE",
  runId: "r1",
  today: { dayKey: "2026-06-04", dayNumber: 3, checks: [false, false, false, false, false, false, false], completedCount: 0 },
};

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: true });
});

// ─── Cache ────────────────────────────────────────────────────────────────────

describe("cache", () => {
  it("round-trips a value through set then get", async () => {
    const store = makeStore();
    await cacheSet("k", { a: 1 }, store);
    expect(store.map.get("p50.cache.k")).toBe(JSON.stringify({ a: 1 }));
    const got = await cacheGet<{ a: number }>("k", store);
    expect(got).toEqual({ a: 1 });
  });

  it("returns null when nothing is cached", async () => {
    const store = makeStore();
    expect(await cacheGet("missing", store)).toBeNull();
  });

  it("returns null when the cached JSON is corrupt", async () => {
    const store = makeStore({ "p50.cache.bad": "{not json" });
    expect(await cacheGet("bad", store)).toBeNull();
  });

  it("defaults to the real AsyncStorage module", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify({ v: 9 }));
    const got = await cacheGet<{ v: number }>("dk");
    expect(AsyncStorage.getItem).toHaveBeenCalledWith("p50.cache.dk");
    expect(got).toEqual({ v: 9 });

    await cacheSet("dk", { v: 10 });
    expect(AsyncStorage.setItem).toHaveBeenCalledWith("p50.cache.dk", JSON.stringify({ v: 10 }));
  });
});

// ─── Queue ────────────────────────────────────────────────────────────────────

describe("queue", () => {
  it("starts empty", async () => {
    const store = makeStore();
    expect(await getQueue(store)).toEqual([]);
  });

  it("enqueues mutations in FIFO order", async () => {
    const store = makeStore();
    await enqueueMutation({ type: "toggleRule", ruleId: 1, done: true }, store);
    await enqueueMutation(
      { type: "logActivity", challengeId: "c1", input: { dayKey: "2026-06-04", done: true } },
      store,
    );
    const queue = await getQueue(store);
    expect(queue).toHaveLength(2);
    expect(queue[0]).toEqual({ type: "toggleRule", ruleId: 1, done: true });
    expect(queue[1]?.type).toBe("logActivity");
  });

  it("returns an empty queue when the stored value is corrupt", async () => {
    const store = makeStore({ "p50.queue": "{broken" });
    expect(await getQueue(store)).toEqual([]);
  });

  it("returns an empty queue when the stored value is not an array", async () => {
    const store = makeStore({ "p50.queue": JSON.stringify({ not: "an array" }) });
    expect(await getQueue(store)).toEqual([]);
  });

  it("defaults to the real AsyncStorage module for enqueue/getQueue", async () => {
    await enqueueMutation({ type: "toggleRule", ruleId: 2, done: false });
    expect(AsyncStorage.getItem).toHaveBeenCalledWith("p50.queue");
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      "p50.queue",
      JSON.stringify([{ type: "toggleRule", ruleId: 2, done: false }]),
    );

    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);
    expect(await getQueue()).toEqual([]);
  });
});

// ─── flushQueue ─────────────────────────────────────────────────────────────

function makeApi(overrides: Record<string, jest.Mock> = {}): jest.Mocked<ApiClient> {
  return {
    toggleRule: jest.fn(async () => ACTIVE_STATE),
    logActivity: jest.fn(async () => ({
      activity: {} as never,
      dayStatus: {} as never,
      newMilestones: [],
    })),
    getProject50State: jest.fn(async () => STATE),
    ...overrides,
  } as unknown as jest.Mocked<ApiClient>;
}

describe("flushQueue", () => {
  it("replays all mutations and clears the queue on success", async () => {
    const queue: QueuedMutation[] = [
      { type: "toggleRule", ruleId: 1, done: true },
      { type: "logActivity", challengeId: "c1", input: { dayKey: "2026-06-04", done: true } },
    ];
    const store = makeStore({ "p50.queue": JSON.stringify(queue) });
    const api = makeApi();

    const result = await flushQueue(api, store);

    expect(result).toEqual({ flushed: 2, remaining: 0 });
    expect(api.toggleRule).toHaveBeenCalledWith(1, true);
    expect(api.logActivity).toHaveBeenCalledWith("c1", { dayKey: "2026-06-04", done: true });
    expect(await getQueue(store)).toEqual([]);
  });

  it("is a no-op on an empty queue", async () => {
    const store = makeStore();
    const api = makeApi();
    const result = await flushQueue(api, store);
    expect(result).toEqual({ flushed: 0, remaining: 0 });
    expect(api.toggleRule).not.toHaveBeenCalled();
  });

  it("stops on the first failure and keeps the failed + remaining mutations", async () => {
    const queue: QueuedMutation[] = [
      { type: "toggleRule", ruleId: 1, done: true },
      { type: "toggleRule", ruleId: 2, done: true },
      { type: "toggleRule", ruleId: 3, done: true },
    ];
    const store = makeStore({ "p50.queue": JSON.stringify(queue) });
    const api = makeApi({
      toggleRule: jest
        .fn()
        .mockResolvedValueOnce(ACTIVE_STATE) // rule 1 ok
        .mockRejectedValueOnce(new Error("offline again")) // rule 2 fails
        .mockResolvedValue(ACTIVE_STATE),
    });

    const result = await flushQueue(api, store);

    expect(result).toEqual({ flushed: 1, remaining: 2 });
    // rule 3 was never attempted (stopped at the failure)
    expect((api.toggleRule as jest.Mock).mock.calls).toEqual([
      [1, true],
      [2, true],
    ]);
    // queue retains the failed mutation and the untried one, in order
    expect(await getQueue(store)).toEqual([
      { type: "toggleRule", ruleId: 2, done: true },
      { type: "toggleRule", ruleId: 3, done: true },
    ]);
  });

  it("defaults to the real AsyncStorage module", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(
      JSON.stringify([{ type: "toggleRule", ruleId: 5, done: true }]),
    );
    const api = makeApi();
    const result = await flushQueue(api);
    expect(result).toEqual({ flushed: 1, remaining: 0 });
    expect(api.toggleRule).toHaveBeenCalledWith(5, true);
  });
});

// ─── isOnline ─────────────────────────────────────────────────────────────────

describe("isOnline", () => {
  it("is true when connected", async () => {
    expect(await isOnline(makeNet(true))).toBe(true);
  });
  it("is false when disconnected", async () => {
    expect(await isOnline(makeNet(false))).toBe(false);
  });
  it("treats an unknown (null) state as offline", async () => {
    expect(await isOnline(makeNet(null))).toBe(false);
  });
  it("defaults to the real NetInfo module", async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValueOnce({ isConnected: true });
    expect(await isOnline()).toBe(true);
    expect(NetInfo.fetch).toHaveBeenCalled();
  });
});

// ─── loadProject50StateOffline ────────────────────────────────────────────────

describe("loadProject50StateOffline", () => {
  it("fetches fresh and refreshes the cache when online", async () => {
    const store = makeStore();
    const net = makeNet(true);
    const api = makeApi({ getProject50State: jest.fn(async () => ACTIVE_STATE) });

    const out = await loadProject50StateOffline(api, { store, net });

    expect(out).toEqual({ state: ACTIVE_STATE, fromCache: false });
    expect(store.map.get(`p50.cache.${PROJECT50_STATE_CACHE_KEY}`)).toBe(
      JSON.stringify(ACTIVE_STATE),
    );
  });

  it("returns cached state when offline", async () => {
    const store = makeStore({
      [`p50.cache.${PROJECT50_STATE_CACHE_KEY}`]: JSON.stringify(ACTIVE_STATE),
    });
    const net = makeNet(false);
    const api = makeApi();

    const out = await loadProject50StateOffline(api, { store, net });

    expect(out).toEqual({ state: ACTIVE_STATE, fromCache: true });
    expect(api.getProject50State).not.toHaveBeenCalled();
  });

  it("returns null cached state when offline and nothing cached", async () => {
    const store = makeStore();
    const net = makeNet(false);
    const api = makeApi();
    const out = await loadProject50StateOffline(api, { store, net });
    expect(out).toEqual({ state: null, fromCache: true });
  });

  it("falls back to cache when online but the fetch fails", async () => {
    const store = makeStore({
      [`p50.cache.${PROJECT50_STATE_CACHE_KEY}`]: JSON.stringify(ACTIVE_STATE),
    });
    const net = makeNet(true);
    const api = makeApi({
      getProject50State: jest.fn().mockRejectedValue(new Error("timeout")),
    });

    const out = await loadProject50StateOffline(api, { store, net });

    expect(out).toEqual({ state: ACTIVE_STATE, fromCache: true });
  });

  it("uses default modules when no deps are passed", async () => {
    const api = makeApi({ getProject50State: jest.fn(async () => STATE) });
    const out = await loadProject50StateOffline(api);
    expect(out).toEqual({ state: STATE, fromCache: false });
    expect(NetInfo.fetch).toHaveBeenCalled();
    expect(AsyncStorage.setItem).toHaveBeenCalled();
  });
});

// ─── toggleRuleOffline ────────────────────────────────────────────────────────

describe("toggleRuleOffline", () => {
  it("calls the API and caches when online", async () => {
    const store = makeStore();
    const net = makeNet(true);
    const api = makeApi({ toggleRule: jest.fn(async () => ACTIVE_STATE) });

    const out = await toggleRuleOffline(api, 2, true, { store, net });

    expect(out).toEqual({ state: ACTIVE_STATE, queued: false });
    expect(api.toggleRule).toHaveBeenCalledWith(2, true);
    expect(store.map.get(`p50.cache.${PROJECT50_STATE_CACHE_KEY}`)).toBe(
      JSON.stringify(ACTIVE_STATE),
    );
  });

  it("enqueues the toggle when offline", async () => {
    const store = makeStore();
    const net = makeNet(false);
    const api = makeApi();

    const out = await toggleRuleOffline(api, 3, false, { store, net });

    expect(out).toEqual({ state: null, queued: true });
    expect(api.toggleRule).not.toHaveBeenCalled();
    expect(await getQueue(store)).toEqual([{ type: "toggleRule", ruleId: 3, done: false }]);
  });

  it("uses default modules when no deps are passed", async () => {
    const api = makeApi({ toggleRule: jest.fn(async () => ACTIVE_STATE) });
    const out = await toggleRuleOffline(api, 1, true);
    expect(out.queued).toBe(false);
    expect(NetInfo.fetch).toHaveBeenCalled();
  });
});

// ─── logActivityOffline ───────────────────────────────────────────────────────

describe("logActivityOffline", () => {
  it("calls the API when online", async () => {
    const store = makeStore();
    const net = makeNet(true);
    const result = { activity: {} as never, dayStatus: {} as never, newMilestones: [] };
    const api = makeApi({ logActivity: jest.fn(async () => result) });

    const out = await logActivityOffline(api, "c1", { dayKey: "2026-06-04", done: true }, { store, net });

    expect(out).toEqual({ result, queued: false });
    expect(api.logActivity).toHaveBeenCalledWith("c1", { dayKey: "2026-06-04", done: true });
  });

  it("enqueues the log when offline", async () => {
    const store = makeStore();
    const net = makeNet(false);
    const api = makeApi();

    const out = await logActivityOffline(api, "c2", { dayKey: "2026-06-04", amount: 5 }, { store, net });

    expect(out).toEqual({ result: null, queued: true });
    expect(api.logActivity).not.toHaveBeenCalled();
    expect(await getQueue(store)).toEqual([
      { type: "logActivity", challengeId: "c2", input: { dayKey: "2026-06-04", amount: 5 } },
    ]);
  });

  it("uses default modules when no deps are passed", async () => {
    const result = { activity: {} as never, dayStatus: {} as never, newMilestones: [] };
    const api = makeApi({ logActivity: jest.fn(async () => result) });
    const out = await logActivityOffline(api, "c9", { dayKey: "2026-06-04", done: true });
    expect(out.queued).toBe(false);
    expect(NetInfo.fetch).toHaveBeenCalled();
  });
});

// ─── syncOnReconnect ──────────────────────────────────────────────────────────

describe("syncOnReconnect", () => {
  it("flushes the queue when online", async () => {
    const store = makeStore({
      "p50.queue": JSON.stringify([{ type: "toggleRule", ruleId: 1, done: true }]),
    });
    const net = makeNet(true);
    const api = makeApi();

    const out = await syncOnReconnect(api, { store, net });

    expect(out).toEqual({ flushed: 1, remaining: 0 });
    expect(api.toggleRule).toHaveBeenCalledWith(1, true);
  });

  it("returns null and does nothing when still offline", async () => {
    const store = makeStore({
      "p50.queue": JSON.stringify([{ type: "toggleRule", ruleId: 1, done: true }]),
    });
    const net = makeNet(false);
    const api = makeApi();

    const out = await syncOnReconnect(api, { store, net });

    expect(out).toBeNull();
    expect(api.toggleRule).not.toHaveBeenCalled();
  });

  it("uses default modules when no deps are passed", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);
    const api = makeApi();
    const out = await syncOnReconnect(api);
    expect(out).toEqual({ flushed: 0, remaining: 0 });
  });
});
