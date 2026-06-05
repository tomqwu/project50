# On-call Runbooks

Operational runbooks for diagnosing and recovering from common Project 50
failures. These are grounded in **this** app's actual architecture — read
alongside [`DEPLOY.md`](./DEPLOY.md) (deploy/rollback model) and
[`INCIDENT-RESPONSE.md`](./INCIDENT-RESPONSE.md) (process, severities, comms).
The full Azure deploy + Key Vault + scaling runbook is
[`infra/azure/README.md`](../infra/azure/README.md).

> Anything that depends on org-level setup (paging tool, status page, on-call
> rotation) is marked **TODO** below — fill these in once it exists. The host
> facts below are real (Azure Container Apps), and the runbooks are accurate to
> the code in this repo today.

## System at a glance

The app runs on **Azure** (Canada Central), deployed **locally** via `az login`
(no GitHub OIDC CD — see `DEPLOY.md`). Resource names: RG
`rg-project50-dev-canadacentral`, Container App `ca-project50-web-dev`, ACR
`acralztyhlgn6o`, Key Vault `kv-project50-dev-6z7n`, Postgres
`psql-project50-dev-zv34o5`.

| Component | What it is | Where |
| --- | --- | --- |
| **Web app** | Next.js app (App Router), the only deployed service | `apps/web` → **Azure Container Apps** `ca-project50-web-dev` (image pulled from ACR `acralztyhlgn6o`) |
| **Database** | **Azure Database for PostgreSQL Flexible Server** (B1ms) `psql-project50-dev-zv34o5`, accessed via **Prisma** as least-priv role `p50app` | `packages/db` (`schema.prisma`, migrations); app conn string in KV `database-url`, admin in KV `database-url-admin` |
| **Object storage** | **Azure Blob** (`media` container) via the app's **managed identity** (`uami-project50-dev`), SAS URLs — no account key | `apps/web/lib/storage.ts`; env `AZURE_STORAGE_ACCOUNT` / `AZURE_STORAGE_CONTAINER` (falls back to S3/MinIO locally) |
| **Secrets** | **Azure Key Vault** `kv-project50-dev-6z7n`, referenced by versionless URI; values set out of band | `infra/azure/README.md` § Key Vault |
| **Auth** | Auth.js (NextAuth v5): Google + Facebook OAuth, JWT sessions | `apps/web/auth.ts`, `apps/web/lib/auth-config.ts` |
| **Recap render** | Server-generated MP4s uploaded to object storage | `apps/web/lib/api/recap.ts` (+ `@project50/recap`) |
| **Logs** | Structured **JSON-per-line** to stdout/stderr → Container Apps Log Analytics workspace | `apps/web/lib/logger.ts` |
| **Error tracking** | Sentry, **opt-in** via `SENTRY_DSN` | `apps/web/sentry.*.config.ts`, `instrumentation.ts` |
| **CI** | GitHub Actions `ci.yml` (gate) + `release.yml` (CalVer tag per merge). `deploy.yml`/`preview.yml` are an **inert Vercel scaffold** — unused (see `DEPLOY.md`). | `.github/workflows/` |

> **Scaling is warm.** The Container App keeps **`min_replicas = 1`** (one
> replica always warm) and scales out to **`max_replicas = 4`** under HTTP
> concurrency — so there is **no cold start** on the first request after idle.
> Don't attribute a slow first request to cold start. (Details + the
> scale-to-zero opt-out: [`infra/azure/README.md`](../infra/azure/README.md)
> § Scaling.)

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
  - Log destination: the Container Apps **Log Analytics workspace** (stdout/stderr
    of `ca-project50-web-dev`). Query with
    `az containerapp logs show -g rg-project50-dev-canadacentral -n ca-project50-web-dev --follow`
    or `ContainerAppConsoleLogs_CL` in the LAW.
- **Errors:** Sentry, **only if `SENTRY_DSN` is set**. With no DSN the SDK never
  initializes (no events). If you have no Sentry events, first confirm the DSN
  is configured (KV / Container App env).
  - **TODO:** Sentry org/project URL.
- **Deploys:** there is **no CI/CD deploy** — deploys are run locally (`az login`)
  per `DEPLOY.md`. Inspect revisions:
  `az containerapp revision list -g rg-project50-dev-canadacentral -n ca-project50-web-dev -o table`
  (each deploy is a new revision; the active image carries the deployed commit
  sha as its tag). The in-app footer `ReleaseBadge` shows the live CalVer
  tag/sha/time.
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

