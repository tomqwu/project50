import { handleRoute } from "@/lib/api/http";
import { handleWebhookEvent } from "@/lib/api/billing";

/**
 * POST /api/billing/webhook — Stripe-signed subscription events. No auth: the
 * request is authenticated by the Stripe-Signature header, verified against
 * STRIPE_WEBHOOK_SECRET inside handleWebhookEvent. The raw body is required for
 * signature verification, so we read it as text (not JSON). 503 when billing is
 * not configured.
 */
export async function POST(req: Request) {
  return handleRoute(async () => {
    const rawBody = await req.text();
    const signature = req.headers.get("stripe-signature");
    const result = await handleWebhookEvent(rawBody, signature);
    return Response.json(result);
  });
}
