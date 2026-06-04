/**
 * Deep-link / native OAuth redirect handling for the project50 mobile app.
 *
 * The native OAuth provider redirects back to the app via either:
 *   - the custom scheme  (`project50://oauth/callback?...`), or
 *   - a Universal Link (iOS) / App Link (Android) on the associated domain
 *     (`https://project50.app/oauth/callback?...`).
 *
 * This module parses the inbound redirect URL into the OAuth params we care
 * about (provider, code, state, error). The pure parsing logic lives here so it
 * can be unit-tested without the native bridge; the subscription helper wraps
 * `expo-linking`'s event listener + initial-URL APIs.
 *
 * Hosting requirement (TODO: host these):
 *   - iOS Universal Links: serve `/.well-known/apple-app-site-association` on
 *     `project50.app` mapping the app's appID to the `applinks` paths.
 *   - Android App Links: serve `/.well-known/assetlinks.json` on `project50.app`
 *     declaring the app's package name + signing-cert SHA-256 fingerprint.
 *   The placeholder domain (`project50.app`) is configured in app.json
 *   (`ios.associatedDomains` + `android.intentFilters` with `autoVerify`).
 */

import * as Linking from "expo-linking";

/** The path segment OAuth providers redirect back to. */
export const OAUTH_CALLBACK_PATH = "oauth/callback";

/** Parsed OAuth redirect parameters extracted from an inbound deep-link URL. */
export interface OAuthRedirectParams {
  /** The provider, inferred from the `provider` query param or the path. */
  provider: string | null;
  /** The OAuth authorization code to exchange for a session token. */
  code: string | null;
  /** The CSRF/state value echoed back by the provider. */
  state: string | null;
  /** The provider error code (e.g. `access_denied`), if the user declined. */
  error: string | null;
}

/** Normalise a possibly-array query param to a single string (or null). */
function firstValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * Parse an inbound redirect URL into OAuth params.
 *
 * Works for both the custom scheme and the Universal/App Link form. Returns all
 * fields null when the URL is empty or carries no recognisable OAuth params.
 */
export function parseOAuthRedirect(url: string | null | undefined): OAuthRedirectParams {
  if (!url) {
    return { provider: null, code: null, state: null, error: null };
  }

  const parsed = Linking.parse(url);
  const query = parsed.queryParams ?? {};

  // Provider may be passed explicitly as a query param, or be the last path
  // segment after the callback prefix (e.g. `oauth/callback/google`).
  let provider = firstValue(query["provider"]);
  if (!provider && parsed.path) {
    const segments = parsed.path.split("/").filter(Boolean);
    const idx = segments.indexOf("callback");
    const next = idx >= 0 ? segments[idx + 1] : undefined;
    if (next) {
      provider = next;
    }
  }

  return {
    provider,
    code: firstValue(query["code"]),
    state: firstValue(query["state"]),
    error: firstValue(query["error"]),
  };
}

/**
 * True when an inbound URL is an OAuth callback we should handle
 * (it carries a `code` or an `error`).
 */
export function isOAuthRedirect(url: string | null | undefined): boolean {
  const { code, error } = parseOAuthRedirect(url);
  return code !== null || error !== null;
}

/**
 * Subscribe to inbound deep-link URLs (foreground + cold-start).
 *
 * Invokes `handler` with each inbound URL: once for the initial URL (if the app
 * was cold-started from a link), and again whenever a link arrives while the app
 * is running. Returns an unsubscribe function.
 */
export function subscribeToDeepLinks(handler: (url: string) => void): () => void {
  const subscription = Linking.addEventListener("url", ({ url }) => handler(url));

  // Cold-start: the launch URL is not delivered via the listener.
  void Linking.getInitialURL().then((url) => {
    if (url) handler(url);
  });

  return () => subscription.remove();
}