3. **Check for a recent deploy.** Deploys are local + revision-based — list the
   Container App revisions
   (`az containerapp revision list -g rg-project50-dev-canadacentral -n ca-project50-web-dev -o table`).
   If the outage started right after a new revision went live → **Bad deploy /
   rollback** runbook (fastest path back to green).

4. **Read the logs** (JSON lines via `az containerapp logs show ... --follow`).
   Look for `"level":"error"` near the incident start, repeated stack traces, or
   boot errors (e.g. a missing required env / KV secret such as the KV
   `database-url`, `auth-secret`, or the `AZURE_STORAGE_*` refs). A replica that
   crash-loops on boot usually means a bad/missing Key Vault secret or env.

5. **Check Sentry** (if `SENTRY_DSN` set) for a spike and the top exception.

6. **Mitigate:**
   - Outage began after a deploy → **roll back** (shift traffic to the last-good
     Container App revision — see *Bad deploy / rollback* below).
   - A dependency is down → follow that dependency's runbook.
   - Boot failure on missing env → fix the host env var, redeploy.

**Escalate** to **SEV1** (see `INCIDENT-RESPONSE.md`) if the whole site is down
and not recovered within the SEV1 target.

---

## Runbook: Database unreachable / migration failures

**Symptoms:** `/api/ready` shows `database:false`; routes that read/write data
fail; logs show Prisma connection errors (e.g. `P1001` can't reach DB,
`P1002` timeout); a migration failing during a local deploy.

### A) Database unreachable at runtime

1. Confirm with readiness: `curl -sS https://<domain>/api/ready | jq` →
   `checks.database:false`.
2. **Check the database itself** — **Azure Postgres Flexible Server**
   `psql-project50-dev-zv34o5` (RG `rg-project50-dev-canadacentral`): is it up,
   at connection-limit (~35 on B1ms), out of disk, or in maintenance?
   ```bash
   az postgres flexible-server show -g rg-project50-dev-canadacentral \
     -n psql-project50-dev-zv34o5 --query '{state:state, version:version}'
   ```
   (Active-connections / CPU / storage alerts on this server are codified in
   `infra/azure/monitoring.tf` when `alert_email` is enabled.)
3. **Check the app connection string.** The running app reads its conn string
   from the **Key Vault** secret `database-url` (least-priv `p50app` role),
   referenced by the Container App by versionless URI — NOT from a host env var
   you set by hand. A rotated password, firewall rule, or stale (cached) secret
   ref is the usual cause; Container Apps caches versionless refs ~30 min, so
   roll a fresh revision after rotating (`infra/azure/README.md` § Key Vault).
   Postgres listens on 5432, SSL required.
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

### B) Migration failed during deploy

The deploy runs `prisma migrate deploy` (as the DB admin, admin URL read from
Key Vault) **before** the `terraform apply` switches the Container App image
(see `DEPLOY.md` and `infra/azure/README.md`). If a migration fails:

- You **stop the deploy** before the image switch — bad code never reaches
  production, and the currently-live revision keeps running on the old schema.
- **Recover:** identify the failing migration from the local `prisma migrate
  deploy` output, author a **corrected forward migration** (or fix the SQL), cut
  a new release, and re-run the deploy. `migrate deploy` is **forward-only** and
  idempotent — already-applied migrations are skipped.
- **Partially-applied migration** (failed mid-way, schema left inconsistent):
  this needs a human. Inspect with `prisma migrate status`, resolve the partial
  state, and ship a forward migration that brings the schema to a consistent
  state. There is **no automatic down-migration** in this project — never
  hand-edit `_prisma_migrations`; prefer a new forward migration.

> Write migrations **backward-compatible** (expand → migrate → contract) so the
> previous app version keeps working in the window between the migrate and the
> image switch, and so the app can always be rolled back (revision rollback)
> without a DB rollback.

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
2. **Check the storage backend.** In prod this is **Azure Blob** — the `media`
   container on the project's storage account, accessed by the app's **managed
   identity** (`uami-project50-dev`), no account key. Is the account up and the
   identity's role assignment intact? `apps/web/lib/storage.ts` selects Azure
   Blob when `AZURE_STORAGE_ACCOUNT` / `AZURE_STORAGE_CONTAINER` are set (wired
   from Key Vault); otherwise it falls back to S3/MinIO (local/CI).
