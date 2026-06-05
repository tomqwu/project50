#!/usr/bin/env bash
#
# pg-restore-drill.sh — PROVE a Project 50 Postgres backup is restorable.
#
# Restores a dump (local file or the latest blob from the backup container) into
# a THROWAWAY scratch database, runs sanity checks (expected tables exist, row
# counts non-zero, Prisma migration history present), prints the wall-clock
# restore time (validates the RTO target), then DROPS the scratch database.
#
# It NEVER touches prod: the scratch DB is a separate database with a fixed,
# obviously-disposable name (project50_restore_test) and the script refuses to
# run if the scratch DB name collides with the source.
#
# This is a DRILL, not a recovery. Real recovery uses scripts/pg-restore.sh.
#
# Default scratch target: a local Postgres in docker (no cloud access needed),
# so this is safe to run anywhere, including CI. Override --scratch-url to drill
# against a managed throwaway server.
#
# Usage
# -----
#   # drill the latest offsite blob into a local docker Postgres:
#   BACKUP_STORAGE_ACCOUNT=stp50backupszv34o5 BACKUP_CONTAINER=db-backups \
#     ./scripts/pg-restore-drill.sh
#
#   # drill a specific local dump:
#   ./scripts/pg-restore-drill.sh --dump ./backups/project50-20260605T031700Z.dump.gz
#
#   # drill against an existing scratch server (must be a throwaway):
#   ./scripts/pg-restore-drill.sh --dump ./d.dump.gz \
#     --scratch-url "postgresql://u:p@scratch-host:5432/postgres"
#
# Flags / env
# -----------
#   --dump PATH             A local .dump(.gz). If omitted, the latest blob is
#                           downloaded from $BACKUP_STORAGE_ACCOUNT/$BACKUP_CONTAINER.
#   --scratch-url URL       Connection to a Postgres where a throwaway DB can be
#                           created. Default: a local docker Postgres this script
#                           starts and tears down (DRILL_DOCKER=1).
#   --keep                  Do NOT drop the scratch DB / stop the container at the
#                           end (for manual inspection). Default: tears down.
#   BACKUP_STORAGE_ACCOUNT  Storage account holding the dumps (for blob download).
#   BACKUP_CONTAINER        Blob container. Default: db-backups.
#   SCRATCH_DB              Scratch DB name. Default: project50_restore_test.
#   EXPECTED_TABLES         Space-separated tables that MUST exist post-restore.
#                           Default: User. Extend as the schema grows.
#   PG_IMAGE                Postgres image for the local scratch + client tools.
#                           Default: postgres:16.
#
# Exit non-zero if the restore fails OR a sanity check fails — a failed drill is
# an incident-class finding (fix the backup tooling before the next cycle).
#
# Fail-fast.
set -euo pipefail

DUMP=""
SCRATCH_URL=""
KEEP="0"
SCRATCH_DB="${SCRATCH_DB:-project50_restore_test}"
PG_IMAGE="${PG_IMAGE:-postgres:16}"
BACKUP_CONTAINER="${BACKUP_CONTAINER:-db-backups}"

while [ $# -gt 0 ]; do
  case "$1" in
    --dump)        DUMP="${2:-}"; shift 2 ;;
    --scratch-url) SCRATCH_URL="${2:-}"; shift 2 ;;
    --keep)        KEEP="1"; shift ;;
    -h|--help)     sed -n '2,40p' "$0"; exit 0 ;;
    *) echo "ERROR: unknown argument: $1" >&2; exit 2 ;;
  esac
done

# --- SAFETY: the scratch DB name must be disposable ---------------------------
# This script issues `DROP DATABASE ... $SCRATCH_DB`. If SCRATCH_DB were ever a
# real/production database name, the drill would DELETE it. Hard-reject a set of
# protected names BEFORE any drop can run (this guard sits before cleanup() is
# even registered, so the protected name can never reach a DROP on any path —
# local-docker or external --scratch-url).
PROTECTED_DBS="${PROTECTED_DBS:-project50 postgres template0 template1 azure_maintenance azure_sys}"
# shellcheck disable=SC2086  # intentional word-splitting of the space-sep list
for protected in $PROTECTED_DBS; do
  if [ "$SCRATCH_DB" = "$protected" ]; then
    echo "REFUSING: SCRATCH_DB='${SCRATCH_DB}' is a protected/production database name." >&2
    echo "The drill DROPs the scratch DB; it must be a throwaway name (default" >&2
    echo "project50_restore_test). Pick a disposable SCRATCH_DB and re-run." >&2
    exit 3
  fi
done

WORKDIR="$(mktemp -d)"
CONTAINER_NAME="p50-restore-drill-$$"
STARTED_DOCKER="0"

