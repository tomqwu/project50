/**
 * useAttribution — fire-once startup hook that captures install/acquisition
 * attribution.
 *
 * Calls captureAttribution() exactly once on mount. The capture itself is gated
 * (EXPO_PUBLIC_ATTRIBUTION_ENABLED) and fully no-op-safe, so this hook is safe to
 * mount unconditionally at the app root — in dev/CI/Expo Go it does nothing
 * observable. The capture is injectable so the hook is unit-testable without the
 * native bridge; the root simply calls useAttribution() with no args.
 */

import { useEffect } from "react";

import { captureAttribution } from "../lib/attribution";

/** The capture signature the hook depends on (injectable for tests). */
export type CaptureFn = typeof captureAttribution;

/**
 * Run attribution capture once on mount.
 *
 * Fires once per app launch: `capture` is a stable reference (the default
 * module import at the root, or a fixed test double), so the effect does not
 * re-run across re-renders. capture() is itself idempotent — first-write-wins
 * persistence means even a duplicate call (e.g. React StrictMode's dev-only
 * double-invoked effect) cannot overwrite or double-report.
 *
 * @param capture — capture implementation; defaults to captureAttribution.
 *   Errors are swallowed so a failed capture never surfaces to the UI.
 */
export function useAttribution(capture: CaptureFn = captureAttribution): void {
  useEffect(() => {
    void Promise.resolve(capture()).catch(() => {
      // Capture is best-effort; never let it bubble into the React tree.
    });
  }, [capture]);
}
