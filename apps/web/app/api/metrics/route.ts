import { renderPrometheus } from "@/lib/metrics";

/**
 * Prometheus scrape endpoint (#27).
 *
 * Returns the in-process metrics registry (see `@/lib/metrics`) in the
 * Prometheus text exposition format. The registry is **per-instance**, so a
 * real setup scrapes each instance (or pushes to a gateway) — see
 * docs/OBSERVABILITY.md.
 *
 * Auth model (cross-ref docs/SECRETS.md → METRICS_TOKEN):
 *   - METRICS_TOKEN unset → endpoint is open (intended for a private network /
 *     a scraper that reaches it over an internal route only). Documented.
 *   - METRICS_TOKEN set   → caller must present `Authorization: Bearer <token>`
 *     (401 otherwise). Use this for any publicly reachable deployment.
 */
export function GET(request: Request): Response {
  const token = process.env.METRICS_TOKEN;
  if (token && request.headers.get("authorization") !== `Bearer ${token}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return new Response(renderPrometheus(), {
    status: 200,
    headers: { "content-type": "text/plain; version=0.0.4; charset=utf-8" },
  });
}
