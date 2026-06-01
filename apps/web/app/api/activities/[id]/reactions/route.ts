import { requireUser } from "@/lib/session";
import { handleRoute } from "@/lib/api/http";
import { react } from "@/lib/api/social";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    const uid = await requireUser();
    const { id: activityId } = await ctx.params;
    const body = await req.json();
    const { kind, text } = body as { kind: "CHEER" | "COMMENT"; text?: string };
    const reaction = await react(uid, activityId, kind, text);
    return Response.json(reaction, { status: 201 });
  });
}
