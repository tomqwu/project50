# Secrets management & rotation policy

How Project 50 handles secrets and sensitive configuration across every
environment, and how to rotate each one. This is **grounded in the code in this
repo today** — every variable below is referenced by real application code (see
the file paths in each row). Read alongside [`DEPLOY.md`](./DEPLOY.md) (deploy
runbook), [`RUNBOOKS.md`](./RUNBOOKS.md) (on-call recovery), and
[`INCIDENT-RESPONSE.md`](./INCIDENT-RESPONSE.md) (process for a confirmed leak).

## The production secret store: Azure Key Vault

Production runs on **Azure Container Apps** (Canada Central). The production
secret store is **Azure Key Vault `kv-project50-dev-6z7n`** — the authoritative,
exhaustive description of the vault and its secrets is
[`infra/azure/README.md`](../infra/azure/README.md) (§ *Key Vault secrets — set
out of band, NOT in Terraform*); this section mirrors it. There is **no Vercel
and no AWS/GCP secret manager** in this stack.

**How the app reads secrets:** the Container App references each secret by its
**versionless Key Vault URI** (`${key_vault_uri}secrets/<name>`). The app's
managed identity (`uami-project50-dev`) holds *Key Vault Secrets User* and
resolves the references at revision start. Because the reference is versionless,
Container Apps **caches the resolved value (~30 min)** — after you change a
secret value you must **force a new revision** (below) for the app to pick it up.

**Secret VALUES are NOT in Terraform state.** Terraform declares only the
*references*, not the values, so no plaintext lands in `apps/project50.tfstate`.
You create and rotate the values **out of band** with `az keyvault secret set`
(runbook in [`infra/azure/README.md`](../infra/azure/README.md) §§ *Key Vault
secrets — create / rotate* and *Deploy runbook*). The only generated secret still
unavoidably in TF state is the Postgres server `administrator_password`
(`random_password.db_admin`) — see that README for why.

| Key Vault secret (`kv-project50-dev-6z7n`) | App env var | Purpose |
| --- | --- | --- |
| `database-url` | `DATABASE_URL` | App connection string (least-priv `p50app` Postgres role). |
| `database-url-admin` | _(deployer-only — never the running app)_ | Admin connection string for `prisma migrate deploy` + role bootstrap. |
| `auth-secret` | `AUTH_SECRET` | Auth.js JWT signing key (`openssl rand -base64 32`). |
| `metrics-token` | `METRICS_TOKEN` | Bearer token guarding `GET /api/metrics` (**until set, the route falls open** — see the `METRICS_TOKEN` row below). |
| `facebook-client-id` / `facebook-client-secret` | `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` | Facebook OAuth credentials. |

> **Set / rotate a value (out of band):**
>
> ```bash
> KV=kv-project50-dev-6z7n
> az keyvault secret set --vault-name "$KV" --name auth-secret \
>   --value "$(openssl rand -base64 32)"
> # then force a fresh revision so the app stops serving the cached value:
> az containerapp update -g rg-project50-dev-canadacentral -n ca-project50-web-dev \
>   --revision-suffix "rotate$(date +%Y%m%d%H%M)"
> ```
>
> Rotating `auth-secret` (and any value change) **forces a new Container App
> revision** — that revision roll is exactly how the new value takes effect (the
> versionless reference is cached otherwise). For `AUTH_SECRET` specifically,
> prefer the comma-separated **zero-downtime** flow below so live sessions are not
> invalidated.

**Local dev** still uses a plain, un-tracked `.env` (Docker Compose Postgres +
MinIO); **CI (GitHub Actions)** uses repository **Actions secrets** for the test
job. Neither uses Key Vault — only production/staging on Azure does.

The **`S3_*`** variables below are **dev / fallback only**: production media is
**Azure Blob** via the app's managed identity (no S3 key in prod). See the
`Core infrastructure` table note and [`OBJECT-STORAGE.md`](./OBJECT-STORAGE.md).

