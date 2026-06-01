import { prisma } from "@project50/db";
import { notFound, unprocessable } from "./http";

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
 * Newest first. Includes challenge and user.
 */
export async function feed(viewerId: string) {
  return prisma.activity.findMany({
    where: {
      user: {
        followers: {
          some: { followerId: viewerId },
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
    },
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
