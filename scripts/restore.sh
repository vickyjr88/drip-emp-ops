#!/usr/bin/env bash
#
# Restore the database and MinIO objects from a backup.
#
#   ./scripts/restore.sh --list                  what is available
#   ./scripts/restore.sh --date 2026-08-12       restore that day
#   ./scripts/restore.sh --date 2026-08-12 --db-only
#   ./scripts/restore.sh --from ./local-dir      restore from files already here
#
# Destructive by design: it replaces the current database and object store.
# Everything is confirmed before anything is touched, and a safety dump of the
# current state is taken first so a mistaken restore is itself reversible.
#
# On a brand new VPS, before running this:
#   1. install docker + compose, clone the repo to /opt/drip-emporium
#   2. restore .env from your password manager (it is never in git or backups)
#   3. docker compose up -d db minio
#   4. ./scripts/restore.sh --date <day>
#   5. docker compose up -d

set -Eeuo pipefail

cd "$(dirname "$0")/.."

MODE_LIST=false
RESTORE_DATE=""
LOCAL_DIR=""
DB_ONLY=false
MEDIA_ONLY=false
ASSUME_YES=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --list) MODE_LIST=true; shift ;;
    --date) RESTORE_DATE="$2"; shift 2 ;;
    --from) LOCAL_DIR="$2"; shift 2 ;;
    --db-only) DB_ONLY=true; shift ;;
    --media-only) MEDIA_ONLY=true; shift ;;
    --yes) ASSUME_YES=true; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

log() { printf '\n=== %s ===\n' "$*"; }
fail() { echo "RESTORE FAILED: $*" >&2; exit 1; }

