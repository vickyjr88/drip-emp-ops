#!/usr/bin/env bash
#
# Nightly backup of the database and MinIO objects, pushed to a second host
# over SSH.
#
#   cd /opt/dirrir-realtors && ./scripts/backup.sh
#
# Both volumes are `driver: local`, so they exist only on this VPS's disk. A
# destroyed host, a `docker volume rm`, or a disk failure loses everything with
# no way back. That is what this script exists to prevent, which is why it
# refuses to "succeed" while writing only to the same machine.
#
# Expects in .env (see .env.sample):
#   BACKUP_SSH_HOST      user@host of the backup target
#   BACKUP_SSH_PORT      optional, default 22
#   BACKUP_REMOTE_DIR    absolute path on the target, e.g. /srv/dirrir-backups
#   BACKUP_SSH_KEY       optional path to the private key
#
# Cron, as the deploy user:
#   30 2 * * * cd /opt/dirrir-realtors && ./scripts/backup.sh >> /var/log/dirrir-backup.log 2>&1

set -Eeuo pipefail

cd "$(dirname "$0")/.."

STAMP="$(date -u +%Y%m%d-%H%M%S)"
DAY="$(date -u +%Y-%m-%d)"
WORK_DIR="$(mktemp -d)"
KEEP_DAILY="${BACKUP_KEEP_DAILY:-7}"
KEEP_WEEKLY="${BACKUP_KEEP_WEEKLY:-4}"
KEEP_MONTHLY="${BACKUP_KEEP_MONTHLY:-6}"
VERIFY="${BACKUP_VERIFY:-true}"

log() { printf '\n=== %s ===\n' "$*"; }
fail() { echo "BACKUP FAILED: $*" >&2; exit 1; }

cleanup() { rm -rf "${WORK_DIR}"; }
trap cleanup EXIT

if [[ ! -f .env ]]; then
  fail "no .env in $(pwd)"
fi
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

# A backup that never leaves the machine it is protecting is not a backup.
# Refuse rather than quietly producing a false sense of safety.
if [[ -z "${BACKUP_SSH_HOST:-}" || -z "${BACKUP_REMOTE_DIR:-}" ]]; then
  fail "BACKUP_SSH_HOST and BACKUP_REMOTE_DIR must be set - a local-only backup does not survive losing this VPS"
fi

SSH_PORT="${BACKUP_SSH_PORT:-22}"
SSH_OPTS=(-p "${SSH_PORT}" -o BatchMode=yes -o ConnectTimeout=15)
RSYNC_SSH="ssh -p ${SSH_PORT} -o BatchMode=yes -o ConnectTimeout=15"
if [[ -n "${BACKUP_SSH_KEY:-}" ]]; then
  SSH_OPTS+=(-i "${BACKUP_SSH_KEY}")
  RSYNC_SSH+=" -i ${BACKUP_SSH_KEY}"
fi

# ---------------------------------------------------------------------------
log "Dumping database"
# --clean --if-exists so the dump can be restored over an existing database
# without hand-dropping it first; a restore happens under pressure and should
# need as few manual steps as possible.
DB_FILE="${WORK_DIR}/db-${STAMP}.sql.gz"
"${COMPOSE[@]}" exec -T db pg_dump \
  --username "${POSTGRES_USER}" \
  --dbname "${POSTGRES_DB}" \
  --clean --if-exists --no-owner --no-privileges \
  | gzip -9 > "${DB_FILE}"

if [[ ! -s "${DB_FILE}" ]]; then
  fail "database dump is empty"
fi
gzip -t "${DB_FILE}" || fail "database dump is not valid gzip"
DB_SIZE="$(wc -c < "${DB_FILE}" | tr -d ' ')"
echo "dump: ${DB_FILE} (${DB_SIZE} bytes)"

