/**
 * Session management for the project50 mobile app.
 * - Token storage via expo-secure-store (encrypted, device-local).
 * - Dev/e2e sign-in via the backend's e2e credentials path (CSRF dance).
 * - Google/Facebook OAuth via expo-auth-session (wired; native redirect is documented exclusion).
 */

import * as SecureStore from "expo-secure-store";
import * as AuthSession from "expo-auth-session";
import { apiClient } from "./apiClient";

const TOKEN_KEY = "project50_session_token";

// ─── Token storage ───────────────────────────────────────────────────────────

/** Persist the auth token in the secure keychain. */
export async function saveToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

/** Retrieve the stored auth token (or null if none). */
export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

/** Remove the stored auth token (sign-out). */
export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

// ─── Dev / e2e sign-in ───────────────────────────────────────────────────────

/**
 * Sign in via the backend's dev/e2e path.
 * 1. Fetch CSRF token from /api/auth/csrf.
 * 2. POST to /api/auth/callback/e2e with the handle + csrfToken.
 * 3. Extract the session token from the Set-Cookie header and store it.
 *
 * For use in development and automated e2e flows only; not available in production.
 */
export async function signInDev(handle: string, baseUrl?: string): Promise<string> {
  const base = baseUrl ?? process.env["EXPO_PUBLIC_API_BASE_URL"] ?? "http://localhost:3000";

  // Step 1: Get CSRF token
  const csrfResp = await fetch(`${base}/api/auth/csrf`);
  if (!csrfResp.ok) {
    throw new Error(`CSRF fetch failed: ${csrfResp.status}`);
  }
  const { csrfToken } = (await csrfResp.json()) as { csrfToken: string };

  // Step 2: POST to e2e callback
  const callbackResp = await fetch(`${base}/api/auth/callback/e2e`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle, csrfToken }),
  });
  if (!callbackResp.ok) {
    throw new Error(`E2E sign-in failed: ${callbackResp.status}`);
  }

  // Step 3: Extract the session token
  // The backend may return the token as a cookie header or in the body.
  // Try body first, then Set-Cookie.
  let token: string | null = null;
  try {
    const body = (await callbackResp.json()) as { token?: string; sessionToken?: string };
    token = body.token ?? body.sessionToken ?? null;
  } catch {
    // body not JSON — fall through to cookie extraction
  }

  if (!token) {
    // Try to extract from Set-Cookie header
    const setCookie = callbackResp.headers.get("set-cookie");
    if (setCookie) {
      const match = /next-auth\.session-token=([^;]+)/.exec(setCookie);
      if (match?.[1]) token = match[1];
    }
  }

  if (!token) {
    throw new Error("No session token in e2e sign-in response");
  }

  await saveToken(token);
  apiClient.setToken(token);
  return token;
}

// ─── OAuth sign-in (Google / Facebook) ───────────────────────────────────────

/**
 * Build the OAuth discovery + auth request config for Google.
 * Returns the request and promptAsync function so the caller can trigger the native redirect.
 *
 * COVERAGE EXCLUSION: This entire function is a React hook wrapper (useAuthRequest must be
 * called inside a React component). It contains no branching logic of our own — it is pure
 * native glue. The testable logic (handling the auth result) lives in handleOAuthResult.
 * See COVERAGE.md for the full justification.
 */
/** The native redirect URI; must be whitelisted in the FB/Google Valid OAuth Redirect URIs. */
export const REDIRECT_URI = AuthSession.makeRedirectUri({ scheme: "project50" });

/* istanbul ignore next */
export function buildGoogleAuthRequest(): ReturnType<typeof AuthSession.useAuthRequest> {
  return AuthSession.useAuthRequest(
    {
      clientId: process.env["EXPO_PUBLIC_GOOGLE_CLIENT_ID"] ?? "",
      scopes: ["openid", "profile", "email"],
      redirectUri: REDIRECT_URI,
      usePKCE: false,
    },
    AuthSession.useAutoDiscovery("https://accounts.google.com"),
  );
}

/**
 * Build the OAuth discovery + auth request config for Facebook.
 * Same pattern as Google — pure hook wiring, no branching logic.
 *
 * COVERAGE EXCLUSION: Same reasoning as buildGoogleAuthRequest. See COVERAGE.md.
 */
/* istanbul ignore next */
export function buildFacebookAuthRequest(): ReturnType<typeof AuthSession.useAuthRequest> {
  return AuthSession.useAuthRequest(
    {
      clientId: process.env["EXPO_PUBLIC_FACEBOOK_APP_ID"] ?? "",
      // Each scope must be enabled in the FB app's "Authenticate and request
      // data" use case, or FB returns "Invalid Scopes: <name>".
      // `user_friends` requires App Review before it works for public users in
      // Live mode; in Development mode it works for admins/testers.
      scopes: ["public_profile", "email", "user_friends"],
      redirectUri: REDIRECT_URI,
      usePKCE: false,
    },
    {
      authorizationEndpoint: "https://www.facebook.com/v19.0/dialog/oauth",
      tokenEndpoint: "https://graph.facebook.com/v19.0/oauth/access_token",
    },
  );
}

/**
 * Handle the result of an OAuth prompt (success/failure).
 * Testable: extracts the code from the result and exchanges it for a session token.
 * @param result — the AuthSession.AuthSessionResult from promptAsync
 * @param exchangePath — backend endpoint that exchanges the code for a session token
 * @param redirectUri — the redirect URI used in the auth request (must match the exchange)
 * @param baseUrl — backend base URL
 */
export async function handleOAuthResult(
  result: AuthSession.AuthSessionResult,
  exchangePath: string,
  redirectUri: string,
  baseUrl?: string,
): Promise<string | null> {
  if (result.type !== "success") {
    return null;
  }

  const base = baseUrl ?? process.env["EXPO_PUBLIC_API_BASE_URL"] ?? "http://localhost:3000";

  const resp = await fetch(`${base}${exchangePath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: result.params["code"], redirectUri }),
  });

  if (!resp.ok) {
    throw new Error(`OAuth token exchange failed: ${resp.status}`);
  }

  const body = (await resp.json()) as { token?: string; sessionToken?: string };
  const token = body.token ?? body.sessionToken ?? null;

  if (token) {
    await saveToken(token);
    apiClient.setToken(token);
  }

  return token;
}

/**
 * Sign in with Google using expo-auth-session.
 * Call buildGoogleAuthRequest() in the component and pass the request + promptAsync.
 * Then call signInWithGoogle(result, REDIRECT_URI) after prompting.
 *
 * The promptAsync() call must happen in a user-gesture handler in the component.
 * The handleOAuthResult logic is tested independently.
 */
export async function signInWithGoogle(
  result: AuthSession.AuthSessionResult,
  redirectUri: string,
  baseUrl?: string,
): Promise<string | null> {
  return handleOAuthResult(result, "/api/mobile/auth/google", redirectUri, baseUrl);
}

/**
 * Sign in with Facebook using expo-auth-session.
 * Same pattern as Google.
 */
export async function signInWithFacebook(
  result: AuthSession.AuthSessionResult,
  redirectUri: string,
  baseUrl?: string,
): Promise<string | null> {
  return handleOAuthResult(result, "/api/mobile/auth/facebook", redirectUri, baseUrl);
}
