# Secrets management & rotation policy

How Project 50 handles secrets and sensitive configuration across every
environment, and how to rotate each one. This is **grounded in the code in this
repo today** — every variable below is referenced by real application code (see
the file paths in each row). Read alongside [`DEPLOY.md`](./DEPLOY.md) (CD
pipeline), [`RUNBOOKS.md`](./RUNBOOKS.md) (on-call recovery), and
[`INCIDENT-RESPONSE.md`](./INCIDENT-RESPONSE.md) (process for a confirmed leak).

> **TODO (your infra):** the actual secret **store** — where production/staging
> values physically live — depends on your hosting choice and is **not yet
> provisioned**. Everywhere you see **TODO: secret store** below, substitute
> your chosen manager once it exists. The expected layout, matching the CI/CD
> that already exists in `.github/workflows/`:
>
> - **CI (GitHub Actions):** repository/organization **Actions secrets**
>   (`secrets.*` in `ci.yml` / `deploy.yml` / `preview.yml`).
> - **Staging / Production (web app):** the **Vercel project's Environment
>   Variables** (default host per `DEPLOY.md`), scoped per environment
>   (Production / Preview / Development).
> - **Long-lived / shared secrets** (DB, OAuth apps): ideally a dedicated cloud
>   secret store (AWS Secrets Manager / GCP Secret Manager / Vault), with
>   Vercel/Actions reading from it. **TODO** until that store is chosen.

## Golden rules

1. **Never commit a real secret.** `.env*` is git-ignored (see `.gitignore`);
   `.env.example` holds only safe placeholders. Real values live only in the
   secret store and in developers' local, un-tracked `.env`.
2. **`NEXT_PUBLIC_*` and `EXPO_PUBLIC_*` are NOT secrets.** They are inlined into
   the client/mobile bundle at build time and are world-readable. Never put a
   value you care about behind those prefixes.
3. **Least exposure.** A secret is set only in the environments that actually
   need it (see the "Environments" column). In particular, the test-only
   `AUTH_E2E*` flags are **NEVER** set in production.
