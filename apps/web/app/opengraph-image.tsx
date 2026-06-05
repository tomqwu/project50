import { ImageResponse } from "next/og";
import { OG_BRAND, OG_CONTENT_TYPE, OG_DEFAULT_ALT, OG_SIZE } from "@/lib/og/meta";
import { defaultOgElement } from "@/lib/og/elements";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = OG_DEFAULT_ALT;

/**
 * Default branded social-share card for the app (landing page, etc.).
 * Charcoal background, volt wordmark + tagline, on the Momentum theme.
 */
export default function OpengraphImage(): ImageResponse {
  return new ImageResponse(defaultOgElement(OG_BRAND), { ...OG_SIZE });
}
