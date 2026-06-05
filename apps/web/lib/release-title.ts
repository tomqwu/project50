/**
 * Resolve the ReleaseBadge feature-intro title at build time.
 *
 * The deploy pipeline passes the title base64-encoded (NEXT_PUBLIC_RELEASE_TITLE_B64)
 * because `az acr build` runs its remote `docker build --build-arg ...` through
 * /bin/sh WITHOUT quoting the value — a raw title (spaces + `(#NNN)`) tokenizes
 * wrong and throws `syntax error near unexpected token '('`. base64 keeps the
 * build-arg a single shell-safe token; next.config.mjs decodes it here and inlines
 * the result as NEXT_PUBLIC_RELEASE_TITLE (which lib/build-info.ts reads).
 *
 * Precedence: decoded *_TITLE_B64 (when present and valid) > legacy raw
 * NEXT_PUBLIC_RELEASE_TITLE > the "dev" fallback. An empty or undecodable base64
 * value falls through cleanly to the next source.
 */
export function resolveReleaseTitle(env: {
  NEXT_PUBLIC_RELEASE_TITLE_B64?: string;
  NEXT_PUBLIC_RELEASE_TITLE?: string;
}): string {
  const decoded = decodeReleaseTitleB64(env.NEXT_PUBLIC_RELEASE_TITLE_B64);
  if (decoded) return decoded;
  return env.NEXT_PUBLIC_RELEASE_TITLE || "Local development build";
}

/**
 * Decode a base64 release title, returning "" for missing/empty/undecodable input
 * so callers can fall back cleanly. Round-trips UTF-8 (spaces, parens, accents).
 */
export function decodeReleaseTitleB64(b64: string | undefined): string {
  if (!b64) return "";
  try {
    return Buffer.from(b64, "base64").toString("utf8");
  } catch {
    return "";
  }
}
