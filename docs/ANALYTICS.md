# Product analytics: funnel & retention

The plan for measuring **product** outcomes — activation, retention, conversion —
for Project 50. Grounded in the event tracking that exists in the repo today
(`apps/web/lib/analytics.ts`). Read alongside the dashboard specs in
[`/analytics/dashboards/`](../analytics/dashboards/).

> **Product analytics vs infra observability.** This doc is about *user
> behaviour* (did they sign up, start a challenge, finish day 50, upgrade). It is
> a different concern from operational metrics — request throughput, latency,
> error rate — which live in [`OBSERVABILITY.md`](./OBSERVABILITY.md) and are
> exposed as Prometheus series at `/api/metrics`. Keep them separate:
>
> | | Product analytics (this doc) | Infra observability (`OBSERVABILITY.md`) |
> | --- | --- | --- |
> | Question | Is the product working *for users*? | Is the service up and fast? |
> | Source | `track()` events → analytics backend | `/api/metrics` → Prometheus |
> | Grain | per user / per cohort | per request / per route |
> | Example | activation rate, D7 retention | p95 latency, 5xx rate |
>
> The one place they overlap is the Grafana spec
> [`grafana-product.json`](../analytics/dashboards/grafana-product.json), which
> reads the *existing* Prometheus series to give product-adjacent traffic shape
> (e.g. `project50_started` POSTs) until a real event backend is wired up.

> **Status: not yet collecting.** `track()` is a **no-op** until both
> `NEXT_PUBLIC_ANALYTICS_KEY` is set **and** the user grants tracking consent
> (see `apps/web/lib/analytics.ts`). Events are queued on `window.p50Analytics`
> and POSTed to `/api/analytics`; no warehouse/provider drains them yet. The
> queries and dashboards below are written to be **imported once a backend is
> connected** — they assume events land in a table/stream. Adapt identifiers to
> your provider (warehouse SQL, Amplitude, PostHog, …) on import.

---

## 1. Event taxonomy

The tracked events are a **closed, typed union** — `AnalyticsEvent` in
`apps/web/lib/analytics.ts`. Keeping it closed means call sites are
type-checked and the taxonomy stays curated rather than free-form. Each event is
recorded via `track(event, props)` and carries the call's epoch-ms timestamp
(`ts`) plus arbitrary JSON-serializable `props`.

| Event | When it fires | Call site | Properties |
| --- | --- | --- | --- |
| `signup` | A new account is created. **Reserved — declared in the union but not yet wired to a call site.** Wire it where the account is created (the post-signup client redirect) so the funnel has its entry step. | _none yet_ | _(none defined yet; suggest `method` once wired, e.g. `"facebook"` / `"email"`)_ |
| `project50_started` | The user begins (or restarts) a 50-day challenge — fires when the start/restart button is pressed. | `app/(app)/_components/Project50Client.tsx` | `restarted: boolean` — `false` for a first start, `true` for a hard-reset restart. |
| `rule_toggled` | The user checks or unchecks one of the day's rules. | `app/(app)/_components/Project50Client.tsx` | `ruleId: string` — which rule; `done: boolean` — checked (`true`) or unchecked (`false`). |
| `upgrade_clicked` | The user presses the primary upgrade button on the paywall (intent to pay — before Stripe Checkout). | `app/(app)/upgrade/_components/Paywall.tsx` | `trial: boolean` — whether a free trial was requested at checkout. |

**Implicit properties on every event** (set by `track()` / the collector, not by
call sites): `event` (the union member), `ts` (epoch ms), and — once a backend
attaches them — an identity (`user_id` / `anonymous_id`) and session/context.
The activation funnel below assumes events can be joined to a stable `user_id`
once the user is known, and stitched to a pre-signup `anonymous_id` for the
`visit → signup` step.

### Adding a new event

1. **Extend the union** in `apps/web/lib/analytics.ts`:
   ```ts
   export type AnalyticsEvent =
     | "signup"
     | "project50_started"
     | "rule_toggled"
     | "upgrade_clicked"
     | "day50_completed"; // ← new member
   ```
2. **Call `track()`** at the moment it happens, with typed props:
   ```ts
   import { track } from "@/lib/analytics";
   track("day50_completed", { restarted: false });
   ```
   `track()` stays a no-op unless analytics is configured + consented, so adding
   a call is safe to ship before a backend exists.
3. **Document it** in the taxonomy table above (when it fires, call site, props).
4. **Update any affected query/dashboard** below and in
   `/analytics/dashboards/` so the funnel/retention definitions stay accurate.

> Several funnel steps below (e.g. *7/7 perfect day*, *Day-50 completion*) are
> **derived** from `rule_toggled` and challenge state rather than from a single
> event. Where a dedicated event would be cleaner (e.g. `day50_completed`), it is
> called out as a recommended addition.

---

## 2. The activation funnel

