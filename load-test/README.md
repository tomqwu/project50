# Load testing — Project 50 web

A runnable [k6](https://k6.io) load-test setup for Project 50's key web
endpoints, plus the methodology for capturing a performance **baseline** once a
deployable target environment (staging/prod) exists.

This directory is **scripts + docs only**: k6 is a standalone binary, so there
is **no npm dependency** and nothing is added to `package.json`. The `.js`
scripts run inside the k6 runtime (not Node), so `load-test/` is excluded from
the repo ESLint run via `.eslintignore`.

---

## Why / scope

We want a repeatable way to answer: _under representative load, are our key
endpoints meeting their latency and error-rate SLOs?_ The scripts here are the
harness. The actual **baseline numbers** can only be captured against a
deployed environment — see [Recording a baseline](#recording-a-baseline).

> **TODO (until staging exists):** There is no shared staging/prod URL yet.
> Run against a local dev server for now (`http://localhost:3000`); re-run and
> record the canonical baseline against staging once it is stood up.

---

## Install k6

k6 is a single standalone binary — no Node/npm involvement.

```sh
# macOS
brew install k6

# Debian/Ubuntu
sudo apt-get install k6

# or download a binary: https://k6.io/docs/get-started/installation/
```

---

## Scripts

| Script          | Endpoints                                          | Auth?                |
| --------------- | -------------------------------------------------- | -------------------- |
| `health.js`     | `GET /api/health`, `GET /api/ready`                | No                   |
| `read-paths.js` | `GET /api/feed`, `/api/challenges`, `/api/account` | Yes (session cookie) |

Both scripts read the target from `__ENV.BASE_URL` (default
`http://localhost:3000`) and define ramp-up / steady / ramp-down stages plus
latency and error-rate thresholds. A run **fails** (non-zero exit) if a
threshold is breached — making these usable as a gate.

### Run the smoke / probe test (no auth)

Start here against any new environment — it validates the harness end to end and
captures a clean latency floor on the dependency-light probe endpoints.

```sh
k6 run -e BASE_URL=https://staging.example.com load-test/health.js
```

`/api/health` must return `200 {"status":"ok"}`. `/api/ready` returns `200`
when Postgres + object storage are reachable, `503` otherwise — both are valid
HTTP responses, so the script only flags transport-level failures.

### Run the authenticated read-path test

```sh
k6 run \
  -e BASE_URL=https://staging.example.com \
  -e SESSION_TOKEN=<cookie-value> \
  -e COOKIE_NAME=__Secure-next-auth.session-token \
  load-test/read-paths.js
```

For a local HTTP server, omit `COOKIE_NAME` (it defaults to the non-secure
cookie) and use `-e BASE_URL=http://localhost:3000`.

---

## Authenticating protected endpoints

Project 50 uses **NextAuth**. The browser session is a cookie:

- over HTTP: `next-auth.session-token`
- over HTTPS: `__Secure-next-auth.session-token`

To obtain a value for `SESSION_TOKEN`:

1. Log in to the target environment in a browser.
2. Open DevTools → Application/Storage → Cookies.
3. Copy the value of the `next-auth.session-token` (or
   `__Secure-next-auth.session-token`) cookie.
4. Pass it via `-e SESSION_TOKEN=<value>` (and `-e COOKIE_NAME=...` on HTTPS).

`read-paths.js` fails fast in `setup()` with a clear message if no
`SESSION_TOKEN` is supplied, so you never accidentally load-test a wall of 401s.

> Treat session tokens as secrets: do not commit them or paste them into shared
> logs. Prefer a short-lived test account dedicated to load testing.

---

## What to measure (SLOs)

Capture these for each endpoint at steady state:

| Metric      | k6 metric                         | Target SLO (initial)          |
| ----------- | --------------------------------- | ----------------------------- |
| Latency p50 | `http_req_duration` p(50)         | probes < 100ms; reads < 400ms |
| Latency p95 | `http_req_duration` p(95)         | probes < 300ms; reads < 800ms |
| Latency p99 | `http_req_duration` p(99)         | reads < 1500ms                |
| Error rate  | `errors` rate / `http_req_failed` | < 1%                          |
| Throughput  | `http_reqs` rate (req/s)          | record, no fixed target yet   |

These SLOs are encoded as thresholds in each script; treat the values above as a
**starting point** and tune them against real staging numbers.

---

## Recording a baseline

A baseline is a single, reproducible measurement against a known environment and
script revision. To record one:

1. Note the **environment** (URL), **commit SHA**, **date**, and the **stages**
   used (they are in the script's `options`).
2. Run the script and export the summary:

   ```sh
   k6 run --summary-export=baseline.json \
     -e BASE_URL=https://staging.example.com load-test/health.js
   ```

3. Record the headline numbers (p50/p95/p99 latency, error rate, throughput)
   in the table below. Keep `baseline.json` as the raw artifact (attach to the
   issue/PR or a perf log — do not commit large/secret-bearing artifacts).

### Baseline log

> Fill in once a target environment exists. Until then this stays empty (TODO).

| Date  | Env     | Commit | Script        | p50 | p95 | p99 | Error rate | Throughput |
| ----- | ------- | ------ | ------------- | --- | --- | --- | ---------- | ---------- |
| _TBD_ | staging | —      | health.js     | —   | —   | —   | —          | —          |
| _TBD_ | staging | —      | read-paths.js | —   | —   | —   | —          | —          |

---

Addresses #38.
