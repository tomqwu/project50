# Observability: metrics, dashboards & uptime monitoring

How Project 50 web exposes operational metrics and how to monitor it. Grounded
in the code in this repo today. Read alongside [`RUNBOOKS.md`](./RUNBOOKS.md)
(on-call recovery, the health/ready endpoints), [`DEPLOY.md`](./DEPLOY.md) (CD),
[`INCIDENT-RESPONSE.md`](./INCIDENT-RESPONSE.md) (severities, paging, comms) and
[`SECRETS.md`](./SECRETS.md) (`METRICS_TOKEN`).

> **Scope: infra, not product.** This doc covers *operational* metrics — is the
> service up and fast (throughput, latency, error rate, per request). The
> separate concern of *product* analytics — activation, retention, conversion,
> per user/cohort, from `track()` events — lives in [`ANALYTICS.md`](./ANALYTICS.md)
> with importable dashboards under [`/analytics/dashboards/`](../analytics/dashboards/).

> **TODO (your infra):** the actual Prometheus/Grafana stack, uptime checker and
> paging tool depend on your hosting choice and are **not yet provisioned**.
> Everywhere you see **TODO** below, substitute your chosen tooling. The configs
> here are accurate to the code that exists today.

---

## 1. Metrics endpoint (#27)

|              |                                                                               |
| ------------ | ----------------------------------------------------------------------------- |
| **Endpoint** | `GET /api/metrics` (`apps/web/app/api/metrics/route.ts`)                      |
| **Format**   | Prometheus text exposition format (`Content-Type: text/plain; version=0.0.4`) |
| **Registry** | In-process, `apps/web/lib/metrics.ts`                                         |
| **Auth**     | Optional `METRICS_TOKEN` bearer — see below                                   |

### Exposed series

The central route wrapper `handleRoute` (`apps/web/lib/api/http.ts`) records one
sample per request it handles:

| Metric                     | Type      | Labels                                      | Meaning                                                                                                  |
| -------------------------- | --------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `http_requests_total`      | counter   | `route`, `status` (`2xx`/`3xx`/`4xx`/`5xx`) | Throughput + error counts per route.                                                                     |
| `http_request_duration_ms` | histogram | `route`                                     | Request latency; buckets `5,10,25,50,100,250,500,1000,2500,5000` ms (+`+Inf`), plus `_sum` and `_count`. |

`status` is bucketed by **class** (not the exact code) to keep label
cardinality bounded. The `route` label is whatever the call site passes to
`handleRoute(fn, route)` (e.g. `"GET /api/feed"`); call sites that don't pass one
yet are recorded under `route="unknown"` — still useful for global throughput
and latency. Incrementally label more routes as needed; it is non-breaking.

Example scrape output:

```text
# HELP http_requests_total Total HTTP requests handled.
# TYPE http_requests_total counter
http_requests_total{route="GET /api/feed",status="2xx"} 1240
http_requests_total{route="GET /api/feed",status="5xx"} 3
# HELP http_request_duration_ms Request latency in milliseconds.
# TYPE http_request_duration_ms histogram
http_request_duration_ms_bucket{route="GET /api/feed",le="50"} 1180
http_request_duration_ms_bucket{route="GET /api/feed",le="+Inf"} 1243
http_request_duration_ms_sum{route="GET /api/feed"} 38120
http_request_duration_ms_count{route="GET /api/feed"} 1243
```

### ⚠️ Per-instance limitation (read this)

The registry lives in **process memory**, so the numbers are **per instance**:

- Each Node process / serverless instance has its **own** counters; they reset
  when the instance restarts (a serverless cold start = a fresh registry).
- A scrape hits **one** instance and returns only that instance's view.

This is intentional (zero deps, near-zero overhead) but means a real setup must
**aggregate across instances**. Two options:

1. **Scrape every instance.** Give Prometheus the list of instance addresses
   (static targets or service discovery) so it scrapes each one; aggregate with
   `sum by (...)` in queries. Works for a fixed fleet (e.g. containers/VMs).
