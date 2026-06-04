import { requireUser } from "@/lib/session";
import { getReferralStats } from "@/lib/api/referral";
import { ReferralSection } from "./_components/ReferralSection";

/**
 * "Refer a friend" page. Loads the signed-in user's referral code (created on
 * first visit) and how many people they've referred, then renders the share
 * panel.
 */
export default async function ReferPage() {
  const uid = await requireUser();
  const stats = await getReferralStats(uid);
  return (
    <ReferralSection code={stats.code} referredCount={stats.referredCount} />
  );
}
