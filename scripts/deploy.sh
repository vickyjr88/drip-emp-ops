#!/usr/bin/env bash
#
# Server-side deployment for drip-emporium, invoked over SSH by
# .github/workflows/deploy.yml. Safe to run by hand on the VPS too:
#
#   cd /opt/drip-emporium && ./scripts/deploy.sh
#
# Expects a populated .env in the deploy directory (never committed, never
# written by CI) and the repo already checked out on the target branch.
#
# Rolling deploy, not stop-and-restart: web/backend each have two slots
# (web/web2, backend/backend2 in docker-compose.yml) published on two
# different host ports. nginx's upstream pool for each app lists both ports
# at all times (see docs/DEPLOYMENT.md), so whichever slot is actually
# listening gets the traffic and nginx's own passive health check routes
# around a slot that is down. That means this script never has to touch
# nginx/aaPanel on a normal deploy -- it only ever starts the *idle* slot on
# the new image, waits for it to pass its own healthcheck directly (not
# through nginx), and only then stops the slot that was serving. There is
# never a moment where both slots are down at once.
#
# Which slot is "active" (the one nginx should mostly be sending traffic to,
# and the one this script will replace) is tracked in .deploy-active-slot
# next to this script's working directory -- Compose has no notion of this
# itself. Slot "a" = web/backend on WEB_PORT/API_PORT. Slot "b" = web2/
# backend2 on WEB_PORT2/API_PORT2.

set -Eeuo pipefail

DEPLOY_REF="${DEPLOY_REF:-origin/main}"
HEALTH_RETRIES="${HEALTH_RETRIES:-30}"
HEALTH_DELAY="${HEALTH_DELAY:-5}"
# Off by default: prisma/seed.js inserts demo projects, units, customers and
# tenancies that must not exist in production. The admin account and RBAC rows
# -- the only part a fresh deploy actually needs -- are handled by
# prisma/bootstrap.js from the container entrypoint instead. Opt in with
# RUN_SEED=true when provisioning a demo or staging environment.
RUN_SEED="${RUN_SEED:-false}"

STATE_FILE=".deploy-active-slot"

log() { printf '\n=== %s ===\n' "$*"; }

# Compose v2 is a docker subcommand; fall back to the v1 binary on older hosts.
if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose --profile standby)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose --profile standby)
else
  echo "Neither 'docker compose' nor 'docker-compose' is available." >&2
  exit 1
fi

PREVIOUS_SHA="$(git rev-parse HEAD)"

# Roll the code back on any failure. Images and containers are intentionally
# left alone: whichever slot was serving before this run keeps serving until
# the new one passes its healthcheck, so a failure before that point means
# the running release was never disturbed.
rollback() {
  local exit_code=$?
  log "DEPLOY FAILED (exit ${exit_code}) - restoring ${PREVIOUS_SHA}"
  git reset --hard "${PREVIOUS_SHA}" || true
  echo "Code restored. Containers were left as-is; check 'docker compose ps' and the logs above." >&2
  exit "${exit_code}"
}
trap rollback ERR

log "Preflight"
if [[ ! -f .env ]]; then
  echo "No .env in $(pwd). Create it from .env.sample before deploying." >&2
  exit 1
fi
# Compose reads .env itself; this check just fails early with a clear message
# instead of surfacing as a confusing container crash after the build.
if ! grep -qE '^JWT_SECRET=.+' .env; then
  echo "JWT_SECRET is missing or empty in .env - auth would fall back to a known dev key." >&2
  exit 1
fi
# Same class of silent failure: canonical URLs, Open Graph tags and sitemap.xml
# are all absolute and baked in at build time. A localhost value here publishes
# canonicals pointing at localhost, which tells search engines to drop the site.
# Nothing crashes, so this is the only place it can be caught.
if ! grep -qE '^NEXT_PUBLIC_SITE_URL=https?://.+' .env; then
  echo "NEXT_PUBLIC_SITE_URL is missing or malformed in .env - set it to the live origin, e.g. https://dripemporium.com" >&2
  exit 1
