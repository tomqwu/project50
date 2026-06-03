import { prisma } from "@project50/db";
import { dayNumber } from "@project50/core";
import { notFound, unprocessable } from "./http";
import { withMediaUrls } from "./media";

/** Follow followeeId as followerId. Idempotent (upsert). Rejects self-follow. */
export async function follow(followerId: string, followeeId: string) {
  if (followerId === followeeId) {
    unprocessable("CANNOT_FOLLOW_SELF");
  }

  return prisma.follow.upsert({
    where: { followerId_followeeId: { followerId, followeeId } },
    update: {},
    create: { followerId, followeeId },
  });
}

/** Unfollow followeeId as followerId. Idempotent (no-op if edge doesn't exist). */
export async function unfollow(followerId: string, followeeId: string) {
  await prisma.follow.deleteMany({
    where: { followerId, followeeId },
  });
}

/**
 * Feed for viewerId: activities from users the viewer follows,
 * where the activity's challenge visibility is PUBLIC or FOLLOWERS.
 * Newest first. Includes challenge, user, media (with signed URLs), and cheer count.
 */
export async function feed(viewerId: string) {
  const activities = await prisma.activity.findMany({
    where: {
      user: {
        followers: {
          some: { followerId: viewerId },
        },
        // Exclude activities from users the viewer has blocked.
        blocksReceived: {
          none: { blockerId: viewerId },
        },
      },
      challenge: {
        visibility: { in: ["PUBLIC", "FOLLOWERS"] },
      },
    },
    orderBy: { createdAt: "desc" },
    include: {
      challenge: true,
      user: true,
      media: { orderBy: { order: "asc" } },
      _count: { select: { reactions: { where: { kind: "CHEER" } } } },
    },
  });

  const withUrls = await withMediaUrls(activities);
  return withUrls.map((a) => {
    // Project 50 runs are visually distinguished in the feed. The challenge's
    // kind/startDate/timezone are already loaded via `include: { challenge }`;
    // surface a 1-based day number for PROJECT50 activities so the UI can show
    // "Project 50 · Day N" relative to the run's start.
    const isProject50 = a.challenge.kind === "PROJECT50";
    const project50Day = isProject50
      ? dayNumber(a.challenge.startDate, a.dayKey)
      : undefined;
    return {
      ...a,
      cheerCount: a._count.reactions,
      hasPhoto: a.media.length > 0,
      isProject50,
      project50Day,
    };
  });
}

/** React to an activity. CHEER ignores text; COMMENT requires non-empty text. */
export async function react(
  userId: string,
  activityId: string,
  kind: "CHEER" | "COMMENT",
  text?: string,
) {
  // Validate COMMENT requires text
  if (kind === "COMMENT" && (!text || text.trim() === "")) {
    unprocessable("COMMENT_REQUIRES_TEXT");
  }

  // Activity must exist
  const activity = await prisma.activity.findUnique({ where: { id: activityId } });
  if (!activity) notFound("ACTIVITY_NOT_FOUND");

  return prisma.reaction.create({
    data: {
      activityId,
      userId,
      kind,
      text: kind === "COMMENT" ? text!.trim() : undefined,
    },
  });
}