cleanup() {
  if [ "$KEEP" = "1" ]; then
    echo "[drill] --keep set: leaving scratch in place. Manual teardown:"
    [ "$STARTED_DOCKER" = "1" ] && echo "  docker rm -f ${CONTAINER_NAME}"
    return
  fi
  if [ -n "$SCRATCH_URL" ] && [ "$STARTED_DOCKER" != "1" ]; then
    # External scratch server: drop the throwaway DB we created (never the
    # server). Connect to the admin 'postgres' DB to issue the DROP.
    ADMIN_DB_URL="$(printf '%s' "$SCRATCH_URL" | sed -E 's#/[^/?]+(\?|$)#/postgres\1#')"
    docker run --rm "$PG_IMAGE" \
      psql "$ADMIN_DB_URL" -v ON_ERROR_STOP=1 \
      -c "DROP DATABASE IF EXISTS ${SCRATCH_DB} WITH (FORCE);" >/dev/null 2>&1 || true
  fi
  if [ "$STARTED_DOCKER" = "1" ]; then
    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  fi
  rm -rf "$WORKDIR"
}
trap cleanup EXIT INT TERM

# --- obtain a dump ------------------------------------------------------------
if [ -z "$DUMP" ]; then
  [ -n "${BACKUP_STORAGE_ACCOUNT:-}" ] || {
    echo "ERROR: pass --dump PATH, or set BACKUP_STORAGE_ACCOUNT to pull the latest blob." >&2
    exit 2
  }
  echo "[drill] finding the latest dump in ${BACKUP_STORAGE_ACCOUNT}/${BACKUP_CONTAINER}"
  # Blob names sort chronologically; the last one is the newest.
  LATEST="$(az storage blob list \
    --account-name "$BACKUP_STORAGE_ACCOUNT" \
    --container-name "$BACKUP_CONTAINER" \
    --prefix "project50-" \
    --auth-mode login \
    --query "[].name" -o tsv --only-show-errors | sort | tail -1)"
  [ -n "$LATEST" ] || { echo "ERROR: no backups found in the container." >&2; exit 1; }
  echo "[drill] latest blob: ${LATEST}"
  DUMP="${WORKDIR}/${LATEST}"
  az storage blob download \
    --account-name "$BACKUP_STORAGE_ACCOUNT" \
    --container-name "$BACKUP_CONTAINER" \
    --name "$LATEST" --file "$DUMP" --auth-mode login --only-show-errors
fi
[ -f "$DUMP" ] || { echo "ERROR: dump file not found: $DUMP" >&2; exit 2; }
echo "[drill] dump: ${DUMP}"

# --- stand up / target a scratch database ------------------------------------
# Each branch defines two helpers used by the rest of the script:
#   PSQL <psql-args...>            run psql against the scratch DB
#   RESTORE                        stream the (maybe-gz) dump into pg_restore
# The LOCAL path runs both via `docker exec` INTO the scratch container — no
# published port and no `--network host`, so it works on Docker Desktop/macOS
# (where host networking is unavailable) and on Linux runners alike.
if [ -z "$SCRATCH_URL" ]; then
  # Local docker Postgres — fully self-contained, no cloud access, no ports.
  echo "[drill] starting throwaway Postgres container ${CONTAINER_NAME}"
  docker run -d --name "$CONTAINER_NAME" \
    -e POSTGRES_PASSWORD=drill -e POSTGRES_DB="$SCRATCH_DB" \
    "$PG_IMAGE" >/dev/null
  STARTED_DOCKER="1"
  # Wait for readiness.
  echo "[drill] waiting for Postgres to accept connections..."
  for _ in $(seq 1 30); do
    if docker exec "$CONTAINER_NAME" pg_isready -U postgres >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  # In-container connection: localhost inside the scratch container itself.
  IN_URL="postgresql://postgres:drill@127.0.0.1:5432/${SCRATCH_DB}"
  PSQL() { docker exec -i "$CONTAINER_NAME" psql "$IN_URL" "$@"; }
  RESTORE() {
    case "$DUMP" in
      *.gz) gunzip -c "$DUMP" | docker exec -i "$CONTAINER_NAME" \
              pg_restore --no-owner --no-privileges --clean --if-exists --dbname "$IN_URL" ;;
      *)    docker exec -i "$CONTAINER_NAME" \
              pg_restore --no-owner --no-privileges --clean --if-exists --dbname "$IN_URL" < "$DUMP" ;;
    esac
  }