fi
if grep -qE '^NEXT_PUBLIC_SITE_URL=https?://(localhost|127\.0\.0\.1)' .env; then
  echo "NEXT_PUBLIC_SITE_URL still points at localhost - canonical URLs and the sitemap would de-index the live site." >&2
  echo "Set it to the public domain, or export ALLOW_LOCALHOST_SITE_URL=true for a deliberate local/staging deploy." >&2
  [[ "${ALLOW_LOCALHOST_SITE_URL:-false}" == "true" ]] || exit 1
fi
echo "Deploying as $(whoami) in $(pwd)"

# Ports are parsed rather than sourced for the same reason as backup.sh: an
# unquoted value with spaces would make `source` run the rest of the line as
# a command.
read_port() {
  sed -nE "s/^${1}=([0-9]+).*/\1/p" .env | tail -1
}
WEB_PORT="$(read_port WEB_PORT)"; WEB_PORT="${WEB_PORT:-3003}"
API_PORT="$(read_port API_PORT)"; API_PORT="${API_PORT:-3101}"
WEB_PORT2="$(read_port WEB_PORT2)"; WEB_PORT2="${WEB_PORT2:-3004}"
API_PORT2="$(read_port API_PORT2)"; API_PORT2="${API_PORT2:-3102}"

# Slot "a" is web/backend on the primary ports; slot "b" is web2/backend2 on
# the standby ports. Whichever the state file says is active is the one this
# run will replace; the other one is where the new release is started first.
ACTIVE_SLOT="a"
[[ -f "${STATE_FILE}" ]] && ACTIVE_SLOT="$(cat "${STATE_FILE}")"
if [[ "${ACTIVE_SLOT}" == "a" ]]; then
  IDLE_WEB_SERVICE="web2"; IDLE_BACKEND_SERVICE="backend2"; IDLE_WEB_PORT="${WEB_PORT2}"; IDLE_API_PORT="${API_PORT2}"
  ACTIVE_WEB_SERVICE="web"; ACTIVE_BACKEND_SERVICE="backend"
  NEXT_SLOT="b"
else
  IDLE_WEB_SERVICE="web"; IDLE_BACKEND_SERVICE="backend"; IDLE_WEB_PORT="${WEB_PORT}"; IDLE_API_PORT="${API_PORT}"
  ACTIVE_WEB_SERVICE="web2"; ACTIVE_BACKEND_SERVICE="backend2"
  NEXT_SLOT="a"
fi
log "Active slot: ${ACTIVE_SLOT} (${ACTIVE_BACKEND_SERVICE}/${ACTIVE_WEB_SERVICE}) - deploying into slot ${NEXT_SLOT} (${IDLE_BACKEND_SERVICE}/${IDLE_WEB_SERVICE})"

# The health gate polls from the host, so it has to use the *published* port
# of whichever slot is being started, not the container-internal port.
IDLE_HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${IDLE_API_PORT}/health}"

log "Pulling ${DEPLOY_REF}"
# SKIP_FETCH lets a manual run redeploy the checkout that is already on disk,
# which is also how the script is exercised where the remote is unreachable.
if [[ "${SKIP_FETCH:-false}" == "true" ]]; then
  echo "SKIP_FETCH=true - deploying the working tree as-is"
else
  git fetch --prune origin
  git reset --hard "${DEPLOY_REF}"
fi
git rev-parse --short HEAD

log "Building images"
"${COMPOSE[@]}" build

log "Starting database"
# Migrations need Postgres up; the db service healthcheck gates readiness.
"${COMPOSE[@]}" up -d db
"${COMPOSE[@]}" up -d minio

log "Running migrations"
# One-off container on the freshly built image. `migrate deploy` only applies
# committed migrations and never prompts or resets, unlike `migrate dev`.
#
# The image entrypoint also migrates on every start, so this step is not what
# guarantees a current schema any more. It is kept because it fails the deploy
# here -- before either slot is touched -- if a migration is bad, while the
# slot that is currently active keeps serving. --entrypoint bypasses the
# entrypoint so this runs exactly once rather than migrating twice.
"${COMPOSE[@]}" run --rm --no-deps --entrypoint npx backend prisma migrate deploy

