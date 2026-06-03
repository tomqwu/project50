import { requireUser } from "@/lib/session";
import { handleRoute } from "@/lib/api/http";
import { blockUser, unblockUser } from "@/lib/api/moderation";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    const uid = await requireUser();
    const { id: blockedId } = await ctx.params;
    const edge = await blockUser(uid, blockedId);
    return Response.json(edge, { status: 201 });
  });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    const uid = await requireUser();
    const { id: blockedId } = await ctx.params;
    await unblockUser(uid, blockedId);
    return new Response(null, { status: 204 });
  });
}
