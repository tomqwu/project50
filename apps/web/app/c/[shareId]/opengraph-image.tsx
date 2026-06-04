import { ImageResponse } from "next/og";
import { dayNumber } from "@project50/core";
import { getChallengeByShareId } from "@/lib/api/challenges";
import { buildCardModel } from "@/lib/share/card-model";
import {
  OG_BRAND,
  OG_CONTENT_TYPE,
  OG_DEFAULT_ALT,
  OG_RECAP_CACHE_CONTROL,
  OG_SIZE,
} from "@/lib/og/meta";
import { defaultOgElement, recapOgElement } from "@/lib/og/elements";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = OG_DEFAULT_ALT;

/**
 * Per-recap social-share card. Pulls the public shared challenge (same loader as
 * the recap page) and renders a personalized "Day N / 50" card. If the share
 * data can't be loaded (missing, private, or any error) we fall back to the
 * default branded card so the build/route never breaks.
 */
export default async function ShareOpengraphImage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}): Promise<ImageResponse> {
  const model = await loadRecapModel(params);

  const element = model ? recapOgElement(OG_BRAND, model) : defaultOgElement(OG_BRAND);

  return new ImageResponse(element, {
    ...OG_SIZE,
    headers: { "Cache-Control": OG_RECAP_CACHE_CONTROL },
  });
}

/**
 * Resolve the recap card view-model for a share id, or null to signal the
 * caller should render the default branded fallback.
 */
async function loadRecapModel(
  params: Promise<{ shareId: string }>,
): Promise<{ headline: string; subline: string; statText: string } | null> {
  try {
    const { shareId } = await params;
    const challenge = await getChallengeByShareId(shareId);
    if (!challenge) {
      return null;
    }

    const todayKey = new Date().toISOString().slice(0, 10);
    const dayNum = Math.max(1, dayNumber(challenge.startDate, todayKey));

    const completedStatuses = challenge.dayStatuses.filter((ds) => ds.completed);
    const daysCompleted = completedStatuses.length;
    const totalAmount =
      challenge.goalType === "TARGET"
        ? completedStatuses.reduce((sum, ds) => sum + (ds.totalAmount ?? 0), 0)
        : null;

    return buildCardModel({
      title: challenge.title,
      daysCompleted,
      totalAmount,
      unit: challenge.unit ?? null,
      dayNumber: dayNum,
      lengthDays: challenge.lengthDays,
    });
  } catch {
    return null;
  }
}
