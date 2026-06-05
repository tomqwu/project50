#!/usr/bin/env bash
#
# pg-backup.sh — take a compressed logical backup of the Project 50 PRODUCTION
# Postgres (Azure Database for PostgreSQL Flexible Server) and upload it to an
# Azure Blob container, then prune old blobs to enforce daily retention.
#
# This is the Azure-native, locally-runnable companion to
# .github/workflows/backup.yml. Per repo policy (ops run locally with `az
# login`), the same script powers both the scheduled CI job and a manual run.
#
# What it does
# ------------
#   1. Resolve the admin connection string — reads the Key Vault secret
#      `database-url-admin` by DEFAULT; a deliberate override is the dedicated
#      $BACKUP_DATABASE_URL (must be the prod ADMIN URL). The ambient $DATABASE_URL
#      is IGNORED (it's the app/pooler p50app connection, wrong for pg_dump).
#   2. pg_dump the database in custom format, gzipped, to a TIMESTAMPED file.
#      pg_dump runs via the `postgres:16` docker image so its major version is
#      >= the prod server (16) without needing a local pg client install.
#   3. Upload the dump to the Azure Blob container ($BACKUP_CONTAINER) on the
#      backup storage account ($BACKUP_STORAGE_ACCOUNT).
#   4. Prune blobs older than $BACKUP_RETENTION_DAYS daily backups (default 14).
#
# Inert without config: if neither a Key Vault secret nor $BACKUP_DATABASE_URL is
# available the script exits non-zero with a clear message; the CI workflow
# gates on the secrets so it is SKIPPED (not failed) until they are set.
#
# Env / config (see docs/BACKUPS.md, infra/azure/README.md)
# ---------------------------------------------------------
#   Connection — the ADMIN conn string is read from Key Vault BY DEFAULT:
#     KEY_VAULT_NAME          Key Vault to read the ADMIN conn string from.
#                             Default: kv-project50-dev-6z7n. This is the source of
#                             truth for both CI and the local path.
#     KV_SECRET_NAME          KV secret name. Default: database-url-admin
#     BACKUP_DATABASE_URL     DELIBERATE OVERRIDE ONLY (a DEDICATED var — NOT the
#                             ambient DATABASE_URL, which is the app/pooler p50app
#                             connection and the WRONG role/host for pg_dump). If
#                             set, it is used instead of the Key Vault read and
#                             MUST be the prod ADMIN connection (sslmode=require).
#                             The ambient DATABASE_URL is intentionally IGNORED so
#                             a shell that has the app DB exported can't dump the
#                             wrong connection by accident. NOT wired into CI.
#
#   Blob upload target (optional — skipped if BACKUP_STORAGE_ACCOUNT unset):
#     BACKUP_STORAGE_ACCOUNT  Storage account for backups (e.g. a dedicated
#                             stp50backups* account, or stp50mediazv34o5).
#     BACKUP_CONTAINER        Blob container for dumps. Default: db-backups
#
#   Other:
#     BACKUP_DIR              Local output dir. Default: ./backups
#     BACKUP_RETENTION_DAYS   Keep this many daily dumps offsite + locally.
#                             Default: 14.
#     PGDUMP_IMAGE            Override the docker image. Default: postgres:16
#
# Auth: `az` must be logged in (`az login`) with read access to the Key Vault
# secret and Storage Blob Data Contributor on the backup container. In CI this
# comes from `azure/login` (federated OIDC) — see backup.yml.
#
# Fail-fast.
set -euo pipefail

KEY_VAULT_NAME="${KEY_VAULT_NAME:-kv-project50-dev-6z7n}"
KV_SECRET_NAME="${KV_SECRET_NAME:-database-url-admin}"
BACKUP_CONTAINER="${BACKUP_CONTAINER:-db-backups}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
PGDUMP_IMAGE="${PGDUMP_IMAGE:-postgres:16}"

# --- resolve the connection string -------------------------------------------
# Read the admin conn string from Key Vault BY DEFAULT (the source of truth). A
# local operator may DELIBERATELY override with the dedicated BACKUP_DATABASE_URL
# env (must be the prod ADMIN URL). The ambient DATABASE_URL is intentionally
# IGNORED here, so a shell with the app/pooler p50app DB exported can't dump the
# wrong connection by accident. Never echo the conn string (it carries the pw).
CONN="${BACKUP_DATABASE_URL:-}"
if [ -z "$CONN" ]; then
  if [ -z "$KEY_VAULT_NAME" ]; then
    echo "ERROR: set BACKUP_DATABASE_URL (admin URL), or KEY_VAULT_NAME to read '${KV_SECRET_NAME}' from Key Vault." >&2
    exit 2
  fi
  echo "[pg-backup] reading ${KV_SECRET_NAME} from Key Vault ${KEY_VAULT_NAME}"
  CONN="$(az keyvault secret show --vault-name "$KEY_VAULT_NAME" \
            --name "$KV_SECRET_NAME" --query value -o tsv)"
  if [ -z "$CONN" ]; then
    echo "ERROR: Key Vault secret '${KV_SECRET_NAME}' is empty or unreadable." >&2
    exit 2
  fi
