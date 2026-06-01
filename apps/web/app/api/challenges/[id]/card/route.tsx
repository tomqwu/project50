import { ImageResponse } from "next/og";
import { prisma } from "@project50/db";
import { dayNumber } from "@project50/core";
import { buildCardModel } from "@/lib/share/card-model";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const challenge = await prisma.challenge.findUnique({
    where: { id },
    include: { dayStatuses: true },
  });

  if (!challenge || challenge.visibility !== "PUBLIC") {
    return new Response(null, { status: 404 });
  }

  // Compute stats
  const completedStatuses = challenge.dayStatuses.filter((ds) => ds.completed);
  const daysCompleted = completedStatuses.length;
  const totalAmount =
    challenge.goalType === "TARGET"
      ? completedStatuses.reduce((sum, ds) => sum + (ds.totalAmount ?? 0), 0)
      : null;

  // dayNumber as of today
  const todayStr = new Date().toISOString().slice(0, 10);
  const dayNum = Math.max(1, dayNumber(challenge.startDate, todayStr));

  const model = buildCardModel({
    title: challenge.title,
    daysCompleted,
    totalAmount,
    unit: challenge.unit ?? null,
    dayNumber: dayNum,
    lengthDays: challenge.lengthDays,
  });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#121013",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "80px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Wordmark */}
        <div
          style={{
            position: "absolute",
            top: "40px",
            left: "80px",
            fontSize: "20px",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "#D6FF3F",
            fontWeight: 700,
          }}
        >
          project50
        </div>

        {/* Headline */}
        <div
          style={{
            fontSize: "72px",
            fontWeight: 900,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "#D6FF3F",
            textAlign: "center",
            lineHeight: 1.1,
          }}
        >
          {model.headline}
        </div>

        {/* Subline (challenge title) */}
        <div
          style={{
            fontSize: "32px",
            color: "#ffffff",
            marginTop: "24px",
            textAlign: "center",
            opacity: 0.9,
          }}
        >
          {model.subline}
        </div>

        {/* Stat */}
        <div
          style={{
            fontSize: "24px",
            color: "#888888",
            marginTop: "16px",
            textAlign: "center",
          }}
        >
          {model.statText}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
