# Backups & tested restore

How Project 50 backs up its **two** stateful systems and — critically — how we
**verify** those backups actually restore. A backup you have never restored is a
hypothesis, not a backup.

Read alongside [`OBJECT-STORAGE.md`](./OBJECT-STORAGE.md) (provisioning the
media bucket + its backup target), [`RUNBOOKS.md`](./RUNBOOKS.md) (recovery
runbooks), [`DEPLOY.md`](./DEPLOY.md) (CD pipeline) and
[`SECRETS.md`](./SECRETS.md) (where the backup creds live).

> **TODO (your infra):** anything that depends on a provisioned cloud account
> (the offsite bucket, its lifecycle/versioning, IAM creds, the scheduler host)
> is marked **TODO** below. The scripts and workflow in this repo are real and
> runnable; they go live the moment the secrets exist.

## What we back up

| System | What | Tool | Script |
| --- | --- | --- | --- |
| **Postgres** | Full logical dump (schema + data) | `pg_dump -Fc \| gzip` | [`scripts/backup/pg-backup.sh`](../scripts/backup/pg-backup.sh) |
| **Object storage** | User media (photos, recap MP4s) | `aws s3 sync` / `mc mirror` | [`scripts/backup/storage-sync.sh`](../scripts/backup/storage-sync.sh) |
| **Restore** | Restore a dump into a target DB | `pg_restore` | [`scripts/backup/pg-restore.sh`](../scripts/backup/pg-restore.sh) |

Everything else is **rebuildable from source** and needs no backup: the app code
(git), infra config (this repo), and secrets (the secret store — see
`SECRETS.md`; back up the secret store per your provider, separately).

## Strategy

### Frequency

| What | Cadence | Mechanism |
| --- | --- | --- |
| Postgres dump | **Daily** (03:17 UTC) | `.github/workflows/backup.yml` `schedule`, or cron — see [Scheduling](#scheduling) |
| Media sync | **Daily** (same run) | same workflow, `storage-sync` job |
| Restore **test** | **Quarterly** | manual/automated — see [Tested-restore runbook](#tested-restore-runbook) |

> Daily is the baseline. If write volume grows, layer **PITR** (continuous WAL
> archiving / a managed provider's point-in-time recovery) on top of the daily
> logical dump. **TODO:** enable PITR on the managed Postgres provider.

### Retention

| Tier | Where | Retention | Enforced by |
| --- | --- | --- | --- |
| Local working copy | backup host `./backups` | `BACKUP_RETENTION_DAYS` (default **14d**) | `pg-backup.sh` prune step |
| Offsite, recent | backup bucket | **30 daily** | bucket **lifecycle** rule (TODO) |
| Offsite, long-term | backup bucket (or Glacier/IA) | **12 monthly** | bucket lifecycle transition (TODO) |

Offsite retention is enforced by the **bucket lifecycle policy**, never by the
backup host — a compromised or buggy host must not be able to delete history.
See `OBJECT-STORAGE.md` for the lifecycle JSON.

### Offsite & isolation

- The dump is uploaded to an **offsite** bucket (`BACKUP_S3_BUCKET`) — ideally a
  **separate cloud account / region** from the primary DB and media bucket, so a
  single account compromise or region outage cannot take out both.
- The media backup bucket (`MEDIA_DST`) should likewise be **cross-region** from
  the live media bucket (`MEDIA_SRC`).
- Enable **versioning** on backup buckets so an overwrite/delete is recoverable.

### Encryption

- **In transit:** all uploads use TLS (S3/R2 HTTPS endpoints).
- **At rest:** enable **bucket default encryption** (SSE-S3, or SSE-KMS with a
  dedicated key) on the backup bucket — **TODO** (cloud-account step). The dump
  itself contains user PII, so encryption at rest is required, not optional.
- The connection string and S3 creds are **secrets** — they live only in the
  CI/secret store (`SECRETS.md`), never in the repo.

## RPO / RTO targets

> Placeholders — set real numbers with the business once SLAs are agreed.

| Metric | Target (placeholder) | Notes |
| --- | --- | --- |
| **RPO** (max data loss) | **24h** | = daily dump cadence. Tighten with PITR (→ minutes). |
| **RTO** (time to restore) | **≤ 2h** | dominated by dump size + restore + app redeploy. |
| Restore-test cadence | **Quarterly** | proves RTO is achievable, not theoretical. |

## Running a backup manually

```bash
# Postgres — local dump only:
DATABASE_URL="postgresql://user:pass@host:5432/db" ./scripts/backup/pg-backup.sh

# Postgres — dump + offsite upload (AWS creds in env):
DATABASE_URL="...prod..." \
BACKUP_S3_BUCKET="s3://project50-backups/pg" \
  ./scripts/backup/pg-backup.sh

# Media — mirror live bucket to backup bucket:
SRC="s3://project50-media-prod" DST="s3://project50-media-backup" \
  ./scripts/backup/storage-sync.sh
```

`DIRECT_URL` is preferred for dumps when a connection pooler is in front of the
DB (the dump uses a normal session connection — see `INFRA-STAGING.md`); the
script picks `DIRECT_URL` over `DATABASE_URL` automatically when set.

## Tested-restore runbook

**Goal:** prove a backup restores into a clean, scratch database and that the
restored data is structurally sound. Run **quarterly** and after any change to
the schema-migration or backup tooling.

### 1. Pick a dump to test

Use the most recent offsite dump (download it) or a local one:

```bash
# (offsite) pull the latest dump locally
aws s3 cp "$(aws s3 ls s3://project50-backups/pg/ | sort | tail -1 | awk '{print $4}' | sed 's#^#s3://project50-backups/pg/#')" ./restore-test.dump.gz
```

### 2. Create a throwaway scratch database

Never restore into prod for a test. Use a local/disposable Postgres:

```bash
# local docker Postgres is already available (docker-compose.yml)
docker compose up -d postgres
createdb -h localhost -U project50 project50_restore_test \
  || psql -h localhost -U project50 -c 'CREATE DATABASE project50_restore_test;'
```

### 3. Restore into the scratch DB

The restore script **refuses** to target your live `DATABASE_URL`/`DIRECT_URL`
and requires confirmation; for the automated test pass `RESTORE_CONFIRM=YES`:

```bash
RESTORE_CONFIRM=YES ./scripts/backup/pg-restore.sh \
  --dump ./restore-test.dump.gz \
  --target "postgresql://project50:project50@localhost:5432/project50_restore_test" \
  --clean
```

### 4. Integrity check

Verify the restore is non-empty and structurally consistent. Two layers:

**a) Schema + row sanity** — core Project 50 tables exist and have rows:

```bash
SCRATCH="postgresql://project50:project50@localhost:5432/project50_restore_test"

# Every expected table is present (adjust list as the schema grows):
psql "$SCRATCH" -Atc "
  SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1;"

# Row counts across all public tables (look for unexpected zeros):
psql "$SCRATCH" -Atc "
  SELECT relname, n_live_tup
  FROM pg_stat_user_tables
  ORDER BY n_live_tup DESC;"

# Prisma migration history restored & all applied (no failed/rolled-back rows):
psql "$SCRATCH" -Atc "
  SELECT migration_name, finished_at, rolled_back_at
  FROM _prisma_migrations ORDER BY started_at;"
```

**b) Migration drift** — the restored schema matches the code's migrations:

```bash
# Should report "Database schema is up to date!" — i.e. the dump's schema is at
# the same migration head the app expects (no pending/extra migrations).
DATABASE_URL="$SCRATCH" pnpm --filter @project50/db exec prisma migrate status
```

**c) App-level smoke (optional but recommended)** — point a local app at the
scratch DB and hit readiness:

