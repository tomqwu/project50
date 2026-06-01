import { requireUser } from "@/lib/session";
import { handleRoute } from "@/lib/api/http";
import { follow, unfollow } from "@/lib/api/social";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    const uid = await requireUser();
    const { id: followeeId } = await ctx.params;
    const edge = await follow(uid, followeeId);
    return Response.json(edge, { status: 201 });
  });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    const uid = await requireUser();
    const { id: followeeId } = await ctx.params;
    await unfollow(uid, followeeId);
    return new Response(null, { status: 204 });
  });
}
