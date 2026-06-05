import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Shared auth for cron/scheduled routes (reminders, streak-nudges, …).
 *
 * Cron endpoints are guarded by a `Bearer ${CRON_SECRET}` token. This helper
 * centralises that check so the comparison is done once, the right way.
 *
 * Auth model (unchanged):
 *   - CRON_SECRET unset/empty → never authorized (route stays locked).
 *   - Missing/wrong token     → not authorized.
 *   - Correct token           → authorized.
 *
 * Security (#274 audit): the token is compared in **constant time** to avoid a
 * timing side-channel that could let an attacker recover the secret byte by
 * byte. `crypto.timingSafeEqual` requires equal-length buffers (and throws
 * otherwise), and a naive length pre-check would itself leak the secret's
 * length. We therefore SHA-256 both sides first: the digests are always 32
 * bytes, so the lengths always match and the only variable-time work happens on
 * fixed-length, non-reversible hashes.
 */
function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** Constant-time string equality that is safe for arbitrary-length inputs. */
function constantTimeEquals(a: string, b: string): boolean {
  return timingSafeEqual(sha256(a), sha256(b));
}

/**
 * Returns true iff the request carries the correct `Bearer ${CRON_SECRET}`
 * token. Returns false when CRON_SECRET is unset/empty so the endpoint can be
 * disabled by simply not configuring the secret.
 */
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization");
  if (!header) return false;

  return constantTimeEquals(header, `Bearer ${secret}`);
}