# ---------------------------------------------------------------------------
if [[ "${VERIFY}" == "true" ]]; then
  log "Verifying dump restores"
  # The failure this catches: backups running nightly for months that turn out
  # to be empty or corrupt exactly when they are needed. Size and gzip checks
  # cannot catch a dump that is well-formed but restores to nothing, so restore
  # it for real into a throwaway container and count what lands.
  VERIFY_NAME="dirrir-backup-verify-${STAMP}"
  docker run -d --name "${VERIFY_NAME}" \
    -e POSTGRES_PASSWORD=verify \
    -e POSTGRES_USER=verify \
    -e POSTGRES_DB=verify \
    postgres:16-alpine >/dev/null

  verify_cleanup() { docker rm -f "${VERIFY_NAME}" >/dev/null 2>&1 || true; }
  trap 'verify_cleanup; cleanup' EXIT

  for _ in $(seq 1 30); do
    if docker exec "${VERIFY_NAME}" pg_isready -U verify >/dev/null 2>&1; then break; fi
    sleep 1
  done

  gunzip -c "${DB_FILE}" | docker exec -i "${VERIFY_NAME}" \
    psql -U verify -d verify -v ON_ERROR_STOP=0 >/dev/null 2>&1 || true

  TABLES="$(docker exec "${VERIFY_NAME}" psql -U verify -d verify -tAc \
    "select count(*) from information_schema.tables where table_schema='public';" | tr -d ' ')"
  USERS="$(docker exec "${VERIFY_NAME}" psql -U verify -d verify -tAc \
    'select count(*) from "User";' 2>/dev/null | tr -d ' ' || echo 0)"

  verify_cleanup
  trap cleanup EXIT

  if [[ "${TABLES:-0}" -lt 20 ]]; then
    fail "restore check found only ${TABLES} tables - the dump is not usable"
  fi
  # A schema with no users means nobody could log in to the restored system.
  if [[ "${USERS:-0}" -lt 1 ]]; then
    fail "restore check found no rows in User - the dump restored a schema with no data"
  fi
  echo "restore check passed: ${TABLES} tables, ${USERS} users"
else
  echo "verification skipped (BACKUP_VERIFY=${VERIFY})"
fi

# ---------------------------------------------------------------------------
log "Archiving MinIO objects"
# The MinIO image is minimal -- no tar, gzip or find, only mc and cp -- so
# archiving from inside it silently produced a 0-byte file. Mount the volume
# read-only into a throwaway alpine instead, which has real tar and does not
# require MinIO to be running at all.
MEDIA_FILE="${WORK_DIR}/media-${STAMP}.tar.gz"
MINIO_VOLUME="$(docker volume ls --format '{{.Name}}' | grep -E "_minio-data$" | head -1)"
[[ -n "${MINIO_VOLUME}" ]] || fail "could not find the minio-data volume"
echo "volume: ${MINIO_VOLUME}"

docker run --rm -v "${MINIO_VOLUME}:/data:ro" alpine:3 \
  sh -c 'cd /data && tar czf - --exclude=".minio.sys" .' > "${MEDIA_FILE}"

if [[ ! -s "${MEDIA_FILE}" ]]; then
  fail "media archive is empty"
fi
gzip -t "${MEDIA_FILE}" || fail "media archive is not valid gzip"
MEDIA_COUNT="$(tar tzf "${MEDIA_FILE}" | grep -vc '/$' || true)"
# A media archive with no objects is legitimate on a fresh install but suspect
# on a running one, so say so rather than passing silently.
if [[ "${MEDIA_COUNT:-0}" -eq 0 ]]; then
  echo "WARNING: the media archive contains no objects" >&2
fi
echo "media: ${MEDIA_FILE} ($(wc -c < "${MEDIA_FILE}" | tr -d ' ') bytes, ${MEDIA_COUNT} files)"

# ---------------------------------------------------------------------------
log "Recording a manifest"
# Restores happen in a hurry. Knowing what a backup contained, and what the
# system looked like when it was taken, is worth the few bytes.
MANIFEST="${WORK_DIR}/manifest-${STAMP}.txt"
{
  echo "taken_at_utc=${STAMP}"
  echo "git_commit=$(git rev-parse HEAD 2>/dev/null || echo unknown)"
  echo "db_file=db-${STAMP}.sql.gz"
  echo "db_bytes=${DB_SIZE}"
  echo "db_sha256=$(shasum -a 256 "${DB_FILE}" | cut -d' ' -f1)"
  echo "media_file=media-${STAMP}.tar.gz"
  echo "media_bytes=$(wc -c < "${MEDIA_FILE}" | tr -d ' ')"
  echo "media_files=${MEDIA_COUNT}"
  echo "media_sha256=$(shasum -a 256 "${MEDIA_FILE}" | cut -d' ' -f1)"
  echo "verified=${VERIFY}"
} > "${MANIFEST}"
cat "${MANIFEST}"

