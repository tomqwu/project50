import { describe, it, expect, beforeEach } from "vitest";
import {
  LATENCY_BUCKETS_MS,
  incRequest,
  observeLatency,
  renderPrometheus,
  resetMetrics,
} from "./metrics";

describe("metrics registry", () => {
  beforeEach(() => resetMetrics());

  describe("incRequest", () => {
    it("counts requests bucketed by status class", () => {
      incRequest("GET /api/feed", 200);
      incRequest("GET /api/feed", 204);
      incRequest("GET /api/feed", 404);
      incRequest("GET /api/feed", 500);

      const out = renderPrometheus();
      expect(out).toContain('http_requests_total{route="GET /api/feed",status="2xx"} 2');
      expect(out).toContain('http_requests_total{route="GET /api/feed",status="4xx"} 1');
      expect(out).toContain('http_requests_total{route="GET /api/feed",status="5xx"} 1');
    });

    it("keeps separate counters per route", () => {
      incRequest("GET /a", 200);
      incRequest("POST /b", 200);
      const out = renderPrometheus();
      expect(out).toContain('http_requests_total{route="GET /a",status="2xx"} 1');
      expect(out).toContain('http_requests_total{route="POST /b",status="2xx"} 1');
    });
  });

  describe("observeLatency", () => {
    it("records count, sum and cumulative buckets", () => {
      observeLatency("GET /x", 3); // <= 5
      observeLatency("GET /x", 30); // <= 50 ...

      const out = renderPrometheus();
      expect(out).toContain('http_request_duration_ms_count{route="GET /x"} 2');
      expect(out).toContain('http_request_duration_ms_sum{route="GET /x"} 33');
      // 3ms falls in every bucket >= 5; 30ms only in buckets >= 50.
      expect(out).toContain('http_request_duration_ms_bucket{route="GET /x",le="5"} 1');
      expect(out).toContain('http_request_duration_ms_bucket{route="GET /x",le="50"} 2');
      expect(out).toContain('http_request_duration_ms_bucket{route="GET /x",le="+Inf"} 2');
    });

    it("counts observations larger than the top bucket in +Inf only", () => {
      const overTop = LATENCY_BUCKETS_MS[LATENCY_BUCKETS_MS.length - 1]! + 1000;
      observeLatency("GET /slow", overTop);
      const out = renderPrometheus();
      // not in the largest finite bucket
      expect(out).toContain(
        `http_request_duration_ms_bucket{route="GET /slow",le="${LATENCY_BUCKETS_MS[LATENCY_BUCKETS_MS.length - 1]}"} 0`,
      );
      // but counted overall (+Inf == count)
      expect(out).toContain('http_request_duration_ms_bucket{route="GET /slow",le="+Inf"} 1');
      expect(out).toContain('http_request_duration_ms_count{route="GET /slow"} 1');
    });

    it("observation exactly on a bucket boundary is included (le is inclusive)", () => {
      observeLatency("GET /edge", 5);
      const out = renderPrometheus();
      expect(out).toContain('http_request_duration_ms_bucket{route="GET /edge",le="5"} 1');
    });
  });

  describe("renderPrometheus", () => {
    it("emits HELP and TYPE headers and ends with a newline", () => {
      incRequest("GET /h", 200);
      observeLatency("GET /h", 10);
      const out = renderPrometheus();
      expect(out).toContain("# HELP http_requests_total Total HTTP requests handled.");
      expect(out).toContain("# TYPE http_requests_total counter");
      expect(out).toContain("# HELP http_request_duration_ms Request latency in milliseconds.");
      expect(out).toContain("# TYPE http_request_duration_ms histogram");
      expect(out.endsWith("\n")).toBe(true);
    });

    it("renders only headers when the registry is empty", () => {
      const out = renderPrometheus();
      expect(out).toContain("# TYPE http_requests_total counter");
      expect(out).not.toContain("http_requests_total{");
      expect(out).not.toContain("http_request_duration_ms_bucket{");
    });

    it("escapes backslash, quote and newline in route labels", () => {
      incRequest('GET /a"b\\c\nd', 200);
      const out = renderPrometheus();
      expect(out).toContain('http_requests_total{route="GET /a\\"b\\\\c\\nd",status="2xx"} 1');
    });
  });
});
