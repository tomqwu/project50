import { requireUser } from "@/lib/session";
import { handleRoute } from "@/lib/api/http";
import { getReferralStats } from "@/lib/api/referral";

/**
 * GET /api/referral — the signed-in user's referral code + how many people
 * they've referred. The code is created on first access if it doesn't exist.
 */
export async function GET() {
  return handleRoute(async () => {
    const uid = await requireUser();
    const stats = await getReferralStats(uid);
    return Response.json(stats);
  });
}