3. **Check storage config** on the Container App: `AZURE_STORAGE_ACCOUNT`,
   `AZURE_STORAGE_CONTAINER`, and the managed-identity role assignment
   (Storage Blob Data Contributor). A revoked role or wrong account name is the
   most common cause. (See `infra/azure/README.md` § Object storage.)
4. **Container/bucket missing?** The app self-heals: it ensures the container
   exists on first use. If that fails, the identity likely lacks the data-plane
   role — fix the role assignment or pre-create the container.
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
   is **per-replica** — counters reset when a replica restarts and the effective
   limit scales with replica count. The Container App runs a warm baseline
   (`min_replicas=1`) and scales out to 4 under load, so a burst of `429`s right
   after a **scale-out** (more replicas → counters not shared) is expected
   behavior, not necessarily an incident.
5. **Mitigate:** roll back a bad deploy; or, if it's a dependency, follow that
   dependency's runbook; or hotfix forward if the cause is a clear, contained
   code bug.

---

## Runbook: Bad deploy / rollback

**Symptoms:** errors/outage began immediately after a deploy.

**Fastest recovery is almost always to roll the app back to the previous good
Container App revision, then investigate.**

### App rollback = Container App revision rollback (instant, does not touch the DB)

Every deploy creates a **new Container App revision**; the previous good revision
still exists. The rollback lever is to shift ingress traffic back to it (or
re-activate it) — there is **no Vercel "Promote"**, and no `terraform apply` is
needed to roll back.

```bash
RG=rg-project50-dev-canadacentral; APP=ca-project50-web-dev

# 1. List revisions, newest first; pick the last KNOWN-GOOD revision name.
az containerapp revision list -g "$RG" -n "$APP" \
  --query "reverse(sort_by([].{name:name, active:properties.active, created:properties.createdTime, image:properties.template.containers[0].image}, &created))" -o table

# 2. Shift 100% of ingress traffic to that revision (instant cutover).
az containerapp ingress traffic set -g "$RG" -n "$APP" \
  --revision-weight <last-good-revision>=100

# 3. If the good revision was scaled-in/deactivated, re-activate it first:
az containerapp revision activate  -g "$RG" -n "$APP" --revision <last-good-revision>
# (and, if needed, deactivate the bad one:)
az containerapp revision deactivate -g "$RG" -n "$APP" --revision <bad-revision>
```

- Confirm recovery: `curl -fsS https://www.project50.fit/api/health` and watch
  the error rate / Sentry settle.
- This does **not** run or revert migrations.
- Full revision/Key-Vault mechanics: [`infra/azure/README.md`](../infra/azure/README.md).

### Why rollback is safe here (forward-only migrations)

- The deploy runs `prisma migrate deploy` **before** switching the Container App
  image, and migrations are **forward-only** (no auto down-migration). Because
  migrations are written **backward-compatible** (expand → migrate → contract),
  the previous revision still runs against the newer schema — so re-pointing
  traffic to the last-good revision is safe even though the schema moved forward.
- **Do not** attempt to "roll back" the database to match an old app version.
  Roll the **revision** back; leave the schema as-is. If a schema change itself is
  the problem, fix it with a **new forward migration** shipped through the normal
  deploy (see Database runbook).

### Bad migration during deploy

- If the migration failed, you stopped before switching the image — prod is still
  on the old revision/schema (no rollback needed). Fix the migration forward, cut
  a new release, and re-deploy — see **Database → B) Migration failed during
  deploy**.

### After rollback

1. Open an incident if not already (see `INCIDENT-RESPONSE.md`).
2. Identify the offending change (compare the revisions' image sha tags / deploy
   SHAs).
3. Fix forward on a branch, let CI (`ci.yml`) go green, merge + cut a release,
   then redeploy (see `DEPLOY.md`).
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
   │                                                          else check logs/env (missing AUTH_SECRET / KV database-url / AZURE_STORAGE_* refs)
   │
   └─ 200 OK ──► curl /api/ready
                    ├─ database:false ──► Database runbook
                    ├─ storage:false  ──► Object storage runbook
                    └─ both true ──► errors? ──► Sentry/logs ──► deploy-correlated? ──► ROLLBACK
                                                                 else dependency/auth runbook or hotfix forward
```

When in doubt, **roll the app back** (instant, DB-safe) to stop the bleeding,
then investigate. Open an incident per `INCIDENT-RESPONSE.md`.
