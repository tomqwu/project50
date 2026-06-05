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
#   Server-side copies every blob from the live media container
#   ($MEDIA_SRC_ACCOUNT/$MEDIA_SRC_CONTAINER) into the backup container
#   ($BACKUP_STORAGE_ACCOUNT/$MEDIA_BACKUP_CONTAINER) using
#   `az storage blob copy start-batch` (no data flows through the runner; Azure
#   copies blob-to-blob). The sync is ADDITIVE by default — it never deletes from
#   the backup, so an accidental/malicious wipe of the live container can't
#   propagate. Point-in-time recovery comes from versioning + soft-delete on the
#   BACKUP account (see docs/BACKUPS.md / docs/OBJECT-STORAGE.md).
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

if [ -z "${BACKUP_STORAGE_ACCOUNT:-}" ]; then
  echo "[media-sync] BACKUP_STORAGE_ACCOUNT not set — nothing to mirror to (no-op)."
  exit 0
fi

echo "[media-sync] source      : ${MEDIA_SRC_ACCOUNT}/${MEDIA_SRC_CONTAINER}"
echo "[media-sync] destination : ${BACKUP_STORAGE_ACCOUNT}/${MEDIA_BACKUP_CONTAINER}"
echo "[media-sync] mode        : additive (never deletes from the backup)"

# Ensure the backup container exists (idempotent).
az storage container create \
  --account-name "$BACKUP_STORAGE_ACCOUNT" \
  --name "$MEDIA_BACKUP_CONTAINER" \
  --auth-mode login --only-show-errors >/dev/null

# Server-side batch copy: source container -> backup container. `--pattern '*'`
# copies all blobs; existing identical destination blobs are left as-is. The
# copy is async on Azure's side; start-batch returns once the copies are queued.
az storage blob copy start-batch \
  --account-name "$BACKUP_STORAGE_ACCOUNT" \
  --destination-container "$MEDIA_BACKUP_CONTAINER" \
  --source-account-name "$MEDIA_SRC_ACCOUNT" \
  --source-container "$MEDIA_SRC_CONTAINER" \
  --pattern "*" \
  --auth-mode login --only-show-errors

echo "[media-sync] copy queued. (Verify backup-container blob count after Azure"
echo "[media-sync]  finishes the async server-side copies.)"
echo "[media-sync] done."
