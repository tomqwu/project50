# Backups & tested restore

How Project 50 backs up its stateful systems on **Azure** — and, critically, how
we **verify** the Postgres backup actually restores. A backup you have never
restored is a hypothesis, not a backup.

Live infra (see [`infra/azure/README.md`](../infra/azure/README.md)): the app
runs on **Azure Container Apps** in `rg-project50-dev-canadacentral` with
**Postgres Flexible Server** (`psql-project50-dev-zv34o5`) and **Blob storage**
(`stp50mediazv34o5`). Admin DB creds live only in the Key Vault secret
`database-url-admin` (vault `kv-project50-dev-6z7n`).

Read alongside [`OBJECT-STORAGE.md`](./OBJECT-STORAGE.md) (media storage),
[`RUNBOOKS.md`](./RUNBOOKS.md) (recovery), [`DEPLOY.md`](./DEPLOY.md) and
[`infra/azure/README.md`](../infra/azure/README.md) (deploy/secrets) and
[`SECRETS.md`](./SECRETS.md).

> **Honest status — automated vs manual.** The **backup workflow + scripts are
> real and runnable** the moment the secrets exist (they are env-gated/inert
> until then, so nothing fakes a backup). What still needs the operator: (1)
> creating the backup **storage account/container**, (2) adding the **repo
> secrets** (or running locally with `az login`), and (3) running the **first
> backup and the restore drill** by hand to confirm. Everything marked **TODO**
> below is an Azure-account step we cannot do from this repo.

## What we back up

| System | What | Tool | Where it goes |
| --- | --- | --- | --- |
| **Postgres** | Full logical dump (schema + data) | `pg_dump -Fc \| gzip` (via `postgres:16` docker) | Azure Blob container `db-backups` |
| **Object storage (media)** | User media (photos, recap MP4s) | server-side Blob mirror (`az storage blob copy`) | backup container `media-backup` |
| **Restore drill** | Restore a dump into a THROWAWAY DB + sanity-check | `pg_restore` + checks | local docker Postgres (no prod touch) |

Scripts:

- [`scripts/pg-backup.sh`](../scripts/pg-backup.sh) — Azure-native Postgres dump
  → Blob, with retention. Powers the `pg-backup` job and a local `az login` run.
- [`scripts/media-sync.sh`](../scripts/media-sync.sh) — Azure-native media Blob
  mirror → backup container. Powers the `media-sync` job and a local run.
- [`scripts/pg-restore-drill.sh`](../scripts/pg-restore-drill.sh) — the **tested
  restore**: restore the latest backup into a throwaway DB, verify, tear down.
- [`scripts/backup/`](../scripts/backup/) — portable S3/MinIO variants of the
  dump/restore/media-sync (for non-Azure / generic hosts). The Azure deployment
  uses the Azure-native scripts above.

