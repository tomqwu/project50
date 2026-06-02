/**
 * Unit tests for session.ts.
 * Mocks: expo-secure-store, global.fetch, apiClient.
 * Covers: saveToken, getToken, clearToken, signInDev, handleOAuthResult,
 *         signInWithGoogle, signInWithFacebook.
 * The buildGoogleAuthRequest / buildFacebookAuthRequest native hook call sites
 * are excluded with istanbul ignore next (see COVERAGE.md).
 */

import type { AuthSessionResult } from "expo-auth-session";

// Mock expo-secure-store before imports
jest.mock("expo-secure-store", () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// Mock expo-auth-session (hooks are native glue; but we test handleOAuthResult)
jest.mock("expo-auth-session", () => ({
  useAuthRequest: jest.fn(),
  useAutoDiscovery: jest.fn(),
  makeRedirectUri: jest.fn(() => "project50://redirect"),
}));

// Mock apiClient singleton
jest.mock("./apiClient", () => ({
  apiClient: { setToken: jest.fn() },
  ApiClient: jest.fn(),
  ApiError: class ApiError extends Error {},
}));

import * as SecureStore from "expo-secure-store";
import { saveToken, getToken, clearToken, signInDev, handleOAuthResult, signInWithGoogle, signInWithFacebook } from "./session";
import { apiClient } from "./apiClient";

const mockSecureStore = SecureStore as jest.Mocked<typeof SecureStore>;
const globalFetch = (): jest.Mock => global.fetch as jest.Mock;

// ─── Helpers ────────────────────────────────────────────────────────────────

beforeEach(() => {
  global.fetch = jest.fn() as typeof fetch;
  jest.clearAllMocks();
});

function mockFetchOk(body: unknown, status = 200, headers?: Record<string, string>): void {
  globalFetch().mockResolvedValueOnce({
    ok: true,
    status,
    json: () => Promise.resolve(body),
    headers: {
      get: (key: string) => headers?.[key] ?? null,
    },
  });
}

function mockFetchError(status: number): void {
  globalFetch().mockResolvedValueOnce({
    ok: false,
    status,
    json: () => Promise.resolve({ error: "error" }),
    headers: { get: () => null },
  });
}

/** Build a minimal success AuthSessionResult for testing. */
function makeSuccessResult(code: string, state: string): AuthSessionResult {
  return {
    type: "success",
    errorCode: null,
    error: null,
    authentication: null,
    url: "project50://redirect?code=" + code,
    params: { code, state },
  } as unknown as AuthSessionResult;
}

function makeCancelResult(): AuthSessionResult {
  return { type: "cancel" } as AuthSessionResult;
}

function makeDismissResult(): AuthSessionResult {
  return { type: "dismiss" } as AuthSessionResult;
}

function makeErrorResult(): AuthSessionResult {
  return { type: "error", errorCode: "access_denied", error: null, authentication: null, url: "", params: {} } as unknown as AuthSessionResult;
}

// ─── saveToken ────────────────────────────────────────────────────────────────

describe("saveToken", () => {
  it("calls SecureStore.setItemAsync with the correct key + value", async () => {
    mockSecureStore.setItemAsync.mockResolvedValueOnce(undefined);
    await saveToken("tok-abc");
    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
      "project50_session_token",
      "tok-abc",
    );
  });
});

// ─── getToken ─────────────────────────────────────────────────────────────────

describe("getToken", () => {
  it("returns token from SecureStore", async () => {
    mockSecureStore.getItemAsync.mockResolvedValueOnce("tok-xyz");
    const token = await getToken();
    expect(token).toBe("tok-xyz");
    expect(mockSecureStore.getItemAsync).toHaveBeenCalledWith("project50_session_token");
  });

  it("returns null when no token stored", async () => {
    mockSecureStore.getItemAsync.mockResolvedValueOnce(null);
    const token = await getToken();
    expect(token).toBeNull();
  });
});

// ─── clearToken ───────────────────────────────────────────────────────────────

describe("clearToken", () => {
  it("calls SecureStore.deleteItemAsync with the correct key", async () => {
    mockSecureStore.deleteItemAsync.mockResolvedValueOnce(undefined);
    await clearToken();
    expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith("project50_session_token");
  });
});

// ─── signInDev ────────────────────────────────────────────────────────────────

