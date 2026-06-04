import { requireUser } from "@/lib/session";
import { handleRoute, unprocessable } from "@/lib/api/http";
import { getProject50State, startProject50 } from "@/lib/project50";

/**
 * POST /api/project50/start — body { timezone } — begin a new run, return the
 * resulting state. Mobile-callable via Bearer token (see requireUser).
 */
export async function POST(req: Request) {
  return handleRoute(async () => {
    const uid = await requireUser();
    const body = await req.json().catch(() => ({}));
    const timezone: unknown = body?.timezone;
    if (typeof timezone !== "string" || timezone.length === 0) {
      unprocessable("INVALID_TIMEZONE");
    }
    await startProject50(uid, timezone as string);
    const state = await getProject50State(uid);
    return Response.json(state, { status: 201 });
  });
}
