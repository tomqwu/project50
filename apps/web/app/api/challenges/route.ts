import { requireUser } from "@/lib/session";
import { handleRoute } from "@/lib/api/http";
import { createChallenge, listChallenges } from "@/lib/api/challenges";

export async function POST(req: Request) {
  return handleRoute(async () => {
    const uid = await requireUser();
    const body = await req.json();
    const challenge = await createChallenge(uid, body);
    return Response.json(challenge, { status: 201 });
  });
}

export async function GET() {
  return handleRoute(async () => {
    const uid = await requireUser();
    const challenges = await listChallenges(uid);
    return Response.json(challenges);
  });
}
