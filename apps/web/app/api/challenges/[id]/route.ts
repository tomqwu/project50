import { requireUser } from "@/lib/session";
import { handleRoute } from "@/lib/api/http";
import {
  getChallenge,
  updateChallenge,
  deleteChallenge,
  type UpdateChallengeInput,
} from "@/lib/api/challenges";

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

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    const uid = await requireUser();
    const { id } = await ctx.params;
    const body = (await req.json()) as UpdateChallengeInput;
    const patch: UpdateChallengeInput = {};
    if (body.title !== undefined) patch.title = body.title;
    if (body.unit !== undefined) patch.unit = body.unit;
    if (body.dailyTarget !== undefined) patch.dailyTarget = body.dailyTarget;
    if (body.visibility !== undefined) patch.visibility = body.visibility;
    const updated = await updateChallenge(id, uid, patch);
    return Response.json(updated);
  });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    const uid = await requireUser();
    const { id } = await ctx.params;
    await deleteChallenge(id, uid);
    return Response.json({ ok: true });
  });
}
