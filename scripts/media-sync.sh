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
#   1. DIFFs the live media container ($MEDIA_SRC_ACCOUNT/$MEDIA_SRC_CONTAINER)
#      against the backup container ($BACKUP_STORAGE_ACCOUNT/$MEDIA_BACKUP_CONTAINER)
#      and server-side copies ONLY the source blobs that are MISSING from the
#      backup (no data flows through the runner; Azure copies blob-to-blob).
#      Existing backup blobs are NEVER overwritten — truly additive.
#   2. WAITS for those async server-side copies to COMPLETE — it polls each
#      destination blob's `properties.copy.status` until none are `pending`. If
#      any copy ends `failed`/`aborted`, or copies are still pending at the
#      timeout, it EXITS NON-ZERO so the workflow surfaces a real failure rather
#      than recording a "successful" backup with missing blobs.
#   ADDITIVE both ways: it never deletes from the backup (a wipe of the live
#   container can't propagate) AND never overwrites a backup blob (a corrupted/
#   overwritten live blob can't clobber the good backup copy). Point-in-time
#   recovery still comes from versioning + soft-delete on the BACKUP account (see
#   docs/BACKUPS.md / docs/OBJECT-STORAGE.md).
#
# Media keys are content-addressed + immutable (media/<userId>/<suffix>.<ext>,
# see docs/CDN.md), so a present backup blob is already the correct bytes — only
# missing names need copying, making the run idempotent.
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
# Auth / RBAC: `az` must be logged in. For this OAuth (`--auth-mode login`)
# cross-account copy, Azure CLI mints a SOURCE user-delegation SAS, which needs
# the ability to call get_user_delegation_key on the SOURCE account. So the
# backup identity needs, on the SOURCE media account:
#     Storage Blob Data Reader + Storage Blob Delegator
#       (or Storage Blob Data Contributor, which includes delegation)
# and on the DESTINATION backup account:
#     Storage Blob Data Contributor.
# (Plain Storage Blob Data Reader on the source is NOT enough — it cannot mint a
# delegation key, and the copy would fail.) In CI the identity comes from
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

# --- ADDITIVE copy: only blobs MISSING from the backup ------------------------
# `start-batch --pattern '*'` would re-copy EVERY source blob, OVERWRITING the
# existing backup copies each run — so if a live blob were corrupted/overwritten
# before the next run, the good backup copy would be overwritten too. Instead we
# diff: list source names, list backup names, and copy ONLY the source blobs that
# are not already in the backup. Existing backup blobs are NEVER touched (keys are
# content-addressed + immutable, so a present blob is already the correct bytes).
# NB: requires Storage Blob Delegator (or Contributor) on the SOURCE account —
# CLI mints a source user-delegation SAS for the cross-account copy (see header).
list_names() {  # <account> <container>
  "$AZ" storage blob list \
    --account-name "$1" --container-name "$2" \
    --auth-mode login --query "[].name" -o tsv --only-show-errors
}

SRC_NAMES="$(list_names "$MEDIA_SRC_ACCOUNT" "$MEDIA_SRC_CONTAINER")"
DST_NAMES="$(list_names "$BACKUP_STORAGE_ACCOUNT" "$MEDIA_BACKUP_CONTAINER")"

# Names present in SRC but not in DST (set difference; names have no spaces —
# content-addressed media keys). comm needs sorted input.
MISSING="$(comm -23 \
  <(printf '%s\n' "$SRC_NAMES" | sort -u) \
  <(printf '%s\n' "$DST_NAMES" | sort -u))"
# Drop any empty line (e.g. when SRC is empty).
MISSING="$(printf '%s\n' "$MISSING" | sed '/^$/d')"

MISSING_COUNT="$(printf '%s' "$MISSING" | grep -c . || true)"
echo "[media-sync] source blobs missing from backup: ${MISSING_COUNT}"
if [ "$MISSING_COUNT" -eq 0 ]; then
  echo "[media-sync] backup already has every source blob — nothing to copy."
  echo "[media-sync] done."
  exit 0
fi

# Queue a server-side copy for each missing blob. We DON'T overwrite, so even if
# a name slipped in concurrently, --requires-sync false keeps it async and the
# poll below confirms completion. (Per-blob start, not start-batch, so we only
# ever target the missing set — existing backup blobs are never re-copied.)
SRC_PREFIX="https://${MEDIA_SRC_ACCOUNT}.blob.core.windows.net/${MEDIA_SRC_CONTAINER}"
printf '%s\n' "$MISSING" | while IFS= read -r name; do
  [ -n "$name" ] || continue
  echo "[media-sync]   copy: ${name}"
  "$AZ" storage blob copy start \
    --account-name "$BACKUP_STORAGE_ACCOUNT" \
    --destination-container "$MEDIA_BACKUP_CONTAINER" \
    --destination-blob "$name" \
    --source-uri "${SRC_PREFIX}/${name}" \
    --auth-mode login --only-show-errors >/dev/null
done

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