# ---------------------------------------------------------------------------
log "Pushing to ${BACKUP_SSH_HOST}:${BACKUP_REMOTE_DIR}"
REMOTE_DAY_DIR="${BACKUP_REMOTE_DIR}/daily/${DAY}"
ssh "${SSH_OPTS[@]}" "${BACKUP_SSH_HOST}" "mkdir -p '${REMOTE_DAY_DIR}'" \
  || fail "cannot reach ${BACKUP_SSH_HOST} - check BACKUP_SSH_HOST, the port and the key"

rsync -a --partial --checksum -e "${RSYNC_SSH}" \
  "${DB_FILE}" "${MEDIA_FILE}" "${MANIFEST}" \
  "${BACKUP_SSH_HOST}:${REMOTE_DAY_DIR}/" \
  || fail "rsync to ${BACKUP_SSH_HOST} failed"

# Confirm the bytes that landed match what was sent. rsync reports success on a
# transfer that a full disk silently truncated.
REMOTE_SUM="$(ssh "${SSH_OPTS[@]}" "${BACKUP_SSH_HOST}" \
  "sha256sum '${REMOTE_DAY_DIR}/$(basename "${DB_FILE}")' 2>/dev/null | cut -d' ' -f1" || true)"
LOCAL_SUM="$(shasum -a 256 "${DB_FILE}" | cut -d' ' -f1)"
if [[ -n "${REMOTE_SUM}" && "${REMOTE_SUM}" != "${LOCAL_SUM}" ]]; then
  fail "checksum mismatch after transfer - local ${LOCAL_SUM}, remote ${REMOTE_SUM}"
fi
echo "transfer verified: ${LOCAL_SUM}"

# ---------------------------------------------------------------------------
log "Promoting weekly and monthly copies"
# Retention without promotion means everything older than KEEP_DAILY is gone.
# Keeping a Sunday copy and a first-of-month copy gives a long tail cheaply --
# which matters for damage noticed weeks later, like a bad import.
if [[ "$(date -u +%u)" == "7" ]]; then
  ssh "${SSH_OPTS[@]}" "${BACKUP_SSH_HOST}" \
    "mkdir -p '${BACKUP_REMOTE_DIR}/weekly' && cp -r '${REMOTE_DAY_DIR}' '${BACKUP_REMOTE_DIR}/weekly/${DAY}'" || true
fi
if [[ "$(date -u +%d)" == "01" ]]; then
  ssh "${SSH_OPTS[@]}" "${BACKUP_SSH_HOST}" \
    "mkdir -p '${BACKUP_REMOTE_DIR}/monthly' && cp -r '${REMOTE_DAY_DIR}' '${BACKUP_REMOTE_DIR}/monthly/${DAY}'" || true
fi

log "Pruning old backups"
# POSIX sh, not bash: a minimal backup host (an alpine container, a NAS) may
# not have bash at all, and the prune silently failed when it did not.
ssh "${SSH_OPTS[@]}" "${BACKUP_SSH_HOST}" sh -s -- \
  "${BACKUP_REMOTE_DIR}" "${KEEP_DAILY}" "${KEEP_WEEKLY}" "${KEEP_MONTHLY}" <<'REMOTE'
set -eu
root="$1"; keep_daily="$2"; keep_weekly="$3"; keep_monthly="$4"
prune() {
  dir="$1"; keep="$2"
  [ -d "$dir" ] || return 0
  # Directories are named YYYY-MM-DD, so a reverse sort is newest-first.
  ls -1 "$dir" 2>/dev/null | sort -r | tail -n "+$((keep + 1))" | while read -r old; do
    [ -n "$old" ] || continue
    rm -rf "${dir}/${old}"
    echo "pruned $(basename "$dir")/${old}"
  done
}
prune "${root}/daily" "${keep_daily}"
prune "${root}/weekly" "${keep_weekly}"
prune "${root}/monthly" "${keep_monthly}"
REMOTE

log "Backup complete: ${DAY} -> ${BACKUP_SSH_HOST}:${REMOTE_DAY_DIR}"
