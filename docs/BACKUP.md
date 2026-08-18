# Backup and recovery

The database and all uploaded documents and images live in Docker volumes with
`driver: local` — they exist only on the VPS's own disk. A destroyed host, an
accidental `docker volume rm`, or a disk failure loses everything with no way
back. These scripts push both off the machine nightly and restore them.

**What is protected**

| Data | Where it lives | In backup |
|---|---|---|
| All business records | `db-data` volume (Postgres) | `db-<stamp>.sql.gz` |
| Documents, photos, floor plans | `minio-data` volume | `media-<stamp>.tar.gz` |
| Queued reminder jobs | `redis-data` volume | not backed up — regenerated from the database |
| Secrets | `.env` on the host | **not backed up. See below.** |

## `.env` is not in the backups

Deliberately: it holds the JWT secret, database password and MinIO credentials,
and a backup host is not the place for them. Keep `.env` in a password manager.
**Without it, a restored backup is unusable** — the app cannot decrypt sessions
or reach its own storage.

This is the single most likely thing to go wrong in a real recovery. Check now
that you have a copy somewhere other than the VPS.

## Setup

You need a second machine — another VPS, a NAS, anything with SSH and rsync.
It should not be the machine being backed up.

1. **On the backup host**, create the destination and authorise the deploy user:

   ```bash
   mkdir -p /srv/dripemporium-backups
   # paste the deploy host's public key
   vi ~/.ssh/authorized_keys
   ```

2. **On the VPS**, add to `.env`:

   ```
   BACKUP_SSH_HOST=backupuser@backup.example.com
   BACKUP_SSH_PORT=22
   BACKUP_REMOTE_DIR=/srv/dripemporium-backups
   BACKUP_SSH_KEY=/home/deploy/.ssh/id_ed25519
   ```

3. **Test it by hand before trusting it to cron:**

   ```bash
   cd /opt/drip-emporium && ./scripts/backup.sh
   ```

4. **Schedule it**, as the deploy user (`crontab -e`):

   ```cron
   30 2 * * * cd /opt/drip-emporium && ./scripts/backup.sh >> /opt/drip-emporium/backups/backup.log 2>&1
   ```

   The log deliberately does **not** go in `/var/log`: that is not writable by a
   non-root user, so the redirect fails, cron discards the output, and a failing
   backup reports nothing at all. `backups/` is created by the script and is
   gitignored.

   Do not schedule this through aaPanel's Cron UI. Its jobs run as root, and a
   root-run backup writes `backups/` and the rsync key usage as root — after
   which the deploy user's own runs fail on permissions. Use the deploy user's
   own crontab, since that is the user whose SSH key the backup host trusts.

   Check after the first scheduled night that the log has content and that the
   remote `daily/` directory gained a dated folder. A cron job that never fires
   looks identical to one that fires and succeeds silently.

## What the nightly run does

1. `pg_dump` the database, gzip it.
2. **Restore that dump into a throwaway Postgres and count what lands.** If it
   restores fewer than 20 tables, or no users, the run fails loudly. This is
   the check that catches backups which have been running for months and are
   silently empty — the failure people discover only when they need the backup.
3. Archive the MinIO objects (via a helper container: the MinIO image has no
   `tar`).
4. Write a manifest with sizes, file counts, SHA-256s and the deployed commit.
5. rsync everything to the backup host and **verify the checksum of what
   landed** — rsync reports success on a transfer that a full disk truncated.
6. Promote a copy to `weekly/` on Sundays and `monthly/` on the 1st.
7. Prune: 7 daily, 4 weekly, 6 monthly.

That retention means roughly six months of history for a few hundred MB.

## Recovery

### See what exists

```bash
./scripts/restore.sh --list
```

### Restore a specific day

```bash
./scripts/restore.sh --date 2026-08-12
```

It prints the manifest, verifies checksums, asks you to type `RESTORE`, and
**snapshots the current state to `./backups/pre-restore-<stamp>/` first** — so
restoring the wrong day is itself reversible.

`--db-only` and `--media-only` restore one side. `--from DIR` restores from
files already on disk.

### Rebuilding a destroyed VPS

```bash
# 1. new host: install docker + compose
# 2. clone the repo
git clone <repo> /opt/drip-emporium && cd /opt/drip-emporium

# 3. restore .env from your password manager  <-- the step that blocks everything

# 4. bring up just the data services
docker compose up -d db minio

# 5. restore
./scripts/restore.sh --date <most-recent>

# 6. start everything
docker compose up -d
```

Migrations run automatically at container start, so a restored database is
brought up to the deployed schema without a manual step.

## Testing recovery

A backup nobody has restored is a guess. Once a quarter, restore the latest
backup onto a scratch machine and sign in. The nightly verification proves the
dump is loadable; only a full restore proves the whole path works — including
that you can still find `.env`.

## Known limits

- **Backups are unencrypted at rest.** They contain customer records. The
  backup host must be one you control, with restricted access. Encrypting them
  (`age`, `gpg`) is a sensible next step, and adds a key you must not lose.
- **Nightly means up to 24 hours of loss.** Fine for this system's volume; if
  that changes, Postgres WAL archiving gives point-in-time recovery.
- **A compromised VPS can delete the backups** — it holds a key that can write
  to them. An append-only or pull-based arrangement, where the backup host
  fetches rather than the VPS pushing, removes that. Worth doing if the threat
  model includes an attacker rather than an accident.
- **Redis is not backed up.** Queued reminder jobs would be lost, then
  regenerated from the database on the next scheduler run.
