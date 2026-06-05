/**
 * Unit tests for deeplink.ts.
 * Mocks expo-linking (parse / addEventListener / getInitialURL).
 * Covers parseOAuthRedirect, isOAuthRedirect, subscribeToDeepLinks.
 */

// ─── Mock expo-linking ────────────────────────────────────────────────────────
// `mock`-prefixed names are permitted inside a jest.mock() factory.
//
// mockFakeParse is a lightweight `parse` that mirrors expo-linking's ParsedURL
// shape closely enough for our extraction logic (scheme/host/path/queryParams).
const mockRemove = jest.fn();
const mockAddEventListener = jest.fn(
  (type: string, handler: (e: { url: string }) => void) => {
    void type;
    void handler;
    return { remove: mockRemove };
  },
);
const mockGetInitialURL = jest.fn();
const mockFakeParse = jest.fn((url: string) => {
  const [base, queryString] = url.split("?");
  const queryParams: Record<string, string | string[]> = {};
  if (queryString) {
    for (const pair of queryString.split("&")) {
      const [k = "", v = ""] = pair.split("=");
      queryParams[decodeURIComponent(k)] = decodeURIComponent(v);
    }
  }
  // Derive a path: strip the scheme://host prefix.
  let path: string | null = null;
  const m = /^[a-z0-9+.-]+:\/\/([^/]*)(\/.*)?$/i.exec(base!);
  let hostname: string | null = null;
  let scheme: string | null = null;
  const schemeMatch = /^([a-z0-9+.-]+):/i.exec(base!);
  if (schemeMatch) scheme = schemeMatch[1] ?? null;
  if (m) {
    hostname = m[1] ?? null;
    path = m[2] ? m[2].replace(/^\//, "") : null;
  }
  return {
    scheme,
    hostname,
    path,
    queryParams: Object.keys(queryParams).length ? queryParams : null,
  };
});

jest.mock("expo-linking", () => ({
  parse: (url: string) => mockFakeParse(url),
  addEventListener: (type: string, handler: (e: { url: string }) => void) =>
    mockAddEventListener(type, handler),
  getInitialURL: () => mockGetInitialURL(),
}));

import {
  parseOAuthRedirect,
  isOAuthRedirect,
  subscribeToDeepLinks,
  OAUTH_CALLBACK_PATH,
  OAUTH_UNIVERSAL_LINK_HOST,
  OAUTH_CALLBACK_URL,
} from "./deeplink";

beforeEach(() => {
  // Clear call history only — keep mockFakeParse's default implementation so
  // override tests (mockReturnValueOnce) take precedence for a single call.
  mockRemove.mockClear();
  mockAddEventListener.mockClear();
  mockFakeParse.mockClear();
  mockGetInitialURL.mockReset();
  mockGetInitialURL.mockResolvedValue(null);
});

// ─── parseOAuthRedirect ───────────────────────────────────────────────────────

describe("parseOAuthRedirect", () => {
  it("returns all-null for empty/undefined url", () => {
    expect(parseOAuthRedirect(undefined)).toEqual({
      provider: null,
      code: null,
      state: null,
      error: null,
      isCallbackPath: false,
    });
    expect(parseOAuthRedirect("")).toEqual({
      provider: null,
      code: null,
      state: null,
      error: null,
      isCallbackPath: false,
    });
    expect(parseOAuthRedirect(null)).toEqual({
      provider: null,
      code: null,
      state: null,
      error: null,
      isCallbackPath: false,
    });
  });

  it("extracts code + state from a custom-scheme redirect", () => {
    const url = "project50://oauth/callback?code=abc123&state=xyz";
    expect(parseOAuthRedirect(url)).toEqual({
      provider: null,
      code: "abc123",
      state: "xyz",
      error: null,
      isCallbackPath: true,
    });
  });

  it("reads the provider from an explicit query param", () => {
    const url = "project50://oauth/callback?provider=google&code=g-code";
    const out = parseOAuthRedirect(url);
    expect(out.provider).toBe("google");
    expect(out.code).toBe("g-code");
  });

  it("infers the provider from the path segment after callback", () => {
    const url = "https://www.project50.fit/oauth/callback/facebook?code=fb-code";
    const out = parseOAuthRedirect(url);
    expect(out.provider).toBe("facebook");
    expect(out.code).toBe("fb-code");
  });

  it("returns provider null when path has no segment after callback", () => {
    const url = "https://www.project50.fit/oauth/callback?code=c";
    expect(parseOAuthRedirect(url).provider).toBeNull();
  });

  it("returns provider null when a non-empty path has no callback segment", () => {
    const url = "https://www.project50.fit/some/other/path?code=c";
    expect(parseOAuthRedirect(url).provider).toBeNull();
  });

  it("extracts an error param (user declined)", () => {
    const url = "project50://oauth/callback?error=access_denied";
    const out = parseOAuthRedirect(url);
    expect(out.error).toBe("access_denied");
    expect(out.code).toBeNull();
  });

  it("normalises array-valued query params to the first value", () => {
    // Force expo-linking.parse to yield array params.
    mockFakeParse.mockReturnValueOnce({
      scheme: "project50",
      hostname: null,
      path: "oauth/callback",
      queryParams: { code: ["first", "second"], provider: ["google"] },
    });
    const out = parseOAuthRedirect("project50://oauth/callback?code=first&code=second");
    expect(out.code).toBe("first");
    expect(out.provider).toBe("google");
  });

  it("treats an empty array param as null", () => {
    mockFakeParse.mockReturnValueOnce({
      scheme: "project50",
      hostname: null,
      path: null,
      queryParams: { code: [] },
    });
    expect(parseOAuthRedirect("project50://oauth/callback").code).toBeNull();
  });

  it("handles a null queryParams from the parser", () => {
    mockFakeParse.mockReturnValueOnce({
      scheme: "project50",
      hostname: null,
      path: null,
      queryParams: null,
    });
    expect(parseOAuthRedirect("project50://oauth/callback")).toEqual({
      provider: null,
      code: null,
      state: null,
      error: null,
      isCallbackPath: false,
    });
  });

  it("exposes the OAuth callback path constant", () => {
    expect(OAUTH_CALLBACK_PATH).toBe("oauth/callback");
  });

  it("targets the prod domain for the Universal/App Link OAuth callback", () => {
    expect(OAUTH_UNIVERSAL_LINK_HOST).toBe("www.project50.fit");
    expect(OAUTH_CALLBACK_URL).toBe("https://www.project50.fit/oauth/callback");
  });

  it("parses a prod-domain Universal Link OAuth callback", () => {
    const out = parseOAuthRedirect(
      "https://www.project50.fit/oauth/callback?code=prod-code&state=s",
    );
    expect(out.code).toBe("prod-code");
    expect(out.state).toBe("s");
  });
});

// ─── isOAuthRedirect ──────────────────────────────────────────────────────────

describe("isOAuthRedirect", () => {
  it("is true when a code is present", () => {
    expect(isOAuthRedirect("project50://oauth/callback?code=c")).toBe(true);
  });

  it("is true when an error is present", () => {
    expect(isOAuthRedirect("project50://oauth/callback?error=denied")).toBe(true);
  });

  it("is false for a non-OAuth deep link", () => {
    expect(isOAuthRedirect("project50://dashboard")).toBe(false);
  });

  it("is false when a code rides a non-callback path", () => {
    // A code on the wrong path must NOT be treated as an OAuth redirect.
    expect(isOAuthRedirect("project50://dashboard?code=x")).toBe(false);
  });

  it("is true on the prod-domain Universal Link callback path", () => {
    expect(isOAuthRedirect("https://www.project50.fit/oauth/callback?code=c")).toBe(true);
  });

  it("is false for empty url", () => {
    expect(isOAuthRedirect(undefined)).toBe(false);
  });
});

// ─── subscribeToDeepLinks ─────────────────────────────────────────────────────

describe("subscribeToDeepLinks", () => {
  it("registers a url listener and forwards inbound urls", () => {
    const handler = jest.fn();
    subscribeToDeepLinks(handler);

    expect(mockAddEventListener).toHaveBeenCalledWith("url", expect.any(Function));
    // Simulate an inbound url event.
    const listener = mockAddEventListener.mock.calls[0]![1] as (e: { url: string }) => void;
    listener({ url: "project50://oauth/callback?code=live" });
    expect(handler).toHaveBeenCalledWith("project50://oauth/callback?code=live");
  });

  it("forwards the cold-start initial url", async () => {
    mockGetInitialURL.mockResolvedValueOnce("project50://oauth/callback?code=cold");
    const handler = jest.fn();
    subscribeToDeepLinks(handler);
    await Promise.resolve();
    await Promise.resolve();
    expect(handler).toHaveBeenCalledWith("project50://oauth/callback?code=cold");
  });

  it("does not forward when there is no initial url", async () => {
    mockGetInitialURL.mockResolvedValueOnce(null);
    const handler = jest.fn();
    subscribeToDeepLinks(handler);
    await Promise.resolve();
    await Promise.resolve();
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns an unsubscribe function that removes the listener", () => {
    const unsubscribe = subscribeToDeepLinks(jest.fn());
    unsubscribe();
    expect(mockRemove).toHaveBeenCalled();
  });
});
