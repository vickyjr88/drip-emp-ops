# Deployment

Pushing to `main` builds and deploys to the Contabo VPS via
`.github/workflows/deploy.yml`. You can also trigger it from the Actions tab
("Deploy" → "Run workflow") to deploy a different ref, or to seed demo data
into a staging environment.

The workflow runs two jobs. `verify` builds the backend, typechecks the web app,
lints the tour anchors and builds the web app on the runner, so a broken build
never reaches the server. `deploy` then SSHes in and runs
[`scripts/deploy.sh`](../scripts/deploy.sh), which does the real work: pull,
build, migrate, restart, health-check.

## One-time server setup

The workflow assumes the repo is already checked out on the VPS and never
creates it. On the server, as the deploy user:

```bash
sudo mkdir -p /opt/drip-emporium && sudo chown "$USER" /opt/drip-emporium
git clone git@github.com:vickyjr88/drip-emporium.git /opt/drip-emporium
cd /opt/drip-emporium
cp .env.sample .env
```

Then edit `.env`. It is gitignored and **the pipeline never writes it** — it is
the one piece of state that lives only on the server, so secrets stay out of the
repo and out of CI logs. It is also deliberately excluded from backups, so keep
a copy in a password manager: without it a restored backup is unusable.

Docker and the Compose plugin must be installed, and the deploy user needs to
run `docker` without `sudo` (`sudo usermod -aG docker "$USER"`, then re-login).
The server also needs a deploy key or PAT with read access to the repo, since
the script does `git fetch` as that user.

### Required — the deploy fails without these

| Variable | Notes |
|---|---|
| `JWT_SECRET` | Generate with `openssl rand -hex 32`. Without it the API falls back to a hardcoded dev key and anyone can forge admin tokens. Compose refuses to start and the preflight refuses to deploy. |
| `NEXT_PUBLIC_SITE_URL` | The site's public origin, e.g. `https://dripemporium.com`. Canonical URLs, Open Graph tags, `sitemap.xml` and `robots.txt` are all absolute and built from it. Left at localhost, every canonical points at localhost and the site de-indexes itself — so the preflight blocks that too. Override for a deliberate local deploy with `ALLOW_LOCALHOST_SITE_URL=true`. |
| `DATABASE_URL` | Must point at the `db` service, e.g. `postgresql://postgres:<pw>@db:5432/drip_emporium`. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Must agree with `DATABASE_URL`. |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | Object storage credentials. |

### Build-time — a rebuild is required to change these

Next.js inlines `NEXT_PUBLIC_*` during `next build`, so these are Compose
**build args**, not runtime environment. Setting them only in the container
environment has no effect on the browser bundle. Every deploy rebuilds, so
editing `.env` and redeploying is enough.

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Public API URL the browser calls, e.g. `https://api.example.com`. |
| `NEXT_PUBLIC_SITE_URL` | As above. Also build-time. |

### Runtime — changing these needs only a restart

| Variable | Default | Notes |
|---|---|---|
| `INTERNAL_API_BASE_URL` | `http://backend:3100` | Used by server-rendered pages, which run inside the web container where `localhost` is the web app, not the API. Wrong value ⇒ CMS copy silently falls back to built-in defaults, and listing metadata loses its title and structured data. |
| `MEDIA_PUBLIC_BASE_URL` | — | Public URL uploaded media is served from. Must be reachable from outside your network: link-preview scrapers fetch images from it, so a localhost value means blank social cards as well as broken images. |
| `MINIO_ENDPOINT` / `MINIO_PORT` / `MINIO_USE_SSL` | `minio` / `9000` / `false` | How the backend reaches object storage inside the Compose network. |
| `MINIO_BUCKET` | `project-media` | Bucket uploads land in. |
| `REDIS_URL` | `redis://redis:6379` | Backs the BullMQ reminder queues. |
| `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` | `admin@dripemporium.store` / `Admin@123` | The admin account bootstrapped on first start. **Change the password before the first deploy** — the default is in the sample and in this repo. |
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, `INQUIRY_FALLBACK_EMAIL` | blank | Transactional email. A blank key means inquiry emails are logged as FAILED rather than sent, which is a deliberate no-op rather than a crash. |
| `AT_API_KEY`, `AT_USERNAME`, `AT_SENDER_ID` | blank / `sandbox` / blank | Africa's Talking, for reminder SMS. Blank key ⇒ SMS is skipped and logged rather than failing the run. |
| `REMINDERS_ENABLED` | `true` | Set `false` on replicas so only one instance runs the scheduler. |
| `REMINDERS_CRON` | `0 8 * * *` | When the reminder sweep runs. |
| `REMINDERS_TIMEZONE` | `Africa/Nairobi` | Timezone that cron is interpreted in. |

### Backups — read by `scripts/backup.sh`, not by Compose

See [BACKUP.md](./BACKUP.md) for the full setup. `backup.sh` refuses to run
until a destination is configured, because a backup living on the machine it
protects is not a backup.

| Variable | Default | Notes |
|---|---|---|
| `BACKUP_SSH_HOST` | — | `user@host` of the backup target. Required. |
| `BACKUP_REMOTE_DIR` | — | Absolute path on that host. Required. |
| `BACKUP_SSH_PORT` | `22` | |
| `BACKUP_SSH_KEY` | — | Private key path, if not the SSH default. |
| `BACKUP_KEEP_DAILY` / `BACKUP_KEEP_WEEKLY` / `BACKUP_KEEP_MONTHLY` | `7` / `4` / `6` | Copies kept per tier. |
| `BACKUP_VERIFY` | `true` | Restores each dump into a scratch Postgres to prove it is loadable. Leave on. |

