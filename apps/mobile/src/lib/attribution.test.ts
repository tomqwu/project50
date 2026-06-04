/**
 * Unit tests for attribution.ts — install/acquisition attribution capture.
 *
 * expo-linking is mocked so `Linking.parse` mirrors the ParsedURL shape (we only
 * need `queryParams`). AsyncStorage and the analytics sink are injected per-test.
 * We exercise: first-launch UTM/ref parsing, the Android install referrer source,
 * first-write-wins (no overwrite on a 2nd launch), the disabled gate (no-op),
 * missing/invalid URL, storage read/write errors, and analytics forwarding.
 */

// ─── Mock expo-linking ────────────────────────────────────────────────────────
// `mock`-prefixed names are permitted inside a jest.mock() factory.
const mockParse = jest.fn((url: string) => {
  const queryParams: Record<string, string | string[]> = {};
  const qIndex = url.indexOf("?");
  if (qIndex >= 0) {
    const queryString = url.slice(qIndex + 1);
    for (const pair of queryString.split("&")) {
      if (!pair) continue;
      const [k = "", v = ""] = pair.split("=");
      queryParams[decodeURIComponent(k)] = decodeURIComponent(v);
    }
  }
  return { queryParams };
});
const mockGetInitialURL = jest.fn();

jest.mock("expo-linking", () => ({
  parse: (url: string) => mockParse(url),
  getInitialURL: () => mockGetInitialURL(),
}));

// Mock so attribution.ts's default AsyncStorage import resolves under Jest.
// Tests inject their own in-memory store, so this default is never exercised.
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
  },
}));

import {
  ATTRIBUTION_EVENT,
  ATTRIBUTION_STORAGE_KEY,
  captureAttribution,
  getAttribution,
  isAttributionEnabled,
  parseAttributionUrl,
  type AttributionData,
  type KeyValueStore,
} from "./attribution";

/** In-memory KeyValueStore for deterministic, isolated tests. */
function makeStore(initial: Record<string, string> = {}): KeyValueStore & {
  data: Record<string, string>;
} {
  const data: Record<string, string> = { ...initial };
  return {
    data,
    getItem: jest.fn(async (key: string) => data[key] ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      data[key] = value;
    }),
  };
}

const FIXED_NOW = 1_700_000_000_000;

afterEach(() => {
  jest.clearAllMocks();
});

describe("isAttributionEnabled", () => {
  it("is enabled by default (undefined flag)", () => {
    expect(isAttributionEnabled(undefined)).toBe(true);
  });

  it("is enabled for any non-'false' value", () => {
    expect(isAttributionEnabled("true")).toBe(true);
    expect(isAttributionEnabled("1")).toBe(true);
    expect(isAttributionEnabled("")).toBe(true);
  });

  it("is disabled only for the explicit string 'false'", () => {
    expect(isAttributionEnabled("false")).toBe(false);
  });

  it("reads EXPO_PUBLIC_ATTRIBUTION_ENABLED by default (env unset → enabled)", () => {
    // Under jest the inlined env is unset, so the default-arg path is enabled.
    expect(isAttributionEnabled()).toBe(true);
  });
});

describe("parseAttributionUrl", () => {
  it("extracts all UTM params and ref", () => {
    const result = parseAttributionUrl(
      "project50://?utm_source=facebook&utm_medium=cpc&utm_campaign=launch&utm_content=hero&utm_term=fitness&ref=alice",
    );
    expect(result).toEqual({
      source: "facebook",
      medium: "cpc",
      campaign: "launch",
      content: "hero",
      term: "fitness",
      referrer: "alice",
    });
  });

  it("returns all-null for an empty/undefined URL", () => {
    const empty = {
      source: null,
      medium: null,
      campaign: null,
      content: null,
      term: null,
      referrer: null,
    };
    expect(parseAttributionUrl(null)).toEqual(empty);
    expect(parseAttributionUrl(undefined)).toEqual(empty);
    expect(parseAttributionUrl("")).toEqual(empty);
  });

  it("returns all-null when Linking.parse throws (malformed URL)", () => {
    mockParse.mockImplementationOnce(() => {
      throw new Error("bad url");
    });
    expect(parseAttributionUrl("::::not a url")).toEqual({
      source: null,
      medium: null,
      campaign: null,
      content: null,
      term: null,
      referrer: null,
    });
  });

  it("treats a missing queryParams object as no params", () => {
    mockParse.mockReturnValueOnce({} as { queryParams: Record<string, string> });
    expect(parseAttributionUrl("project50://home")).toEqual({
      source: null,
      medium: null,
      campaign: null,
      content: null,
      term: null,
      referrer: null,
    });
  });

  it("normalises array params to the first value and trims, blanks → null", () => {
    mockParse.mockReturnValueOnce({
      queryParams: {
        utm_source: ["fb", "ig"],
        utm_medium: "  cpc  ",
        utm_campaign: "   ",
      },
    });
    const r = parseAttributionUrl("project50://?x=y");
    expect(r.source).toBe("fb");
    expect(r.medium).toBe("cpc");
    expect(r.campaign).toBeNull();
  });
});

