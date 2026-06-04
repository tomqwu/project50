#!/usr/bin/env sh
#
# storage-sync.sh — mirror the Project 50 MEDIA bucket to a BACKUP bucket so
# user-generated media (activity photos, recap MP4s) survives loss of the
# primary bucket.
#
# The app's media bucket is described in docs/OBJECT-STORAGE.md and read by
# apps/web/lib/storage.ts via S3_ENDPOINT / S3_ACCESS_KEY / S3_SECRET_KEY /
# S3_BUCKET. This script mirrors that bucket to a second, ideally
# cross-region / cross-account bucket.
#
# Two backends are supported; pick whichever your environment has:
#   * AWS CLI   : `aws s3 sync`  (S3, R2, MinIO via --endpoint-url)   [default]
#   * MinIO mc  : `mc mirror`    (set MC_BIN=mc and use alias paths)
#
# Usage (aws)
# -----------
#   SRC=s3://project50-media-prod \
#   DST=s3://project50-media-backup \
#   ./scripts/backup/storage-sync.sh
#
# Usage (MinIO client)
# --------------------
#   MC_BIN=mc SRC=prod/project50-media DST=backup/project50-media \
#   ./scripts/backup/storage-sync.sh
#
# Env vars
# --------
#   SRC               Source bucket/path (REQUIRED).
#   DST               Destination bucket/path (REQUIRED).
#   S3_ENDPOINT       Custom endpoint for aws (R2/MinIO). Optional.
#   MC_BIN            If set (e.g. "mc"), use MinIO client mirror instead of aws.
#   DELETE_EXTRANEOUS If "1", remove objects in DST not present in SRC
#                     (true MIRROR). Default unset = additive sync only, which is
#                     SAFER for a backup (never deletes history on its own).
#   AWS_*             Standard AWS creds/region for the aws backend.
#
# NOTE on deletes: a backup that blindly mirrors deletes is dangerous — an
# accidental/malicious wipe of the primary would propagate. Default is additive.
# Combine with bucket VERSIONING + lifecycle on the backup bucket (see
# docs/OBJECT-STORAGE.md) for point-in-time recovery.
#
# Fail-fast.
set -eu
# shellcheck disable=SC3040
(set -o pipefail 2>/dev/null) && set -o pipefail

SRC="${SRC:-}"
DST="${DST:-}"
[ -n "$SRC" ] || { echo "ERROR: set SRC to the source bucket/path." >&2; exit 2; }
[ -n "$DST" ] || { echo "ERROR: set DST to the destination bucket/path." >&2; exit 2; }

echo "[storage-sync] source      : ${SRC}"
echo "[storage-sync] destination : ${DST}"

if [ -n "${MC_BIN:-}" ]; then
  # ---- MinIO client backend --------------------------------------------------
  # `mc mirror` is additive by default; --remove makes it a true mirror.
  set -- mirror
  if [ "${DELETE_EXTRANEOUS:-}" = "1" ]; then
    echo "[storage-sync] mode: MIRROR (--remove: deletes in DST not in SRC)"
    set -- "$@" --remove
  else
    echo "[storage-sync] mode: additive (no deletes in DST)"
  fi
  echo "[storage-sync] running: ${MC_BIN} ${*} ${SRC} ${DST}"
  "$MC_BIN" "$@" "$SRC" "$DST"
else
  # ---- AWS CLI backend -------------------------------------------------------
  set -- s3 sync "$SRC" "$DST"
  if [ "${DELETE_EXTRANEOUS:-}" = "1" ]; then
    echo "[storage-sync] mode: MIRROR (--delete: deletes in DST not in SRC)"
    set -- "$@" --delete
  else
    echo "[storage-sync] mode: additive (no deletes in DST)"
  fi
  if [ -n "${S3_ENDPOINT:-}" ]; then
    set -- "$@" --endpoint-url "$S3_ENDPOINT"
  fi
  echo "[storage-sync] running: aws ${*}"
  aws "$@"
fi

echo "[storage-sync] done."