else
  # External scratch server: guard against accidentally targeting the source.
  # Compare the NORMALIZED restore target (host:port + the scratch DB name we
  # will actually create/drop) against the live DATABASE_URL — not just the
  # raw --scratch-url (which is typically an admin /postgres URL whose db name
  # differs). strip_creds() drops user:pass and any querystring so we compare
  # host:port/db only.
  strip_creds() { printf '%s' "$1" | sed -E 's#^[a-zA-Z]+://[^@]*@##; s#\?.*$##'; }
  # The actual target = scratch host with SCRATCH_DB as the database.
  TARGET_URL="$(printf '%s' "$SCRATCH_URL" | sed -E "s#/[^/?]+(\?|\$)#/${SCRATCH_DB}\1#")"
  TARGET_ID="$(strip_creds "$TARGET_URL")"
  SRC_ID="$(strip_creds "${DATABASE_URL:-}")"
  if [ -n "$SRC_ID" ] && [ "$TARGET_ID" = "$SRC_ID" ]; then
    echo "REFUSING: the scratch target (${TARGET_ID}) collides with the live DATABASE_URL." >&2
    echo "A drill must restore into a throwaway DB on a non-live host/name." >&2
    exit 3
  fi
  echo "[drill] creating throwaway DB ${SCRATCH_DB} on the scratch server"
  ADMIN_DB_URL="$(printf '%s' "$SCRATCH_URL" | sed -E 's#/[^/?]+(\?|$)#/postgres\1#')"
  docker run --rm "$PG_IMAGE" psql "$ADMIN_DB_URL" -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS ${SCRATCH_DB} WITH (FORCE);" \
    -c "CREATE DATABASE ${SCRATCH_DB};"
  SCRATCH_URL="$TARGET_URL"
  PSQL() { docker run --rm "$PG_IMAGE" psql "$SCRATCH_URL" "$@"; }
  RESTORE() {
    case "$DUMP" in
      *.gz) gunzip -c "$DUMP" | docker run --rm -i "$PG_IMAGE" \
              pg_restore --no-owner --no-privileges --clean --if-exists --dbname "$SCRATCH_URL" ;;
      *)    docker run --rm -i "$PG_IMAGE" \
              pg_restore --no-owner --no-privileges --clean --if-exists --dbname "$SCRATCH_URL" < "$DUMP" ;;
    esac
  }
fi

# --- restore (timed) ----------------------------------------------------------
echo "[drill] restoring into scratch DB (timing for RTO)..."
START="$(date +%s)"
RESTORE
END="$(date +%s)"
ELAPSED="$(( END - START ))"
echo "[drill] restore wall-clock: ${ELAPSED}s (compare to the RTO target in docs/BACKUPS.md)"

# --- sanity checks ------------------------------------------------------------
echo "[drill] === sanity checks ==="
FAIL="0"

# 1) The Prisma migration ledger must exist and be non-empty — proves the schema
#    restored and was at a known migration head.
MIGRATIONS="$(PSQL -Atc \
  "SELECT count(*) FROM _prisma_migrations;" 2>/dev/null || echo "ERR")"
if [ "$MIGRATIONS" = "ERR" ] || [ "$MIGRATIONS" = "0" ]; then
  echo "[drill] FAIL: _prisma_migrations missing or empty (got '${MIGRATIONS}')"
  FAIL="1"
else
  echo "[drill] ok: _prisma_migrations has ${MIGRATIONS} rows"
fi

# 2) Core Project 50 tables must be present. Adjust this list as the schema
#    grows; a known core table proves the dump carried real schema, not an empty
#    shell. "User" is the canonical always-present table.
EXPECTED_TABLES="${EXPECTED_TABLES:-User}"
# shellcheck disable=SC2086  # intentional word-splitting: space-separated list
for tbl in $EXPECTED_TABLES; do
  EXISTS="$(PSQL -Atc \
    "SELECT to_regclass('public.\"${tbl}\"') IS NOT NULL;" 2>/dev/null || echo "f")"
  if [ "$EXISTS" = "t" ]; then
    echo "[drill] ok: table \"${tbl}\" exists"
  else
    echo "[drill] FAIL: expected table \"${tbl}\" is missing"
    FAIL="1"
  fi
done

# 3) Report row counts across all public tables (informational — look for an
#    unexpectedly empty restore).
echo "[drill] row counts (public schema):"
PSQL -Atc \
  "SELECT relname || '=' || n_live_tup FROM pg_stat_user_tables ORDER BY relname;" \
  2>/dev/null | sed 's/^/[drill]   /' || true

if [ "$FAIL" != "0" ]; then
  echo "[drill] RESULT: FAIL — backup did NOT restore cleanly. Treat as an incident." >&2
  exit 1
fi
echo "[drill] RESULT: PASS — backup restored and passed sanity checks in ${ELAPSED}s."
