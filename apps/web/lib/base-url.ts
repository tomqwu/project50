/**
 * Returns the absolute base URL for constructing internal links.
 * Reads APP_BASE_URL from the environment, defaulting to localhost:3000 for local dev.
 */
export function getBaseUrl(): string {
  return process.env.APP_BASE_URL ?? "http://localhost:3000";
}