2. **Push gateway.** On a serverless host where instances are ephemeral and not
   individually addressable, push to a [Prometheus Pushgateway] or use an
   aggregating collector (e.g. an OpenTelemetry collector / vendor agent). The
   in-process registry is then the source for the periodic push. **TODO** when
   the host is chosen.

[Prometheus Pushgateway]: https://github.com/prometheus/pushgateway

### Auth: `METRICS_TOKEN`

`/api/metrics` can leak internal route names + traffic shape, so guard it on any
publicly reachable deployment.

- **`METRICS_TOKEN` unset →** endpoint is **open**. Fine only when it is reached
  over a private network / internal route the public can't hit.
- **`METRICS_TOKEN` set →** caller must send `Authorization: Bearer <token>`;
  otherwise `401 {"error":"unauthorized"}`.

See [`SECRETS.md`](./SECRETS.md) for storage + rotation, and `.env.example`.

### Prometheus scrape config

```yaml
# prometheus.yml
scrape_configs:
  - job_name: project50-web
    metrics_path: /api/metrics
    scheme: https
    scrape_interval: 30s
    # If METRICS_TOKEN is set, present it as a bearer token:
    authorization:
      type: Bearer
      credentials: "${METRICS_TOKEN}" # TODO: inject from your secret store
    static_configs:
      - targets:
          - web-1.internal:3000 # TODO: your instance addresses, or use
          - web-2.internal:3000 #       a *_sd_config for dynamic discovery
```

On a single-URL host (one load-balanced domain) you'll scrape a different
instance each time — see the per-instance note above; prefer per-instance
targets or a push gateway for accurate aggregation.

---

## 2. Grafana dashboard outline

A "Project 50 — Web" dashboard with these panels (PromQL against the series
above). Use `$route` as a multi-select template variable
(`label_values(http_requests_total, route)`).

| Panel                   | Query (PromQL)                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| **Throughput** (req/s)  | `sum(rate(http_requests_total[5m]))`                                                                 |
| **Throughput by route** | `sum by (route) (rate(http_requests_total{route=~"$route"}[5m]))`                                    |
| **Error rate %**        | `100 * sum(rate(http_requests_total{status="5xx"}[5m])) / sum(rate(http_requests_total[5m]))`        |
| **Errors by route**     | `sum by (route) (rate(http_requests_total{status=~"4xx\|5xx"}[5m]))`                                 |
| **Latency p50**         | `histogram_quantile(0.50, sum by (le) (rate(http_request_duration_ms_bucket{route=~"$route"}[5m])))` |
| **Latency p95**         | `histogram_quantile(0.95, sum by (le) (rate(http_request_duration_ms_bucket{route=~"$route"}[5m])))` |
| **Avg latency**         | `sum(rate(http_request_duration_ms_sum[5m])) / sum(rate(http_request_duration_ms_count[5m]))`        |

> Always `sum by (le)` across the fleet **before** `histogram_quantile` so the
> percentile is computed over aggregated buckets (correct for the per-instance
> registry). Import via Grafana → Dashboards → New → and wire the Prometheus
> data source. A JSON model can live under `ops/grafana/` once provisioned —
> **TODO**.

### Alerting rules (Prometheus / Grafana alerting)

```yaml
# alerts.yml — TODO: wire receivers to your paging tool (see §3)
groups:
  - name: project50-web
    rules:
      - alert: HighErrorRate
        expr: |
          100 * sum(rate(http_requests_total{status="5xx"}[5m]))
              / sum(rate(http_requests_total[5m])) > 5
        for: 5m
        labels: { severity: page }
        annotations:
          summary: "5xx error rate >5% for 5m"
      - alert: HighLatencyP95
        expr: |
          histogram_quantile(0.95,
            sum by (le) (rate(http_request_duration_ms_bucket[5m]))) > 1000
        for: 10m
        labels: { severity: page }
        annotations:
          summary: "p95 latency >1s for 10m"
      - alert: NoTraffic
        expr: sum(rate(http_requests_total[10m])) == 0
        for: 10m
        labels: { severity: page }
        annotations:
          summary: "No requests recorded for 10m (app down or scrape broken?)"
```

