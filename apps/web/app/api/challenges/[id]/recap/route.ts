import { requireUser } from "@/lib/session";
import { handleRoute } from "@/lib/api/http";
import { unprocessable } from "@/lib/api/http";
import { generateRecap, listRecaps, RECAP_KINDS } from "@/lib/api/recap";
import type { RecapKind } from "@project50/recap";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    const uid = await requireUser();
    const { id } = await ctx.params;
    const body = await req.json();
    const kind: string = body?.kind;

    if (!kind || !(RECAP_KINDS as readonly string[]).includes(kind)) {
      unprocessable("INVALID_KIND");
    }

    const result = await generateRecap(uid, id, kind as RecapKind);
    return Response.json(result, { status: 201 });
  });
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    const uid = await requireUser();
    const { id } = await ctx.params;
    const recaps = await listRecaps(id, uid);
    return Response.json(recaps);
  });
}