## Upgrading an existing server

If the VPS was set up before these changes, its `.env` predates several
variables and the next deploy will stop at the preflight. Add, in order of what
will bite first:

```bash
cd /opt/drip-emporium

# 1. Required. The preflight rejects a missing or localhost value.
echo 'NEXT_PUBLIC_SITE_URL=https://your-real-domain.com' >> .env

# 2. Backups. scripts/backup.sh refuses to run without a destination.
echo 'BACKUP_SSH_HOST=backupuser@backup.example.com' >> .env
echo 'BACKUP_REMOTE_DIR=/srv/dripemporium-backups' >> .env

# 3. Check the rest against the sample; anything absent falls back to a
#    Compose default, which is right for some and wrong for MEDIA_PUBLIC_BASE_URL.
diff <(grep -oE '^[A-Z_]+' .env | sort -u) <(grep -oE '^[A-Z_]+' .env.sample | sort -u)
```

Two defaults worth checking rather than inheriting:

- `MEDIA_PUBLIC_BASE_URL` must be reachable from the public internet, or link
  previews render blank even though images work in the portal.
- `ADMIN_SEED_PASSWORD` — if it was never set, the bootstrapped admin uses the
  documented default.

## Repository secrets

Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `CONTABO_HOST` | Server IP or hostname. |
| `CONTABO_USER` | SSH user. |
| `CONTABO_SSH_KEY` | Private key, full PEM including header/footer. Use a key dedicated to CI. |
| `CONTABO_SSH_KNOWN_HOSTS` | Output of `ssh-keyscan -H <host>`. Pins the host key so the session cannot be silently redirected. |
| `CONTABO_DEPLOY_PATH` | Absolute deploy dir, e.g. `/opt/drip-emporium`. |
| `CONTABO_PORT` | Optional, defaults to `22`. |

The `deploy` job targets a `production` environment, so you can add required
reviewers there if you want deploys gated on approval.

## What a deploy does

1. **Preflight** — verifies `.env` exists, `JWT_SECRET` is set, and
   `NEXT_PUBLIC_SITE_URL` is a real origin rather than localhost. All three fail
   silently at runtime rather than crashing, so this is the only place they can
   be caught.
2. **Pull** — `git fetch` then `git reset --hard` to the target ref.
3. **Build** — `docker compose build`, passing `NEXT_PUBLIC_*` as build args.
4. **Start data services** — `db` and `minio`, gated on the db healthcheck.
5. **Migrate** — `prisma migrate deploy` in a one-off container. This runs with
   `--entrypoint npx` to bypass the image entrypoint, which would otherwise
   migrate a second time. It is kept even though the entrypoint migrates on
   every start, because it fails the deploy *here* — before any container is
   swapped in, while the old release is still serving — rather than as a
   crash-loop afterwards.
6. **Seed** — **off by default.** `prisma/seed.js` inserts demo projects, units
   and customers that must not reach production. Opt in with `RUN_SEED=true`
   for a staging environment. The rows production actually needs — permissions,
   roles, the admin user, chart of accounts, tax rates, leave types, statutory
   deductions, reminder ladders — are applied by `prisma/bootstrap.js` from the
   container entrypoint on every start.
7. **Restart** — `docker compose up -d --remove-orphans`.
8. **Health gate** — polls `/health` (up to 30 × 5s). The endpoint runs
   `SELECT 1`, so a container that is listening but cannot reach Postgres fails
   the deploy rather than being reported as a success.
9. **Complete** — the run summary records commit, ref, host, and whether seeding
   ran.

If any step fails, the script restores the previous commit and prints the last
60 lines of backend logs. Containers are deliberately left running: the old ones
keep serving until the new ones swap in at step 7, so a failure before that point
never takes the site down.

## Migrations run at container start too

The backend image has an entrypoint that applies `prisma migrate deploy` and
then bootstraps configuration before the app is allowed to listen. That covers
every start the deploy script does not: a host reboot (the containers carry
`restart: unless-stopped`), a manual `docker compose up -d`, or a crash-restart.

Before this, those starts served traffic against whatever schema happened to be
there — which is how a missing `AuditLog` table made logging in fail. The
entrypoint retries if Postgres is briefly unavailable and refuses to start the
app if migrations cannot be applied, so "the process is up" now means "the
schema is current".

## Running it by hand

The same script works on the server during an incident:

```bash
cd /opt/drip-emporium
./scripts/deploy.sh                          # deploy origin/main
DEPLOY_REF=origin/hotfix ./scripts/deploy.sh
RUN_SEED=true ./scripts/deploy.sh            # also insert demo data (staging only)
SKIP_FETCH=true ./scripts/deploy.sh          # rebuild the checkout already on disk
ALLOW_LOCALHOST_SITE_URL=true ./scripts/deploy.sh   # local/staging, no public domain
```

## Rolling back

Deploy the previous commit:

```bash
cd /opt/drip-emporium
DEPLOY_REF=<previous-sha> ./scripts/deploy.sh
```

Note this does **not** roll back database migrations. Prisma has no automatic
down-migration, so a release that changed the schema needs a new forward
migration to reverse it. To roll data back as well, restore a backup — see
[BACKUP.md](./BACKUP.md).