4. **Rotate on a schedule and on suspicion.** Routine cadence is in the
   [rotation runbook](#rotation-runbook); any suspected exposure triggers an
   immediate rotation via [`INCIDENT-RESPONSE.md`](./INCIDENT-RESPONSE.md).

## Environment legend

| Tag | Meaning |
| --- | --- |
| **dev** | A developer's machine (`.env`, Docker Compose Postgres + MinIO). |
| **CI** | GitHub Actions (`ci.yml`): lint, typecheck, unit + e2e tests. |
| **staging** | Preview deploys (`preview.yml`) — per-PR / pre-prod. |
| **prod** | Production deploy (`deploy.yml`). |

---

## Secret inventory

### Core infrastructure

| Variable | Purpose | Environments | Where stored | Rotation |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | Postgres connection string (incl. password) used by Prisma. `packages/db`, consumed app-wide. Also a CI secret (`secrets.DATABASE_URL` in workflows). | dev, CI, staging, prod | **dev:** local `.env` (docker-compose creds). **CI:** GitHub Actions secret. **staging/prod:** **TODO: secret store** (Vercel env / cloud secret manager; managed DB provider's connection string). | Rotate the DB user's password in the provider, then update the stored `DATABASE_URL` and redeploy. Use a **second DB user** for zero-downtime: create new user → update secret → deploy → drop old user. Cadence: 90 days / on suspicion. |
| `S3_ENDPOINT` | Object-storage endpoint. `apps/web/lib/storage.ts` (defaults to `http://localhost:9000` MinIO). | dev, CI, staging, prod | **dev/CI:** MinIO defaults. **staging/prod:** **TODO: secret store**. | Endpoint URL, not secret-sensitive on its own; change when migrating providers. |
| `S3_ACCESS_KEY` | S3/MinIO access key id. `apps/web/lib/storage.ts`. | dev, CI, staging, prod | **dev/CI:** `minioadmin`. **staging/prod:** **TODO: secret store**. | Rotate as a **pair** with `S3_SECRET_KEY`: provision a new key pair in the storage provider, update both secrets, deploy, then revoke the old pair. Cadence: 90 days / on suspicion. |
| `S3_SECRET_KEY` | S3/MinIO secret key. `apps/web/lib/storage.ts`. **Highly sensitive.** | dev, CI, staging, prod | **dev/CI:** `minioadmin`. **staging/prod:** **TODO: secret store**. | See `S3_ACCESS_KEY` (rotated together). |
| `S3_BUCKET` | Bucket name. `apps/web/lib/storage.ts` (default `project50-media`). | dev, CI, staging, prod | Plain config, not a secret. **TODO: secret store** for prod value if non-default. | n/a (rename = data migration, not rotation). |
| `S3_PUBLIC_URL` | Public base URL for serving stored media; falls back to `S3_ENDPOINT`. `apps/web/middleware.ts`. | staging, prod (optional) | **TODO: secret store** (or plain env). | Plain config, not a secret. |

### Authentication (Auth.js / NextAuth v5)

| Variable | Purpose | Environments | Where stored | Rotation |
| --- | --- | --- | --- | --- |
| `AUTH_SECRET` | Signs/verifies session JWTs. **Supports comma-separated rotation** — see `apps/web/lib/auth-config.ts` `parseAuthSecrets()`: the **first** value signs new tokens, **all** listed values verify, so an old secret can be retired without invalidating live sessions. Wired in `apps/web/auth.ts`. **Highly sensitive.** | dev, CI, staging, prod | **dev:** `.env` placeholder. **staging/prod:** **TODO: secret store**. | Zero-downtime flow — see [`AUTH_SECRET` rotation](#auth_secret-zero-downtime-rotation). Cadence: 90 days / on suspicion. Generate with `openssl rand -base64 32`. |
| `AUTH_URL` | Canonical deployment URL Auth.js uses to build callback URLs. **Also gates secure cookies:** `shouldUseSecureCookies()` in `auth-config.ts` returns `true` only when `AUTH_URL` starts with `https://`, so it must be the real `https://…` origin in staging/prod (falls back to `NEXTAUTH_URL`). | staging, prod | **TODO: secret store** (or plain env). | Not a secret — update on domain change. **Must be `https://` in prod** or session cookies won't be marked `Secure`. |
| `AUTH_TRUST_HOST` | Tells Auth.js to trust the host header (needed behind a proxy / for non-canonical hosts). Set to `1` in `apps/web/playwright.config.ts` for e2e; set in prod only if the platform requires it. | CI (e2e); staging/prod if proxied | Plain env / **TODO: secret store**. | Not a secret. |
| `GOOGLE_CLIENT_ID` | Google OAuth client id. `apps/web/auth.ts`. Not secret on its own but pairs with the secret. | dev (optional), staging, prod | **dev:** optional in `.env`. **staging/prod:** **TODO: secret store**. | Rotate with `GOOGLE_CLIENT_SECRET` below. |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret. `apps/web/auth.ts`. **Highly sensitive.** | dev (optional), staging, prod | **dev:** optional in `.env`. **staging/prod:** **TODO: secret store**. | In Google Cloud Console → Credentials, add a **new** client secret, update the stored value, deploy, then delete the old secret (Google allows two concurrently). Cadence: 180 days / on suspicion. |
| `FACEBOOK_CLIENT_ID` | Facebook App ID (OAuth). `apps/web/auth.ts`. Also surfaced to mobile as `EXPO_PUBLIC_FACEBOOK_APP_ID` (public). | dev (optional), staging, prod | **TODO: secret store**. | Rotate with `FACEBOOK_CLIENT_SECRET`. |
| `FACEBOOK_CLIENT_SECRET` | Facebook App Secret (OAuth + mobile code exchange). `apps/web/auth.ts`. **Highly sensitive.** | dev (optional), staging, prod | **dev:** optional in `.env`. **staging/prod:** **TODO: secret store**. | In the Meta App Dashboard → Settings → Basic, reset the App Secret, update the store, deploy. Meta does not support overlap, so schedule a brief rotation window. Cadence: 180 days / on suspicion. |

### Error tracking (Sentry — opt-in)

Sentry is **disabled** unless a DSN is present: `apps/web/next.config.mjs` and the
`sentry.*.config.ts` files no-op when `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` are
blank, so dev/CI/e2e are unaffected with these unset.

| Variable | Purpose | Environments | Where stored | Rotation |
| --- | --- | --- | --- | --- |
| `SENTRY_DSN` | Server + edge ingest endpoint. Not exposed to the browser. `sentry.server.config.ts`, `sentry.edge.config.ts`. | staging, prod (optional) | **TODO: secret store**. | DSNs are low-sensitivity ingest keys, not credentials. Rotate by creating a new Sentry client key and replacing the value; revoke the old key. |
| `NEXT_PUBLIC_SENTRY_DSN` | Browser/client ingest endpoint. **Inlined into the JS bundle — public by design.** `instrumentation-client.ts`. | staging, prod (optional) | **TODO: secret store** (build-time env). | Same as `SENTRY_DSN`; treat as public. |
| `SENTRY_AUTH_TOKEN` | **Build-time only** — authorizes source-map upload during `next build` (`withSentryConfig`, `next.config.mjs`; upload disabled when unset). **Sensitive** (account/org scope). | CI/prod build only | **TODO: secret store** (GitHub Actions / Vercel build env). | Create a new Sentry **internal integration / auth token**, replace the CI secret, then revoke the old token. **Never** ship to the runtime/browser. Cadence: 180 days / on suspicion. |
| `SENTRY_ORG`, `SENTRY_PROJECT` | Build-time org/project slugs for source-map upload. `next.config.mjs`. | CI/prod build only | Plain build env / **TODO: secret store**. | Not secrets. |

### Social publishing (optional — auto-share)

These enable server-side publishing to FB/IG/WeChat; when omitted the app uses
deep-link / web-share fallbacks. All are **page/long-lived access tokens** and
are **highly sensitive**.

| Variable | Purpose | Environments | Where stored | Rotation |
| --- | --- | --- | --- | --- |
| `FB_PAGE_ID` | Facebook Page id to publish to. | prod (optional) | **TODO: secret store**. | Not secret on its own. |
| `FB_PAGE_TOKEN` | Facebook Page access token. **Highly sensitive.** | prod (optional) | **TODO: secret store**. | Re-issue a long-lived Page token via the Graph API, update the store, deploy. Cadence: per Meta token expiry (≤ 60 days) / on suspicion. |
| `IG_USER_ID` | Instagram business account id. | prod (optional) | **TODO: secret store**. | Not secret on its own. |
| `IG_TOKEN` | Instagram Graph API access token. **Highly sensitive.** | prod (optional) | **TODO: secret store**. | Re-issue via the Graph API; cadence per token expiry / on suspicion. |
| `WECHAT_APP_ID` | WeChat app id (publishing integration). | prod (optional) | **TODO: secret store**. | Rotate the paired app secret in the WeChat console when that integration is finalized. |

### Observability (optional)

See [`OBSERVABILITY.md`](./OBSERVABILITY.md) for the metrics endpoint, dashboards
and uptime monitoring.

| Variable | Purpose | Environments | Where stored | Rotation |
| --- | --- | --- | --- | --- |
| `METRICS_TOKEN` | Bearer token guarding `GET /api/metrics` (`apps/web/app/api/metrics/route.ts`). **Unset → endpoint open** (only safe on a private network). **Set → callers must send `Authorization: Bearer ${METRICS_TOKEN}`** — required on any publicly reachable deployment, and on the Prometheus scrape config. | staging, prod (recommended) | **dev:** optional `.env`. **staging/prod:** **TODO: secret store** (also the scraper's secret). | Generate with `openssl rand -base64 32`; rotate the value + the Prometheus scrape credential together. Cadence: 180 days / on suspicion. |

### Test-only flags — NEVER set in production

| Variable | Purpose | Environments | Where stored | Notes |
| --- | --- | --- | --- | --- |
| `AUTH_E2E` | Enables the gated demo/test-login path. `shouldRegisterE2eProvider()` (`apps/web/lib/auth-config.ts`, used by `auth.ts`) activates it **only** when `AUTH_E2E === "1"`. | dev, CI (e2e) **only** | `.env` (dev), Playwright web-server env (CI). | **NEVER set in prod.** This is the primary gate that exposes a passwordless test login. |
| `AUTH_E2E_ALLOW_PROD` | Single documented escape hatch re-enabling the e2e login when the e2e server runs `next start` with `NODE_ENV=production` over http. **Production safety guard (#277):** in production the test login registers **only** when `AUTH_E2E_ALLOW_PROD === "1"` exactly; unset/blank → silently refused even if `AUTH_E2E=1` leaks; any **other** value (e.g. `"true"`, `"yes"`) → the app **throws a startup error** rather than guess intent. | CI (e2e) **only** | Playwright web-server env. | **NEVER set in prod.** With `AUTH_E2E` unset (gate 1), this is moot, but do not set it regardless. |
| `RECAP_FAKE` | Dev/CI flag to stub recap MP4 rendering. | dev, CI | `.env`, CI env. | Not a secret; do not set in prod. |

### Non-secret runtime config (for completeness)

These are referenced by code but are **not secrets**: `NODE_ENV`, `NEXT_RUNTIME`
(framework-set); `APP_BASE_URL` (`apps/web/lib/base-url.ts`); `NEXTAUTH_URL`
(legacy alias for `AUTH_URL`); `LOG_LEVEL` (`apps/web/lib/logger.ts`);
`SENTRY_ENVIRONMENT` / `SENTRY_DEBUG` / `SENTRY_TRACES_SAMPLE_RATE` and their
`NEXT_PUBLIC_*` twins; mobile `EXPO_PUBLIC_FACEBOOK_APP_ID` /
`EXPO_PUBLIC_API_BASE_URL` (inlined into the Expo bundle — **never put a secret
behind `EXPO_PUBLIC_`**).

---

## `AUTH_SECRET` zero-downtime rotation

`parseAuthSecrets()` (`apps/web/lib/auth-config.ts`) accepts a **comma-separated**
list: index 0 signs new tokens, every entry verifies existing ones. This lets you
roll the secret without logging anyone out.

1. **Generate** a new secret: `openssl rand -base64 32`.
2. **Prepend** it to the list, keeping the current one second:
   `AUTH_SECRET="<new>,<current>"`. Update the value in the secret store.
3. **Deploy.** New sessions are now signed with `<new>`; sessions signed with
   `<current>` still verify, so no one is logged out.
4. **Wait** past the session lifetime so old tokens age out — `SESSION_MAX_AGE`
   is **30 days** (`SESSION_MAX_AGE_SECONDS` in `auth-config.ts`). After 30 days
   no live session relies on `<current>`.
5. **Remove** the old secret: `AUTH_SECRET="<new>"`. Update the store and deploy.

> On a **confirmed leak**, skip the wait: set `AUTH_SECRET="<new>"` alone and
> deploy immediately. This invalidates all existing sessions (forces re-login) —
> the correct trade-off for a compromised signing key.

---

## Rotation runbook

**Routine cadence**

| Secret class | Cadence |
| --- | --- |
| `AUTH_SECRET`, `DATABASE_URL`, `S3_ACCESS_KEY`/`S3_SECRET_KEY` | 90 days |
| OAuth secrets (`GOOGLE_CLIENT_SECRET`, `FACEBOOK_CLIENT_SECRET`), `SENTRY_AUTH_TOKEN` | 180 days |
| Social tokens (`FB_PAGE_TOKEN`, `IG_TOKEN`) | Per provider expiry (≤ 60 days) |

**Standard rotation procedure**

1. Generate / provision the new value at the source (DB provider, OAuth console,
   storage provider, Sentry, Meta Graph API).
2. Update the value in the **secret store** (**TODO: secret store** — GitHub
   Actions secrets and/or the Vercel env for the right environment scope).
3. Deploy (`deploy.yml` for prod, `preview.yml` for staging). Prefer the
   overlap/two-value flows above (`AUTH_SECRET` comma-list; second DB user; dual
   OAuth client secrets; dual S3 key pairs) so there is **no downtime**.
4. Verify with `/api/ready` (DB + storage) and a real OAuth login on the target
   environment — see [`RUNBOOKS.md`](./RUNBOOKS.md).
5. **Revoke** the old value at the source.
6. Record the rotation (date + who) wherever you track ops changes.

**On suspected exposure:** treat it as an incident — follow
[`INCIDENT-RESPONSE.md`](./INCIDENT-RESPONSE.md), rotate the affected secret
**immediately** (no overlap wait), and audit access logs.

> **TODO (your infra):** once the secret store is provisioned, replace every
> **TODO: secret store** marker above with the concrete location (e.g. "Vercel →
> project → Settings → Environment Variables → Production"), and wire automated
> rotation reminders where the store supports them.
