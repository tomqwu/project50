#!/usr/bin/env bash
#
# media-sync.sh — mirror the Project 50 MEDIA Blob container (user photos / recap
# MP4s) to a BACKUP container so user-generated media survives loss of the live
# media storage account.
#
# Azure-native companion to scripts/pg-backup.sh and .github/workflows/backup.yml.
# Runs locally with `az login`, or in CI via azure/login (federated OIDC).
#
# What it does
# ------------
#   1. Server-side copies every blob from the live media container
#      ($MEDIA_SRC_ACCOUNT/$MEDIA_SRC_CONTAINER) into the backup container
#      ($BACKUP_STORAGE_ACCOUNT/$MEDIA_BACKUP_CONTAINER) using
#      `az storage blob copy start-batch` (no data flows through the runner;
#      Azure copies blob-to-blob).
#   2. WAITS for those async server-side copies to COMPLETE — it polls each
#      destination blob's `properties.copy.status` until none are `pending`. If
#      any copy ends `failed`/`aborted`, or copies are still pending at the
#      timeout, it EXITS NON-ZERO so the workflow surfaces a real failure rather
#      than recording a "successful" backup with missing blobs.
#   The sync is ADDITIVE by default — it never deletes from the backup, so an
#   accidental/malicious wipe of the live container can't propagate. Point-in-time
#   recovery comes from versioning + soft-delete on the BACKUP account (see
#   docs/BACKUPS.md / docs/OBJECT-STORAGE.md).
#
# Media keys are content-addressed + immutable (media/<userId>/<suffix>.<ext>,
# see docs/CDN.md), so an additive copy is idempotent: existing blobs are skipped
# (start-batch does not overwrite identical destination blobs by default).
#
# Inert without config: exits 0 (no-op) if the media/backup vars aren't set, so
# CI gating can call it unconditionally; the workflow also gates the job.
#
# Env / config (see docs/BACKUPS.md, infra/azure/README.md)
# ---------------------------------------------------------
#   MEDIA_SRC_ACCOUNT       Live media storage account. Default: stp50mediazv34o5
#   MEDIA_SRC_CONTAINER     Live media container.       Default: media
#   BACKUP_STORAGE_ACCOUNT  Backup storage account (REQUIRED to do anything).
#   MEDIA_BACKUP_CONTAINER  Backup container.           Default: media-backup
#   MEDIA_SYNC_TIMEOUT      Max seconds to wait for copies to finish. Default: 1800
#   MEDIA_SYNC_POLL_INTERVAL Seconds between copy-status polls. Default: 10
#
# Auth: `az` must be logged in with Storage Blob Data Reader on the source and
# Storage Blob Data Contributor on the backup container. In CI this comes from
# `azure/login` (federated OIDC) — see backup.yml.
#
# Fail-fast.
set -euo pipefail

MEDIA_SRC_ACCOUNT="${MEDIA_SRC_ACCOUNT:-stp50mediazv34o5}"
MEDIA_SRC_CONTAINER="${MEDIA_SRC_CONTAINER:-media}"
MEDIA_BACKUP_CONTAINER="${MEDIA_BACKUP_CONTAINER:-media-backup}"
MEDIA_SYNC_TIMEOUT="${MEDIA_SYNC_TIMEOUT:-1800}"
MEDIA_SYNC_POLL_INTERVAL="${MEDIA_SYNC_POLL_INTERVAL:-10}"

# `az` is overridable so the poll loop can be exercised with a local stub in tests.
AZ="${AZ_BIN:-az}"

if [ -z "${BACKUP_STORAGE_ACCOUNT:-}" ]; then
  echo "[media-sync] BACKUP_STORAGE_ACCOUNT not set — nothing to mirror to (no-op)."
  exit 0
fi

echo "[media-sync] source      : ${MEDIA_SRC_ACCOUNT}/${MEDIA_SRC_CONTAINER}"
echo "[media-sync] destination : ${BACKUP_STORAGE_ACCOUNT}/${MEDIA_BACKUP_CONTAINER}"
echo "[media-sync] mode        : additive (never deletes from the backup)"

# Ensure the backup container exists (idempotent).
"$AZ" storage container create \
  --account-name "$BACKUP_STORAGE_ACCOUNT" \
  --name "$MEDIA_BACKUP_CONTAINER" \
  --auth-mode login --only-show-errors >/dev/null

# Server-side batch copy: source container -> backup container. `--pattern '*'`
# copies all blobs; existing identical destination blobs are left as-is. The
# copy is async on Azure's side; start-batch returns once the copies are queued.
"$AZ" storage blob copy start-batch \
  --account-name "$BACKUP_STORAGE_ACCOUNT" \
  --destination-container "$MEDIA_BACKUP_CONTAINER" \
  --source-account-name "$MEDIA_SRC_ACCOUNT" \
  --source-container "$MEDIA_SRC_CONTAINER" \
  --pattern "*" \
  --auth-mode login --only-show-errors

# --- wait for the async server-side copies to COMPLETE ------------------------
# Poll every destination blob's copy.status until none are `pending`. Any
# `failed`/`aborted` (or still-`pending` at the timeout) is a hard failure: we
# must not report a successful backup while blobs are missing/incomplete.
echo "[media-sync] waiting for server-side copies to complete (timeout ${MEDIA_SYNC_TIMEOUT}s)..."
DEADLINE=$(( $(date +%s) + MEDIA_SYNC_TIMEOUT ))
while :; do
  # One line per blob: "<status>". A freshly-copied identical/skip blob with no
  # active copy reports empty status -> treat empty as terminal (not pending).
  STATUSES="$("$AZ" storage blob list \
    --account-name "$BACKUP_STORAGE_ACCOUNT" \
    --container-name "$MEDIA_BACKUP_CONTAINER" \
    --auth-mode login \
    --query "[].properties.copy.status" -o tsv --only-show-errors)"

  PENDING=0; FAILED=0; SUCCESS=0; OTHER=0
  while IFS= read -r s; do
    case "$s" in
      pending)            PENDING=$((PENDING + 1)) ;;
      failed|aborted)     FAILED=$((FAILED + 1)) ;;
      success|""|None)    SUCCESS=$((SUCCESS + 1)) ;;
      *)                  OTHER=$((OTHER + 1)) ;;
    esac
  done <<EOF_STATUSES
$STATUSES
EOF_STATUSES

  if [ "$FAILED" -gt 0 ]; then
    echo "[media-sync] ERROR: ${FAILED} destination blob copy(ies) failed/aborted." >&2
    exit 1
  fi
  if [ "$PENDING" -eq 0 ]; then
    echo "[media-sync] all copies complete (${SUCCESS} blob(s), ${OTHER} other-state)."
    break
  fi
  if [ "$(date +%s)" -ge "$DEADLINE" ]; then
    echo "[media-sync] ERROR: timed out after ${MEDIA_SYNC_TIMEOUT}s with ${PENDING} copy(ies) still pending." >&2
    exit 1
  fi
  echo "[media-sync]   ${PENDING} pending, ${SUCCESS} done — re-checking in ${MEDIA_SYNC_POLL_INTERVAL}s"
  sleep "$MEDIA_SYNC_POLL_INTERVAL"
done

echo "[media-sync] done."