[[ -f .env ]] || fail "no .env in $(pwd) - restore it before restoring data"
# Parse .env rather than sourcing it: an unquoted value containing spaces
# (BREVO_SENDER_NAME, for one) makes `source` try to run the rest as a command.
# This reads KEY=VALUE lines literally, which is what compose does too.
while IFS='=' read -r key value; do
  [[ "${key}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
  value="${value%\"}"; value="${value#\"}"
  export "${key}=${value}"
done < <(grep -vE '^[[:space:]]*(#|$)' .env)

: "${POSTGRES_USER:?POSTGRES_USER must be set in .env}"
: "${POSTGRES_DB:?POSTGRES_DB must be set in .env}"

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  fail "neither 'docker compose' nor 'docker-compose' is available"
fi

SSH_PORT="${BACKUP_SSH_PORT:-22}"
SSH_OPTS=(-p "${SSH_PORT}" -o BatchMode=yes -o ConnectTimeout=15)
RSYNC_SSH="ssh -p ${SSH_PORT} -o BatchMode=yes -o ConnectTimeout=15"
if [[ -n "${BACKUP_SSH_KEY:-}" ]]; then
  SSH_OPTS+=(-i "${BACKUP_SSH_KEY}")
  RSYNC_SSH+=" -i ${BACKUP_SSH_KEY}"
fi

# ---------------------------------------------------------------------------
if [[ "${MODE_LIST}" == "true" ]]; then
  [[ -n "${BACKUP_SSH_HOST:-}" ]] || fail "BACKUP_SSH_HOST is not set"
  log "Backups on ${BACKUP_SSH_HOST}"
  ssh "${SSH_OPTS[@]}" "${BACKUP_SSH_HOST}" \
    "for tier in daily weekly monthly; do
       d='${BACKUP_REMOTE_DIR}'/\$tier
       [ -d \"\$d\" ] || continue
       echo \"[\$tier]\"
       ls -1 \"\$d\" | sort -r | head -20 | sed 's/^/  /'
     done"
  exit 0
fi

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "${WORK_DIR}"' EXIT

# ---------------------------------------------------------------------------
if [[ -n "${LOCAL_DIR}" ]]; then
  SOURCE_DIR="${LOCAL_DIR}"
  log "Restoring from local directory ${SOURCE_DIR}"
else
  [[ -n "${RESTORE_DATE}" ]] || fail "pass --date YYYY-MM-DD (or --list to see what exists, or --from DIR)"
  [[ -n "${BACKUP_SSH_HOST:-}" ]] || fail "BACKUP_SSH_HOST is not set"

  # A date may live in any tier; check the cheapest first.
  REMOTE_DIR=""
  for tier in daily weekly monthly; do
    if ssh "${SSH_OPTS[@]}" "${BACKUP_SSH_HOST}" \
        "[ -d '${BACKUP_REMOTE_DIR}/${tier}/${RESTORE_DATE}' ]" 2>/dev/null; then
      REMOTE_DIR="${BACKUP_REMOTE_DIR}/${tier}/${RESTORE_DATE}"
      break
    fi
  done
  [[ -n "${REMOTE_DIR}" ]] || fail "no backup for ${RESTORE_DATE} - run --list"

  log "Fetching ${REMOTE_DIR}"
  rsync -a --partial -e "${RSYNC_SSH}" \
    "${BACKUP_SSH_HOST}:${REMOTE_DIR}/" "${WORK_DIR}/fetched/" \
    || fail "could not fetch the backup"
  SOURCE_DIR="${WORK_DIR}/fetched"
fi

DB_FILE="$(find "${SOURCE_DIR}" -name 'db-*.sql.gz' | sort | tail -1)"
MEDIA_FILE="$(find "${SOURCE_DIR}" -name 'media-*.tar.gz' | sort | tail -1)"
MANIFEST="$(find "${SOURCE_DIR}" -name 'manifest-*.txt' | sort | tail -1)"

[[ "${MEDIA_ONLY}" == "true" || -n "${DB_FILE}" ]] || fail "no database dump in ${SOURCE_DIR}"
[[ "${DB_ONLY}" == "true" || -n "${MEDIA_FILE}" ]] || fail "no media archive in ${SOURCE_DIR}"

if [[ -n "${MANIFEST}" ]]; then
  log "Manifest"
  cat "${MANIFEST}"
fi

# Checksums in the manifest exist precisely so a silently corrupted transfer is
# caught before it overwrites live data, not after.
if [[ -n "${MANIFEST}" && -n "${DB_FILE}" ]]; then
  want="$(grep '^db_sha256=' "${MANIFEST}" | cut -d= -f2 || true)"
  got="$(shasum -a 256 "${DB_FILE}" | cut -d' ' -f1)"
  if [[ -n "${want}" && "${want}" != "${got}" ]]; then
    fail "database dump checksum mismatch - expected ${want}, got ${got}"
  fi
fi

# ---------------------------------------------------------------------------
log "About to overwrite live data"
echo "  database : ${DB_ONLY:+yes}${MEDIA_ONLY:+no (media-only)}"
echo "  objects  : ${MEDIA_ONLY:+yes}${DB_ONLY:+no (db-only)}"
echo "  source   : ${SOURCE_DIR}"
echo
echo "This replaces the current contents of ${POSTGRES_DB} and the MinIO bucket."
if [[ "${ASSUME_YES}" != "true" ]]; then
  read -r -p "Type RESTORE to continue: " answer
  [[ "${answer}" == "RESTORE" ]] || fail "cancelled"
fi

# ---------------------------------------------------------------------------
# Safety net: dump what is there now, so a restore of the wrong day can itself
# be undone. Skipped only when there is nothing to dump.
SAFETY_DIR="./backups/pre-restore-$(date -u +%Y%m%d-%H%M%S)"
mkdir -p "${SAFETY_DIR}"
log "Snapshotting current state to ${SAFETY_DIR}"
if "${COMPOSE[@]}" exec -T db pg_isready -U "${POSTGRES_USER}" >/dev/null 2>&1; then
  "${COMPOSE[@]}" exec -T db pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
    --clean --if-exists --no-owner --no-privileges 2>/dev/null \
    | gzip -9 > "${SAFETY_DIR}/db-before-restore.sql.gz" || true
  echo "current database snapshotted"
else
  echo "database not reachable; nothing to snapshot"
fi

# ---------------------------------------------------------------------------
if [[ "${MEDIA_ONLY}" != "true" ]]; then
  log "Restoring database"
  "${COMPOSE[@]}" up -d db >/dev/null
  for _ in $(seq 1 60); do
    "${COMPOSE[@]}" exec -T db pg_isready -U "${POSTGRES_USER}" >/dev/null 2>&1 && break
    sleep 1
  done

  # The dump carries --clean --if-exists, so it drops and recreates each object
  # itself. ON_ERROR_STOP=0 because those DROPs are noisy on a fresh database.
  gunzip -c "${DB_FILE}" | "${COMPOSE[@]}" exec -T db \
    psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=0 >/dev/null

  TABLES="$("${COMPOSE[@]}" exec -T db psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -tAc \
    "select count(*) from information_schema.tables where table_schema='public';" | tr -d ' \r')"
  [[ "${TABLES:-0}" -ge 20 ]] || fail "after restore only ${TABLES} tables exist"
  echo "database restored: ${TABLES} tables"
fi

# ---------------------------------------------------------------------------
if [[ "${DB_ONLY}" != "true" ]]; then
  log "Restoring objects"
  # The MinIO image has no tar or find, so do this through a helper container
  # mounting the same volume. MinIO is stopped for the swap: writing objects
  # underneath a running server risks it serving from stale in-memory state.
  MINIO_VOLUME="$(docker volume ls --format '{{.Name}}' | grep -E "_minio-data$" | head -1)"
  [[ -n "${MINIO_VOLUME}" ]] || fail "could not find the minio-data volume"

  "${COMPOSE[@]}" stop minio >/dev/null 2>&1 || true

  # Replace rather than merge: a restore should reproduce the backup exactly,
  # and leaving stray newer objects behind reproduces neither the backup nor
  # the state before it. .minio.sys is left alone -- it is the server's own
  # metadata, not your data.
  docker run --rm -v "${MINIO_VOLUME}:/data" alpine:3 \
    sh -c 'cd /data && for entry in * .[!.]*; do [ "$entry" = ".minio.sys" ] && continue; [ -e "$entry" ] && rm -rf "$entry"; done' || true

  docker run --rm -i -v "${MINIO_VOLUME}:/data" alpine:3 \
    sh -c 'cd /data && tar xzf -' < "${MEDIA_FILE}"

  COUNT="$(docker run --rm -v "${MINIO_VOLUME}:/data:ro" alpine:3 \
    sh -c 'find /data -type f ! -path "*/.minio.sys/*" | wc -l' | tr -d ' \r')"

  "${COMPOSE[@]}" up -d minio >/dev/null
  echo "objects restored: ${COUNT} files"
fi

log "Restore complete"
echo "Previous state saved in ${SAFETY_DIR} if this was a mistake."
echo "Bring the rest of the stack up with: ${COMPOSE[*]} up -d"