if [[ "${RUN_SEED}" == "true" ]]; then
  log "Seeding reference data"
  # prisma/seed.js is upsert-based, so this is safe on an existing database.
  # Also bypasses the entrypoint: migrations already ran a step ago.
  "${COMPOSE[@]}" run --rm --no-deps --entrypoint npm backend run prisma:seed
else
  log "Seeding skipped (RUN_SEED=${RUN_SEED})"
fi

log "Starting the idle slot (${IDLE_BACKEND_SERVICE}, ${IDLE_WEB_SERVICE}) on the new image"
# The slot that was active is left running and untouched through this whole
# step -- it is still what nginx is sending most traffic to.
"${COMPOSE[@]}" up -d --no-deps "${IDLE_BACKEND_SERVICE}"

log "Waiting for the new slot's API health at ${IDLE_HEALTH_URL}"
attempt=1
until curl -fsS --max-time 5 "${IDLE_HEALTH_URL}" >/dev/null 2>&1; do
  if (( attempt >= HEALTH_RETRIES )); then
    echo "New slot did not become healthy after $(( HEALTH_RETRIES * HEALTH_DELAY ))s." >&2
    echo "--- ${IDLE_BACKEND_SERVICE} logs (last 60 lines) ---" >&2
    "${COMPOSE[@]}" logs --tail=60 "${IDLE_BACKEND_SERVICE}" >&2 || true
    echo "The previously active slot (${ACTIVE_BACKEND_SERVICE}) was never stopped and is still serving." >&2
    exit 1
  fi
  printf 'attempt %s/%s - not ready yet\n' "${attempt}" "${HEALTH_RETRIES}"
  sleep "${HEALTH_DELAY}"
  (( attempt++ ))
done
curl -fsS "${IDLE_HEALTH_URL}"; echo

# The new backend slot is healthy -- safe to bring its web slot up now too.
# It depends on the "backend" service name internally (INTERNAL_API_BASE_URL
# defaults to http://backend:3100), which Compose resolves to whichever
# container is actually named that on the shared network regardless of which
# host port is published, so this works the same for either slot.
log "Starting the idle slot's web container (${IDLE_WEB_SERVICE})"
"${COMPOSE[@]}" up -d --no-deps "${IDLE_WEB_SERVICE}"

log "Waiting for the new slot's web port (${IDLE_WEB_PORT}) to answer"
attempt=1
until curl -fsS --max-time 5 "http://127.0.0.1:${IDLE_WEB_PORT}/" >/dev/null 2>&1; do
  if (( attempt >= HEALTH_RETRIES )); then
    echo "New web slot did not answer after $(( HEALTH_RETRIES * HEALTH_DELAY ))s." >&2
    echo "--- ${IDLE_WEB_SERVICE} logs (last 60 lines) ---" >&2
    "${COMPOSE[@]}" logs --tail=60 "${IDLE_WEB_SERVICE}" >&2 || true
    echo "The previously active slot (${ACTIVE_WEB_SERVICE}) was never stopped and is still serving." >&2
    exit 1
  fi
  printf 'attempt %s/%s - not ready yet\n' "${attempt}" "${HEALTH_RETRIES}"
  sleep "${HEALTH_DELAY}"
  (( attempt++ ))
done

# Both containers in the new slot are confirmed healthy and already in
# nginx's upstream pool (both ports are listed there permanently -- see
# docs/DEPLOYMENT.md), so traffic has already started reaching them. Only
# now is it safe to stop the slot that used to be active.
log "Stopping the previous slot (${ACTIVE_BACKEND_SERVICE}, ${ACTIVE_WEB_SERVICE})"
"${COMPOSE[@]}" stop "${ACTIVE_WEB_SERVICE}" "${ACTIVE_BACKEND_SERVICE}"
"${COMPOSE[@]}" rm -f "${ACTIVE_WEB_SERVICE}" "${ACTIVE_BACKEND_SERVICE}"

echo "${NEXT_SLOT}" > "${STATE_FILE}"

trap - ERR
log "Deployment complete: $(git rev-parse --short HEAD) - active slot is now ${NEXT_SLOT}"
