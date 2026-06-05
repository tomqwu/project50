/**
 * Centralised runtime configuration for the project50 mobile app.
 *
 * Resolves the backend API base URL once, with a clear precedence:
 *
 *   1. `EXPO_PUBLIC_API_BASE_URL` env var (explicit override — used by local dev,
 *      CI, and e2e to point at a localhost / tunnel / staging backend).
 *   2. In a dev build (`__DEV__ === true`): `http://localhost:3000` so a fresh
 *      `expo start` "just works" against a local Next.js server.
 *   3. Otherwise (production / release builds): the prod domain
 *      `https://www.project50.fit`.
 *
 * We deliberately do NOT hardcode a developer's LAN IP — local dev points at
 * localhost (or the env override), production points at the real domain. The
 * prod default lives here so every network caller (apiClient, session OAuth
 * exchange, push token registration) resolves the same base URL.
 *
 * Expo inlining: Expo/Metro replaces `process.env.EXPO_PUBLIC_*` references at
 * build time, and ONLY when written with static dot notation — bracket access
 * is not substituted. So the override is read once below as
 * `process.env.EXPO_PUBLIC_API_BASE_URL` (the value is baked into the bundle).
 * The precedence + normalisation logic is factored into the pure
 * `resolveApiBaseUrlFrom(override)` helper so it stays unit-testable (the inlined
 * env value can't be mutated at runtime under jest-expo).
 * See https://docs.expo.dev/guides/environment-variables/.
 */

/** The production backend domain. OAuth callbacks resolve against this host. */
export const PROD_API_BASE_URL = "https://www.project50.fit";

/** Localhost backend used by `expo start` against a local Next.js dev server. */
export const DEV_API_BASE_URL = "http://localhost:3000";

/**
 * Read the `__DEV__` global without tripping on a Node test context where it
 * may be undefined. Expo/Metro injects `__DEV__` at build time (true for the
 * dev client, false for release builds).
 */
function isDevBuild(): boolean {
  return typeof __DEV__ !== "undefined" && __DEV__ === true;
}

/** Strip surrounding whitespace and any trailing slashes from a base URL. */
function normaliseBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/**
 * Pure resolver: given an optional `EXPO_PUBLIC_API_BASE_URL` override value,
 * apply the precedence (trimmed non-empty override → dev-build localhost → prod
 * domain) and normalise the result (no trailing slash, so callers can
 * concatenate `/api/...` directly).
 *
 * Exported for unit testing; production code calls `resolveApiBaseUrl()`.
 */
export function resolveApiBaseUrlFrom(override: string | undefined): string {
  if (override && override.trim().length > 0) {
    return normaliseBaseUrl(override);
  }
  return isDevBuild() ? DEV_API_BASE_URL : PROD_API_BASE_URL;
}

/**
 * Resolve the backend API base URL for the current build from the inlined
 * `EXPO_PUBLIC_API_BASE_URL` env value. Direct dot notation is required for
 * Expo to substitute the value at build time.
 */
export function resolveApiBaseUrl(): string {
  return resolveApiBaseUrlFrom(process.env.EXPO_PUBLIC_API_BASE_URL);
}

/** The resolved API base URL for this build (computed once at module load). */
export const API_BASE_URL = resolveApiBaseUrl();
