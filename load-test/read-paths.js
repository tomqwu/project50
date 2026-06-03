/* eslint-disable */
// k6 load test for Project 50's authenticated *read* endpoints.
//
// Read paths exercised (all GET, all session-protected):
//   - GET /api/feed        -> the authenticated activity feed
//   - GET /api/challenges   -> the current user's challenges
//   - GET /api/account      -> the current user's account profile
//
// These return 401/403 without a valid session, so a session must be supplied.
// Project 50 uses NextAuth, whose browser session lives in a cookie:
//   - over HTTP:  next-auth.session-token
//   - over HTTPS: __Secure-next-auth.session-token
//
// HOW TO OBTAIN A SESSION COOKIE
//   1. Log in to the target environment in a browser.
//   2. Open DevTools -> Application/Storage -> Cookies.
//   3. Copy the value of the `next-auth.session-token` (or
//      `__Secure-next-auth.session-token`) cookie.
//   4. Pass it in via SESSION_TOKEN below.
//
// Run (HTTP):
//   k6 run \
//     -e BASE_URL=http://localhost:3000 \
//     -e SESSION_TOKEN=<cookie-value> \
//     load-test/read-paths.js
//
// Run (HTTPS staging) — also set COOKIE_NAME for the __Secure- prefix:
//   k6 run \
//     -e BASE_URL=https://staging.example.com \
//     -e SESSION_TOKEN=<cookie-value> \
//     -e COOKIE_NAME=__Secure-next-auth.session-token \
//     load-test/read-paths.js
//
// k6 is a standalone binary (no npm dependency); the imports below resolve in
// the k6 runtime, which is why ESLint is disabled for this file.

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const SESSION_TOKEN = __ENV.SESSION_TOKEN || "";
// Default to the plain (HTTP) cookie name; override for HTTPS environments.
const COOKIE_NAME = __ENV.COOKIE_NAME || "next-auth.session-token";

const errorRate = new Rate("errors");
// Per-endpoint latency trends so the summary breaks out each read path.
const feedTrend = new Trend("read_feed_duration", true);
const challengesTrend = new Trend("read_challenges_duration", true);
const accountTrend = new Trend("read_account_duration", true);

export const options = {
  // Realistic read-traffic profile: gradual ramp to a steady plateau, then down.
  stages: [
    { duration: "1m", target: 25 }, // ramp-up
    { duration: "3m", target: 25 }, // steady state — the measured plateau
    { duration: "1m", target: 0 }, // ramp-down
  ],
  thresholds: {
    // Authenticated reads hit the DB; allow more headroom than the probes.
    http_req_duration: ["p(95)<800", "p(99)<1500"],
    errors: ["rate<0.01"],
    // Per-endpoint SLO guards (see load-test/README.md for the SLO table).
    read_feed_duration: ["p(95)<800"],
    read_challenges_duration: ["p(95)<800"],
    read_account_duration: ["p(95)<800"],
  },
};

// Fail fast with a clear message if no session was provided, rather than
// hammering the target with requests that will all 401.
export function setup() {
  if (!SESSION_TOKEN) {
    throw new Error(
      "SESSION_TOKEN is required for read-paths.js. " +
        "Pass it via `-e SESSION_TOKEN=<cookie-value>` " +
        "(see the header comment for how to obtain it).",
    );
  }
}

function authParams(endpoint) {
  return {
    headers: {
      // Send the NextAuth session cookie so the request is authenticated.
      Cookie: `${COOKIE_NAME}=${SESSION_TOKEN}`,
    },
    tags: { endpoint },
  };
}

function checkRead(res, name) {
  const ok = check(res, {
    [`${name} status is 200`]: (r) => r.status === 200,
    [`${name} not unauthorized`]: (r) => r.status !== 401 && r.status !== 403,
  });
  errorRate.add(!ok);
  return ok;
}

export default function () {
  const feed = http.get(`${BASE_URL}/api/feed`, authParams("feed"));
  feedTrend.add(feed.timings.duration);
  checkRead(feed, "feed");

  const challenges = http.get(`${BASE_URL}/api/challenges`, authParams("challenges"));
  challengesTrend.add(challenges.timings.duration);
  checkRead(challenges, "challenges");

  const account = http.get(`${BASE_URL}/api/account`, authParams("account"));
  accountTrend.add(account.timings.duration);
  checkRead(account, "account");

  // Pace each virtual user to roughly one read cycle per second.
  sleep(1);
}