Everything else is **rebuildable from source** and needs no backup: app code
(git), infra config (this repo), and secrets (held in Key Vault — back up the
vault per Azure's soft-delete/purge-protection, separately; see `SECRETS.md`).

## Strategy

### Frequency

| What | Cadence | Mechanism |
| --- | --- | --- |
| Postgres dump | **Daily** (03:17 UTC) | [`.github/workflows/backup.yml`](../.github/workflows/backup.yml) `schedule`, or a local cron — see [Scheduling](#scheduling) |
| Media mirror | **Daily** (same run) | `backup.yml` `media-sync` job → [`scripts/media-sync.sh`](../scripts/media-sync.sh) (see [Media](#media-backup--restore)) |
| Restore **drill** | **Quarterly** + after any backup/schema-tooling change | [`scripts/pg-restore-drill.sh`](../scripts/pg-restore-drill.sh) — see [Restore drill](#tested-restore-drill) |

> Daily logical dump is the baseline. Azure Flexible Server **also** runs its own
> automated backups with **point-in-time restore (PITR)** within its retention
> window (default 7 days) — that is the first line of defence for an
> oops-recovery. Our logical dump is the **independent, offsite, app-controlled**
> copy that survives the server/subscription itself. Both layers matter.

### Retention

| Tier | Where | Retention | Enforced by |
| --- | --- | --- | --- |
| Local working copy | backup host `./backups` | `BACKUP_RETENTION_DAYS` (default **14**) | `pg-backup.sh` prune step |
| Offsite, Blob | `db-backups` container | `BACKUP_RETENTION_DAYS` (default **14 daily**) | `pg-backup.sh` blob prune (by timestamped name) |
| Azure PITR | Flexible Server | provider window (default **7 days**) | Azure-managed (separate from our dumps) |

> **Hardening (TODO, Azure-account steps):** the script prunes the offsite blobs
> by date, which is convenient but means the backup identity can delete history.
> For a stronger guarantee, layer an Azure **lifecycle-management policy** to
> expire/tier old blobs and/or **immutability (time-based retention / legal
> hold)** on the container so a compromised identity cannot erase recent
> backups. Enable **blob versioning + soft-delete on the BACKUP account** (note:
> the *media* account deliberately keeps soft-delete OFF for GDPR hard-erase —
> these are different accounts; see `infra/azure/README.md`).

### Isolation & encryption

- Put the backup container on a **separate storage account** from the media
  account (ideally a different region) so one account compromise/outage can't
  take out both live data and its backup. **TODO:** create
  `stp50backups<suffix>` + the `db-backups` container.
- **In transit:** all uploads use TLS (Azure Blob HTTPS).
- **At rest:** Azure Storage is encrypted at rest by default (SSE). The dump
  contains user PII, so keep the backup account private (no anonymous access);
  consider a customer-managed key.
- The connection string + storage access are **secrets** (Key Vault / GitHub
  Actions secrets) — never in the repo. The backup uses `--auth-mode login`
  (managed identity / federated identity), not an account key.

## RPO / RTO targets

> Placeholders — agree real numbers with the business once SLAs are set.

| Metric | Target (placeholder) | Notes |
| --- | --- | --- |
| **RPO** (max data loss) | **24h** from our logical dump; **~minutes** from Azure PITR | The daily dump bounds worst case if PITR is unavailable. |
| **RTO** (time to restore) | **≤ 2h** | dominated by dump size + `pg_restore` + role/secret + revision roll. The drill prints the actual restore wall-clock to validate this. |
| Restore-drill cadence | **Quarterly** | proves RTO is achievable, not theoretical. |

## Running a backup

### Locally (operator, `az login`)

```bash
az login
BACKUP_STORAGE_ACCOUNT=stp50backups<suffix> \
  ./scripts/pg-backup.sh
# reads database-url-admin from Key Vault (kv-project50-dev-6z7n) by default,
# dumps via the postgres:16 docker image, uploads to the db-backups container,
# and prunes blobs older than BACKUP_RETENTION_DAYS (14).
```

Deliberate override (skip Key Vault) — use the **dedicated `BACKUP_DATABASE_URL`**
var, which **must be the prod ADMIN connection**. The script **ignores the
ambient `DATABASE_URL`** on purpose, so running from a shell that has the
app/pooler `p50app` `DATABASE_URL` exported can't dump the wrong connection:

```bash
BACKUP_DATABASE_URL="postgresql://<admin>:<pw>@psql-project50-dev-zv34o5.postgres.database.azure.com:5432/project50?sslmode=require" \
BACKUP_STORAGE_ACCOUNT=stp50backups<suffix> \
  ./scripts/pg-backup.sh
```

Local dump only (no upload) — omit `BACKUP_STORAGE_ACCOUNT`:

```bash
BACKUP_DATABASE_URL="...ADMIN url..." ./scripts/pg-backup.sh   # writes ./backups/*.dump.gz
```

> By default (no `BACKUP_DATABASE_URL`) the script reads `database-url-admin` from
> Key Vault — the source of truth for both the local path and CI. The override is
> a deliberate opt-in via the dedicated var; the ambient `DATABASE_URL` is never
> used for backups.

### In CI (`backup.yml`)

Daily + on demand from the Actions tab. **Inert until secrets are set** (like
`deploy.yml`): a `preflight` job gates the backup, so on a fork / before setup it
is **skipped, not failed**, and CI stays green.

> **CI requires Azure login, and the dump connection always comes from Key
> Vault.** The Blob upload runs `az storage blob upload --auth-mode login`, which
> needs an authenticated `az` on the runner — so the workflow **always** uses
> `azure/login` (federated OIDC) and the gate **requires the OIDC creds + the
> storage account**. The scheduled backup reads the prod **admin** connection
> from the `database-url-admin` Key Vault secret — the single source of truth —
> and **never** uses the shared `DATABASE_URL` repo secret (that's the
> app/pooler `p50app` connection, the wrong role/host for `pg_dump`). No DB conn
> string is passed into CI at all; the federated login already grants KV access.

Required secrets (ALL of these — the gate requires the full Azure-login set plus
the storage account, else the job stays inert/skipped):

| Secret | Purpose |
| --- | --- |
| `AZURE_CLIENT_ID` / `AZURE_TENANT_ID` / `AZURE_SUBSCRIPTION_ID` | Federated (OIDC) login — **required** (used by both the `pg-backup` and `media-sync` jobs). The app registration needs **Key Vault Secrets User** on `kv-project50-dev-6z7n`, **Storage Blob Data Contributor** on the backup account, and **Storage Blob Data Reader** on the live media account (for the media mirror). |
| `BACKUP_STORAGE_ACCOUNT` | Backup storage account (e.g. `stp50backups<suffix>`) — **required**; holds both the DB dumps and the media mirror. |
| `BACKUP_CONTAINER` | (optional) DB-dump container name; default `db-backups`. |
| `KEY_VAULT_NAME` | (optional) override; default `kv-project50-dev-6z7n`. |
| `BACKUP_RETENTION_DAYS` | (optional) daily dumps to keep; default `14`. |
| `MEDIA_SRC_ACCOUNT` / `MEDIA_SRC_CONTAINER` | (optional) live media account/container to mirror; default `stp50mediazv34o5` / `media`. |
| `MEDIA_BACKUP_CONTAINER` | (optional) backup container for the media mirror; default `media-backup`. |

> **No `DATABASE_URL` in CI** — deliberately. The admin URL comes from Key Vault.
> The script's `BACKUP_DATABASE_URL` override is for the local-operator path only;
> the ambient `DATABASE_URL` is never used for backups.

> **Least privilege:** the backup identity needs only **read** on the Key Vault
> secret + **read on the DB** (the admin string is used read-only for `pg_dump`)
> + **read on the live media** container, and **write** on the backup account —
> and, for DB-dump retention, delete on the `db-backups` container only. Never
> delete on the source DB or the live media account.

## Tested restore drill

**Goal:** prove a backup restores into a clean, throwaway database and that the
restored data is structurally sound. Run **quarterly** and after any change to
the schema-migration or backup tooling. This is a **drill**, not recovery — it
never touches prod.

[`scripts/pg-restore-drill.sh`](../scripts/pg-restore-drill.sh):

1. Obtains a dump — a local `--dump PATH`, or (default) downloads the **latest**
   blob from `$BACKUP_STORAGE_ACCOUNT/$BACKUP_CONTAINER`.
2. Stands up a **throwaway local Postgres** in docker (no cloud access needed)
   — or targets a `--scratch-url` you pass (with a guard that **refuses** to use
   `DATABASE_URL`).
3. Restores into a disposable DB (`project50_restore_test`), **timing** the
   restore (validates the RTO target).
4. **Sanity checks:** `_prisma_migrations` is present and non-empty, the core
   `User` table exists (extend via `EXPECTED_TABLES`), and prints per-table row
   counts so an unexpectedly-empty restore is obvious.
5. **Tears down** the throwaway DB/container (unless `--keep`).

Exit is **non-zero if the restore or any check fails** — a failed drill is an
incident-class finding; fix the backup tooling before the next cycle.

### Run it

```bash
# Drill the latest offsite backup (operator with az + docker):
az login
BACKUP_STORAGE_ACCOUNT=stp50backups<suffix> BACKUP_CONTAINER=db-backups \
  ./scripts/pg-restore-drill.sh

# Or drill a specific local dump (no Azure needed at all):
./scripts/pg-restore-drill.sh --dump ./backups/project50-20260605T031700Z.dump.gz
```

Record the result (date, dump tested, pass/fail, restore wall-clock) wherever ops
changes are tracked. The wall-clock validates the **RTO** target above.

### Deeper checks (optional, manual)

Beyond the script's automated checks, for a thorough quarterly drill also verify
the restored schema matches the code's migrations and the app boots against it:

```bash
SCRATCH="postgresql://postgres:drill@127.0.0.1:5432/project50_restore_test"  # from a --keep run

# Restored schema is at the migration head the app expects (no drift):
DATABASE_URL="$SCRATCH" pnpm --filter @project50/db exec prisma migrate status
# -> expect "Database schema is up to date!"

# App-level smoke: point a local app at the scratch DB and hit readiness:
DATABASE_URL="$SCRATCH" pnpm --filter @project50/web dev &
curl -sS http://localhost:3000/api/ready | jq   # expect database:true
```

> **TODO (automate the drill):** a `schedule: cron` Actions job can run the drill
> quarterly against the latest blob and fail (alert) on a bad restore. Kept
> manual here to stay inert without infra and because it needs `az` + docker.

## Restoring for real (incident recovery)

> **This DROPs/recreates objects in the target. For prod recovery only.** Prefer
> **Azure PITR** (`az postgres flexible-server restore`) for an oops-recovery
> within the provider window — it's faster and needs no dump. Use the logical
> dump when PITR can't reach far enough back or the server/subscription is gone.

```bash
# 1. Pull the dump to restore (latest, or a specific blob):
az storage blob download --account-name stp50backups<suffix> \
  --container-name db-backups --auth-mode login \
  --name project50-<ts>.dump.gz --file ./restore.dump.gz

# 2. Open the Postgres firewall to your IP, read the admin URL from Key Vault:
MYIP=$(curl -s https://api.ipify.org)
az postgres flexible-server firewall-rule create -g rg-project50-dev-canadacentral \
  --server-name psql-project50-dev-zv34o5 --name temp-restore \
  --start-ip-address "$MYIP" --end-ip-address "$MYIP"
ADMIN_URL=$(az keyvault secret show --vault-name kv-project50-dev-6z7n \
  --name database-url-admin --query value -o tsv)

# 3. Restore (custom-format, --clean). The portable scripts/backup/pg-restore.sh
#    has a production-safety guard; run via docker so the client is >= server 16:
gunzip -c ./restore.dump.gz | docker run --rm -i postgres:16 \
  pg_restore --no-owner --no-privileges --clean --if-exists --dbname "$ADMIN_URL"

# 4. Remove the temp firewall rule, roll a fresh Container App revision.
az postgres flexible-server firewall-rule delete -g rg-project50-dev-canadacentral \
  --server-name psql-project50-dev-zv34o5 --name temp-restore --yes
```

See [`RUNBOOKS.md`](./RUNBOOKS.md) and [`INCIDENT-RESPONSE.md`](./INCIDENT-RESPONSE.md)
for the full recovery flow.

## Media backup & restore

User media lives in the `media` container on `stp50mediazv34o5`. Keys are
content-addressed and immutable (`media/<userId>/<suffix>.<ext>`, see
[`CDN.md`](./CDN.md)), so an **additive** mirror to a backup container is safe and
idempotent.

**Backup ([`scripts/media-sync.sh`](../scripts/media-sync.sh), `media-sync` job):**
a daily **server-side** blob-to-blob copy from the live container to a backup
container (`media-backup`, on `BACKUP_STORAGE_ACCOUNT`). No data flows through the
runner; the copy is **additive** — it never deletes from the backup, so an
accidental/malicious wipe of the live container can't propagate.

> **It waits for completion.** `az storage blob copy start-batch` only *queues*
> Azure's async server-side copies. The script then **polls each destination
> blob's `copy.status` until none are pending** and only then reports success. If
> any copy ends `failed`/`aborted`, or copies are still pending at the timeout
> (`MEDIA_SYNC_TIMEOUT`, default 1800s), it **exits non-zero** so the workflow
> fails — it will never record a "successful" media backup with missing or
> still-copying blobs.

Run locally too:

```bash
az login
BACKUP_STORAGE_ACCOUNT=stp50backups<suffix> ./scripts/media-sync.sh
# (defaults: MEDIA_SRC_ACCOUNT=stp50mediazv34o5, MEDIA_SRC_CONTAINER=media,
#  MEDIA_BACKUP_CONTAINER=media-backup)
```

**Restore:** reverse the direction — copy from the backup container back into a
(new) live media container:

```bash
MEDIA_SRC_ACCOUNT=stp50backups<suffix> MEDIA_SRC_CONTAINER=media-backup \
BACKUP_STORAGE_ACCOUNT=stp50mediazv34o5 MEDIA_BACKUP_CONTAINER=media \
  ./scripts/media-sync.sh
```

After a restore, `/api/ready` should report `storage:true` (see `RUNBOOKS.md` →
Object storage).

> **TODO (Azure-account step):** create the `media-backup` container on the backup
> account and enable **versioning + soft-delete on the BACKUP account** for
> point-in-time recovery. Ideally place the backup account in a different region.

> **Note on soft-delete:** the *live media* account deliberately keeps blob
> soft-delete **OFF** so account deletion is a true GDPR hard-erase
> (`infra/azure/README.md`). Recoverability for media therefore comes from the
> **separate backup container**, not from soft-delete on the live account.

## CRON_SECRET — reminder / nudge cron routes

The reminder and streak-nudge senders are HTTP routes that **only run when a
caller presents the shared secret**:

- `apps/web/app/api/cron/reminders/route.ts`
- `apps/web/app/api/cron/streak-nudges/route.ts`

Both **refuse to run (503) when `CRON_SECRET` is unset**, and otherwise require
`Authorization: Bearer ${CRON_SECRET}` (constant-time compared — see
`apps/web/lib/cron-auth.ts`). So until `CRON_SECRET` is set in prod, **no
reminders or nudges are ever sent** (fail-closed, by design).

It's documented here because it's an ops/prod-readiness secret tied to scheduled
jobs, like the backup schedule.

**Set it (Azure — same pattern as the other app secrets):**

```bash
KV=kv-project50-dev-6z7n
# 1. Create the secret value (high-entropy):
az keyvault secret set --vault-name "$KV" --name cron-secret \
  --value "$(openssl rand -base64 32)"
```

2. **Wire it into the Container App** as the `CRON_SECRET` env var, sourced from
   the `cron-secret` Key Vault secret (a versionless KV reference, like the other
   app secrets in `main.tf` — that wiring is owned by `infra/azure/main.tf`, not
   changed here). Then roll a revision so the app picks it up:

   ```bash
   az containerapp update -g rg-project50-dev-canadacentral -n ca-project50-web-dev \
     --revision-suffix "cron$(date +%Y%m%d%H%M)"
   ```

3. **Schedule the caller** to hit the routes with the bearer token (the actual
   scheduler is a **TODO** — an Azure Logic App timer, a Container Apps Job on a
   cron, or any external scheduler):

   ```bash
   curl -fsS -X POST https://www.project50.fit/api/cron/reminders \
     -H "Authorization: Bearer $CRON_SECRET"
   curl -fsS -X POST https://www.project50.fit/api/cron/streak-nudges \
     -H "Authorization: Bearer $CRON_SECRET"
   ```

> Rotate `CRON_SECRET` together with the scheduler's stored token. Cadence: 180
> days / on suspicion. (Add it to the inventory in `SECRETS.md` when wiring the
> KV reference in `main.tf`.)

## Scheduling

### GitHub Actions (default — `backup.yml`)

[`.github/workflows/backup.yml`](../.github/workflows/backup.yml) runs the
Postgres backup **daily** (03:17 UTC) and on demand. Inert until the secrets
above are set (skipped, not failed).

### Local cron (self-hosted alternative)

On any host with docker, the Azure CLI (`az login` / a service principal), and a
checkout of this repo:

```cron
# daily Postgres dump -> Blob at 03:17 UTC (BACKUP_STORAGE_ACCOUNT etc. from the
# host env / a sourced, NOT-committed secrets file; az already authenticated)
17 3 * * *  cd /opt/project50 && ./scripts/pg-backup.sh >> /var/log/p50-backup.log 2>&1
```

> **TODO:** if self-hosting the scheduler, provision the host, install docker +
> the Azure CLI, authenticate `az` (managed identity or a service principal),
> and supply the config via the host env.
