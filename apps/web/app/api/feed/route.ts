import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/session";
import { handleRoute } from "@/lib/api/http";
import { feed } from "@/lib/api/social";

export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const uid = await requireUser();

    const params = req.nextUrl.searchParams;
    const cursor = params.get("cursor") ?? undefined;
    const rawLimit = params.get("limit");
    // `feed()` clamps the limit to [1, FEED_MAX_LIMIT]; pass the parsed value
    // through (undefined for missing/non-numeric so the default applies).
    const limit =
      rawLimit !== null && rawLimit.trim() !== "" && Number.isFinite(Number(rawLimit))
        ? Number(rawLimit)
        : undefined;

    const page = await feed(uid, { cursor, limit });
    return Response.json(page);
  });
}
