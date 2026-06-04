import { requireUser } from "@/lib/session";
import { handleRoute, unprocessable } from "@/lib/api/http";
import { getProject50State, toggleRule } from "@/lib/project50";

/**
 * POST /api/project50/toggle — body { ruleId, done } — set a rule's done state
 * for today on the caller's active run, then return the recomputed state.
 * Mobile-callable via Bearer token (see requireUser).
 */
export async function POST(req: Request) {
  return handleRoute(async () => {
    const uid = await requireUser();
    const body = await req.json().catch(() => ({}));
    const ruleId: unknown = body?.ruleId;
    const done: unknown = body?.done;
    if (typeof ruleId !== "number" || typeof done !== "boolean") {
      unprocessable("INVALID_TOGGLE");
    }
    await toggleRule(uid, ruleId as number, done as boolean);
    const state = await getProject50State(uid);
    return Response.json(state);
  });
}
