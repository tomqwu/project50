import { ImageResponse } from "next/og";
import { getPublicDay } from "@/lib/api/day-share";
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

// Revalidate the generated card every 5 minutes so Next's route cache does not
// serve a stale "Day N / 50" image indefinitely after first generation. MUST be
// a literal `export const` here — a re-export is ignored by Next's route config.
export const revalidate = 300;

/**
 * Per-day social-share card. Pulls the public day (same visibility-gated loader
 * as the page) and renders a "Day N of 50" card with the day's rule count. Any
 * failure (missing, private, out-of-range, junk param, or error) falls back to
 * the default branded card so the route never breaks.
 */
export default async function ShareDayOpengraphImage({
  params,
}: {
  params: Promise<{ shareId: string; day: string }>;
}): Promise<ImageResponse> {
  const model = await loadDayCardModel(params);

  const element = model ? recapOgElement(OG_BRAND, model) : defaultOgElement(OG_BRAND);

  return new ImageResponse(element, {
    ...OG_SIZE,
    headers: { "Cache-Control": OG_RECAP_CACHE_CONTROL },
  });
}

/**
 * Resolve the per-day card view-model, or null to signal the default fallback.
 */
async function loadDayCardModel(
  params: Promise<{ shareId: string; day: string }>,
): Promise<{ headline: string; subline: string; statText: string } | null> {
  try {
    const { shareId, day } = await params;
    const dayNumber = Number(day);
    if (!Number.isInteger(dayNumber)) {
      return null;
    }

    const publicDay = await getPublicDay(shareId, dayNumber);
    if (!publicDay) {
      return null;
    }

    return {
      headline: `Day ${publicDay.dayNumber} of ${publicDay.challenge.lengthDays}`,
      subline: publicDay.challenge.title,
      statText: `${publicDay.rulesCompleted} / 7 rules`,
    };
  } catch {
    return null;
  }
}
