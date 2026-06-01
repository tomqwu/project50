import { prisma } from "@project50/db";
import { currentStreak } from "@project50/core";
import { getRenderer } from "@project50/recap";
import type { RecapData, RecapKind } from "@project50/recap";
import { RECAP_KINDS } from "@project50/recap";
import { presignGet, putObject } from "@/lib/storage";
import { notFound, HttpError } from "./http";
import { withMediaUrls } from "./media";

/**
 * Build a RecapData payload from challenge data.
 *
 * Days window per kind:
 *   DAY   — the single latest completed/logged day
 *   WEEK  — the last 7 dayStatuses (sorted by dayKey desc, take 7, reverse)
 *   FIFTY — all dayStatuses
 */
export function buildRecapData(
  challenge: {
    id: string;
    title: string;
    lengthDays: number;
    unit?: string | null;
    goalType: string;
    dailyTarget?: number | null;
  },
  dayStatuses: {
    dayKey: string;
    completed: boolean;
    totalAmount: number;
  }[],
  activitiesWithMedia: {
    dayKey: string;
    media: { objectKey: string; url: string }[];
  }[],
  kind: RecapKind,
): RecapData {
  // Sort dayStatuses ascending by dayKey
  const sorted = [...dayStatuses].sort((a, b) => a.dayKey.localeCompare(b.dayKey));

  // Select the window of days per kind
  let windowDays: typeof sorted;
  if (kind === "DAY") {
    // Latest day only (by dayKey)
    const latest = sorted.at(-1);
    windowDays = latest ? [latest] : [];
  } else if (kind === "WEEK") {
    // Last 7 days (newest 7, then put back in chronological order)
    windowDays = sorted.slice(-7);
  } else {
    // FIFTY — all days
    windowDays = sorted;
  }

  // Build a map from dayKey → first photoUrl (from activities with media)
  const photoByDay = new Map<string, string>();
  for (const activity of activitiesWithMedia) {
    if (!photoByDay.has(activity.dayKey) && activity.media.length > 0) {
      photoByDay.set(activity.dayKey, activity.media[0]!.url);
    }
  }

  // Compute stats from ALL dayStatuses (global stats)
  const completedDayKeys = dayStatuses
    .filter((ds) => ds.completed)
    .map((ds) => ds.dayKey);

  const daysCompleted = completedDayKeys.length;
  const totalAmount = dayStatuses.reduce((sum, ds) => sum + ds.totalAmount, 0);

  // currentStreak needs the latest completed dayKey as the "asOf" anchor
  const latestCompletedDayKey =
    completedDayKeys.length > 0
      ? [...completedDayKeys].sort().at(-1)!
      : challenge.id; // fallback — streak will be 0

  const streak =
    completedDayKeys.length > 0
      ? currentStreak(completedDayKeys, latestCompletedDayKey)
      : 0;

  const dayNumber = daysCompleted;

  return {
    title: challenge.title,
    kind,
    dayNumber,
    lengthDays: challenge.lengthDays,
    stats: {
      daysCompleted,
      totalAmount,
      unit: challenge.unit ?? undefined,
      currentStreak: streak,
    },
    days: windowDays.map((ds) => ({
      dayKey: ds.dayKey,
      completed: ds.completed,
      amount: ds.totalAmount > 0 ? ds.totalAmount : undefined,
      photoUrl: photoByDay.get(ds.dayKey),
    })),
  };
}

/**
 * Generate a recap MP4 for a challenge. Owner-only.
 * Returns { recapId, kind, url }.
 */
export async function generateRecap(
  userId: string,
  challengeId: string,
  kind: RecapKind,
): Promise<{ recapId: string; kind: RecapKind; url: string }> {
  // 1. Load challenge
  const challenge = await prisma.challenge.findUnique({
    where: { id: challengeId },
    include: {
      dayStatuses: true,
      activities: {
        include: { media: { orderBy: { order: "asc" } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!challenge) notFound("CHALLENGE_NOT_FOUND");

  // 2. Owner-only
  if (challenge.ownerId !== userId) {
    throw new HttpError(403, "FORBIDDEN");
  }

  // 3. Attach signed URLs to activity media
  const activitiesWithUrls = await withMediaUrls(challenge.activities);

  // 4. Build RecapData
  const data = buildRecapData(
    {
      id: challenge.id,
      title: challenge.title,
      lengthDays: challenge.lengthDays,
      unit: challenge.unit,
      goalType: challenge.goalType,
      dailyTarget: challenge.dailyTarget,
    },
    challenge.dayStatuses,
    activitiesWithUrls,
    kind,
  );

  // 5. Render
  const renderer = getRenderer();
  const mp4Buffer = await renderer.render(data);

  // 6. Upload MP4 to storage
  const suffix = `recap-${kind}-${Date.now()}`;
  const objectKey = `media/${userId}/${suffix}.mp4`;
  await putObject(objectKey, mp4Buffer, "video/mp4");

  // 7. Create Recap row
  const recap = await prisma.recap.create({
    data: {
      challengeId,
      kind: kind as "DAY" | "WEEK" | "FIFTY",
      objectKey,
    },
  });

  // 8. Return signed URL
  const url = await presignGet(objectKey);
  return { recapId: recap.id, kind, url };
}

/**
 * List recaps for a challenge, visibility-gated (same rules as getChallenge).
 * Returns recaps with signed URLs, newest first.
 */
export async function listRecaps(
  challengeId: string,
  viewerId: string,
): Promise<{ id: string; kind: RecapKind; url: string; createdAt: Date }[]> {
  // Load challenge for visibility check
  const challenge = await prisma.challenge.findUnique({
    where: { id: challengeId },
  });
  if (!challenge) notFound("CHALLENGE_NOT_FOUND");

  // Enforce visibility (same rules as getChallenge)
  if (challenge.visibility === "PRIVATE") {
    if (challenge.ownerId !== viewerId) notFound("CHALLENGE_NOT_FOUND");
  } else if (challenge.visibility === "FOLLOWERS") {
    if (challenge.ownerId !== viewerId) {
      const follow = await prisma.follow.findUnique({
        where: {
          followerId_followeeId: {
            followerId: viewerId,
            followeeId: challenge.ownerId,
          },
        },
      });
      if (!follow) notFound("CHALLENGE_NOT_FOUND");
    }
  }

  const recaps = await prisma.recap.findMany({
    where: { challengeId },
    orderBy: { createdAt: "desc" },
  });

  return Promise.all(
    recaps.map(async (r) => ({
      id: r.id,
      kind: r.kind as RecapKind,
      url: await presignGet(r.objectKey),
      createdAt: r.createdAt,
    })),
  );
}

// Re-export for validation convenience
export { RECAP_KINDS };
