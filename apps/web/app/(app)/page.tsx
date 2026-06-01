import { requireUser } from "@/lib/session";
import { listChallenges, getChallenge } from "@/lib/api/challenges";
import { localDayKey, dayNumber } from "@project50/core";
import { DashboardView } from "./_components/DashboardView";
import type { PrimaryChallenge, ChallengeItem } from "./_components/DashboardView";

export default async function DashboardPage() {
  const uid = await requireUser();

  const challenges = await listChallenges(uid);

  if (challenges.length === 0) {
    return <DashboardView primary={null} challenges={[]} />;
  }

  // Pick the first (most-recently created) challenge as primary
  const primaryRaw = challenges[0];

  // Load full challenge detail (includes dayStatuses + streak info)
  const full = await getChallenge(primaryRaw.id, uid);

  const tz = full.timezone ?? "UTC";
  const todayKey = localDayKey(new Date(), tz);
  const dayNum = dayNumber(full.startDate, todayKey);

  // Find today's DayStatus
  const todayStatus = full.dayStatuses.find((ds) => ds.dayKey === todayKey) ?? null;

  const todayProgress = todayStatus
    ? {
        totalAmount: todayStatus.totalAmount ?? 0,
        target: full.dailyTarget ?? 1,
        completed: todayStatus.completed,
      }
    : null;

  // Count earned badges (milestones) — not directly available from getChallenge; use dayStatuses count
  // Badges and cheering counts aren't loaded by getChallenge; use 0 as placeholder until we have a
  // dedicated service. This keeps the page thin.
  const primary: PrimaryChallenge = {
    id: full.id,
    title: full.title,
    goalType: full.goalType as "TARGET" | "BINARY",
    unit: full.unit ?? null,
    dayNumber: Math.max(1, dayNum),
    today: todayProgress,
    currentStreak: full.currentStreak,
    badges: 0,
    cheering: 0,
  };

  const challengeItems: ChallengeItem[] = challenges.map((c) => ({
    id: c.id,
    title: c.title,
    goalType: c.goalType as "TARGET" | "BINARY",
  }));

  return <DashboardView primary={primary} challenges={challengeItems} />;
}
