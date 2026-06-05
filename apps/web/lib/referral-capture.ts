/**
 * Referral capture-across-auth (#266 / F4).
 *
 * The invite link is `${origin}/?ref=<code>`. When the recipient is a NEW,
 * signed-OUT user (the primary case), hitting `/?ref=...` redirects them to
 * `/signin` — and a query param does NOT survive that redirect or the external
 * OAuth round-trip, so the referral code would be lost before it could ever be
 * recorded.
 *
 * Fix: capture `<code>` into a short-lived httpOnly cookie in `middleware`
 * (which runs on every request, BEFORE any redirect, and whose cookie survives
 * the OAuth bounce). After the user lands authenticated, the cookie is read and
 * the referral is recorded via the SAME `recordReferral` attribution path used
 * by `/api/referral/claim` (idempotent + self-referral-safe), then cleared.
 *
 * EDGE-ONLY: this module is imported by the Edge `middleware`, so it must NOT
 * import (statically OR dynamically) anything that pulls in Prisma or
 * `node:crypto`. The Node-only claim helper that records via the DB lives in the
 * sibling `referral-claim-server.ts` (imported only from server/route code).
 */
import type { NextRequest, NextResponse } from "next/server";

/** Name of the short-lived cookie holding a pending referral code. */
export const REFERRAL_COOKIE = "p50_ref";

/** Lifetime of the pending-referral cookie: 30 minutes. */
export const REFERRAL_COOKIE_MAX_AGE_SECONDS = 30 * 60;

/**
 * Generated codes are 8 chars from `[A-Z2-9]` (see `lib/api/referral.ts`). We
 * accept the slightly broader `[A-Za-z0-9]{1,64}` so legacy/manual codes still
 * work, while rejecting anything with spaces, slashes, or other characters that
 * could smuggle a path/redirect into the cookie value.
 */
const VALID_CODE = /^[A-Za-z0-9]{1,64}$/;

/** True when `code` is a plausible, injection-safe referral code. */
export function isValidReferralCode(code: string): boolean {
  return VALID_CODE.test(code);
}

/** A parsed pending-referral cookie: the code + when it was captured. */
export interface ParsedReferralCookie {
  code: string;
  capturedAt: Date;
}

/**
 * Cookie encoding: `"<code>.<epochMillis>"`.
 *
 * The capture timestamp lets the claim path compare it to the account's
 * `createdAt` — the authoritative "was the ref clicked BEFORE the account
 * existed" signal. Codes are `[A-Za-z0-9]` so they never contain the `.`
 * separator; we split on the LAST dot to recover the timestamp.
 */
export function encodeReferralCookie(code: string, capturedAtMs: number): string {
  return `${code}.${capturedAtMs}`;
}

/**
 * Parse a `"<code>.<epochMillis>"` cookie value back into `{ code, capturedAt }`,
 * or `null` when it is absent, malformed, timestamp-less (legacy format), has an
 * invalid code, or a non-positive/non-integer timestamp. Callers treat `null` as
 * "no usable pending referral" and fail safe (do NOT record).
 */
export function parseReferralCookie(
  value: string | undefined,
): ParsedReferralCookie | null {
  if (!value) return null;
  const lastDot = value.lastIndexOf(".");
  if (lastDot <= 0) return null; // no dot, or leading dot (empty code)
  const code = value.slice(0, lastDot);
  const tsPart = value.slice(lastDot + 1);
  if (!isValidReferralCode(code)) return null;
  // Strictly an integer string (no sign, no decimals, no whitespace).
  if (!/^\d+$/.test(tsPart)) return null;
  const ms = Number(tsPart);
  if (!Number.isSafeInteger(ms) || ms <= 0) return null;
  return { code, capturedAt: new Date(ms) };
}

/**
 * Whether the `p50_ref` cookie should carry the `Secure` flag.
 *
 * Derived from the app SCHEME — never `NODE_ENV` — mirroring the Auth.js
 * secure-cookie convention (`shouldUseSecureCookies`): a production build served
 * over plain http (the e2e server, or an http deployment) has
 * `NODE_ENV=production` but must NOT mark the cookie Secure, or the browser
 * refuses to send it back over http and the whole cookie-claim flow silently
 * breaks. Signal, in order: the configured `AUTH_URL`/`NEXTAUTH_URL` scheme,
 * else the incoming request's own scheme. For prod (https www.project50.fit)
 * this stays Secure.
 */
function shouldSecureReferralCookie(request: NextRequest): boolean {
  const url = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  if (url) return url.startsWith("https://");
  return request.nextUrl.protocol === "https:";
}

/**
 * If the incoming request carries a valid `?ref=<code>`, set the pending
 * referral cookie on `response`. Edge-safe (no DB). Returns whether a cookie
 * was set. Invalid/garbage/absent codes are ignored (no cookie, no throw).
 */
export function captureReferralFromRequest(
  request: NextRequest,
  response: NextResponse,
): boolean {
  const raw = request.nextUrl.searchParams.get("ref");
  if (raw === null) return false;
  const code = raw.trim();
  if (!isValidReferralCode(code)) return false;

  response.cookies.set(REFERRAL_COOKIE, encodeReferralCookie(code, Date.now()), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: REFERRAL_COOKIE_MAX_AGE_SECONDS,
    // Secure only when the app is served over https (scheme-derived, NOT
    // NODE_ENV) so an http deployment's browser still sends the cookie back.
    secure: shouldSecureReferralCookie(request),
  });
  return true;
}