## Golden rules

1. **Never commit a real secret.** `.env*` is git-ignored (see `.gitignore`);
   `.env.example` holds only safe placeholders. Real values live only in the
   secret store (**Azure Key Vault** in prod) and in developers' local,
   un-tracked `.env`. **Secret values never go into Terraform state** — KV
   secrets are referenced by versionless URI and set out of band.
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
| **CI** | GitHub Actions: lint, typecheck, unit + e2e tests (no secrets beyond Actions secrets for the test job). |
| **staging** | A prod-like Azure environment (Container Apps + Key Vault), where one is stood up — same secret model as prod. |
| **prod** | Production: **Azure Container Apps**, secrets from **Azure Key Vault `kv-project50-dev-6z7n`** (referenced by versionless URI). Deploys run **locally** via `az login` (see [`infra/azure/README.md`](../infra/azure/README.md)) — **not** GitHub Actions CD. |

---

## Secret inventory

### Core infrastructure

| Variable | Purpose | Environments | Where stored | Rotation |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | Postgres connection string (incl. password) used by Prisma. `packages/db`, consumed app-wide. The app connects as the least-priv **`p50app`** role; the admin string lives separately in `database-url-admin` (migrations only). | dev, CI, staging, prod | **dev:** local `.env` (docker-compose creds). **CI:** GitHub Actions secret. **prod:** Key Vault secret **`database-url`** (referenced by versionless URI). | Rotate the `p50app` password (`infra/azure/sql/app-role.sql`), overwrite the **`database-url`** KV secret with the new connection string, then force a new revision. The deployer needs *Key Vault Secrets Officer* to write it. See [`infra/azure/README.md`](../infra/azure/README.md) (DB-credential rotation). Cadence: 90 days / on suspicion. |
| `DATABASE_URL` (admin) | The **`database-url-admin`** KV secret — admin Postgres connection string used **only** by the deployer for `prisma migrate deploy` + the `p50app` role bootstrap. **Never referenced by the running app.** | prod (deployer) | Key Vault secret **`database-url-admin`** (read at deploy time; not an app reference). | The admin password is only retrievable from the `db_admin_password` TF output (Azure never reveals it again); reassemble + re-set the secret per [`infra/azure/README.md`](../infra/azure/README.md). |
| `S3_ENDPOINT` | Object-storage endpoint. `apps/web/lib/storage.ts` (defaults to `http://localhost:9000` MinIO). **Dev/CI/fallback only** — prod uses Azure Blob, not S3 (see note ↓). | dev, CI | **dev/CI:** MinIO defaults. | Endpoint URL, not secret-sensitive on its own; change when migrating providers. |
| `S3_ACCESS_KEY` | S3/MinIO access key id. `apps/web/lib/storage.ts`. **Dev/MinIO fallback only — NOT set in prod.** | dev, CI | **dev/CI:** `minioadmin`. | Rotate as a **pair** with `S3_SECRET_KEY` if you run the S3/MinIO fallback in some non-prod environment. n/a for prod (Azure Blob uses managed identity, no key). |
| `S3_SECRET_KEY` | S3/MinIO secret key. `apps/web/lib/storage.ts`. **Dev/MinIO fallback only — NOT set in prod.** | dev, CI | **dev/CI:** `minioadmin`. | See `S3_ACCESS_KEY` (rotated together); n/a for prod. |
| `S3_BUCKET` | Bucket name. `apps/web/lib/storage.ts` (default `project50-media`). **Dev/fallback only.** | dev, CI | Plain config, not a secret. | n/a (rename = data migration). |
| `S3_PUBLIC_URL` | Public base URL for serving stored media; falls back to `S3_ENDPOINT`. **Dev/fallback only** — unused by the prod Azure Blob path (it serves via per-request SAS GET URLs). Drives `next.config.mjs` `images.remotePatterns` + the CSP when set. `apps/web/middleware.ts`. | dev (optional) | Plain env. | Plain config, not a secret. |
| `AZURE_STORAGE_ACCOUNT` / `AZURE_STORAGE_CONTAINER` | Select the **Azure Blob** backend in prod (`apps/web/lib/storage.ts`); wired from Terraform. Account is `stp50mediazv34o5`, a private container. | prod | Plain env, wired by `infra/azure/main.tf`. | Not secrets (no account key in prod — the app signs SAS with its **managed identity** user-delegation key). See [`OBJECT-STORAGE.md`](./OBJECT-STORAGE.md). |

