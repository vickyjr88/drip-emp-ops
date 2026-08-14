#!/bin/sh
#
# Container entrypoint for the backend. Applies pending migrations before the
# app is allowed to listen.
#
# scripts/deploy.sh also runs `migrate deploy`, but only on the deploy path.
# Containers carry `restart: unless-stopped`, so they also come up on host
# reboot, on manual `docker compose up -d`, and after a crash -- none of which
# go through the deploy script. Previously those starts served traffic against
# whatever schema happened to be there, and requests touching a table from an
# unapplied migration (e.g. AuditLog on login) failed at runtime. Migrating
# here makes "the process is up" mean "the schema is current", regardless of
# how the container was started.
#
# Re-running is safe and cheap: `migrate deploy` is a no-op when there is
# nothing pending, and it never prompts or resets, unlike `migrate dev`.

set -eu

echo "==> Applying database migrations"

# Postgres may still be accepting connections slowly when several containers
# restart together (host reboot), and compose's dependency ordering does not
# apply to a `docker compose up` of a single service. Retry rather than crash-
# looping the container, so transient unavailability self-heals within a boot.
attempt=1
max_attempts="${MIGRATE_RETRIES:-10}"
delay="${MIGRATE_RETRY_DELAY:-3}"

until npx prisma migrate deploy; do
  if [ "${attempt}" -ge "${max_attempts}" ]; then
    echo "Migrations failed after ${max_attempts} attempts; refusing to start." >&2
    exit 1
  fi
  echo "migrate deploy failed (attempt ${attempt}/${max_attempts}); retrying in ${delay}s" >&2
  attempt=$((attempt + 1))
  sleep "${delay}"
done

echo "==> Migrations up to date"

# Migrations create the User table but leave it empty, so a start that bypasses
# scripts/deploy.sh would otherwise leave nobody able to log in. This bootstraps
# only permissions, the ADMIN role and the admin user -- NOT prisma/seed.js,
# which also inserts demo projects, units, customers and tenancies that must
# never reach production. It no-ops once any user exists.
echo "==> Ensuring admin account"
node prisma/bootstrap.js

echo "==> Starting backend"

# exec so the app becomes PID 1 and receives SIGTERM directly on `docker stop`,
# letting Nest shut down cleanly instead of being killed after the grace period.
exec "$@"
