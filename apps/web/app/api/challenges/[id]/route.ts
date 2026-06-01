import { requireUser } from "@/lib/session";
import { handleRoute } from "@/lib/api/http";
import { getChallenge } from "@/lib/api/challenges";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    const uid = await requireUser();
    const { id } = await ctx.params;
    const challenge = await getChallenge(id, uid);
    return Response.json(challenge);
  });
}
