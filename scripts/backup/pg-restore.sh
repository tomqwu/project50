#!/usr/bin/env sh
#
# pg-restore.sh — restore a Project 50 Postgres dump (produced by pg-backup.sh)
# into a TARGET database.
#
# !!! DESTRUCTIVE !!!
# -------------------
# With --clean the restore DROPs and recreates objects in the target DB. To
# avoid catastrophe, this script:
#   * REFUSES to run against the same host:db as $DATABASE_URL/$DIRECT_URL (your
#     live DB) unless you pass --i-understand-this-is-production.
#   * Requires an interactive "yes" confirmation, OR a non-interactive
#     RESTORE_CONFIRM=YES env var (for the quarterly automated restore TEST).
#
# Intended use: verify a backup by restoring it into a SCRATCH database (see the
# tested-restore runbook in docs/BACKUPS.md), or recover prod during an incident.
#
# Usage
# -----
#   # restore into a scratch DB (recommended verification flow)
#   ./scripts/backup/pg-restore.sh \
#       --dump ./backups/project50-YYYYMMDDTHHMMSSZ.dump.gz \
#       --target postgresql://user:pass@localhost:5432/project50_restore_test
#
#   # non-interactive (CI / cron quarterly test)
#   RESTORE_CONFIRM=YES ./scripts/backup/pg-restore.sh --dump ... --target ...
#
# Flags
# -----
#   --dump   PATH    Path to a .dump or .dump.gz file (REQUIRED).
#   --target URL     Target Postgres connection string (REQUIRED).
#   --clean          Pass --clean --if-exists to pg_restore (drop before create).
#   --jobs N         Parallel restore jobs (pg_restore -j). Default: 1.
#   --i-understand-this-is-production
#                    Allow restoring over the live DB. Off by default.
#
# Fail-fast.
set -eu
# shellcheck disable=SC3040
(set -o pipefail 2>/dev/null) && set -o pipefail

DUMP=""
TARGET=""
CLEAN=""
JOBS="1"
ALLOW_PROD="0"

while [ $# -gt 0 ]; do
  case "$1" in
    --dump)   DUMP="${2:-}"; shift 2 ;;
    --target) TARGET="${2:-}"; shift 2 ;;
    --clean)  CLEAN="1"; shift ;;
    --jobs)   JOBS="${2:-1}"; shift 2 ;;
    --i-understand-this-is-production) ALLOW_PROD="1"; shift ;;
    -h|--help)
      sed -n '2,40p' "$0"; exit 0 ;;
    *)
      echo "ERROR: unknown argument: $1" >&2; exit 2 ;;
  esac
done

[ -n "$DUMP" ]   || { echo "ERROR: --dump is required." >&2; exit 2; }
[ -n "$TARGET" ] || { echo "ERROR: --target is required." >&2; exit 2; }
[ -f "$DUMP" ]   || { echo "ERROR: dump file not found: $DUMP" >&2; exit 2; }

# --- production safety guard --------------------------------------------------
# Strip any password before comparing/printing so we never leak creds in logs.
strip_creds() {
  # postgresql://user:pass@host:port/db -> host:port/db
  printf '%s' "$1" | sed -E 's#^[a-zA-Z]+://[^@]*@##'
}
LIVE="${DIRECT_URL:-${DATABASE_URL:-}}"
TARGET_ID="$(strip_creds "$TARGET")"
if [ -n "$LIVE" ]; then
  LIVE_ID="$(strip_creds "$LIVE")"
  if [ "$TARGET_ID" = "$LIVE_ID" ] && [ "$ALLOW_PROD" != "1" ]; then
    echo "REFUSING: --target matches your live DATABASE_URL/DIRECT_URL (${TARGET_ID})." >&2
    echo "This would overwrite the live database. Re-run with" >&2
    echo "  --i-understand-this-is-production  to override (incident recovery only)." >&2
    exit 3
  fi
fi

echo "[pg-restore] dump   : ${DUMP}"
echo "[pg-restore] target : ${TARGET_ID}"
[ "$ALLOW_PROD" = "1" ] && echo "[pg-restore] !!! PRODUCTION OVERRIDE ENABLED !!!"

# --- confirmation -------------------------------------------------------------
# RESTORE_CONFIRM=YES skips the prompt (automated quarterly test / CI).
if [ "${RESTORE_CONFIRM:-}" = "YES" ]; then
  echo "[pg-restore] RESTORE_CONFIRM=YES — proceeding without prompt."
else
  printf 'Type "yes" to restore into %s: ' "$TARGET_ID"
  read -r REPLY
  if [ "$REPLY" != "yes" ]; then
    echo "[pg-restore] aborted." >&2
    exit 4
  fi
fi

# --- restore ------------------------------------------------------------------
# Build pg_restore args. --no-owner/--no-privileges so the restore works as
# whatever role connects to the target (matches how pg-backup.sh dumps).
set -- --no-owner --no-privileges --dbname "$TARGET" -j "$JOBS"
if [ -n "$CLEAN" ]; then
  set -- "$@" --clean --if-exists
fi

echo "[pg-restore] restoring..."
case "$DUMP" in
  *.gz)
    # Stream-decompress into pg_restore (reads the archive from stdin).
    gunzip -c "$DUMP" | pg_restore "$@"
    ;;
  *)
    pg_restore "$@" "$DUMP"
    ;;
esac

echo "[pg-restore] restore complete. Run the integrity check from docs/BACKUPS.md."
