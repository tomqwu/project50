/**
 * Shared constants and helpers for Open Graph / Twitter social-share images.
 *
 * All OG image routes render at 1200×630 PNG on the Momentum brand theme:
 *   - charcoal #121013 background
 *   - volt #D6FF3F accent
 */
import { getBaseUrl } from "@/lib/base-url";

export const OG_BRAND = {
  /** Charcoal app background. */
  background: "#121013",
  /** Volt accent. */
  accent: "#D6FF3F",
  /** Primary on-charcoal text. */
  text: "#ffffff",
} as const;

/** Standard OG/Twitter image dimensions (summary_large_image). */
export const OG_SIZE = { width: 1200, height: 630 } as const;

/** PNG, the format next/og ImageResponse produces. */
export const OG_CONTENT_TYPE = "image/png";

/**
 * Cache-Control for the dynamic per-recap OG/Twitter image. The card renders
 * live progress (Day N / totals) and can be a transient-error fallback, so we
 * must NOT inherit next/og's default `immutable, max-age=31536000`. Allow a
 * short shared-cache window with revalidation instead.
 */
export const OG_RECAP_CACHE_CONTROL = "public, max-age=300, s-maxage=300";

/** Default alt text / tagline used for the branded fallback card. */
export const OG_DEFAULT_ALT = "project50 — 7 rules · 50 days · no days off";

/**
 * Resolve the app's public base URL for `metadataBase`. Prefers an explicit
 * site URL, then the auth URLs used for cookie/link decisions, then the shared
 * base-URL helper (which honors `APP_BASE_URL` and defaults to localhost). Reuse
 * of `getBaseUrl()` keeps OG/Twitter URLs consistent with internal links on
 * deployments configured via `APP_BASE_URL`.
 */
export function resolveSiteUrl(env: Record<string, string | undefined> = process.env): URL {
  // Treat blank / whitespace-only values as unset — a stray `AUTH_URL=` in a
  // copied .env must not win the precedence and crash `new URL("")`.
  const raw =
    [env.NEXT_PUBLIC_SITE_URL, env.AUTH_URL, env.NEXTAUTH_URL]
      .map((value) => value?.trim())
      .find((value) => value) ?? getBaseUrl();
  return new URL(raw);
}