```bash
DATABASE_URL="$SCRATCH" pnpm --filter @project50/web dev &
curl -sS http://localhost:3000/api/ready | jq   # expect database:true
```

### 5. Record & tear down

```bash
dropdb -h localhost -U project50 project50_restore_test \
  || psql -h localhost -U project50 -c 'DROP DATABASE project50_restore_test;'
rm -f ./restore-test.dump.gz
```

Record the result (date, dump tested, pass/fail, restore wall-clock time) wherever
ops changes are tracked. A failed or slow restore is an incident-class finding —
fix the backup tooling before the next cycle. The wall-clock time validates the
**RTO** target above.

> **TODO:** schedule the quarterly test — a calendar reminder, or a
> `schedule: cron` GitHub Actions job that spins up an ephemeral Postgres
> service, runs steps 2–4 against the latest offsite dump, and fails the run if
> the integrity checks fail. (Kept manual here to stay inert without infra.)

## Media restore

The media backup is a plain bucket mirror, so "restore" is a reverse sync:

```bash
# restore media from backup bucket back into a (new) primary bucket:
SRC="s3://project50-media-backup" DST="s3://project50-media-prod" \
  ./scripts/backup/storage-sync.sh
```

Media keys are content-addressed and immutable (`media/<userId>/<suffix>.<ext>`
— see `CDN.md`), so an additive restore is safe and idempotent. After restore,
`/api/ready` should report `storage:true` (see `RUNBOOKS.md` → Object storage).

## Scheduling

### GitHub Actions (default — `backup.yml`)

[`.github/workflows/backup.yml`](../.github/workflows/backup.yml) runs the
Postgres backup + media sync **daily** and on demand. Like `deploy.yml`, it is
**inert until secrets are configured**: a `preflight` job surfaces secret
presence as boolean outputs and gates each job, so on a fork or before setup the
jobs are **skipped, not failed**, and CI stays green.

Required secrets (add under **Settings → Secrets and variables → Actions**, see
`SECRETS.md`):

| Secret | Purpose |
| --- | --- |
| `DATABASE_URL` | DB to dump (`DIRECT_URL` optional, preferred for dumps) |
| `BACKUP_S3_BUCKET` | offsite dump target, e.g. `s3://project50-backups/pg` |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` | backup-bucket creds |
| `BACKUP_S3_ENDPOINT` | (optional) custom endpoint for R2 / MinIO |
| `MEDIA_SRC` / `MEDIA_DST` | live + backup media buckets |

> **Least privilege:** the backup creds need only **read** on the source DB /
> media bucket and **write** on the backup bucket — never delete on the source.

### cron (self-hosted alternative)

On any host with `pg_dump`, the AWS CLI, and a checkout of this repo:

```cron
# daily Postgres dump + media sync at 03:17 UTC (creds via the host env / a
# sourced secrets file — NOT committed; see SECRETS.md)
17 3 * * *  cd /opt/project50 && ./scripts/backup/pg-backup.sh   >> /var/log/p50-backup.log 2>&1
27 3 * * *  cd /opt/project50 && ./scripts/backup/storage-sync.sh >> /var/log/p50-sync.log   2>&1
```

> **TODO:** if self-hosting the scheduler, provision the host, install the
> Postgres-16 client + AWS CLI, and supply the secrets via the host's env / a
> protected secrets file.
