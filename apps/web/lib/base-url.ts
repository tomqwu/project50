/**
 * Returns the absolute base URL for constructing internal links.
 * Reads APP_BASE_URL from the environment, defaulting to localhost:3000 for local dev.
 *
 * A blank or whitespace-only APP_BASE_URL (common when copying .env.example) is
 * treated as unset rather than returning "" — callers feed this to `new URL(...)`,
 * which would otherwise throw and break next dev/build.
 */
export function getBaseUrl(): string {
  const configured = process.env.APP_BASE_URL?.trim();
  return configured ? configured : "http://localhost:3000";
}
