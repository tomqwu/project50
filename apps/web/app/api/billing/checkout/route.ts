import { requireUser } from "@/lib/session";
import { handleRoute, HttpError } from "@/lib/api/http";
import { createCheckoutSession } from "@/lib/api/billing";

/**
 * POST /api/billing/checkout — start a subscription Checkout for the signed-in
 * user. Body: { priceId? } (falls back to STRIPE_PRICE_ID). Returns { url }.
 * 503 when billing is not configured.
 */
export async function POST(req: Request) {
  return handleRoute(async () => {
    const uid = await requireUser();
    const body = (await req.json().catch(() => ({}))) as { priceId?: unknown };
    const priceId =
      typeof body.priceId === "string" && body.priceId.length > 0
        ? body.priceId
        : process.env.STRIPE_PRICE_ID;
    if (!priceId) throw new HttpError(422, "missing_price_id");
    const url = await createCheckoutSession(uid, priceId);
    return Response.json({ url });
  });
}
