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

/**
 * The ONE documented escape hatch that re-enables the test login under
 * `NODE_ENV=production`. The CI e2e server runs `next start` (which forces
 * production) over http, and sets this to exactly "1" so Playwright's
 * deterministic login keeps working. Any other value is a misconfiguration.
 */
const AUTH_E2E_ALLOW_PROD_ESCAPE_HATCH = "1";

/**
 * Production safety guard for the dev/e2e "continue as demo" Credentials
 * provider (#277).
 *
 * The dev/e2e sign-in path is a passwordless login and must NEVER be reachable
 * in production. This decides whether `auth.ts` may register the `e2e`
 * Credentials provider, hardening the previous inline double-gate so it can't be
 * enabled in production by misconfiguration:
 *
 *   - Gate 1 (primary): only `AUTH_E2E === "1"` arms the path at all. Any other
 *     value (unset, "0", "true", …) → never registered, never throws.
 *   - Non-production (`NODE_ENV !== "production"`, e.g. dev / vitest / Playwright
 *     dev server) → registered. This is the normal local + CI-unit path.
 *   - Production (`NODE_ENV === "production"`):
 *       • `AUTH_E2E_ALLOW_PROD === "1"` (the single documented escape hatch) →
 *         registered, so the CI e2e prod-build server still works.
 *       • `AUTH_E2E_ALLOW_PROD` set to any *other* truthy/non-empty value →
 *         **throws** a clear startup error: this is almost certainly a
 *         misconfiguration trying to expose the test login in prod, so fail
 *         loudly rather than silently guess.
 *       • `AUTH_E2E_ALLOW_PROD` unset or empty → NOT registered (silent refuse):
 *         `.env.example` ships it blank, so a leaked `AUTH_E2E=1` alone can never
 *         expose the test login in production.
 *
 * @throws {Error} in production when the escape hatch is set to a non-"1",
 *   non-empty value while `AUTH_E2E === "1"`.
 */
export function shouldRegisterE2eProvider(
  env: Record<string, string | undefined> = process.env,
): boolean {
  // Gate 1 — primary gate. Never set in production deployments.
  if (env.AUTH_E2E !== "1") return false;

  // Non-production: the primary gate is sufficient.
  if (env.NODE_ENV !== "production") return true;

  // Production: the test login may ONLY come back via the exact escape hatch.
  const allowProd = env.AUTH_E2E_ALLOW_PROD;
  if (allowProd === AUTH_E2E_ALLOW_PROD_ESCAPE_HATCH) return true;

  // Empty / unset → silently refuse (the safe production default).
  if (allowProd === undefined || allowProd === "") return false;

  // Any other value in production is a misconfiguration — fail loudly so a
  // mistyped/forced flag can never quietly expose the passwordless test login.
  throw new Error(
    `Refusing to start: AUTH_E2E_ALLOW_PROD=${JSON.stringify(allowProd)} is set in ` +
      `production but is not the documented escape hatch "1". The dev/e2e test ` +
      `login must never be enabled in production. Unset AUTH_E2E and ` +
      `AUTH_E2E_ALLOW_PROD in production (see docs/SECRETS.md).`,
  );
}
