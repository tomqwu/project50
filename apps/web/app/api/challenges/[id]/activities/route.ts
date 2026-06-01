import { requireUser } from "@/lib/session";
import { handleRoute, HttpError } from "@/lib/api/http";
import { logActivity } from "@/lib/api/activities";
import { localDayKey } from "@project50/core";
import { prisma } from "@project50/db";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    const uid = await requireUser();
    const { id: challengeId } = await ctx.params;

    const body = await req.json();

    // Load challenge timezone for clock-based asOf
    const challenge = await prisma.challenge.findUnique({
      where: { id: challengeId },
      select: { timezone: true },
    });

    // If challenge doesn't exist, logActivity will 404 — use UTC as fallback for asOf
    const timezone = challenge?.timezone ?? "UTC";
    const asOf = localDayKey(new Date(), timezone);

    const result = await logActivity(uid, challengeId, body, asOf);
    return Response.json(result, { status: 201 });
  });
}
