import { prisma } from "@project50/db";

export interface PublicProfileChallenge {
  id: string;
  title: string;
  goalType: "TARGET" | "BINARY";
}

export interface PublicProfile {
  handle: string;
  displayName: string;
  challenges: PublicProfileChallenge[];
}

/**
 * Public profile for `handle`: the user's public-facing info plus their
 * PUBLIC challenges (most recent first). Returns null if no user has that
 * handle. Private/followers-only challenges are never included.
 */
export async function getPublicProfile(
  handle: string,
): Promise<PublicProfile | null> {
  const user = await prisma.user.findUnique({
    where: { handle },
    select: {
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

  return {
    handle: user.handle,
    displayName: user.displayName,
    challenges: user.challenges,
  };
}
