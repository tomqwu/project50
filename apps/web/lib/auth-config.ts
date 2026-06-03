/**
 * Pure auth configuration helpers (M0 #32).
 *
 * Kept separate from auth.ts (which constructs NextAuth at module load) so the
 * session-expiry, secret-rotation, and secure-cookie logic can be unit-tested
 * directly without standing up the whole auth runtime.
 */

/** 30 days — how long a session JWT stays valid before re-auth is required. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** Re-issue the session JWT at most once per day to roll its expiry forward. */
export const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24;

/**
 * Parse AUTH_SECRET into the value NextAuth expects.
 *
 * A comma-separated list enables **secret rotation**: the first secret signs new
 * tokens while all listed secrets are accepted for verification, so an old
 * secret can be retired without invalidating live sessions. A single value
 * behaves exactly as before. Returns undefined when unset/empty so NextAuth
 * falls back to its own AUTH_SECRET resolution.
 */
export function parseAuthSecrets(raw: string | undefined): string | string[] | undefined {
  if (!raw) return undefined;
  const secrets = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (secrets.length === 0) return undefined;
  return secrets.length === 1 ? secrets[0] : secrets;
}

/**
 * Decide whether to force `Secure` session cookies.
 *
 * Returns true only when the deployment URL is https, and undefined otherwise —
 * so NextAuth keeps its per-request default (Secure over https, plain over
 * http). Gating on the URL scheme (not NODE_ENV) is deliberate: the e2e server
 * runs `next start` with NODE_ENV=production over http, and forcing Secure there
 * would stop the browser from ever sending the session cookie.
 */
export function shouldUseSecureCookies(
  env: Record<string, string | undefined> = process.env,
): boolean | undefined {
  const url = env.AUTH_URL ?? env.NEXTAUTH_URL;
  return url?.startsWith("https://") ? true : undefined;
}
