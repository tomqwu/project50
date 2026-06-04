import { requireUser } from "@/lib/session";
import { handleRoute, unprocessable } from "@/lib/api/http";
import { recordReferral } from "@/lib/api/referral";

/**
 * POST /api/referral/claim — body { code }. Records that the signed-in
 * (newly-signed-up) user was referred via `code`. Intended to be called by the
 * client just after signup with the `?ref=<code>` it captured. Idempotent and
 * self-referral-safe: returns { recorded: boolean } where `false` means it was
 * a harmless no-op (unknown code, self-referral, or already referred).
 *
 * FOLLOW-UP: call `recordReferral` directly from the onboarding server flow
 * once the referrer code is threaded through it, making this endpoint optional.
 */
export async function POST(req: Request) {
  return handleRoute(async () => {
    const uid = await requireUser();
    const body = (await req.json().catch(() => null)) as { code?: unknown } | null;
    const code = body?.code;
    if (typeof code !== "string" || code.trim() === "") {
      unprocessable("INVALID_REFERRAL_CODE");
    }
    const recorded = await recordReferral(code.trim(), uid);
    return Response.json({ recorded });
  });
}
