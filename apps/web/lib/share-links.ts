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
 * Public URL for a single day's rendered share-card IMAGE (the per-day
 * opengraph-image route):
 *   `${origin}/c/${shareId}/day/${dayNumber}/opengraph-image`
 *
 * This is the image asset Instagram needs: IG has no web "share a link" dialog,
 * so the only compliant in-browser path is an IMAGE-based native share (the OS
 * share sheet / "Share to Story" deep link with a file). Callers fetch this URL
 * into a `File` and hand it to `navigator.share({ files })`.
 *
 * `origin` is a bare scheme+host with NO trailing slash (e.g.
 * "https://www.project50.fit"), matching `dayShareUrl`.
 */
export function dayImageUrl(origin: string, shareId: string, dayNumber: number): string {
  return `${origin}/c/${shareId}/day/${dayNumber}/opengraph-image`;
}

/**
 * Facebook sharer endpoint for an arbitrary target URL. The target is
 * query-encoded so reserved characters survive the round-trip.
 */
export function facebookSharerUrl(url: string): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
}

/**
 * Shareable referral URL for a user's referral `code`:
 *   `${origin}/?ref=${code}`
 *
 * This is the single source of truth for the `?ref=<code>` convention used by
 * the referral program (`ReferralSection` / the `/refer` page) and F4's
 * "Invite friends" action. `origin` is a bare scheme+host with NO trailing
 * slash (e.g. "https://www.project50.fit"), matching our base-url helpers.
 */
export function referralUrl(origin: string, code: string): string {
  return `${origin}/?ref=${code}`;
}
