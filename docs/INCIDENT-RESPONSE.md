# Incident Response Process

How we detect, respond to, and learn from production incidents for Project 50.
Pairs with the per-failure [`RUNBOOKS.md`](./RUNBOOKS.md) (what to *do*) and
[`DEPLOY.md`](./DEPLOY.md) (deploy/rollback mechanics). The app runs on **Azure
Container Apps** (`ca-project50-web-dev`); the full deploy + Key Vault + scaling
runbook is [`infra/azure/README.md`](../infra/azure/README.md).

> Items that depend on **your** org/cloud setup (paging tool, comms channel,
> status page, on-call rotation) are marked **TODO** — fill them in once the
> infra exists. The process below stands on its own.

## What counts as an incident

Any unplanned event that degrades the service for users or risks data/security:
site down, elevated error rate, a hard dependency unreachable (Postgres / object
storage), broken auth, a bad deploy, or a security issue (e.g. leaked secret,
e2e auth provider active in prod). When unsure, **declare** — it's cheaper to
stand one down than to respond late.

## Severity levels

| SEV | Meaning | Examples | Response | Target time to mitigate |
| --- | --- | --- | --- | --- |
| **SEV1** | Critical — service down or unusable for most users; data loss/exposure | Whole site down (`/api/health` failing), DB unreachable, auth fully broken, secret leak | Page on-call immediately; all-hands until mitigated | **TODO** (e.g. ≤30 min) |
| **SEV2** | Major — significant degradation, important feature broken, no workaround | Uploads/recap down (`storage:false`), sustained elevated 5xx, one OAuth provider down | Page on-call; active response | **TODO** (e.g. ≤2 h) |
| **SEV3** | Minor — limited or cosmetic impact, workaround exists | Slow recap render, intermittent non-critical errors, isolated route bug | Normal hours; ticket + fix forward | Next business day |

Severity can change as you learn more — **upgrade** the moment impact looks
worse than first thought; downgrade only with evidence.

## Roles

For small incidents one person may hold several roles; for SEV1 split them.

- **Incident Commander (IC)** — owns the response. Decides actions, sets
  severity, keeps the timeline, delegates. Does **not** also debug hands-on if
  avoidable. The IC's job is coordination, not heroics.
- **Operations / Responder(s)** — execute the runbooks: diagnose, mitigate, run
  the rollback. Report findings to the IC.
- **Communications lead** — posts updates to stakeholders/users and the status
  page on a cadence (SEV1: at least every 30 min). For small incidents the IC
  also owns comms.
- **Scribe** — captures the timeline (events, decisions, timestamps) for the
  postmortem. Can be the IC for small incidents.

**TODO:** define the on-call rotation and the paging tool (PagerDuty / Opsgenie /
etc.) and link them here.

## Response lifecycle

### 1. Detect
- Sources: an **Azure Monitor** metric alert (the 5xx / replica-restart /
  Postgres CPU-storage-connections alerts in `infra/azure/monitoring.tf`, when
  `alert_email` is enabled), the Container App `/api/health` probe failing, a
  **Sentry** alert (if `SENTRY_DSN` set), a spike of `"level":"error"` JSON logs,
  or user reports.
- **TODO:** wire alerting (set `alert_email` to enable the Azure Monitor action
  group; `/api/health` external check + Sentry → pager/Slack) so detection isn't
  purely manual.

### 2. Triage
- **Declare** the incident and assign an **IC**.
- Set an initial **severity** (table above).
- Open the incident channel/doc. **TODO:** comms channel (e.g. a dedicated Slack
  channel + incident doc from the postmortem template).
- Run the fast triage from `RUNBOOKS.md`:
  `curl /api/health` → `curl /api/ready | jq` → check recent deploys → read
  logs / Sentry. This localizes the failure (process / DB / storage / auth /
  bad deploy) within a couple of minutes.

### 3. Mitigate (stop the bleeding — before root-causing)
- **Restore service first.** The fastest, safest lever here is usually a
  **rollback**: shift ingress traffic to the last known-good **Container App
  revision** (`az containerapp ingress traffic set` / re-activate a previous
  revision via `az containerapp revision activate`) — instant and DB-safe. See
  `RUNBOOKS.md` → *Bad deploy / rollback* and `DEPLOY.md` → *Rollback*.
