/**
 * Product analytics — provider-agnostic, env-gated, and consent-gated (#124).
 *
 * Design goals:
 *  - **No-op by default.** With no `NEXT_PUBLIC_ANALYTICS_KEY` configured, or
 *    without the user's tracking consent, `track()` does nothing — no network,
 *    no queue writes. This keeps builds, tests, and privacy-by-default intact.
 *  - **Provider-agnostic.** We never call a vendor SDK directly. When active,
 *    events are pushed onto a `window`-based queue (`window.p50Analytics`) AND
 *    POSTed (best-effort, fire-and-forget) to a generic collector endpoint.
 *    A real provider (PostHog, Segment, Amplitude, a self-hosted sink, …) is
 *    plugged in by draining `window.p50Analytics` or by pointing the endpoint
 *    at the provider — no call sites change. See `AnalyticsProvider`.
 *  - **Client-safe.** No Node-only imports; guards all `window`/`fetch` access
 *    so importing this module on the server (or during SSR) is harmless.
 *
 * Call sites only ever import `track()` and the typed event union; they don't
 * need to know whether analytics is configured.
 */

import { hasTrackingConsent } from "@/app/_components/CookieConsent";

/**
 * The known product events. Keep this a closed union so call sites are
 * type-checked and the event taxonomy stays curated rather than free-form.
 */
export type AnalyticsEvent =
  | "signup"
  | "project50_started"
  | "rule_toggled"
  | "project50_photo_added"
  | "project50_journal_saved"
  | "upgrade_clicked";

/** Arbitrary, JSON-serializable properties attached to an event. */
export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

/** A queued analytics event, as pushed onto `window.p50Analytics`. */
export interface QueuedEvent {
  event: AnalyticsEvent;
  props?: AnalyticsProps;
  /** Epoch milliseconds when `track()` was called. */
  ts: number;
}

declare global {
  // eslint-disable-next-line no-var
  var p50Analytics: QueuedEvent[] | undefined;
}

/** The collector endpoint events are POSTed to when analytics is active. */
export const ANALYTICS_ENDPOINT = "/api/analytics";

/** Read the public analytics key (inlined into the client bundle by Next). */
function analyticsKey(): string | undefined {
  const key = process.env.NEXT_PUBLIC_ANALYTICS_KEY;
  return key && key.trim() !== "" ? key : undefined;
}

/**
 * Whether an analytics key is configured. This is the env half of the gate —
 * it intentionally does NOT consider consent, so server code / the build can
 * check configuration without touching `localStorage`.
 */
export function isAnalyticsConfigured(): boolean {
  return analyticsKey() !== undefined;
}

/**
 * Whether analytics is *active*: configured AND the user has granted tracking
 * consent. Both halves must be true for any event to be recorded or sent.
 */
export function isAnalyticsActive(): boolean {
  return isAnalyticsConfigured() && hasTrackingConsent();
}

/**
 * Record a product event.
 *
 * Complete no-op unless analytics is configured (`NEXT_PUBLIC_ANALYTICS_KEY`)
 * AND the user has consented (`hasTrackingConsent()`). When active, the event
 * is appended to the `window.p50Analytics` queue (so a provider can drain it)
 * and POSTed best-effort to {@link ANALYTICS_ENDPOINT}. Never throws.
 */
export function track(event: AnalyticsEvent, props?: AnalyticsProps): void {
  if (!isAnalyticsActive()) return;
  if (typeof window === "undefined") return;

  const queued: QueuedEvent = { event, props, ts: Date.now() };
  (window.p50Analytics ??= []).push(queued);

  // Best-effort delivery to a generic collector. Fire-and-forget: failures
  // (offline, blocked, no endpoint) must never surface to the caller.
  try {
    void fetch(ANALYTICS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(queued),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // `fetch` unavailable (very old/edge runtimes) — the queue still has it.
  }
}
