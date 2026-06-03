# On-call Runbooks

Operational runbooks for diagnosing and recovering from common Project 50
failures. These are grounded in **this** app's actual architecture — read
alongside [`DEPLOY.md`](./DEPLOY.md) (CD pipeline) and
[`INCIDENT-RESPONSE.md`](./INCIDENT-RESPONSE.md) (process, severities, comms).

> Anything that depends on **your** cloud setup (hosting dashboard, paging tool,
> log drain, status page) is marked **TODO** below — fill these in once the
> infra is provisioned. The runbooks themselves are accurate to the code in this
> repo today.

## System at a glance

| Component | What it is | Where |
| --- | --- | --- |
| **Web app** | Next.js app (App Router), the only deployed service | `apps/web`, default host **Vercel** (see `DEPLOY.md`) |
| **Database** | PostgreSQL 16, accessed via **Prisma** | `packages/db` (`schema.prisma`, migrations); conn string `DATABASE_URL` |
| **Object storage** | S3-compatible (MinIO in dev/CI, S3/compatible in prod) | `apps/web/lib/storage.ts`; env `S3_ENDPOINT` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_BUCKET` |
| **Auth** | Auth.js (NextAuth v5): Google + Facebook OAuth, JWT sessions | `apps/web/auth.ts`, `apps/web/lib/auth-config.ts` |
| **Recap render** | Server-generated MP4s uploaded to object storage | `apps/web/lib/api/recap.ts` (+ `@project50/recap`) |
| **Logs** | Structured **JSON-per-line** to stdout/stderr | `apps/web/lib/logger.ts` |
| **Error tracking** | Sentry, **opt-in** via `SENTRY_DSN` | `apps/web/sentry.*.config.ts`, `instrumentation.ts` |
| **CI / CD** | GitHub Actions: `ci.yml`, `deploy.yml`, `preview.yml` | `.github/workflows/` |

### Health & readiness endpoints (these EXIST — use them first)

| Endpoint | Source | Meaning |
| --- | --- | --- |
| `GET /api/health` | `apps/web/app/api/health/route.ts` | **Liveness.** Dependency-free; returns `200 {"status":"ok"}` if the process is up and serving. Never touches DB/storage. |
| `GET /api/ready` | `apps/web/app/api/ready/route.ts` | **Readiness.** Checks **Postgres** (`SELECT 1`) **and** object storage (`HeadBucket`). `200 {"status":"ready","checks":{"database":true,"storage":true}}` when both pass; `503 {"status":"not_ready", ...}` otherwise, with a per-dependency breakdown. Never throws. |

`/api/ready` is the single most useful diagnostic: it tells you in one call
whether the DB and/or storage is the failing dependency.

```bash
# Liveness — is the process serving at all?
curl -fsS https://<your-domain>/api/health

