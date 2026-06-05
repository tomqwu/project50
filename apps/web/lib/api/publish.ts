import { prisma } from "@project50/db";
import { notFound, unprocessable, HttpError } from "./http";
import { listRecaps } from "./recap";
import { getPublisher } from "@/lib/publish/registry";
import { getBaseUrl } from "@/lib/base-url";
import { isFeatureEnabled } from "@/lib/flags";
import type { Platform, AssetKind, PublishResult } from "@/lib/publish/types";

/**
 * Resolve, build, and publish a challenge asset to the given social platform.
 * Owner-only. IMAGE requires the challenge to be PUBLIC.
 */
export async function publishChallengeAsset(
  userId: string,
  challengeId: string,
  platform: Platform,
  assetKind: AssetKind,
): Promise<PublishResult> {
  // 1. Load challenge (404 if not found)
  const challenge = await prisma.challenge.findUnique({
    where: { id: challengeId },
  });
  if (!challenge) notFound("CHALLENGE_NOT_FOUND");

  // 2. Owner-only (403 FORBIDDEN)
  if (challenge.ownerId !== userId) {
    throw new HttpError(403, "FORBIDDEN");
  }

  // 2b. Feature-flag kill-switch (#285). The celebrate UI hides the Instagram
  // button when `shareInstagram` is OFF, but the kill-switch must hold even if
  // the UI is bypassed (direct API call, stale client) — so enforce it here on
  // the authoritative server path too, via the same resolver (no drift).
  if (platform === "INSTAGRAM" && !isFeatureEnabled("shareInstagram")) {
    unprocessable("PLATFORM_DISABLED");
  }

  // 3. Resolve asset URL and build caption
  let assetUrl: string;

  if (assetKind === "IMAGE") {
    // IMAGE: challenge must be PUBLIC (card URL is public — no private data leak)
    if (challenge.visibility !== "PUBLIC") {
      unprocessable("MUST_BE_PUBLIC");
    }
    assetUrl = `${getBaseUrl()}/api/challenges/${challengeId}/card`;
  } else {
    // VIDEO: get the latest recap signed URL
    const recaps = await listRecaps(challengeId, userId);
    if (recaps.length === 0) notFound("NO_RECAP");
    // listRecaps returns newest first
    assetUrl = recaps[0]!.url;
  }

  const caption = `${challenge.title} — ${challenge.lengthDays}-day challenge`;

  // 4. Publish via the platform publisher
  const publisher = getPublisher(platform);
  return publisher.publish({ kind: assetKind, url: assetUrl, caption });
}
