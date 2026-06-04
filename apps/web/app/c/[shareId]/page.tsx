import { notFound } from "next/navigation";
import Link from "next/link";
import { getChallengeByShareId } from "@/lib/api/challenges";
import { CelebrateView } from "@/app/(app)/challenges/[id]/celebrate/CelebrateView";
import type { MilestoneKind } from "@/app/(app)/challenges/[id]/celebrate/CelebrateView";
import { dayNumber, localDayKey } from "@project50/core";

export default async function PublicSharePage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const challenge = await getChallengeByShareId(shareId);

  if (!challenge) {
    notFound();
  }

  // Derive the current day from the challenge timezone so the page and its OG
  // social-share image (app/c/[shareId]/opengraph-image.tsx) agree near midnight.
  const todayKey = localDayKey(new Date(), challenge.timezone ?? "UTC");
  const dayNum = Math.max(1, dayNumber(challenge.startDate, todayKey));

  const completedStatuses = challenge.dayStatuses.filter((ds) => ds.completed);
  const daysCompleted = completedStatuses.length;
  const totalAmount =
    challenge.goalType === "TARGET"
      ? completedStatuses.reduce((sum, ds) => sum + (ds.totalAmount ?? 0), 0)
      : null;

  const milestones = challenge.milestones.map((m) => m.kind as MilestoneKind);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg, #121013)",
        color: "var(--text, #ffffff)",
      }}
    >
      {/* Public shell header */}
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "20px 32px",
          borderBottom: "1px solid var(--hairline, rgba(255,255,255,0.1))",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-display, 'Anton', sans-serif)",
            fontSize: "22px",
            letterSpacing: "0.05em",
            color: "var(--accent, #D6FF3F)",
            textTransform: "uppercase",
          }}
          data-testid="wordmark"
        >
          project50
        </span>
        <Link
          href="/signin"
          style={{
            fontFamily: "var(--font-body, system-ui)",
            fontSize: "14px",
            color: "var(--text, #ffffff)",
            textDecoration: "none",
          }}
          data-testid="start-own-link"
        >
          Start your own
        </Link>
      </nav>

      {/* Reuse the CelebrateView */}
      <CelebrateView
        challengeTitle={challenge.title}
        dayNumber={dayNum}
        stats={{
          daysCompleted,
          totalAmount,
          unit: challenge.unit ?? null,
        }}
        milestones={milestones}
      />
    </div>
  );
}