The path from a stranger to an activated, finishing user. Each step is a strict
subset of the one above it; the **conversion** of a step is `count(step) /
count(previous step)`.

| # | Step | Source | Definition |
| --- | --- | --- | --- |
| 1 | **Visit** | page/session event (analytics backend) or `http_requests_total` on the landing route | A unique visitor (`anonymous_id`) loads the site. |
| 2 | **Signup** | `signup` *(reserve — wire the call site)* | Visitor creates an account. Stitch `anonymous_id → user_id`. |
| 3 | **Started** | `project50_started` (`restarted=false`) | New user begins their first 50-day challenge. **This is the activation moment.** |
| 4 | **First perfect day (7/7)** | derived from `rule_toggled` | On some day, the user has all 7 rules `done=true` — they experienced the core loop. |
| 5 | **Day-50 completion** | derived (recommend a `day50_completed` event) | The user reaches day 50 of a challenge with the streak intact (program completed). |

**Activation rate** is the headline: step 3 / step 2 (started / signup). A
"perfect-day" (step 4) is the strongest early predictor of finishing, so it is
worth its own panel.

### Example queries (provider-agnostic SQL-ish)

Assume an `events(event, user_id, anonymous_id, ts, props /* json */)` table.

**Funnel counts (last 30 days of signups), one row per step:**
```sql
WITH signups AS (
  SELECT user_id, MIN(ts) AS signed_up_at
  FROM events
  WHERE event = 'signup' AND ts >= NOW() - INTERVAL '30 days'
  GROUP BY user_id
),
started AS (
  SELECT DISTINCT user_id FROM events
  WHERE event = 'project50_started' AND (props->>'restarted') = 'false'
),
perfect_day AS ( -- a day on which 7 distinct rules were toggled done=true
  SELECT user_id FROM events
  WHERE event = 'rule_toggled' AND (props->>'done') = 'true'
  GROUP BY user_id, DATE(ts)
  HAVING COUNT(DISTINCT props->>'ruleId') >= 7
)
SELECT
  COUNT(*)                                                                AS signups,
  COUNT(*) FILTER (WHERE s.user_id IN (SELECT user_id FROM started))      AS started,
  COUNT(*) FILTER (WHERE s.user_id IN (SELECT user_id FROM perfect_day))  AS perfect_day
FROM signups s;
```

**Activation rate (started / signup):**
```sql
SELECT
  COUNT(DISTINCT st.user_id)::float / NULLIF(COUNT(DISTINCT su.user_id), 0) AS activation_rate
FROM (SELECT DISTINCT user_id FROM events WHERE event = 'signup') su
LEFT JOIN (
  SELECT DISTINCT user_id FROM events
  WHERE event = 'project50_started' AND (props->>'restarted') = 'false'
) st USING (user_id);
```

**Day-50 completion** is best measured from a `day50_completed` event once wired
(`COUNT(DISTINCT user_id) WHERE event='day50_completed'`); until then derive it
from challenge state in the app DB (a challenge whose day index reached 50 with
the streak unbroken) — that lives in the product database, not the event stream.

---

## 3. Retention

Retention = of the users who started on day _d0_, how many came back and were
active later. "Active" for Project 50 = recorded **at least one `rule_toggled`**
that day (the daily check-in is the core habit). Anchor `d0` on the user's
`project50_started` (`restarted=false`) — the activation moment — not signup, so
retention measures *program* stickiness.

### D1 / D7 / D30

`DN retention` = share of a day-0 cohort that was active N days later. There is a
choice of variant: **exact day N** (strict return-rate) vs **N-day-or-later**
(smoother survival curve). The definition used here is **active on day N
(exact)**.

```sql
WITH cohort AS ( -- each user's activation day = day 0
  SELECT user_id, MIN(DATE(ts)) AS d0
  FROM events
  WHERE event = 'project50_started' AND (props->>'restarted') = 'false'
  GROUP BY user_id
),
active_days AS ( -- distinct days each user checked in
  SELECT DISTINCT user_id, DATE(ts) AS day
  FROM events
  WHERE event = 'rule_toggled'
)
SELECT
  COUNT(DISTINCT c.user_id)                                          AS cohort_size,
  COUNT(DISTINCT a1.user_id)::float / COUNT(DISTINCT c.user_id)      AS d1,
  COUNT(DISTINCT a7.user_id)::float / COUNT(DISTINCT c.user_id)      AS d7,
  COUNT(DISTINCT a30.user_id)::float / COUNT(DISTINCT c.user_id)     AS d30
FROM cohort c
LEFT JOIN active_days a1  ON a1.user_id  = c.user_id AND a1.day  = c.d0 + 1
LEFT JOIN active_days a7  ON a7.user_id  = c.user_id AND a7.day  = c.d0 + 7
LEFT JOIN active_days a30 ON a30.user_id = c.user_id AND a30.day = c.d0 + 30;
```

