import { requireUser } from "@/lib/session";
import { getChallenge, getMilestones } from "@/lib/api/challenges";
import { localDayKey, dayNumber } from "@project50/core";
import { CelebrateView } from "./CelebrateView";
import type { MilestoneKind } from "./CelebrateView";

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

  return (
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
    />
  );
}
