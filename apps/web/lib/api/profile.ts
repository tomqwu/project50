import { prisma } from "@project50/db";

import { cached, invalidate } from "../cache";

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

/** Viewer-independent public core of a profile (everything except `isFollowing`). */
type PublicProfileCore = Omit<PublicProfile, "isFollowing">;

/** TTL for the cached public profile core. */
const PROFILE_TTL_MS = 30_000;

const profileKey = (handle: string) => `profile:public:${handle}`;

/**
 * Load the viewer-independent public core for `handle` straight from the DB.
 * Returns `undefined` when no user has that handle (so the cache does not
 * memoize a "missing" result — a newly created profile becomes visible at
 * once). PUBLIC challenges only, newest first; private / followers-only
 * challenges are never included.
 */
async function loadPublicProfileCore(
  handle: string,
): Promise<PublicProfileCore | undefined> {
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

  if (!user) return undefined;

  return {
    id: user.id,
    handle: user.handle,
    displayName: user.displayName,
    challenges: user.challenges,
  };
}

/**
 * Public profile for `handle`: the user's public-facing info plus their
 * PUBLIC challenges (most recent first). Returns null if no user has that
 * handle. Private/followers-only challenges are never included.
 *
 * The viewer-independent public core (user info + public challenges) is served
 * from a short-TTL ({@link PROFILE_TTL_MS}) in-memory cache because it is a hot,
 * low-volatility public read. Staleness is bounded by the TTL; call
 * {@link invalidatePublicProfile} after a relevant write to refresh sooner.
 *
 * `isFollowing` is viewer-specific and auth-sensitive, so it is computed fresh
 * on every request and never cached.
 *
 * When `viewerId` is supplied, `isFollowing` reflects whether that viewer
 * currently follows the profile user (false for self or when not following).
 */
export async function getPublicProfile(
  handle: string,
  viewerId?: string,
): Promise<PublicProfile | null> {
  const core = await cached(profileKey(handle), PROFILE_TTL_MS, () =>
    loadPublicProfileCore(handle),
  );

  if (core === undefined) return null;

  let isFollowing = false;
  if (viewerId && viewerId !== core.id) {
    const edge = await prisma.follow.findUnique({
      where: {
        followerId_followeeId: { followerId: viewerId, followeeId: core.id },
      },
    });
    isFollowing = edge !== null;
  }

  return { ...core, isFollowing };
}

/**
 * Drop the cached public-profile core for `handle` so the next read reflects a
 * recent write (e.g. display-name change or a challenge's visibility flip).
 */
export function invalidatePublicProfile(handle: string): Promise<void> {
  return invalidate(profileKey(handle));
}