### Authentication (Auth.js / NextAuth v5)

| Variable | Purpose | Environments | Where stored | Rotation |
| --- | --- | --- | --- | --- |
| `AUTH_SECRET` | Signs/verifies session JWTs. **Supports comma-separated rotation** — see `apps/web/lib/auth-config.ts` `parseAuthSecrets()`: the **first** value signs new tokens, **all** listed values verify, so an old secret can be retired without invalidating live sessions. Wired in `apps/web/auth.ts`. **Highly sensitive.** | dev, CI, staging, prod | **dev:** `.env` placeholder. **prod:** Key Vault secret **`auth-secret`** (versionless URI). | Zero-downtime flow — see [`AUTH_SECRET` rotation](#auth_secret-zero-downtime-rotation). **Any change forces a new Container App revision** (that revision roll is how the new value takes effect — the versionless KV reference is otherwise cached ~30 min). Cadence: 90 days / on suspicion. Generate with `openssl rand -base64 32`. |
| `AUTH_URL` | Canonical deployment URL Auth.js uses to build callback URLs. **Also gates secure cookies:** `shouldUseSecureCookies()` in `auth-config.ts` returns `true` only when `AUTH_URL` starts with `https://`, so it must be the real `https://…` origin in staging/prod (falls back to `NEXTAUTH_URL`). The prod canonical origin is **`https://www.project50.fit`** (the Terraform `auth_url` default), so a routine deploy needs no override. | staging, prod | Plain env (Terraform `auth_url` var; default `https://www.project50.fit`). | Not a secret — update on domain change. **Must be `https://` in prod** or session cookies won't be marked `Secure`. See [`DOMAIN-TLS.md`](./DOMAIN-TLS.md). |
| `AUTH_TRUST_HOST` | Tells Auth.js to trust the host header (needed behind a proxy / for non-canonical hosts). Set to `1` in `apps/web/playwright.config.ts` for e2e; set in prod only if the platform requires it. | CI (e2e); staging/prod if proxied | Plain env / Key Vault `kv-project50-dev-6z7n` (out-of-band, when the integration is enabled). | Not a secret. |
| `GOOGLE_CLIENT_ID` | Google OAuth client id. `apps/web/auth.ts`. Not secret on its own but pairs with the secret. | dev (optional), staging, prod | **dev:** optional in `.env`. **staging/prod:** Key Vault `kv-project50-dev-6z7n` (out-of-band, when the integration is enabled). | Rotate with `GOOGLE_CLIENT_SECRET` below. |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret. `apps/web/auth.ts`. **Highly sensitive.** | dev (optional), staging, prod | **dev:** optional in `.env`. **staging/prod:** Key Vault `kv-project50-dev-6z7n` (out-of-band, when the integration is enabled). | In Google Cloud Console → Credentials, add a **new** client secret, update the stored value, deploy, then delete the old secret (Google allows two concurrently). Cadence: 180 days / on suspicion. |
| `FACEBOOK_CLIENT_ID` | Facebook App ID (OAuth). `apps/web/auth.ts`. Also surfaced to mobile as `EXPO_PUBLIC_FACEBOOK_APP_ID` (public). | dev (optional), staging, prod | **dev:** optional in `.env`. **prod:** Key Vault secret **`facebook-client-id`** (versionless URI). | Rotate with `FACEBOOK_CLIENT_SECRET`. |
| `FACEBOOK_CLIENT_SECRET` | Facebook App Secret (OAuth + mobile code exchange). `apps/web/auth.ts`. **Highly sensitive.** | dev (optional), staging, prod | **dev:** optional in `.env`. **prod:** Key Vault secret **`facebook-client-secret`** (versionless URI). | In the Meta App Dashboard → Settings → Basic, reset the App Secret, set the new value with `az keyvault secret set`, force a new revision. Meta does not support overlap, so schedule a brief rotation window. Cadence: 180 days / on suspicion. |

### Error tracking (Sentry — opt-in)

Sentry is **disabled** unless a DSN is present: `apps/web/next.config.mjs` and the
`sentry.*.config.ts` files no-op when `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` are
blank, so dev/CI/e2e are unaffected with these unset.

| Variable | Purpose | Environments | Where stored | Rotation |
| --- | --- | --- | --- | --- |
| `SENTRY_DSN` | Server + edge ingest endpoint. Not exposed to the browser. `sentry.server.config.ts`, `sentry.edge.config.ts`. | staging, prod (optional) | Key Vault `kv-project50-dev-6z7n` (out-of-band, when the integration is enabled). | DSNs are low-sensitivity ingest keys, not credentials. Rotate by creating a new Sentry client key and replacing the value; revoke the old key. |
| `NEXT_PUBLIC_SENTRY_DSN` | Browser/client ingest endpoint. **Inlined into the JS bundle — public by design.** `instrumentation-client.ts`. | staging, prod (optional) | Key Vault `kv-project50-dev-6z7n` (out-of-band, when the integration is enabled) (build-time env). | Same as `SENTRY_DSN`; treat as public. |
| `SENTRY_AUTH_TOKEN` | **Build-time only** — authorizes source-map upload during the image build (`withSentryConfig`, `next.config.mjs`; upload disabled when unset). **Sensitive** (account/org scope). | CI / build only | The image is built with `az acr build` (see [`infra/azure/README.md`](../infra/azure/README.md)); pass this as a build-time secret/arg only when source-map upload is enabled. Not an app-runtime KV secret. | Create a new Sentry **internal integration / auth token**, replace it at the build source, then revoke the old token. **Never** ship to the runtime/browser. Cadence: 180 days / on suspicion. |
| `SENTRY_ORG`, `SENTRY_PROJECT` | Build-time org/project slugs for source-map upload. `next.config.mjs`. | CI/prod build only | Plain build env / Key Vault `kv-project50-dev-6z7n` (out-of-band, when the integration is enabled). | Not secrets. |

### Social publishing (optional — auto-share)

These enable server-side publishing to FB/IG/WeChat; when omitted the app uses
deep-link / web-share fallbacks. All are **page/long-lived access tokens** and
are **highly sensitive**.

| Variable | Purpose | Environments | Where stored | Rotation |
| --- | --- | --- | --- | --- |
| `FB_PAGE_ID` | Facebook Page id to publish to. | prod (optional) | Key Vault `kv-project50-dev-6z7n` (out-of-band, when the integration is enabled). | Not secret on its own. |
| `FB_PAGE_TOKEN` | Facebook Page access token. **Highly sensitive.** | prod (optional) | Key Vault `kv-project50-dev-6z7n` (out-of-band, when the integration is enabled). | Re-issue a long-lived Page token via the Graph API, update the store, deploy. Cadence: per Meta token expiry (≤ 60 days) / on suspicion. |
| `IG_USER_ID` | Instagram business account id. | prod (optional) | Key Vault `kv-project50-dev-6z7n` (out-of-band, when the integration is enabled). | Not secret on its own. |
| `IG_TOKEN` | Instagram Graph API access token. **Highly sensitive.** | prod (optional) | Key Vault `kv-project50-dev-6z7n` (out-of-band, when the integration is enabled). | Re-issue via the Graph API; cadence per token expiry / on suspicion. |
| `WECHAT_APP_ID` | WeChat app id (publishing integration). | prod (optional) | Key Vault `kv-project50-dev-6z7n` (out-of-band, when the integration is enabled). | Rotate the paired app secret in the WeChat console when that integration is finalized. |

### Observability (optional)

See [`OBSERVABILITY.md`](./OBSERVABILITY.md) for the metrics endpoint, dashboards
and uptime monitoring.

| Variable | Purpose | Environments | Where stored | Rotation |
| --- | --- | --- | --- | --- |
| `METRICS_TOKEN` | Bearer token guarding `GET /api/metrics` (`apps/web/app/api/metrics/route.ts`). **Unset → endpoint open** (only safe on a private network). **Set → callers must send `Authorization: Bearer ${METRICS_TOKEN}`** — required on any publicly reachable deployment, and on the Prometheus scrape config. | staging, prod (recommended) | **dev:** optional `.env`. **prod:** Key Vault secret **`metrics-token`** (versionless URI). On a fresh deploy it is show-or-created with a random value; **until it is set + a revision rolls, `/api/metrics` falls open on the prod ingress** (see [`infra/azure/README.md`](../infra/azure/README.md) SECURITY note). | Generate with `openssl rand -base64 32`; rotate the value + the Prometheus scrape credential together, then force a new revision. Intentional scrape-credential rotation is a deliberate step, **never** part of a routine deploy. Cadence: 180 days / on suspicion. |

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
| `AUTH_SECRET` (`auth-secret`), `DATABASE_URL` (`database-url`) | 90 days |
| OAuth secrets (`GOOGLE_CLIENT_SECRET`, `FACEBOOK_CLIENT_SECRET`/`facebook-client-secret`), `SENTRY_AUTH_TOKEN`, `METRICS_TOKEN` (`metrics-token`) | 180 days |
| Social tokens (`FB_PAGE_TOKEN`, `IG_TOKEN`) | Per provider expiry (≤ 60 days) |
| `S3_ACCESS_KEY`/`S3_SECRET_KEY` | dev/MinIO-fallback only — n/a in prod (Azure Blob uses managed identity, no key). |

**Standard rotation procedure**

1. Generate / provision the new value at the source (DB provider, OAuth console,
   Sentry, Meta Graph API).
2. Update the value in the **secret store** — for prod, `az keyvault secret set
   --vault-name kv-project50-dev-6z7n --name <secret> --value <new>` (writing a
   value needs *Key Vault Secrets Officer*). CI test secrets live in GitHub
   Actions secrets.
3. **Force a new Container App revision** so the app stops serving the cached
   (versionless) value: `az containerapp update -g rg-project50-dev-canadacentral
   -n ca-project50-web-dev --revision-suffix "rotate$(date +%Y%m%d%H%M)"`. Prefer
   the overlap flows above (`AUTH_SECRET` comma-list; second DB user; dual OAuth
   client secrets) so there is **no downtime**.
4. Verify with `/api/ready` (DB + storage) and a real OAuth login on the target
   environment — see [`RUNBOOKS.md`](./RUNBOOKS.md).
5. **Revoke** the old value at the source.
6. Record the rotation (date + who) wherever you track ops changes.

**On suspected exposure:** treat it as an incident — follow
[`INCIDENT-RESPONSE.md`](./INCIDENT-RESPONSE.md), rotate the affected secret
**immediately** (no overlap wait), and audit access logs.

> **Leaked plaintext in TF state history:** `database-url`, `database-url-admin`,
> and `auth-secret` were *previously* managed as `azurerm_key_vault_secret`
> resources, so their values exist in **prior versions** of the remote state blob
> (`apps/project50.tfstate`). After the one-time `state rm` migration, treat those
> three as exposed: **rotate each once** and **delete the old state blob
> versions/snapshots** that still hold the plaintext. Full procedure in
> [`infra/azure/README.md`](../infra/azure/README.md) § *One-time migration: stop
> Terraform tracking these secret values*.