# Readiness — which hard dependency is down?
curl -sS https://<your-domain>/api/ready | jq
# -> {"status":"not_ready","checks":{"database":false,"storage":true}}  ⇒ DB is the problem
```

### Where to look (logs, errors, dashboards)

- **Logs:** structured JSON, one object per line (`{ "level", "msg", ... }`),
  emitted to stdout/stderr. Sensitive keys (`password`, `token`, `secret`,
  `authorization`, `cookie`, `*_token`, `client_secret`) are auto-redacted, so
  they are safe to read/share. Filter by `level` (`debug|info|warn|error`).
  Controlled by `LOG_LEVEL` (default `info`).
  - **TODO:** record your log destination here (Vercel: Project → Logs / a
    configured Log Drain; otherwise your container/log-aggregator).
- **Errors:** Sentry, **only if `SENTRY_DSN` is set**. With no DSN the SDK never
  initializes (no events). If you have no Sentry events, first confirm the DSN
  is configured in the host's env.
  - **TODO:** Sentry org/project URL.
- **Deploys:** GitHub Actions **Deploy** workflow + your host's deployment list.
  - **TODO:** host dashboard URL (Vercel: Project → Deployments).
- **Paging / on-call rotation:** **TODO** — wire up your pager (PagerDuty/Opsgenie/etc.).

### Useful local commands

```bash
pnpm lint                                            # repo lint (CI gate)
pnpm --filter @project50/db exec prisma migrate status   # pending vs applied migrations
pnpm --filter @project50/db exec prisma migrate deploy   # apply pending migrations (forward-only)
docker compose up -d postgres minio                  # local Postgres + MinIO (docker-compose.yml)
```

---

## Runbook: Web app down / 5xx / not responding

**Symptoms:** site unreachable, blanket 5xx, host healthcheck failing, "deploy
is broken" reports.

1. **Confirm scope.** Hit liveness:
   ```bash
   curl -fsS https://<domain>/api/health
   ```
   - **No 200 (timeout/connection refused/5xx):** the process/host is down → go
     to step 2.
   - **200 OK:** the app *is* serving; the failure is dependency-specific or
     route-specific → run `/api/ready` (next) and jump to the matching runbook
     (DB, storage, OAuth, error rate).

2. **Check readiness** to localize a dependency failure:
   ```bash
   curl -sS https://<domain>/api/ready | jq
   ```
   `checks.database:false` → **Database unreachable** runbook.
   `checks.storage:false` → **Object storage unreachable** runbook.
   Both true but app still erroring → **Elevated error rate** runbook.

3. **Check for a recent deploy.** Look at GitHub Actions **Deploy** and the host's
   deployment list. If the outage started right after a deploy → **Bad deploy /
   rollback** runbook (fastest path back to green).

4. **Read the logs** (JSON lines). Look for `"level":"error"` near the incident
   start, repeated stack traces, or boot errors (e.g. a missing required env var
   such as `DATABASE_URL`, `AUTH_SECRET`, or `S3_*`). A process that crash-loops
   on boot usually means bad/missing env config on the host.

5. **Check Sentry** (if `SENTRY_DSN` set) for a spike and the top exception.

6. **Mitigate:**
   - Outage began after a deploy → **roll back** (promote last-good — see below).
   - A dependency is down → follow that dependency's runbook.
   - Boot failure on missing env → fix the host env var, redeploy.

**Escalate** to **SEV1** (see `INCIDENT-RESPONSE.md`) if the whole site is down
and not recovered within the SEV1 target.

---

## Runbook: Database unreachable / migration failures

**Symptoms:** `/api/ready` shows `database:false`; routes that read/write data
fail; logs show Prisma connection errors (e.g. `P1001` can't reach DB,
`P1002` timeout); the `migrate` job failing in CD.

### A) Database unreachable at runtime

1. Confirm with readiness: `curl -sS https://<domain>/api/ready | jq` →
   `checks.database:false`.
2. **Check the database itself** (managed Postgres dashboard / provider status):
   is it up, at connection-limit, out of disk, or in maintenance? **TODO:** your
   DB provider + dashboard link.
3. **Check `DATABASE_URL`** on the host — rotated password, wrong host, network
   rules (Postgres listens on 5432). Note the app reads `DATABASE_URL` at the
   *host/runtime* env, configured separately from GitHub Actions secrets (see
   `DEPLOY.md`).
4. **Connectivity test** from an environment with the prod creds:
   ```bash
   DATABASE_URL=<prod-url> pnpm --filter @project50/db exec prisma migrate status
   ```
   This both proves connectivity and reports pending vs. applied migrations.
5. **Mitigate:** restore connectivity (raise connection limit / restart DB /
   fix network rule / correct `DATABASE_URL`). The app recovers on its own once
   the DB is reachable — `/api/ready` flips back to `database:true`. If the
   outage coincided with a deploy that added load/connections, consider a
   rollback while you investigate.

### B) Migration failed in CD

The `migrate` job runs `prisma migrate deploy` **before** the app is promoted
(see `DEPLOY.md`). If a migration fails:

- The `migrate` job **fails** and the `deploy` job is **skipped** — bad code
  never reaches production. The currently-live app keeps running on the old
  schema.
- **Recover:** identify the failing migration from the job logs, author a
  **corrected forward migration** (or fix the SQL), and re-run the Deploy
  workflow. `migrate deploy` is **forward-only** and idempotent — already-applied
  migrations are skipped.
- **Partially-applied migration** (failed mid-way, schema left inconsistent):
  this needs a human. Inspect with `prisma migrate status`, resolve the partial
  state, and ship a forward migration that brings the schema to a consistent
  state. There is **no automatic down-migration** in this project — never
  hand-edit `_prisma_migrations`; prefer a new forward migration.

> Write migrations **backward-compatible** (expand → migrate → contract) so the
> previous app version keeps working in the window between `migrate` and
> `deploy`, and so the app can always be rolled back without a DB rollback.

