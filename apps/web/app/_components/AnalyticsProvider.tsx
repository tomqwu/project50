"use client";

import { useEffect } from "react";
import { isAnalyticsActive } from "@/lib/analytics";

/**
 * AnalyticsProvider — one-time client-side analytics bootstrap (#124).
 *
 * Rendered once in the root layout. On mount it initializes the provider-
 * agnostic queue ONLY when analytics is both configured
 * (`NEXT_PUBLIC_ANALYTICS_KEY`) and consented (`hasTrackingConsent()`); with
 * neither it is a complete no-op (renders nothing, touches no globals).
 *
 * To plug in a real provider, drain `window.p50Analytics` here (e.g. load the
 * vendor SDK and replay queued events, then swap the array for a live shim) —
 * call sites that use `track()` stay unchanged.
 */
export function AnalyticsProvider() {
  useEffect(() => {
    if (!isAnalyticsActive()) return;
    // Ensure the queue exists so a provider drain (or `track`) has a target.
    window.p50Analytics ??= [];
  }, []);

  return null;
}