---

## 3. Uptime monitoring & alerting (#28)

External, black-box monitoring of the **already-existing** probes — these run
from outside your infra so they catch total outages a scraper inside it would
miss. The endpoints (see [`RUNBOOKS.md`](./RUNBOOKS.md)):

| Check         | Endpoint          | Expect                                          | Meaning                                                                                       |
| ------------- | ----------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Liveness**  | `GET /api/health` | `200` `{"status":"ok"}`                         | Process up & serving. Dependency-free; never touches DB/storage.                              |
| **Readiness** | `GET /api/ready`  | `200` `{"status":"ready",...}` (`503` when not) | Postgres (`SELECT 1`) **and** object storage reachable; per-dependency breakdown in the body. |

### Configure an uptime checker

Pick one (**TODO:** the user's choice) — UptimeRobot, Pingdom, or Grafana
Synthetic Monitoring. Two monitors:

| Monitor       | URL                           | Interval | Up condition                                   | Alert after                                                                                                          |
| ------------- | ----------------------------- | -------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **liveness**  | `https://<domain>/api/health` | 60s      | HTTP 200 **and** body contains `"status":"ok"` | 2 consecutive failures (~2 min)                                                                                      |
| **readiness** | `https://<domain>/api/ready`  | 60s      | HTTP 200 **and** body contains `"ready"`       | 3 consecutive failures (~3 min) — readiness can flap on a brief dependency blip; require more failures before paging |

Notes:

- Keep `/api/health` and `/api/ready` **unauthenticated** (they expose no
  secrets) so the checker can reach them without credentials.
- Liveness failing = the box is down (page immediately). Readiness failing while
  liveness passes = a **dependency** (DB/storage) is down — the response body
  tells you which; jump to the matching runbook.

UptimeRobot example (API or dashboard): two HTTP(s) monitors, 60s interval,
keyword type `exists` matching `"status":"ok"` and `ready` respectively, with an
alert contact wired to your paging tool.

Grafana Synthetics example (as code):

```yaml
# synthetics — TODO: your Grafana Cloud stack id / token
checks:
  - job: p50-liveness
    target: https://<domain>/api/health
    type: http
    frequency: 60s
    settings: { http: { validStatusCodes: [200], failIfBodyNotMatchesRegexp: ['"status":"ok"'] } }
  - job: p50-readiness
    target: https://<domain>/api/ready
    type: http
    frequency: 60s
    settings: { http: { validStatusCodes: [200], failIfBodyNotMatchesRegexp: ["ready"] } }
```

### Alerting thresholds & paging

| Signal                       | Threshold              | Severity      | Action                                                                 |
| ---------------------------- | ---------------------- | ------------- | ---------------------------------------------------------------------- |
| Liveness down                | 2 consecutive failures | **SEV: page** | Page on-call immediately → [`RUNBOOKS.md`](./RUNBOOKS.md) "site down". |
| Readiness down (liveness up) | 3 consecutive failures | **SEV: page** | Page on-call; read `checks` to see DB vs storage → matching runbook.   |
| Error rate / latency (§2)    | per `alerts.yml`       | page          | Same on-call rotation.                                                 |

> **TODO (your paging tool):** wire the uptime checker's + Prometheus
> Alertmanager's notification channels to your pager (PagerDuty / Opsgenie /
> Slack on-call / email). The on-call process, severities and comms live in
> [`INCIDENT-RESPONSE.md`](./INCIDENT-RESPONSE.md); recovery steps in
> [`RUNBOOKS.md`](./RUNBOOKS.md).