---

## Runbook: Object storage unreachable (uploads / recap failing)

**Symptoms:** `/api/ready` shows `storage:false`; image uploads fail; recap MP4
generation/playback fails; logs show S3 errors on
`apps/web/lib/storage.ts` (`HeadBucket`, `PutObject`, presign).

How storage is used:
- **Uploads** — `POST /api/uploads/presign` returns a presigned PUT URL
  (5-min expiry); the client uploads directly to storage.
- **Recap** — the server renders an MP4 and writes it with `putObject`
  (`apps/web/lib/api/recap.ts`), then serves a presigned GET URL.
- **Readiness** — `checkStorage()` does a `HeadBucket` on `S3_BUCKET`.

1. Confirm with readiness: `checks.storage:false`.
2. **Check the storage backend** (S3 / MinIO / compatible): is the endpoint up,
   the bucket present, and creds valid? **TODO:** your storage provider +
   dashboard/console link.
3. **Check storage env** on the host: `S3_ENDPOINT`, `S3_ACCESS_KEY`,
   `S3_SECRET_KEY`, `S3_BUCKET`. A rotated key or wrong endpoint is the most
   common cause.
4. **Bucket missing?** The app self-heals: `ensureBucket()` (called by the
   presign route and `putObject`) creates `S3_BUCKET` if absent. If creates are
   failing, the credentials likely lack `CreateBucket`/`HeadBucket` permission —
   fix the IAM policy or pre-create the bucket manually.
5. **Presigned URL errors** (clients get 403 on upload/view): presigned URLs
   expire after **5 minutes** (`PRESIGN_EXPIRY`). Persistent 403s usually mean
   wrong creds or clock skew between app and storage, not expiry. A stale page
   that holds an old URL just needs a refresh to mint a new one.
6. **Mitigate:** restore the endpoint / fix creds / fix bucket perms. Uploads and
   recap recover automatically once storage is reachable. Note: liveness and most
   non-media features keep working while storage is down — scope the impact
   accordingly when setting severity.

---

## Runbook: Elevated error rate

**Symptoms:** Sentry spike, more `"level":"error"` log lines, users reporting
failures, but `/api/health` and often `/api/ready` are still green.

1. **Quantify & localize.** In Sentry (if enabled), find the top new/spiking
   issue and which route/transaction it maps to. In logs, filter
   `"level":"error"` and group by `msg` / route context (the logger supports
   `child(context)` so route errors carry context).
2. **Correlate with a deploy.** Did the spike start at a deploy time? If yes →
   **Bad deploy / rollback** is the fastest mitigation.
3. **Check dependencies** even if `/api/ready` is green — partial degradation
   (slow DB, intermittent storage 5xx, OAuth provider flakiness) can drive errors
   without flipping readiness. Run `/api/ready` a few times.
4. **Rate limiting note:** the in-memory limiter (`apps/web/lib/rate-limit.ts`)
   is **per-instance** — counters reset on cold start and the effective limit
   scales with instance count. A burst of `429`s after a scale-up/cold-start is
   expected behavior, not necessarily an incident.
5. **Mitigate:** roll back a bad deploy; or, if it's a dependency, follow that
   dependency's runbook; or hotfix forward if the cause is a clear, contained
   code bug.

---

## Runbook: Bad deploy / rollback

**Symptoms:** errors/outage began immediately after a production deploy.

**Fastest recovery is almost always to roll the app back, then investigate.**

### App rollback (instant, does not touch the DB)

- **Vercel (default host):** Project → **Deployments** → last known-good
  production deployment → **Promote to Production** (or `vercel rollback`). This
  is instant and does **not** run or revert migrations.
  - **TODO:** if you self-host, document your host's promote/rollback command.
- Confirm recovery: `curl -fsS https://<domain>/api/health` and watch the error
  rate / Sentry settle.

### Why rollback is safe here (forward-only migrations)

- CD runs `prisma migrate deploy` **before** promoting the app, and migrations
  are **forward-only** (no auto down-migration). Because migrations are written
  **backward-compatible** (expand → migrate → contract), the previous app version
  still runs against the newer schema — so promoting the last-good deployment is
  safe even though the schema moved forward.
