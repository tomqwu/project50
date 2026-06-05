/**
 * NODE-ONLY referral claim helper (#266 / F4).
 *
 * Split out of `lib/referral-capture.ts` because that module is imported by the
 * EDGE `middleware` (for cookie capture/parse). This helper reaches into the DB
 * via `recordReferral`, which pulls in Prisma + `node:crypto` — neither is
 * Edge-compatible — so it must live in a module that the middleware import graph
 * never touches. Only the server (Node runtime) imports this.
 */
import { isValidReferralCode } from "./referral-capture";
import { recordReferral } from "./api/referral";

/**
 * Record a referral `code` for `uid`, reusing the canonical `recordReferral`
 * attribution path (idempotent; self-referral / already-claimed / unknown-code
 * are safe no-ops). Returns whether a NEW referral was recorded. A
 * missing/blank/invalid code is a no-op that never touches the DB.
 */
export async function claimReferralCode(
  code: string | undefined,
  uid: string,
): Promise<boolean> {
  if (!code) return false;
  const trimmed = code.trim();
  if (!isValidReferralCode(trimmed)) return false;
  return recordReferral(trimmed, uid);
}
