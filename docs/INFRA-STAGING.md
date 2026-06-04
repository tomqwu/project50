# Staging environment & Postgres connection pooling

Infrastructure-as-config for a **staging environment that mirrors production**
(issue **#22**) and a **managed Postgres + connection pooler** setup (issue
**#18**). Everything here is real, reviewable config + docs — the only thing
left is applying it with your cloud accounts, which is called out as **TODO**.

Read alongside [`DEPLOY.md`](./DEPLOY.md) (the CD pipeline + prod host),
[`SECRETS.md`](./SECRETS.md) (every secret's purpose/storage/rotation), and the
root [`docker-compose.yml`](../docker-compose.yml) (the dev stack this mirrors).

## What's in the box

| File | Purpose |
| --- | --- |
| [`../docker-compose.staging.yml`](../docker-compose.staging.yml) | The local staging stack: web + Postgres 16 + **PgBouncer** pooler + MinIO (S3). |
| [`../.env.staging.example`](../.env.staging.example) | Template for `.env.staging` (git-ignored secrets). |
| [`../infra/pgbouncer/pgbouncer.ini`](../infra/pgbouncer/pgbouncer.ini) | Reviewed, committed PgBouncer transaction-pool tuning (no secrets). |

## How it mirrors prod

Prod (per `DEPLOY.md`) is **Vercel** (Next.js web) + a **managed Postgres** +
**S3-compatible object storage**. Staging uses the *same four moving parts* and
the *same env contract* (`DATABASE_URL`, `AUTH_SECRET`, `S3_*`, `AUTH_URL`, …):

| Concern | Prod | Staging (cloud) | Staging (local stack, this repo) |
| --- | --- | --- | --- |
| Web app | Vercel (Next.js build) | Vercel preview / 2nd project | `node:20` container running `pnpm --filter @project50/web build && start` |
| Database | Managed Postgres | Managed Postgres (separate instance/branch) | `postgres:16` container |
| **Pooling** | Provider pooler / RDS Proxy | Provider pooler (Supabase/Neon) | **PgBouncer** container (transaction mode) |
| Object storage | S3 bucket | S3 bucket (separate) | MinIO container |
| Secrets | Vercel env / secret store | Vercel "Preview" env / secret store | `.env.staging` (git-ignored) |

The point of the local stack is to validate the **topology** (app → pooler →
Postgres, app → S3) before pointing the same app at managed cloud services.

---

## Option A — stand up staging locally (docker-compose)

```sh
cp .env.staging.example .env.staging
# edit .env.staging: set POSTGRES_PASSWORD, AUTH_SECRET, S3_SECRET_KEY, …
docker compose --env-file .env.staging -f docker-compose.staging.yml up --build
```

This brings up, in order (via healthchecks/`depends_on`):

1. **postgres** (`postgres:16`) — not published to the host; reachable only
   inside the compose network.
2. **pgbouncer** — transaction-mode pool on `:6432`, fronting Postgres.
3. **minio** + **minio-setup** — S3 storage and a one-shot that creates the
   `project50-media` bucket.
4. **web** — installs deps, `prisma generate`, **`prisma migrate deploy`**, then
   `next build` + `next start` on `http://localhost:3000`.

The web app connects to Postgres **only through PgBouncer** (`DATABASE_URL`
→ `:6432`). Migrations use the **direct** connection (`DIRECT_URL` → `:5432`).

> The committed config contains **no secrets**: `docker-compose.staging.yml` and
> `pgbouncer.ini` read everything from `.env.staging`, which is git-ignored.
> Add `/.env.staging` to `.gitignore` if your global ignore doesn't already
> cover `.env*` (this repo's `.gitignore` does — see `SECRETS.md` golden rules).

---

## Prisma + PgBouncer (issue #18)

### Why two URLs

A **transaction-mode** pooler (PgBouncer `pool_mode = transaction`, and the
hosted equivalents) hands a backend connection to a client only for the length
of a single transaction. That multiplexes thousands of short app/serverless
connections onto a tiny backend pool — but it **breaks** anything that relies on
session state, including **prepared statements** and Prisma **migrations**.

So we split the connection into two:

| Var | Points at | Used for | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | **PgBouncer** (`:6432`) | the running app (queries) | append `?pgbouncer=true` so Prisma disables prepared statements; `connection_limit` small. |
| `DIRECT_URL` | **Postgres** (`:5432`) | `prisma migrate deploy`, introspection | a normal session connection that bypasses the pooler. |

Example (local stack — full values in `.env.staging.example`):

```sh
DATABASE_URL="postgresql://project50:***@pgbouncer:6432/project50?pgbouncer=true&connection_limit=10"
DIRECT_URL="postgresql://project50:***@postgres:5432/project50"
```

### Required schema change — DOCUMENTED, NOT APPLIED

For Prisma to actually route migrations through `DIRECT_URL`, the datasource
block in `packages/db/prisma/schema.prisma` needs a `directUrl` field. **That
schema edit is out of scope for this infra change** and is left as a TODO. The
change is a one-liner:

```prisma
// packages/db/prisma/schema.prisma  — TODO (separate PR, not this change)
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")   // pooled (PgBouncer, transaction mode)
  directUrl = env("DIRECT_URL")     // ADD THIS — direct, for migrate deploy
}
```

**Until `directUrl` is added**, Prisma uses `DATABASE_URL` for everything,
including migrations — which fails through a transaction pooler. Workaround for
the meantime: run `prisma migrate deploy` with `DATABASE_URL` temporarily set to
the **direct** (`:5432`) value, then run the app with the pooled value. The
compose `web` service runs `migrate deploy` at startup; if you adopt the pooled
`DATABASE_URL` there before the schema gains `directUrl`, point that one command
at the direct connection.

> `DEPLOY.md`'s `migrate` job (issue #21) runs `prisma migrate deploy` against
> the `DATABASE_URL` GitHub secret. Once `directUrl` lands, set that secret to
> the **pooled** URL and add a `DIRECT_URL` secret for migrations — same split
> as here.

### Pool-size / connection-limit guidance

- **Postgres `max_connections`** defaults to 100. Everything below must leave
  headroom for admin + migration (direct) connections.
- **PgBouncer `default_pool_size = 20`** — backend connections per (user, db).
  This is the real load on Postgres. Rule of thumb: keep
  `default_pool_size × (number of distinct user/db pairs)` well under
  `max_connections`.
- **PgBouncer `max_client_conn = 200`** — how many app-side connections the
  pooler will accept. Can far exceed `default_pool_size` (that's the whole
  point of pooling). Raise it as the number of app instances grows.
- **Prisma `connection_limit` (in `DATABASE_URL`)** — the per-process Prisma
  client pool. Keep it **small** (e.g. 5–10); the pooler does the heavy lifting.
  Total app demand ≈ `instances × connection_limit`; size `max_client_conn`
  above that, and `default_pool_size` for the actual concurrent-transaction
  load.
- See `infra/pgbouncer/pgbouncer.ini` for the committed values and inline
  rationale for each.

---

## Option B — cloud staging (TODO: needs your accounts)

These steps mirror prod but target a **separate, isolated** staging environment.
Each is a **TODO** — they require provisioning with your cloud credentials.

1. **Managed Postgres + pooler** — **TODO.** Pick one and create a *staging*
   instance separate from prod:
   - **Supabase** — Project → Database → Connection string. Use the **Connection
     Pooling** endpoint (port `6543`, "Transaction" mode) for `DATABASE_URL`
     (append `?pgbouncer=true`), and the **direct** connection (port `5432`) for
     `DIRECT_URL`.
   - **Neon** — use the **pooled** host (the `-pooler` suffix) for
     `DATABASE_URL` and the unpooled host for `DIRECT_URL`. Pooling is PgBouncer
     in transaction mode under the hood.
   - **AWS RDS + PgBouncer / RDS Proxy** — point `DATABASE_URL` at the proxy/
     PgBouncer endpoint and `DIRECT_URL` at the RDS instance. If you self-host
     PgBouncer, reuse `infra/pgbouncer/pgbouncer.ini` as the starting config.
2. **Object storage** — **TODO.** Create a *staging* S3 bucket (AWS S3, Cloud­
   flare R2, Supabase Storage, …) and a scoped access-key pair. Set `S3_*`.
3. **Web host** — **TODO.** Either a second Vercel project (or Vercel's
   **Preview** environment, which `DEPLOY.md`/`preview.yml` already drive) with
   Root Directory `apps/web`, or run `docker-compose.staging.yml`'s `web`
   service shape on any container host. Set its env to the staging values.
4. **Secrets** — set every variable from `.env.staging.example` in the host's
   env / your secret store (see the "Where stored" column in `SECRETS.md`). The
   staging values are the **TODO: secret store** rows there.
5. **DNS / URLs** — point a `staging.` hostname at the web host and set
   `AUTH_URL` / `APP_BASE_URL` to that https origin (the https scheme gates
   Secure session cookies — see `SECRETS.md`). Register the staging redirect
   URIs in the OAuth apps.

### Secrets needed (cross-reference `SECRETS.md`)

Same contract as prod, scoped to staging. The sensitive ones:
`POSTGRES_PASSWORD` / `DATABASE_URL` / `DIRECT_URL`, `AUTH_SECRET`,
`S3_SECRET_KEY` (+ `S3_ACCESS_KEY`), and OAuth client secrets if enabled.
`NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` are **not** secrets. Never set the
`AUTH_E2E*` flags in a staging that faces real users. See `SECRETS.md` for
storage and rotation of each.

---

## Status

- ✅ Config + docs (this change): staging compose stack, PgBouncer pooler
  config, `.env.staging.example`, and this guide.
- ⬜ **TODO (your infra):** provision the cloud Postgres+pooler, object storage,
  and web host with your accounts; add the `directUrl` schema field (separate
  PR); populate the secret store.