describe("signInDev", () => {
  it("fetches CSRF then posts to e2e callback, returns token from body", async () => {
    // CSRF fetch
    mockFetchOk({ csrfToken: "csrf-token-123" });
    // e2e callback POST
    mockFetchOk({ token: "session-token-abc" });
    mockSecureStore.setItemAsync.mockResolvedValueOnce(undefined);

    const token = await signInDev("testuser", "http://localhost:3000");

    expect(token).toBe("session-token-abc");
    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
      "project50_session_token",
      "session-token-abc",
    );
    expect(apiClient.setToken).toHaveBeenCalledWith("session-token-abc");
  });

  it("handles sessionToken in body (alternate key)", async () => {
    mockFetchOk({ csrfToken: "csrf-token-456" });
    mockFetchOk({ sessionToken: "session-token-def" });
    mockSecureStore.setItemAsync.mockResolvedValueOnce(undefined);

    const token = await signInDev("testuser2", "http://localhost:3000");
    expect(token).toBe("session-token-def");
  });

  it("falls back to Set-Cookie header when body has no token", async () => {
    // CSRF fetch
    mockFetchOk({ csrfToken: "csrf-token-789" });
    // e2e callback returns no token in body, but Set-Cookie header
    const cookieValue = "session-token-ghi";
    globalFetch().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}), // no token field
      headers: {
        get: (key: string) =>
          key === "set-cookie"
            ? `next-auth.session-token=${cookieValue}; Path=/; HttpOnly`
            : null,
      },
    });
    mockSecureStore.setItemAsync.mockResolvedValueOnce(undefined);

    const token = await signInDev("testuser3", "http://localhost:3000");
    expect(token).toBe(cookieValue);
  });

  it("throws when CSRF fetch fails", async () => {
    mockFetchError(500);
    await expect(signInDev("user", "http://localhost:3000")).rejects.toThrow(
      "CSRF fetch failed: 500",
    );
  });

  it("throws when e2e callback fails", async () => {
    mockFetchOk({ csrfToken: "tok" });
    mockFetchError(401);
    await expect(signInDev("user", "http://localhost:3000")).rejects.toThrow(
      "E2E sign-in failed: 401",
    );
  });

  it("throws when no token found in response", async () => {
    mockFetchOk({ csrfToken: "tok" });
    globalFetch().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      headers: { get: () => null },
    });
    await expect(signInDev("user", "http://localhost:3000")).rejects.toThrow(
      "No session token",
    );
  });

  it("throws when Set-Cookie header exists but has no next-auth token match", async () => {
    mockFetchOk({ csrfToken: "tok" });
    globalFetch().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      headers: {
        get: (key: string) =>
          key === "set-cookie" ? "some-other-cookie=value; Path=/" : null,
      },
    });
    await expect(signInDev("user", "http://localhost:3000")).rejects.toThrow(
      "No session token",
    );
  });

  it("uses default localhost URL when no baseUrl and no env var", async () => {
    // Env var not set, baseUrl not passed → should use default localhost:3000
    delete process.env["EXPO_PUBLIC_API_BASE_URL"];
    mockFetchOk({ csrfToken: "tok" });
    mockFetchOk({ token: "tok2" });
    mockSecureStore.setItemAsync.mockResolvedValueOnce(undefined);

    await signInDev("user");

    const calls = globalFetch().mock.calls as Array<[string, unknown]>;
    expect(calls[0]![0]).toContain("http://localhost:3000");
  });

  it("calls the CSRF endpoint on the correct base URL", async () => {
    mockFetchOk({ csrfToken: "tok" });
    mockFetchOk({ token: "session-token" });
    mockSecureStore.setItemAsync.mockResolvedValueOnce(undefined);

    await signInDev("user", "http://myapi:3001");

    const calls = globalFetch().mock.calls as Array<[string, unknown]>;
    expect(calls[0]![0]).toBe("http://myapi:3001/api/auth/csrf");
    expect(calls[1]![0]).toBe("http://myapi:3001/api/auth/callback/e2e");
  });

  it("posts handle + csrfToken to e2e callback", async () => {
    mockFetchOk({ csrfToken: "csrf-abc" });
    mockFetchOk({ token: "session-tok" });
    mockSecureStore.setItemAsync.mockResolvedValueOnce(undefined);

    await signInDev("myhandle", "http://localhost:3000");

    const calls = globalFetch().mock.calls as Array<[string, RequestInit]>;
    const body = JSON.parse(calls[1]![1]!.body as string) as { handle: string; csrfToken: string };
    expect(body).toEqual({ handle: "myhandle", csrfToken: "csrf-abc" });
  });
});

// ─── handleOAuthResult ────────────────────────────────────────────────────────

