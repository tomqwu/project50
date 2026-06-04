#!/usr/bin/env sh
#
# pg-backup.sh — take a compressed logical backup of the Project 50 Postgres DB
# and (optionally) upload it offsite to an S3-compatible bucket.
#
# What it does
# ------------
#   1. pg_dump the database referenced by $DATABASE_URL (or $DIRECT_URL — the
#      non-pooled connection, preferred for dumps; see docs/INFRA-STAGING.md).
#   2. Write a TIMESTAMPED, gzipped custom-format dump to $BACKUP_DIR.
#   3. If $BACKUP_S3_BUCKET is set, upload the dump offsite (aws / mc).
#   4. If $BACKUP_RETENTION_DAYS is set, prune older LOCAL dumps.
#
# Why custom format (-Fc): pg_restore can selectively restore, parallelise, and
# is version-tolerant. We additionally gzip for a smaller offsite footprint.
#
# Usage
# -----
#   DATABASE_URL=postgresql://user:pass@host:5432/db ./scripts/backup/pg-backup.sh
#
# Env vars (all optional unless noted)
# ------------------------------------
#   DATABASE_URL          Postgres conn string. REQUIRED unless DIRECT_URL set.
#   DIRECT_URL            Non-pooled conn string; preferred for dumps if present.
#   BACKUP_DIR            Local output dir. Default: ./backups
#   BACKUP_S3_BUCKET      Offsite target, e.g. s3://project50-backups/pg
#                         When set, the dump is uploaded there after writing.
#   BACKUP_RETENTION_DAYS Prune local dumps older than N days. Default: 14
#   BACKUP_S3_ENDPOINT    Custom S3 endpoint (R2 / MinIO). Optional.
#   AWS_*                 Standard AWS creds/region for `aws s3` (or use mc).
#   MC_ALIAS              If set, use MinIO Client (`mc cp`) instead of `aws`.
#
# Retention (documented policy — see docs/BACKUPS.md)
# ---------------------------------------------------
#   Local dumps:   pruned after BACKUP_RETENTION_DAYS (default 14 days).
#   Offsite (S3):  retention is enforced by the BUCKET LIFECYCLE policy, not by
#                  this script (so a compromised host cannot delete history).
#                  See docs/BACKUPS.md and docs/OBJECT-STORAGE.md.
#
# Fail-fast: any error aborts; unset vars are an error; pipe failures propagate.
set -eu
# `set -o pipefail` is not in POSIX sh but is supported by bash/dash/ash; enable
# it when available so a failing pg_dump in `pg_dump | gzip` is not masked.
# shellcheck disable=SC3040
(set -o pipefail 2>/dev/null) && set -o pipefail

# --- resolve connection string ------------------------------------------------
CONN="${DIRECT_URL:-${DATABASE_URL:-}}"
if [ -z "$CONN" ]; then
  echo "ERROR: set DATABASE_URL (or DIRECT_URL) to the Postgres connection string." >&2
  exit 2
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

# Timestamp is UTC and sortable (lexical order == chronological order).
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BACKUP_DIR}/project50-${TS}.dump.gz"

mkdir -p "$BACKUP_DIR"

echo "[pg-backup] dumping database -> ${OUT}"
# -Fc  : custom format (restorable with pg_restore)
# -Z0  : let pg_dump emit uncompressed; we gzip the stream so the offsite blob
#        is a single .gz (simpler lifecycle rules, smaller than -Fc's internal
#        zlib for our data).  Use a temp file + atomic rename so a crashed run
#        never leaves a half-written ".dump.gz" that looks valid.
TMP="${OUT}.part"
# Trap removes the partial file on any failure/interrupt.
trap 'rm -f "$TMP"' EXIT INT TERM
pg_dump --no-owner --no-privileges -Fc -Z0 "$CONN" | gzip -9 > "$TMP"
mv "$TMP" "$OUT"
trap - EXIT INT TERM

SIZE="$(wc -c < "$OUT" | tr -d ' ')"
echo "[pg-backup] wrote ${OUT} (${SIZE} bytes)"

# --- offsite upload -----------------------------------------------------------
if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  DEST="${BACKUP_S3_BUCKET%/}/project50-${TS}.dump.gz"
  echo "[pg-backup] uploading offsite -> ${DEST}"
  if [ -n "${MC_ALIAS:-}" ]; then
    # MinIO Client path. DEST should be like "myalias/bucket/pg".
    mc cp "$OUT" "${DEST}"
  else
    # AWS CLI path (works against S3, R2, MinIO via --endpoint-url).
    if [ -n "${BACKUP_S3_ENDPOINT:-}" ]; then
      aws s3 cp "$OUT" "$DEST" --endpoint-url "$BACKUP_S3_ENDPOINT"
    else
      aws s3 cp "$OUT" "$DEST"
    fi
  fi
  echo "[pg-backup] offsite upload complete."
else
  echo "[pg-backup] BACKUP_S3_BUCKET not set — skipping offsite upload (local only)."
fi

# --- local retention prune ----------------------------------------------------
# Offsite retention is handled by the bucket lifecycle policy (see docs). Here we
# only prune the LOCAL working copies to bound disk usage on the backup host.
if [ "$BACKUP_RETENTION_DAYS" -gt 0 ] 2>/dev/null; then
  echo "[pg-backup] pruning local dumps older than ${BACKUP_RETENTION_DAYS} days in ${BACKUP_DIR}"
  find "$BACKUP_DIR" -type f -name 'project50-*.dump.gz' -mtime "+${BACKUP_RETENTION_DAYS}" -print -delete || true
fi

echo "[pg-backup] done."
