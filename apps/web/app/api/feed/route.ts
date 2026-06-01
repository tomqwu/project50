import { requireUser } from "@/lib/session";
import { handleRoute } from "@/lib/api/http";
import { feed } from "@/lib/api/social";

export async function GET() {
  return handleRoute(async () => {
    const uid = await requireUser();
    const activities = await feed(uid);
    return Response.json(activities);
  });
}
