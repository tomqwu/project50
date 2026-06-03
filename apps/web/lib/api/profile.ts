import { prisma } from "@project50/db";

export interface PublicProfileChallenge {
  id: string;
  title: string;
  goalType: "TARGET" | "BINARY";
}

export interface PublicProfile {
  id: string;
  handle: string;
  displayName: string;
  challenges: PublicProfileChallenge[];
  /**
   * Whether `viewerId` currently follows this profile's user. Always false when
   * there is no viewer or when the viewer is the profile user themselves.
   */
  isFollowing: boolean;
}

/**
 * Public profile for `handle`: the user's public-facing info plus their
 * PUBLIC challenges (most recent first). Returns null if no user has that
 * handle. Private/followers-only challenges are never included.
 *
 * When `viewerId` is supplied, `isFollowing` reflects whether that viewer
 * currently follows the profile user (false for self or when not following).
 */
export async function getPublicProfile(
  handle: string,
  viewerId?: string,
): Promise<PublicProfile | null> {
  const user = await prisma.user.findUnique({
    where: { handle },
    select: {
      id: true,
      handle: true,
      displayName: true,
      challenges: {
        where: { visibility: "PUBLIC" },
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, goalType: true },
      },
    },
  });

  if (!user) return null;

  let isFollowing = false;
  if (viewerId && viewerId !== user.id) {
    const edge = await prisma.follow.findUnique({
      where: {
        followerId_followeeId: { followerId: viewerId, followeeId: user.id },
      },
    });
    isFollowing = edge !== null;
  }

  return {
    id: user.id,
    handle: user.handle,
    displayName: user.displayName,
    challenges: user.challenges,
    isFollowing,
  };
}
