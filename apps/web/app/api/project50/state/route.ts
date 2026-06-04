import { requireUser } from "@/lib/session";
import { handleRoute } from "@/lib/api/http";
import { getProject50State } from "@/lib/project50";

/**
 * GET /api/project50/state — the caller's Project 50 state.
 *
 * Mobile-callable: authenticates via the shared `requireUser` helper, which
 * accepts an `Authorization: Bearer <jwt>` header (see lib/mobile-session.ts).
 */
export async function GET() {
  return handleRoute(async () => {
    const uid = await requireUser();
    const state = await getProject50State(uid);
    return Response.json(state);
  });
}
