import { requireUser } from "@/lib/session";
import { handleRoute } from "@/lib/api/http";
import { reportTarget } from "@/lib/api/moderation";

export async function POST(req: Request) {
  return handleRoute(async () => {
    const uid = await requireUser();
    const body = await req.json();
    const { targetType, targetId, reason } = body as {
      targetType: "USER" | "ACTIVITY";
      targetId: string;
      reason: string;
    };
    const report = await reportTarget(uid, { targetType, targetId, reason });
    return Response.json(report, { status: 201 });
  });
}
