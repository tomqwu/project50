import { requireUser } from "@/lib/session";
import { getChallenge, getMilestones } from "@/lib/api/challenges";
import { listRecaps } from "@/lib/api/recap";
import { getCapabilities } from "@/lib/publish/registry";
import { getOrCreateReferralCode } from "@/lib/api/referral";
import { localDayKey, dayNumber } from "@project50/core";
import { CelebrateView } from "./CelebrateView";
import type { MilestoneKind } from "./CelebrateView";
import { RecapPanel } from "./RecapPanel";
import { SocialShare } from "./SocialShare";

export default async function CelebratePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const uid = await requireUser();
  const { id } = await params;

  const challenge = await getChallenge(id, uid);
  const milestoneRows = await getMilestones(id);

  const tz = challenge.timezone ?? "UTC";
  const todayKey = localDayKey(new Date(), tz);
  const dayNum = dayNumber(challenge.startDate, todayKey);

  // Compute stats from dayStatuses
  const completedStatuses = challenge.dayStatuses.filter((ds) => ds.completed);
  const daysCompleted = completedStatuses.length;
  const totalAmount =
    challenge.goalType === "TARGET"
      ? completedStatuses.reduce((sum, ds) => sum + (ds.totalAmount ?? 0), 0)
      : null;

  const milestones = milestoneRows.map((m) => m.kind as MilestoneKind);

  // Find the most recent activity photo (activities are ordered by createdAt desc)
  const photoUrl =
    challenge.activities.find((a) => a.media.length > 0)?.media[0]?.url ?? null;

  // Load existing recaps (visibility-gated)
  const initialRecaps = await listRecaps(id, uid);

  // Viewer's referral code for the "Invite friends" action on the celebrate
  // screen (created on first access; stable thereafter).
  const referralCode = await getOrCreateReferralCode(uid);

  // Compute props for SocialShare
  const hasRecap = initialRecaps.length > 0;
  const isPublic = challenge.visibility === "PUBLIC";
  const capabilities = getCapabilities();

  return (
    <>
      <CelebrateView
        challengeTitle={challenge.title}
        dayNumber={Math.max(1, dayNum)}
        stats={{
          daysCompleted,
          totalAmount,
          unit: challenge.unit ?? null,
        }}
        milestones={milestones}
        shareActions={{
          challengeId: id,
          shareId: challenge.shareId,
          visibility: challenge.visibility as "PUBLIC" | "FOLLOWERS" | "PRIVATE",
        }}
        photoUrl={photoUrl}
        referralCode={referralCode}
      />
      <div style={{ maxWidth: "480px", margin: "0 auto", padding: "0 32px 48px" }}>
        <SocialShare
          challengeId={id}
          hasRecap={hasRecap}
          isPublic={isPublic}
          capabilities={capabilities}
        />
        <RecapPanel challengeId={id} initialRecaps={initialRecaps} />
      </div>
    </>
  );
}