describe("handleOAuthResult", () => {
  it("returns null for non-success result type (cancel)", async () => {
    const result = makeCancelResult();
    const token = await handleOAuthResult(result, "/api/auth/callback/google");
    expect(token).toBeNull();
  });

  it("returns null for dismiss result type", async () => {
    const result = makeDismissResult();
    const token = await handleOAuthResult(result, "/api/auth/callback/google");
    expect(token).toBeNull();
  });

  it("returns null for error result type", async () => {
    const result = makeErrorResult();
    const token = await handleOAuthResult(result, "/api/auth/callback/google");
    expect(token).toBeNull();
  });

  it("posts code + state to exchange URL on success", async () => {
    const result = makeSuccessResult("auth-code-123", "state-xyz");

    mockFetchOk({ token: "oauth-session-tok" });
    mockSecureStore.setItemAsync.mockResolvedValueOnce(undefined);

    const token = await handleOAuthResult(result, "/api/auth/callback/google", "http://localhost:3000");

    expect(token).toBe("oauth-session-tok");
    const calls = globalFetch().mock.calls as Array<[string, RequestInit]>;
    expect(calls[0]![0]).toBe("http://localhost:3000/api/auth/callback/google");
    const body = JSON.parse(calls[0]![1]!.body as string) as { code: string; state: string };
    expect(body).toEqual({ code: "auth-code-123", state: "state-xyz" });
  });

  it("saves token and sets apiClient on success", async () => {
    const result = makeSuccessResult("code-abc", "state-abc");

    mockFetchOk({ token: "stored-token" });
    mockSecureStore.setItemAsync.mockResolvedValueOnce(undefined);

    await handleOAuthResult(result, "/api/auth/callback/google", "http://localhost:3000");

    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
      "project50_session_token",
      "stored-token",
    );
    expect(apiClient.setToken).toHaveBeenCalledWith("stored-token");
  });

  it("returns null when exchange response has no token", async () => {
    const result = makeSuccessResult("code-xyz", "state-xyz");

    mockFetchOk({});

    const token = await handleOAuthResult(result, "/api/auth/callback/google", "http://localhost:3000");
    expect(token).toBeNull();
  });

  it("throws when token exchange request fails", async () => {
    const result = makeSuccessResult("code-err", "state-err");

    mockFetchError(401);

    await expect(
      handleOAuthResult(result, "/api/auth/callback/google", "http://localhost:3000"),
    ).rejects.toThrow("OAuth token exchange failed: 401");
  });

  it("handles sessionToken key in exchange response", async () => {
    const result = makeSuccessResult("code-st", "state-st");

    mockFetchOk({ sessionToken: "session-tok-alt" });
    mockSecureStore.setItemAsync.mockResolvedValueOnce(undefined);

    const token = await handleOAuthResult(result, "/api/auth/callback/google", "http://localhost:3000");
    expect(token).toBe("session-tok-alt");
  });

  it("uses default localhost URL when no baseUrl provided", async () => {
    delete process.env["EXPO_PUBLIC_API_BASE_URL"];
    const result = makeSuccessResult("code-def", "state-def");

    mockFetchOk({ token: "default-tok" });
    mockSecureStore.setItemAsync.mockResolvedValueOnce(undefined);

    const token = await handleOAuthResult(result, "/api/auth/callback/google");
    expect(token).toBe("default-tok");
    const calls = globalFetch().mock.calls as Array<[string, unknown]>;
    expect(calls[0]![0]).toContain("http://localhost:3000");
  });
});

// ─── signInWithGoogle ─────────────────────────────────────────────────────────

describe("signInWithGoogle", () => {
  it("delegates to handleOAuthResult with google callback URL", async () => {
    const result = makeSuccessResult("g-code", "g-state");

    mockFetchOk({ token: "g-token" });
    mockSecureStore.setItemAsync.mockResolvedValueOnce(undefined);

    const token = await signInWithGoogle(result, "http://localhost:3000");
    expect(token).toBe("g-token");

    const calls = globalFetch().mock.calls as Array<[string, unknown]>;
    expect(calls[0]![0]).toContain("/api/auth/callback/google");
  });

  it("returns null for cancelled auth", async () => {
    const result = makeCancelResult();
    const token = await signInWithGoogle(result, "http://localhost:3000");
    expect(token).toBeNull();
  });
});

// ─── signInWithFacebook ───────────────────────────────────────────────────────

describe("signInWithFacebook", () => {
  it("delegates to handleOAuthResult with facebook callback URL", async () => {
    const result = makeSuccessResult("fb-code", "fb-state");

    mockFetchOk({ token: "fb-token" });
    mockSecureStore.setItemAsync.mockResolvedValueOnce(undefined);

    const token = await signInWithFacebook(result, "http://localhost:3000");
    expect(token).toBe("fb-token");

    const calls = globalFetch().mock.calls as Array<[string, unknown]>;
    expect(calls[0]![0]).toContain("/api/auth/callback/facebook");
  });

  it("returns null for dismissed auth", async () => {
    const result = makeDismissResult();
    const token = await signInWithFacebook(result, "http://localhost:3000");
    expect(token).toBeNull();
  });
});
