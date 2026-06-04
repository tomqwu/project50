import { requireUser } from "@/lib/session";
import { handleRoute } from "@/lib/api/http";
import { getEntitlement } from "@/lib/api/entitlements";

/**
 * GET /api/billing/entitlement — the signed-in user's plan + premium flag.
 * Works without any Stripe env: free for users with no active subscription.
 */
export async function GET() {
  return handleRoute(async () => {
    const uid = await requireUser();
    const entitlement = await getEntitlement(uid);
    return Response.json(entitlement);
  });
}