fi

# Timestamp is UTC and lexically sortable (sort == chronological).
TS="$(date -u +%Y%m%dT%H%M%SZ)"
BLOB_NAME="project50-${TS}.dump.gz"
OUT="${BACKUP_DIR}/${BLOB_NAME}"
mkdir -p "$BACKUP_DIR"

echo "[pg-backup] dumping prod Postgres -> ${OUT}"
# pg_dump via docker so the client major (>= server 16) is guaranteed regardless
# of the host. -Fc = custom format (selective/parallel pg_restore); we gzip the
# stream so the offsite blob is a single .gz. Write to a .part then atomically
# rename so a crashed run never leaves a half-written ".dump.gz". The conn string
# is passed via env (PGCONN) so it never appears in `ps`/process args.
TMP="${OUT}.part"
trap 'rm -f "$TMP"' EXIT INT TERM
docker run --rm -i -e PGCONN="$CONN" "$PGDUMP_IMAGE" \
  sh -c 'pg_dump --no-owner --no-privileges -Fc -Z0 "$PGCONN"' \
  | gzip -9 > "$TMP"
mv "$TMP" "$OUT"
trap - EXIT INT TERM

SIZE="$(wc -c < "$OUT" | tr -d ' ')"
echo "[pg-backup] wrote ${OUT} (${SIZE} bytes)"
if [ "$SIZE" -lt 100 ]; then
  echo "ERROR: dump is suspiciously small (${SIZE} bytes) — refusing to upload." >&2
  exit 1
fi

# --- upload to Azure Blob -----------------------------------------------------
if [ -n "${BACKUP_STORAGE_ACCOUNT:-}" ]; then
  echo "[pg-backup] uploading -> ${BACKUP_STORAGE_ACCOUNT}/${BACKUP_CONTAINER}/${BLOB_NAME}"
  # --auth-mode login uses the az-logged-in identity (RBAC: Storage Blob Data
  # Contributor) instead of an account key — no key handling in CI.
  az storage blob upload \
    --account-name "$BACKUP_STORAGE_ACCOUNT" \
    --container-name "$BACKUP_CONTAINER" \
    --name "$BLOB_NAME" \
    --file "$OUT" \
    --auth-mode login \
    --overwrite false \
    --only-show-errors
  echo "[pg-backup] upload complete."

  # --- offsite retention: prune old blobs ------------------------------------
  # Offsite retention is enforced HERE by date so the backup history is bounded.
  # (A stronger guarantee — immutability/legal-hold or a storage lifecycle
  # management policy — is a documented follow-up; see docs/BACKUPS.md.)
  if [ "$BACKUP_RETENTION_DAYS" -gt 0 ]; then
    CUTOFF="$(date -u -d "${BACKUP_RETENTION_DAYS} days ago" +%Y%m%dT%H%M%SZ 2>/dev/null \
              || date -u -v-"${BACKUP_RETENTION_DAYS}"d +%Y%m%dT%H%M%SZ)"
    echo "[pg-backup] pruning blobs older than ${BACKUP_RETENTION_DAYS}d (cutoff ${CUTOFF})"
    # Names sort chronologically (project50-<UTC ts>.dump.gz); delete any whose
    # timestamp is before the cutoff. List names only, filter, delete each.
    az storage blob list \
      --account-name "$BACKUP_STORAGE_ACCOUNT" \
      --container-name "$BACKUP_CONTAINER" \
      --prefix "project50-" \
      --auth-mode login \
      --query "[].name" -o tsv --only-show-errors \
    | while IFS= read -r name; do
        [ -n "$name" ] || continue
        ts="$(printf '%s' "$name" | sed -n 's/^project50-\(.*\)\.dump\.gz$/\1/p')"
        [ -n "$ts" ] || continue
        if [ "$ts" \< "$CUTOFF" ]; then
          echo "[pg-backup]   prune ${name}"
          az storage blob delete \
            --account-name "$BACKUP_STORAGE_ACCOUNT" \
            --container-name "$BACKUP_CONTAINER" \
            --name "$name" --auth-mode login --only-show-errors || true
        fi
      done
  fi
else
  echo "[pg-backup] BACKUP_STORAGE_ACCOUNT not set — local dump only (no upload)."
fi

# --- local retention prune ----------------------------------------------------
if [ "$BACKUP_RETENTION_DAYS" -gt 0 ]; then
  echo "[pg-backup] pruning local dumps older than ${BACKUP_RETENTION_DAYS}d in ${BACKUP_DIR}"
  find "$BACKUP_DIR" -type f -name 'project50-*.dump.gz' \
    -mtime "+${BACKUP_RETENTION_DAYS}" -print -delete || true
fi

echo "[pg-backup] done."