describe("getAttribution", () => {
  it("returns the parsed stored payload", async () => {
    const stored: AttributionData = {
      source: "newsletter",
      medium: "email",
      campaign: "june",
      content: null,
      term: null,
      referrer: null,
      installReferrer: null,
      capturedAt: FIXED_NOW,
    };
    const store = makeStore({
      [ATTRIBUTION_STORAGE_KEY]: JSON.stringify(stored),
    });
    await expect(getAttribution(store)).resolves.toEqual(stored);
  });

  it("returns null when nothing is stored", async () => {
    await expect(getAttribution(makeStore())).resolves.toBeNull();
  });

  it("returns null on unparseable stored JSON", async () => {
    const store = makeStore({ [ATTRIBUTION_STORAGE_KEY]: "{not json" });
    await expect(getAttribution(store)).resolves.toBeNull();
  });

  it("returns null when the store read throws", async () => {
    const store = makeStore();
    (store.getItem as jest.Mock).mockRejectedValueOnce(new Error("disk"));
    await expect(getAttribution(store)).resolves.toBeNull();
  });

  it("defaults to AsyncStorage when no store is passed (mocked → null)", async () => {
    // Exercises the default-parameter path; the mocked AsyncStorage returns null.
    await expect(getAttribution()).resolves.toBeNull();
  });
});