### Weekly cohorts (retention curve)

Group users by the **week** they activated, then measure the share active in each
subsequent week — the standard triangular cohort table.

```sql
WITH cohort AS (
  SELECT user_id,
         DATE_TRUNC('week', MIN(ts)) AS cohort_week
  FROM events
  WHERE event = 'project50_started' AND (props->>'restarted') = 'false'
  GROUP BY user_id
),
activity AS (
  SELECT DISTINCT user_id, DATE_TRUNC('week', ts) AS active_week
  FROM events WHERE event = 'rule_toggled'
)
SELECT
  c.cohort_week,
  ((a.active_week - c.cohort_week) / 7)        AS week_offset,
  COUNT(DISTINCT a.user_id)                    AS retained
FROM cohort c
JOIN activity a ON a.user_id = c.user_id AND a.active_week >= c.cohort_week
GROUP BY c.cohort_week, week_offset
ORDER BY c.cohort_week, week_offset;
-- Divide each row's `retained` by its cohort's week_offset=0 value to get
-- retention %. Many BI tools do this normalization in the viz layer.
```

---

## 4. Key product metrics

### Activation rate
Defined in §2. Started / signup. Events: `project50_started`, `signup`.

### Trial → paid conversion
Intent (`upgrade_clicked`) → outcome (subscription becomes `ACTIVE`). The
**outcome** is not an event — it lives in the product DB
(`SubscriptionStatus`, see `apps/web/lib/api/entitlements.ts`:
`ACTIVE | TRIALING | PAST_DUE | CANCELED | NONE`). Two related ratios:

- **Click → paid:** of users who fired `upgrade_clicked`, how many ended up
  `ACTIVE`.
- **Trial → paid:** of users who entered a trial (`upgrade_clicked` with
  `props.trial = true`, → `TRIALING`), how many converted to `ACTIVE` rather than
  `CANCELED`/`NONE` at trial end.

```sql
-- Click → paid (join event stream to the subscriptions table)
WITH clickers AS (
  SELECT user_id,
         BOOL_OR((props->>'trial') = 'true') AS wanted_trial
  FROM events WHERE event = 'upgrade_clicked'
  GROUP BY user_id
)
SELECT
  COUNT(*)                                                                AS clicked,
  COUNT(*) FILTER (WHERE s.status = 'ACTIVE')                             AS converted,
  COUNT(*) FILTER (WHERE s.status = 'ACTIVE')::float / NULLIF(COUNT(*),0) AS click_to_paid,
  COUNT(*) FILTER (WHERE c.wanted_trial AND s.status = 'ACTIVE')::float
    / NULLIF(COUNT(*) FILTER (WHERE c.wanted_trial), 0)                   AS trial_to_paid
FROM clickers c
LEFT JOIN subscriptions s ON s.user_id = c.user_id;
```

### Streak survival
The signature Project 50 metric: a *hard reset* (missing a day) sends the user
back to day 1. Survival = the share of started challenges still alive at day _d_.
Approximate "alive at day d" from check-in activity (an unbroken run of
`rule_toggled` days from `d0`), or — more accurately — from the challenge's
current/peak day index in the product DB. A drop in the curve marks the days
people most often break.

```sql
-- Survival proxy: share of cohort with a check-in on each day-offset, from events
WITH cohort AS (
  SELECT user_id, MIN(DATE(ts)) AS d0
  FROM events WHERE event = 'project50_started' AND (props->>'restarted') = 'false'
  GROUP BY user_id
),
active AS (SELECT DISTINCT user_id, DATE(ts) AS day FROM events WHERE event = 'rule_toggled')
SELECT
  (a.day - c.d0)                                       AS day_offset,
  COUNT(DISTINCT a.user_id)::float
    / (SELECT COUNT(*) FROM cohort)                    AS surviving_share
FROM cohort c
JOIN active a ON a.user_id = c.user_id AND a.day BETWEEN c.d0 AND c.d0 + 49
GROUP BY day_offset
ORDER BY day_offset;
```

> The most accurate streak-survival and Day-50-completion numbers come from the
> **product database** (challenge day index + streak state), not the event
> stream — events tell you *intent and check-in behaviour*, the DB holds the
> authoritative program state. Use events for funnel/retention; join to the DB
> for completion and conversion outcomes.

---

## 5. See also

- [`/analytics/dashboards/`](../analytics/dashboards/) — importable dashboard
  specs: `funnel.json`, `retention.json` (provider-agnostic), and
  `grafana-product.json` (Grafana over the existing `/api/metrics` Prometheus
  series).
- [`OBSERVABILITY.md`](./OBSERVABILITY.md) — infra metrics, the `/api/metrics`
  endpoint, uptime monitoring (the *operational* counterpart to this doc).
- `apps/web/lib/analytics.ts` — the `track()` implementation and the
  `AnalyticsEvent` source of truth.
</content>
