import { requireUser } from "@/lib/session";
import { handleRoute } from "@/lib/api/http";
import { createPortalSession } from "@/lib/api/billing";

/**
 * POST /api/billing/portal — open a Stripe Billing Portal session for the
 * signed-in user and return its hosted { url } so the client can redirect there
 * to manage / cancel their subscription. 503 when billing is not configured,
 * 409 when the user has no Stripe customer yet.
 */
export async function POST() {
  return handleRoute(async () => {
    const uid = await requireUser();
    const url = await createPortalSession(uid);
    return Response.json({ url });
  });
}
