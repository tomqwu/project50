/**
 * Pure, framework-free builders for outbound share links.
 *
 * Kept as a small module of named exports so later social features (e.g. F4's
 * referral links) can add their own builder here without pulling in React, the
 * DB, or any request context. Every helper takes an explicit `origin` so callers
 * decide whether to use the request origin, a configured site URL, etc.
 */

/**
 * Public, unauthenticated URL for a single completed Project 50 day:
 *   `${origin}/c/${shareId}/day/${dayNumber}`
 *
 * `origin` is expected to be a bare scheme+host (optionally with port/path) and
 * NO trailing slash (e.g. "https://www.project50.fit"), matching the values our
 * base-url/site-url helpers return.
 */
export function dayShareUrl(origin: string, shareId: string, dayNumber: number): string {
  return `${origin}/c/${shareId}/day/${dayNumber}`;
}

/**
 * Facebook sharer endpoint for an arbitrary target URL. The target is
 * query-encoded so reserved characters survive the round-trip.
 */
export function facebookSharerUrl(url: string): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
}
