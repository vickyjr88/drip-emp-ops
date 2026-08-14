#!/usr/bin/env bash
#
# Server-side deployment for dirrir-realtors, invoked over SSH by
# .github/workflows/deploy.yml. Safe to run by hand on the VPS too:
#
#   cd /opt/dirrir-realtors && ./scripts/deploy.sh
#
# Expects a populated .env in the deploy directory (never committed, never
# written by CI) and the repo already checked out on the target branch.

set -Eeuo pipefail

DEPLOY_REF="${DEPLOY_REF:-origin/main}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3100/health}"
HEALTH_RETRIES="${HEALTH_RETRIES:-30}"
HEALTH_DELAY="${HEALTH_DELAY:-5}"
# Off by default: prisma/seed.js inserts demo projects, units, customers and
# tenancies that must not exist in production. The admin account and RBAC rows
# -- the only part a fresh deploy actually needs -- are handled by
# prisma/bootstrap.js from the container entrypoint instead. Opt in with
# RUN_SEED=true when provisioning a demo or staging environment.
RUN_SEED="${RUN_SEED:-false}"

log() { printf '\n=== %s ===\n' "$*"; }

# Compose v2 is a docker subcommand; fall back to the v1 binary on older hosts.
if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "Neither 'docker compose' nor 'docker-compose' is available." >&2
  exit 1
fi

PREVIOUS_SHA="$(git rev-parse HEAD)"

# Roll the code back on any failure. Images and containers are intentionally
# left alone: the old containers keep serving until the new ones swap in, so a
# failure before that point means the running release was never disturbed.
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
  echo "NEXT_PUBLIC_SITE_URL is missing or malformed in .env - set it to the live origin, e.g. https://dirrirrealtors.com" >&2
  exit 1
fi
if grep -qE '^NEXT_PUBLIC_SITE_URL=https?://(localhost|127\.0\.0\.1)' .env; then
  echo "NEXT_PUBLIC_SITE_URL still points at localhost - canonical URLs and the sitemap would de-index the live site." >&2
  echo "Set it to the public domain, or export ALLOW_LOCALHOST_SITE_URL=true for a deliberate local/staging deploy." >&2
  [[ "${ALLOW_LOCALHOST_SITE_URL:-false}" == "true" ]] || exit 1
fi
echo "Deploying as $(whoami) in $(pwd)"

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
# here -- before any container is swapped in -- if a migration is bad, while
# the old release is still serving. Without it a broken migration would only
# surface as the new containers crash-looping. --entrypoint bypasses the
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

log "Starting application"
"${COMPOSE[@]}" up -d --remove-orphans

log "Waiting for API health at ${HEALTH_URL}"
attempt=1
until curl -fsS --max-time 5 "${HEALTH_URL}" >/dev/null 2>&1; do
  if (( attempt >= HEALTH_RETRIES )); then
    echo "API did not become healthy after $(( HEALTH_RETRIES * HEALTH_DELAY ))s." >&2
    echo "--- backend logs (last 60 lines) ---" >&2
    "${COMPOSE[@]}" logs --tail=60 backend >&2 || true
    exit 1
  fi
  printf 'attempt %s/%s - not ready yet\n' "${attempt}" "${HEALTH_RETRIES}"
  sleep "${HEALTH_DELAY}"
  (( attempt++ ))
done
curl -fsS "${HEALTH_URL}"; echo

trap - ERR
log "Deployment complete: $(git rev-parse --short HEAD)"