describe("captureAttribution", () => {
  it("captures and persists UTM/ref from the install URL on first launch", async () => {
    const store = makeStore();
    const analytics = jest.fn();
    mockGetInitialURL.mockResolvedValue(
      "project50://?utm_source=facebook&utm_medium=cpc&utm_campaign=launch&ref=alice",
    );

    const result = await captureAttribution({
      store,
      analytics,
      now: () => FIXED_NOW,
    });

    const expected: AttributionData = {
      source: "facebook",
      medium: "cpc",
      campaign: "launch",
      content: null,
      term: null,
      referrer: "alice",
      installReferrer: null,
      capturedAt: FIXED_NOW,
    };
    expect(result).toEqual(expected);
    expect(JSON.parse(store.data[ATTRIBUTION_STORAGE_KEY]!)).toEqual(expected);
    expect(analytics).toHaveBeenCalledWith(ATTRIBUTION_EVENT, expected);
  });

  it("includes the Android Play install referrer when a resolver is provided", async () => {
    const store = makeStore();
    mockGetInitialURL.mockResolvedValue(null);

    const result = await captureAttribution({
      store,
      now: () => FIXED_NOW,
      getInstallReferrer: async () =>
        "utm_source=google-play&utm_campaign=spring",
    });

    expect(result?.installReferrer).toBe("utm_source=google-play&utm_campaign=spring");
  });

  it("swallows a throwing install-referrer resolver (→ null referrer, still captures)", async () => {
    const store = makeStore();
    mockGetInitialURL.mockResolvedValue(null);

    const result = await captureAttribution({
      store,
      now: () => FIXED_NOW,
      getInstallReferrer: async () => {
        throw new Error("Play services unavailable");
      },
    });

    expect(result?.installReferrer).toBeNull();
    expect(store.data[ATTRIBUTION_STORAGE_KEY]).toBeDefined();
  });

  it("is first-write-wins: a 2nd launch returns the stored value without overwriting", async () => {
    const first: AttributionData = {
      source: "facebook",
      medium: null,
      campaign: null,
      content: null,
      term: null,
      referrer: null,
      installReferrer: null,
      capturedAt: FIXED_NOW,
    };
    const store = makeStore({
      [ATTRIBUTION_STORAGE_KEY]: JSON.stringify(first),
    });
    const analytics = jest.fn();
    mockGetInitialURL.mockResolvedValue("project50://?utm_source=twitter");

    const result = await captureAttribution({
      store,
      analytics,
      now: () => FIXED_NOW + 999,
    });

    expect(result).toEqual(first);
    expect(store.setItem).not.toHaveBeenCalled();
    expect(mockGetInitialURL).not.toHaveBeenCalled();
    expect(analytics).not.toHaveBeenCalled();
  });

  it("no-ops when disabled via the gate (returns null, no storage/linking access)", async () => {
    const store = makeStore();
    const analytics = jest.fn();
    mockGetInitialURL.mockResolvedValue("project50://?utm_source=facebook");

    const result = await captureAttribution({
      store,
      analytics,
      enabledFlag: "false",
    });

    expect(result).toBeNull();
    expect(store.getItem).not.toHaveBeenCalled();
    expect(store.setItem).not.toHaveBeenCalled();
    expect(mockGetInitialURL).not.toHaveBeenCalled();
    expect(analytics).not.toHaveBeenCalled();
  });

  it("handles a missing install URL → all-null attribution (still captured once)", async () => {
    const store = makeStore();
    mockGetInitialURL.mockResolvedValue(null);

    const result = await captureAttribution({ store, now: () => FIXED_NOW });

    expect(result).toEqual({
      source: null,
      medium: null,
      campaign: null,
      content: null,
      term: null,
      referrer: null,
      installReferrer: null,
      capturedAt: FIXED_NOW,
    });
    expect(store.data[ATTRIBUTION_STORAGE_KEY]).toBeDefined();
  });

  it("swallows a rejecting getInitialURL (→ all-null, still captures)", async () => {
    const store = makeStore();
    mockGetInitialURL.mockRejectedValue(new Error("bridge"));

    const result = await captureAttribution({ store, now: () => FIXED_NOW });

    expect(result?.source).toBeNull();
    expect(store.data[ATTRIBUTION_STORAGE_KEY]).toBeDefined();
  });

  it("returns null and does not forward analytics when the write fails", async () => {
    const store = makeStore();
    (store.setItem as jest.Mock).mockRejectedValueOnce(new Error("quota"));
    const analytics = jest.fn();
    mockGetInitialURL.mockResolvedValue("project50://?utm_source=facebook");

    const result = await captureAttribution({
      store,
      analytics,
      now: () => FIXED_NOW,
    });

    expect(result).toBeNull();
    expect(analytics).not.toHaveBeenCalled();
  });

  it("does not let a throwing analytics sink break capture", async () => {
    const store = makeStore();
    mockGetInitialURL.mockResolvedValue("project50://?utm_source=facebook");

    const result = await captureAttribution({
      store,
      now: () => FIXED_NOW,
      analytics: () => {
        throw new Error("analytics down");
      },
    });

    expect(result?.source).toBe("facebook");
    expect(store.data[ATTRIBUTION_STORAGE_KEY]).toBeDefined();
  });

  it("persists without an analytics sink (forwarding is optional)", async () => {
    const store = makeStore();
    mockGetInitialURL.mockResolvedValue("project50://?utm_source=facebook");

    const result = await captureAttribution({ store, now: () => FIXED_NOW });

    expect(result?.source).toBe("facebook");
    expect(store.data[ATTRIBUTION_STORAGE_KEY]).toBeDefined();
  });

  it("uses all real defaults when called with no deps (mocked store/linking)", async () => {
    // Exercises the default store (AsyncStorage), getInitialURL (Linking) and
    // now (Date.now) branches. Mocked AsyncStorage.getItem → null (first launch),
    // mocked getInitialURL → null, so it captures an all-null payload.
    mockGetInitialURL.mockResolvedValue(null);

    const result = await captureAttribution();

    expect(result).not.toBeNull();
    expect(result?.source).toBeNull();
    expect(typeof result?.capturedAt).toBe("number");
  });
});
