/**
 * Referral program (#127).
 *
 * Each user has a stable, shareable referral code (`User.referralCode`). When a
 * new user signs up via someone's code, a `Referral` row records who referred
 * whom. A user can view their code and how many people they've referred.
 *
 * ── SIGNUP WIRING (follow-up) ──────────────────────────────────────────────
 * Hooking `recordReferral` into the real signup flow is auth-internal and out
 * of scope here. The client captures `?ref=<code>` at signup time and calls
 * `POST /api/referral/claim` with that code once the new user is authenticated;
 * `recordReferral` is idempotent and self-referral-safe so a stray double-call
 * is harmless. FOLLOW-UP: invoke `recordReferral` directly from the onboarding
 * server flow once the referrer code is threaded through it.
 */
import { randomBytes } from "node:crypto";
import { prisma } from "@project50/db";
import { unprocessable } from "./http";

/** Alphabet for generated codes: unambiguous uppercase + digits (no 0/O/1/I). */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** Length of a generated referral code. */
const CODE_LENGTH = 8;

/** Generate a random referral code from the unambiguous alphabet. */
function generateCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let code = "";
  for (const byte of bytes) {
    code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return code;
}

/**
 * Return the user's stable referral code, creating and storing one on first
 * call. Subsequent calls return the same stored code. Throws 422 if no such
 * user.
 *
 * A fresh code is 8 chars from a 32-symbol alphabet (~10^12 space), so a
 * collision on the unique column is astronomically unlikely; we don't add a
 * retry loop for it (an unhandled write error would surface as a 500, which is
 * the correct signal for a genuinely-broken DB).
 */
export async function getOrCreateReferralCode(uid: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: uid },
    select: { referralCode: true },
  });
  if (!user) unprocessable("USER_NOT_FOUND");
  if (user.referralCode) return user.referralCode;

  const updated = await prisma.user.update({
    where: { id: uid },
    data: { referralCode: generateCode() },
    select: { referralCode: true },
  });
  return updated.referralCode as string;
}

/** A user's referral code and how many people they've referred. */
export interface ReferralStats {
  code: string;
  referredCount: number;
}

/**
 * Return the user's referral code (creating it if needed) and a count of the
 * users they have referred.
 */
export async function getReferralStats(uid: string): Promise<ReferralStats> {
  const code = await getOrCreateReferralCode(uid);
  const referredCount = await prisma.referral.count({
    where: { referrerId: uid },
  });
  return { code, referredCount };
}

/**
 * Return a user's account-creation time, or `null` for an unknown user id.
 *
 * Used by COOKIE-based referral attribution: the claim path compares the
 * referral's CAPTURE time (stored in the `p50_ref` cookie) to this `createdAt`.
 * A genuine referral means the invite link was clicked at or before the account
 * was created (`capturedAt <= createdAt`); a returning account, or an organic
 * signup that later clicked the link, has `createdAt < capturedAt` and is
 * excluded. This capture-vs-signup comparison is the authoritative signal
 * (explicit body-code claims are not gated by it). Chosen because the cookie
 * claim is a decoupled client POST after sign-in, so the Auth.js `createUser`
 * "is new" flag isn't available at that point — `User.createdAt` is.
 */
export async function getUserCreatedAt(uid: string): Promise<Date | null> {
  const user = await prisma.user.findUnique({
    where: { id: uid },
    select: { createdAt: true },
  });
  return user?.createdAt ?? null;
}

/**
 * Record that `newUserId` was referred via `referrerCode`.
 *
 * Returns `true` if a new referral was recorded, `false` when it was a no-op
 * (referrer not found, self-referral, or the new user was already referred).
 * Idempotent: calling it again for an already-referred user is a safe no-op.
 */
export async function recordReferral(
  referrerCode: string,
  newUserId: string,
): Promise<boolean> {
  const referrer = await prisma.user.findUnique({
    where: { referralCode: referrerCode },
    select: { id: true },
  });
  // Unknown code, or someone trying to refer themselves: ignore.
  if (!referrer || referrer.id === newUserId) return false;

  // Already referred (the referredUserId unique guards this too): ignore.
  const existing = await prisma.referral.findUnique({
    where: { referredUserId: newUserId },
    select: { id: true },
  });
  if (existing) return false;

  await prisma.referral.create({
    data: {
      referrerId: referrer.id,
      referredUserId: newUserId,
      code: referrerCode,
    },
  });
  return true;
}