- **Do not** attempt to "roll back" the database to match an old app version.
  Roll the **app** back; leave the schema as-is. If a schema change itself is the
  problem, fix it with a **new forward migration** shipped through the normal
  pipeline (see Database runbook).

### Bad migration during deploy

- If the migration failed, the `deploy` job was skipped and prod is still on the
  old code/schema (no rollback needed). Fix the migration forward and re-run
  Deploy — see **Database → B) Migration failed in CD**.

### After rollback

1. Open an incident if not already (see `INCIDENT-RESPONSE.md`).
2. Identify the offending change (compare deploy SHAs).
3. Fix forward on a branch, let CI (`ci.yml`) go green, then redeploy.
4. Postmortem if SEV1/SEV2.

---

## Runbook: Auth / OAuth issues

**Symptoms:** users can't sign in; "callback" errors; sessions dropping
immediately; Google/Facebook login fails.

Auth is Auth.js (NextAuth v5) in `apps/web/auth.ts` with **Google** and
**Facebook** providers and **JWT sessions** (config in
`apps/web/lib/auth-config.ts`). Sessions last **30 days** (`SESSION_MAX_AGE_SECONDS`),
refreshed at most daily.

1. **Everyone is logged out / sessions invalid right after a deploy →
   `AUTH_SECRET`.** Session JWTs are signed with `AUTH_SECRET`. If it changed,
   all existing sessions become invalid.
   - **Rotate without mass logout:** `AUTH_SECRET` accepts a **comma-separated
     list** (`parseAuthSecrets`) — the **first** secret signs new tokens, **all**
     listed are accepted for verification. To rotate: set
     `AUTH_SECRET="newsecret,oldsecret"`, deploy, then later drop the old one.
   - If the secret was changed to a single new value by mistake, restoring the
     previous value (or adding it as a second entry) revives live sessions.

2. **Session cookie not being sent (login "succeeds" then immediately logged
   out).** Cookies are forced `Secure` only when the deployment URL is `https`
   (`shouldUseSecureCookies` keys off `AUTH_URL` / `NEXTAUTH_URL`, not
   `NODE_ENV`). On a production https domain `AUTH_URL`/`NEXTAUTH_URL` must be set
   correctly, or `Secure` cookies + callback URLs won't line up.

3. **A single provider (Google or Facebook) fails: "callback" / "redirect_uri
   mismatch" / "invalid client".**
   - **Redirect URI** registered with the provider must exactly match
     `https://<domain>/api/auth/callback/google` (or `/facebook`). The values in
     `.env.example` are dev (`http://localhost:3000/...`) — prod must use the
     real https domain.
   - **Client id/secret:** check `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` and
     `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` on the host. A rotated/expired
     secret breaks just that provider.
   - **Provider-side outage / app review state** (Facebook app in dev mode,
     Google consent screen unverified) can block real users — check the
     provider's console. **TODO:** link your Google Cloud Console + Facebook app.

4. **The `e2e` credentials provider should NEVER appear in prod.** It is
   double-gated (`AUTH_E2E=1` **and** non-production) and is only for Playwright.
   If you ever see e2e login working in production, treat it as a **security
   incident**: `AUTH_E2E` / `AUTH_E2E_ALLOW_PROD` have leaked into the prod env —
   remove them and redeploy immediately.

5. **Diagnose from logs:** auth errors are logged (with secrets/tokens redacted
   by the logger). Look for callback/JWT errors around the report time.

**Mitigate:** correct the env var (`AUTH_SECRET`, `AUTH_URL`, provider creds, or
redirect URI), redeploy. If a deploy introduced the breakage, rollback first,
then fix forward.

---

## Appendix: quick triage flow

```
Reports of breakage
   │
   ├─ curl /api/health  ──► no 200 ──► process/host down ──► check recent deploy ──► ROLLBACK if deploy-caused
   │                                                          else check logs/env (missing DATABASE_URL/AUTH_SECRET/S3_*)
   │
   └─ 200 OK ──► curl /api/ready
                    ├─ database:false ──► Database runbook
                    ├─ storage:false  ──► Object storage runbook
                    └─ both true ──► errors? ──► Sentry/logs ──► deploy-correlated? ──► ROLLBACK
                                                                 else dependency/auth runbook or hotfix forward
```

When in doubt, **roll the app back** (instant, DB-safe) to stop the bleeding,
then investigate. Open an incident per `INCIDENT-RESPONSE.md`.