- If it's a dependency, follow that dependency's runbook:
  - **DB / storage** — run `curl -sS https://www.project50.fit/api/ready | jq` to
    see which is down (`database` / `storage` breakdown), then the matching
    runbook. Storage is **Azure Blob via managed identity**; DB is **Azure
    Postgres Flexible Server** `psql-project50-dev-zv34o5`.
  - **Secret / Key Vault** (e.g. a rotated/missing `database-url`, `auth-secret`,
    `metrics-token`) — set the value out of band and **roll a fresh revision** to
    clear the ~30-min versionless-ref cache, per
    [`infra/azure/README.md`](../infra/azure/README.md) § Key Vault.
  - **OAuth provider** — auth runbook in `RUNBOOKS.md`.
- Apply the matching runbook in `RUNBOOKS.md`. Record every action + timestamp
  (scribe).
- Communicate: post that you're investigating, then that you've mitigated.

### 4. Resolve
- Confirm recovery with evidence: `/api/health` 200, `/api/ready` all-green,
  error rate back to baseline in Sentry/logs, key user flows working.
- Hold for a stabilization window before declaring resolved (SEV1: watch a while
  after metrics recover).
- Comms lead posts the **all-clear**; IC stands the incident down.

### 5. Postmortem (learn)
- Required for **SEV1 and SEV2**; optional for SEV3.
- **Blameless** — focus on systems and gaps, not individuals.
- Owner: the IC, within **5 business days**. Drive each action item to an owner
  and a due date; track them like any other work.

## Communication

- **Cadence:** SEV1 — update at least every 30 min until mitigated; SEV2 — at
  meaningful state changes; SEV3 — on the ticket.
- **Internal:** incident channel + live incident doc (timeline). **TODO:** link.
- **External/users:** status page / customer comms for SEV1/SEV2 with visible
  user impact. Say what's affected, that you're on it, and the next update time —
  no speculation on root cause until confirmed. **TODO:** status page link.
- **Security incidents** (leaked secret, auth bypass, e2e provider live in prod):
  rotate the affected credential immediately, contain, and follow your
  disclosure obligations. **TODO:** security contact / disclosure policy.

## Postmortem template

Copy this for each SEV1/SEV2.

```markdown
# Postmortem — <short title>

- **Date / time (UTC):** <when it started → when resolved>
- **Severity:** SEV<n>
- **Status:** Resolved
- **Authors:** <names>          - **IC:** <name>
- **Duration / time-to-detect / time-to-mitigate:** <…>

## Impact
What users experienced, how many, for how long, and any data/security impact.

## Detection
How we found out (alert / Sentry / logs / user report) and how long that took.

## Timeline (UTC)
- HH:MM — <event / action / decision>
- HH:MM — …

## Root cause
The underlying cause (technical + contributing factors). Blameless.

## Resolution & recovery
What mitigated it (e.g. rollback to deploy <SHA>), how recovery was confirmed
(`/api/health` 200, `/api/ready` green, error rate normal).

## What went well / what went poorly
- Went well: …
- Went poorly: …
- Got lucky: …

## Action items
| Action | Type (prevent / detect / mitigate / process) | Owner | Due | Tracking |
| --- | --- | --- | --- | --- |
| … | … | … | … | #issue |

## Lessons learned
Anything to fold back into `RUNBOOKS.md`, alerting, or this process.
```

## Pre-incident checklist (do these before you need them)

- [ ] On-call rotation + paging tool configured — **TODO**
- [ ] Azure Monitor alerts enabled (`alert_email` set — `infra/azure/monitoring.tf`) + an external `/api/health` check, Sentry → pager/Slack — **TODO**
- [ ] `SENTRY_DSN` set in production so errors are captured — see `RUNBOOKS.md`
- [ ] Incident comms channel + status page set up — **TODO**
- [ ] Team has practiced a **Container App revision rollback** (`az containerapp ingress traffic set` to the last-good revision) once — see `DEPLOY.md` / `RUNBOOKS.md`
- [ ] Responders can `az login` to the subscription and reach the Container App revisions / logs (`az containerapp logs show`) and Key Vault `kv-project50-dev-6z7n`
- [ ] Responders have read `RUNBOOKS.md`
