/**
 * Tiny in-process metrics registry — counters + histograms — that renders to
 * the Prometheus text exposition format. Pure and synchronous so it is fully
 * unit-testable and adds negligible overhead to the request path.
 *
 * SCOPE / LIMITATION: state lives in this module's memory, so it is
 * **per-instance** (per Node process / serverless instance). A real deployment
 * either scrapes every instance individually or routes samples through a push
 * gateway / aggregating collector. See docs/OBSERVABILITY.md.
 */

/** Latency histogram buckets in milliseconds (cumulative "less-or-equal"). */
export const LATENCY_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000] as const;

interface Histogram {
  /** Cumulative count per bucket, indexed parallel to LATENCY_BUCKETS_MS. */
  buckets: number[];
  count: number;
  sum: number;
}

const requestCounts = new Map<string, number>();
const latencyHistograms = new Map<string, Histogram>();

/** Escape a label value for Prometheus text format: backslash, quote, newline. */
function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function newHistogram(): Histogram {
  return {
    buckets: new Array(LATENCY_BUCKETS_MS.length).fill(0),
    count: 0,
    sum: 0,
  };
}

/**
 * Record one completed request for a route + HTTP status. `status` is bucketed
 * by class (2xx/3xx/4xx/5xx) to keep label cardinality bounded.
 */
export function incRequest(route: string, status: number): void {
  const statusClass = `${Math.floor(status / 100)}xx`;
  const key = `${route}\x1f${statusClass}`;
  requestCounts.set(key, (requestCounts.get(key) ?? 0) + 1);
}

/** Record a request-latency observation (milliseconds) for a route. */
export function observeLatency(route: string, ms: number): void {
  let hist = latencyHistograms.get(route);
  if (!hist) {
    hist = newHistogram();
    latencyHistograms.set(route, hist);
  }
  hist.count += 1;
  hist.sum += ms;
  for (let i = 0; i < LATENCY_BUCKETS_MS.length; i++) {
    if (ms <= LATENCY_BUCKETS_MS[i]!) hist.buckets[i]! += 1;
  }
}

/** Reset all registry state. Intended for tests. */
export function resetMetrics(): void {
  requestCounts.clear();
  latencyHistograms.clear();
}

/** Render the current registry in Prometheus text exposition format. */
export function renderPrometheus(): string {
  const lines: string[] = [];

  lines.push("# HELP http_requests_total Total HTTP requests handled.");
  lines.push("# TYPE http_requests_total counter");
  for (const [key, value] of requestCounts) {
    const sep = key.indexOf("\x1f");
    const route = key.slice(0, sep);
    const statusClass = key.slice(sep + 1);
    lines.push(
      `http_requests_total{route="${escapeLabel(route)}",status="${statusClass}"} ${value}`,
    );
  }

  lines.push("# HELP http_request_duration_ms Request latency in milliseconds.");
  lines.push("# TYPE http_request_duration_ms histogram");
  for (const [route, hist] of latencyHistograms) {
    const label = escapeLabel(route);
    for (let i = 0; i < LATENCY_BUCKETS_MS.length; i++) {
      lines.push(
        `http_request_duration_ms_bucket{route="${label}",le="${LATENCY_BUCKETS_MS[i]}"} ${hist.buckets[i]}`,
      );
    }
    lines.push(`http_request_duration_ms_bucket{route="${label}",le="+Inf"} ${hist.count}`);
    lines.push(`http_request_duration_ms_sum{route="${label}"} ${hist.sum}`);
    lines.push(`http_request_duration_ms_count{route="${label}"} ${hist.count}`);
  }

  return lines.join("\n") + "\n";
}
