/* eslint-disable */
// k6 smoke / liveness load test for Project 50.
//
// Targets the two dependency-light probe endpoints:
//   - GET /api/health  -> cheap liveness check, always 200 { status: "ok" }
//   - GET /api/ready   -> readiness probe, 200 when DB + storage reachable,
//                         503 otherwise (still a "successful" HTTP exchange).
//
// These endpoints require no authentication, so this is the script to run
// first against any new environment to validate the harness end-to-end and
// to capture a low-load latency baseline.
//
// Run:
//   k6 run -e BASE_URL=https://staging.example.com load-test/health.js
//
// k6 is a standalone binary (https://k6.io/docs/get-started/installation/).
// There is no npm dependency; `import` statements below resolve inside the
// k6 runtime, not Node. ESLint cannot resolve them, hence the disable above.

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

// BASE_URL must be supplied via `-e BASE_URL=...`. Default to localhost so the
// script is runnable against a local `pnpm --filter @project50/web dev`.
const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

// Custom error rate so the threshold below counts *our* notion of failure
// (non-2xx/3xx) rather than k6's default http_req_failed.
const errorRate = new Rate("errors");

export const options = {
  // Modest smoke profile: ramp up, hold, ramp down. Probe endpoints are cheap,
  // so this mostly validates the harness and captures a clean latency floor.
  stages: [
    { duration: "30s", target: 10 }, // ramp-up to 10 virtual users
    { duration: "1m", target: 10 }, // steady state
    { duration: "30s", target: 0 }, // ramp-down
  ],
  thresholds: {
    // Probes are dependency-light; p95 should be well under 300ms.
    http_req_duration: ["p(95)<300"],
    // Fewer than 1% of requests may be treated as errors.
    errors: ["rate<0.01"],
  },
};

export default function () {
  // Liveness — must always be 200.
  const health = http.get(`${BASE_URL}/api/health`, {
    tags: { endpoint: "health" },
  });
  const healthOk = check(health, {
    "health status is 200": (r) => r.status === 200,
    "health body is ok": (r) => r.json("status") === "ok",
  });
  errorRate.add(!healthOk);

  // Readiness — 200 (ready) or 503 (a dependency is down). Both are valid HTTP
  // responses; we only flag transport-level failures, not a legitimate 503.
  const ready = http.get(`${BASE_URL}/api/ready`, {
    tags: { endpoint: "ready" },
  });
  const readyOk = check(ready, {
    "ready status is 200 or 503": (r) => r.status === 200 || r.status === 503,
  });
  errorRate.add(!readyOk);

  sleep(1);
}
