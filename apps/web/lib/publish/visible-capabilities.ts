/**
 * Flag-gated view over the publish capabilities (#285).
 *
 * The social-share panel on the celebrate screen renders one button per
 * {@link Capability}. This is the single seam where we apply the
 * `shareInstagram` feature flag: when it is OFF, the `INSTAGRAM` capability is
 * dropped server-side so the button never reaches the browser — an instant,
 * deploy-free kill-switch for the Instagram share path (e.g. if the Graph API
 * or deeplink misbehaves). The flag defaults ON, so normal behaviour is
 * unchanged.
 *
 * Pure: it takes the capability list + env and returns a filtered copy. The
 * underlying publisher registry is untouched, so the publisher still exists for
 * the `/publish` API route — we only hide the UI affordance.
 */

import type { Capability } from "./types";
import { isFeatureEnabled } from "@/lib/flags";

/**
 * Filter `capabilities` down to the ones the current feature-flag configuration
 * allows the UI to surface. `env` is injectable for tests and defaults to
 * `process.env`.
 *
 * Today this only gates `INSTAGRAM` behind {@link isFeatureEnabled}
 * (`shareInstagram`). Other platforms pass through untouched.
 */
export function visibleCapabilities(
  capabilities: Capability[],
  env: NodeJS.ProcessEnv = process.env,
): Capability[] {
  const instagramEnabled = isFeatureEnabled("shareInstagram", env);
  return capabilities.filter((c) => c.platform !== "INSTAGRAM" || instagramEnabled);
}
