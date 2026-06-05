import { handleRoute } from "@/lib/api/http";
import { getCapabilities } from "@/lib/publish/registry";
import { visibleCapabilities } from "@/lib/publish/visible-capabilities";

export async function GET() {
  return handleRoute(async () => {
    // Apply feature flags (e.g. the `shareInstagram` kill-switch, #285) so the
    // advertised capabilities agree with the celebrate UI and the publish
    // endpoint — all three route through `visibleCapabilities` /
    // `isFeatureEnabled`, so a killed platform is never offered to clients.
    const capabilities = visibleCapabilities(getCapabilities());
    return Response.json(capabilities);
  });
}
