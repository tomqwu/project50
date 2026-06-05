import { requireUser } from "@/lib/session";
import { listChallenges, getChallenge } from "@/lib/api/challenges";
import { localDayKey, dayNumber } from "@project50/core";
import { getProject50State } from "@/lib/project50";
import { isFeatureEnabled } from "@/lib/flags";
import { getLeaderboard } from "@/lib/leaderboard";
import { getOrCreateReferralCode } from "@/lib/api/referral";
import { Project50Client } from "./_components/Project50Client";
import { StartProject50Button } from "./_components/StartProject50Button";
import { DashboardView } from "./_components/DashboardView";
import { Leaderboard } from "./_components/Leaderboard";
import type { PrimaryChallenge, ChallengeItem } from "./_components/DashboardView";

export default async function DashboardPage() {
  const uid = await requireUser();

  // Resolve the Instagram-share kill-switch (#285) server-side once and thread
  // it down to the (client) day-share controls — same `isFeatureEnabled` path
  // as the capabilities API, celebrate UI, and publish endpoint, so all four
  // surfaces agree.
  const instagramEnabled = isFeatureEnabled("shareInstagram");

  // An active/failed/completed Project 50 run takes over the home screen — but
  // these users ARE the leaderboard's ranked audience, so render the leaderboard
  // alongside their Project 50 dashboard (loaded once, both scopes).
  const p50 = await getProject50State(uid);
  if (p50.status !== "NONE") {
    const [friendsLeaderboard, globalLeaderboard, referralCode] = await Promise.all([
      getLeaderboard(uid, { scope: "friends" }),
      getLeaderboard(uid, { scope: "global" }),
      getOrCreateReferralCode(uid),
    ]);
    return (
      <>
        <Project50Client state={p50} instagramEnabled={instagramEnabled} />
        <div style={{ padding: "0 32px 32px", maxWidth: "480px", margin: "0 auto" }}>
          <Leaderboard
            friends={friendsLeaderboard}
            global={globalLeaderboard}
            referralCode={referralCode}
          />
        </div>
      </>
    );
  }

  // No Project 50 run. Brand-new users (no challenges) get the Project 50
  // start choice; users who already have challenges keep their dashboard,
  // with an entry to start Project 50.
  const challenges = await listChallenges(uid);
  if (challenges.length === 0) {
    return <Project50Client state={p50} instagramEnabled={instagramEnabled} />;
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

  // Load both leaderboard scopes + the viewer's referral code for the
  // dashboard's ranked area (the leaderboard's invite empty-state).
  const [friendsLeaderboard, globalLeaderboard, referralCode] = await Promise.all([
    getLeaderboard(uid, { scope: "friends" }),
    getLeaderboard(uid, { scope: "global" }),
    getOrCreateReferralCode(uid),
  ]);

  return (
    <>
      <StartProject50Button />
      <DashboardView
        primary={primary}
        challenges={challengeItems}
        friendsLeaderboard={friendsLeaderboard}
        globalLeaderboard={globalLeaderboard}
        referralCode={referralCode}
      />
    </>
  );
}
