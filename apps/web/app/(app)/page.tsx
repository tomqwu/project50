import { requireUser } from "@/lib/session";
import { listChallenges, getChallenge } from "@/lib/api/challenges";
import { localDayKey, dayNumber } from "@project50/core";
import { getProject50State } from "@/lib/project50";
import { getLeaderboard } from "@/lib/leaderboard";
import { Project50Client } from "./_components/Project50Client";
import { StartProject50Button } from "./_components/StartProject50Button";
import { DashboardView } from "./_components/DashboardView";
import { Leaderboard } from "./_components/Leaderboard";
import type { PrimaryChallenge, ChallengeItem } from "./_components/DashboardView";

export default async function DashboardPage() {
  const uid = await requireUser();

  // An active/failed/completed Project 50 run takes over the home screen — but
  // these users ARE the leaderboard's ranked audience, so render the leaderboard
  // alongside their Project 50 dashboard (loaded once, both scopes).
  const p50 = await getProject50State(uid);
  if (p50.status !== "NONE") {
    const [friendsLeaderboard, globalLeaderboard] = await Promise.all([
      getLeaderboard(uid, { scope: "friends" }),
      getLeaderboard(uid, { scope: "global" }),
    ]);
    return (
      <>
        <Project50Client state={p50} />
        <div style={{ padding: "0 32px 32px", maxWidth: "480px", margin: "0 auto" }}>
          <Leaderboard friends={friendsLeaderboard} global={globalLeaderboard} />
        </div>
      </>
    );
  }

  // No Project 50 run. Brand-new users (no challenges) get the Project 50
  // start choice; users who already have challenges keep their dashboard,
  // with an entry to start Project 50.
  const challenges = await listChallenges(uid);
  if (challenges.length === 0) {
    return <Project50Client state={p50} />;
  }

  const primaryRaw = challenges[0]!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
  const full = await getChallenge(primaryRaw.id, uid);
  const tz = full.timezone ?? "UTC";
  const todayKey = localDayKey(new Date(), tz);
  const dayNum = dayNumber(full.startDate, todayKey);
  const todayStatus = full.dayStatuses.find((ds) => ds.dayKey === todayKey) ?? null;
  const todayProgress = todayStatus
    ? { totalAmount: todayStatus.totalAmount ?? 0, target: full.dailyTarget ?? 1, completed: todayStatus.completed }
    : null;
  const primary: PrimaryChallenge = {
    id: full.id, title: full.title, goalType: full.goalType as "TARGET" | "BINARY",
    unit: full.unit ?? null, dayNumber: Math.max(1, dayNum), today: todayProgress,
    currentStreak: full.currentStreak, badges: full.badges, cheering: full.cheering,
  };
  const challengeItems: ChallengeItem[] = challenges.map((c) => ({ id: c.id, title: c.title, goalType: c.goalType as "TARGET" | "BINARY" }));

  // Load both leaderboard scopes for the dashboard's ranked area.
  const [friendsLeaderboard, globalLeaderboard] = await Promise.all([
    getLeaderboard(uid, { scope: "friends" }),
    getLeaderboard(uid, { scope: "global" }),
  ]);

  return (
    <>
      <StartProject50Button />
      <DashboardView
        primary={primary}
        challenges={challengeItems}
        friendsLeaderboard={friendsLeaderboard}
        globalLeaderboard={globalLeaderboard}
      />
    </>
  );
}
