/**
 * Deep-link / native OAuth redirect handling for the project50 mobile app.
 *
 * The native OAuth provider redirects back to the app via either:
 *   - the custom scheme  (`project50://oauth/callback?...`), or
 *   - a Universal Link (iOS) / App Link (Android) on the production domain
 *     (`https://www.project50.fit/oauth/callback?...`).
 *
 * This module parses the inbound redirect URL into the OAuth params we care
 * about (provider, code, state, error). The pure parsing logic lives here so it
 * can be unit-tested without the native bridge; the subscription helper wraps
 * `expo-linking`'s event listener + initial-URL APIs.
 *
 * Hosting requirement (served by apps/web on the prod domain):
 *   - iOS Universal Links: serve `/.well-known/apple-app-site-association` on
 *     `www.project50.fit` mapping the app's appID to the `applinks` paths.
 *   - Android App Links: serve `/.well-known/assetlinks.json` on
 *     `www.project50.fit` declaring the app's package name + signing-cert
 *     SHA-256 fingerprint.
 *   The prod domain (`www.project50.fit`) is configured in app.json
 *   (`ios.associatedDomains` + `android.intentFilters` with `autoVerify`).
 *
 * Provider registration (FB/Google) — the OAuth "Valid redirect URIs" that must
 * be whitelisted for the mobile app to return here:
 *   - `https://www.project50.fit/oauth/callback`  (Universal/App Link form)
 *   - `project50://oauth/callback`                (custom-scheme form)
 */

import * as Linking from "expo-linking";

/** The path segment OAuth providers redirect back to. */
export const OAUTH_CALLBACK_PATH = "oauth/callback";

/**
 * The production host used for the Universal Link / App Link OAuth callback.
 * Must match `ios.associatedDomains` + `android.intentFilters` in app.json and
 * the redirect URIs registered with the FB/Google OAuth apps.
 */
export const OAUTH_UNIVERSAL_LINK_HOST = "www.project50.fit";

/** The full https Universal/App Link OAuth callback URL on the prod domain. */
export const OAUTH_CALLBACK_URL = `https://${OAUTH_UNIVERSAL_LINK_HOST}/${OAUTH_CALLBACK_PATH}`;

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
  /**
   * True when the URL's path is the OAuth callback path (`oauth/callback`,
   * optionally with a trailing `/provider` segment). Used to gate handling so an
   * arbitrary deep link that happens to carry a `code` query param is NOT
   * mistaken for an OAuth redirect.
   */
  isCallbackPath: boolean;
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
    return { provider: null, code: null, state: null, error: null, isCallbackPath: false };
  }

  const parsed = Linking.parse(url);
  const query = parsed.queryParams ?? {};

  // Normalise both redirect forms into a single segment list:
  //   - Universal/App Link `https://www.project50.fit/oauth/callback`
  //       → hostname `www.project50.fit`, path `oauth/callback`
  //   - custom scheme `project50://oauth/callback`
  //       → hostname `oauth`, path `callback`
  // Prepending the hostname yields `[…, "oauth", "callback", <provider?>]` in
  // both cases, so the callback check is host-form-agnostic.
  const pathSegments = parsed.path ? parsed.path.split("/").filter(Boolean) : [];
  const segments = parsed.hostname ? [parsed.hostname, ...pathSegments] : pathSegments;

  // The path is an OAuth callback when it ends with `oauth/callback`
  // (optionally followed by a single `provider` segment).
  const callbackIdx = segments.indexOf("callback");
  const isCallbackPath =
    callbackIdx >= 1 &&
    segments[callbackIdx - 1] === "oauth" &&
    segments.length <= callbackIdx + 2;

  // Provider may be passed explicitly as a query param, or be the last path
  // segment after the callback prefix (e.g. `oauth/callback/google`).
  let provider = firstValue(query["provider"]);
  if (!provider) {
    const next = callbackIdx >= 0 ? segments[callbackIdx + 1] : undefined;
    if (next) {
      provider = next;
    }
  }

  return {
    provider,
    code: firstValue(query["code"]),
    state: firstValue(query["state"]),
    error: firstValue(query["error"]),
    isCallbackPath,
  };
}

/**
 * True when an inbound URL is an OAuth callback we should handle: its path must
 * be the OAuth callback path AND it must carry a `code` or an `error`. Gating on
 * the path prevents an arbitrary deep link (e.g. `project50://dashboard?code=x`)
 * from being treated as an OAuth redirect.
 */
export function isOAuthRedirect(url: string | null | undefined): boolean {
  const { code, error, isCallbackPath } = parseOAuthRedirect(url);
  return isCallbackPath && (code !== null || error !== null);
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
