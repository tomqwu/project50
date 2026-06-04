import { handleRoute, unprocessable } from "@/lib/api/http";
import { requestMagicLink } from "@/lib/api/magic-link";

/**
 * POST /api/auth/magic-link/request — body { email }.
 *
 * Requests an email magic-link sign-in. ENV-GATED end-to-end: when email is not
 * configured, requestMagicLink is a no-op and this returns { sent: false }.
 *
 * Enumeration-safe: a configured, well-formed request always responds
 * { sent: true } whether or not the address maps to an existing account — so the
 * response never reveals which emails are registered. A 422 is returned only for
 * a structurally-invalid request (missing/blank email or non-JSON body).
 */
export async function POST(req: Request) {
  return handleRoute(async () => {
    const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
    const email = body?.email;
    if (typeof email !== "string" || email.trim() === "") {
      unprocessable("INVALID_EMAIL");
    }

    const result = await requestMagicLink(email.trim());
    // not_configured → email disabled for this deployment (clear, non-leaky).
    // invalid_email → the address failed the shape check.
    if (!result.sent && result.reason === "invalid_email") {
      unprocessable("INVALID_EMAIL");
    }
    return Response.json({ sent: result.sent });
  }, "POST /api/auth/magic-link/request");
}
