# PHP remote code execution (CVE-2026-109618 / CVE-2026-109619): audit, patch plan and disk clean-up

Audit date: 2026-10-23. Server: Ubuntu 24.04, kernel 6.8.0-147, Docker 29.5.3. Nothing in this document has been applied yet.

## Status (updated 2026-10-23)

| Step | Result |
|---|---|
| 0. Close public ports | **Done.** `/usr/local/sbin/docker-user-firewall.sh` plus `docker-user-firewall.service` (enabled, runs after Docker at boot) drop new public connections to 20 published internal ports. Verified from outside: all closed; SSH, mail, 80/443 and 18185 open; every site answers. Still to do: bind those ports to 127.0.0.1 in each compose file and set a Redis password (realtors). |
| 1. Mautic | **Done.** Staging, then production, on `mautic/mautic:7.2.1-20261021-apache`: PHP **8.3.36** in all four containers. Database and Redis untouched (`--no-deps`), pre-patch dump at `/root/mautic-backups/pre-php-patch-2026-10-23.sql.gz`, `.env.bak-2026-10-23` in both project folders. Verified: public login 200, clean logs, cron connected, 4,575 contacts intact. |
| 2. Roundcube webmail | **Not done, needs a decision.** Still PHP 8.1.32 and publicly reachable at `/roundcube/`. |
| 3. OS packages (66, incl. Docker) | **Not done.** Do it in a quiet window; restarts every container. |
| Clean-up | **Done**, see below. |

Clean-up result: `/` went from **153 GB used (79%) to 77 GB used (40%)**, 117 GB free.
Removed: unused images (Mautic 5, 5.2.11, 6.0.9 and the superseded 7.2.1, MySQL 8.0, `debug-builder`, `node:18-alpine`); 94 orphaned anonymous volumes
(74 empty Postgres clusters and 20 empty stubs; `gari_me_minio_data` kept); Docker build cache older than 24 h (~61 GB); the journal (4.0 GB to 0.46 GB, now capped at 500 MB);
the 5.7 GB `dripemporium.store.log` (rotated; archived to `/root/dripemporium.store.access.2026-10-23.log.gz`, 280 MB) with weekly rotation for every file in `/www/wwwlogs`
(`/etc/logrotate.d/aapanel-sites`). Kept on purpose: the 6.8.0-124 kernel (fallback), 51 GB of build cache from the last 24 h (`docker builder prune -af` would free it
at the cost of one slower deploy), the two exited one-off containers.

Note: the DOCKER-USER rules survive a Docker restart but not a reboot; the unit above re-applies them at boot.

## The vulnerability

Two critical flaws in PHP core (CVSS v4 9.2), fixed on 2026-10-21 in **PHP 8.5.12, 8.4.27, 8.3.36 and 8.2.35**. Both allow
**unauthenticated remote code execution** in any PHP that serves web requests (mod_php, PHP-FPM, php-cgi, FrankenPHP,
LiteSpeed); `mod_php` is the highest risk because the attack can land before any application code runs. Public proof-of-concept
exploits exist and attempts are being reported. Only updating PHP fully fixes it: the project says no setting does.
Sources: PHP's advisory (php.net, 2026-10-21), [Rapid7](https://www.rapid7.com/blog/post/etr-cve-2026-109618-and-cve-2026-109619-critical-unauthenticated-remote-code-execution-in-php/),
[watchTowr](https://watchtowr.com/intelligence/php-cve-2026-109618-faq/).

## What on this server runs PHP

The host itself has **no PHP** (aaPanel's `enable-php-00` means static/proxy only, `/www/server/php` has no versions installed, no `php*` packages).
All PHP is inside Docker containers:

| Container(s) | Image | PHP now | SAPI | Public? | Verdict |
|---|---|---|---|---|---|
| `mautic_app`, `mautic_cron` (prod) | `mautic/mautic:7.2.1-apache` | **8.3.33** | Apache mod_php | `m.dripemporium.store` -> 127.0.0.1:8090 | **Vulnerable, highest priority.** `post_max_size` is 512M, upload progress on |
| `mautic_app_staging`, `mautic_cron_staging` | same | 8.3.33 | Apache mod_php | localhost only (8091) | Vulnerable, lower exposure |
| `billionmail-webmail-billionmail-1` (Roundcube) | `roundcube/roundcubemail:1.6.10-fpm-alpine` | **8.1.32** (end of life) | PHP-FPM | `mail.dripemporium.store/roundcube/` and `engage.vitaldigitalmedia.net/roundcube/` return 200 | **Vulnerable and no upstream fix for 8.1.** This is the mail login page |

Everything else (Node apps, Postgres, Redis, MinIO, BillionMail core/dovecot/postfix/rspamd, Elasticsearch, MySQL) does not run PHP.

Signs of exploitation: **none found** (checked 2026-10-23): no 5xx and no large uploads on the Mautic or webmail vhosts since 2026-10-21;
no PHP/phar/.htaccess files changed in the Mautic or Roundcube containers since 2026-10-19; no new cron/systemd files in 5 days;
`authorized_keys` last changed 2026-09-28. Absence of evidence is not proof; the nginx logs do not record request bodies.

## Which patched images exist (verified from the registry, not assumed)

| Image tag | Built | PHP inside | Use? |
|---|---|---|---|
| `mautic/mautic:7.2.1-20261021-apache` (same as `7.2.1-apache`) | 2026-10-21 18:24 UTC | **8.3.36** | **Yes**, same Mautic version |
| `mautic/mautic:7.2.1-20260923-apache` | 2026-09-23 | 8.3.33 | No (what you run now) |
| `roundcube/roundcubemail:1.7.5-fpm-alpine` | 2026-10-23 | **8.4.27** | **Yes**, but a 1.6 -> 1.7 minor upgrade: test first |
| `roundcube/roundcubemail:1.6.19-fpm-alpine` | 2026-10-21 | 8.4.26 | No, still vulnerable |
| `roundcube/roundcubemail:1.6.20-fpm-alpine` | 2026-10-22 | 8.4.15 | No, still vulnerable |

## Patch plan, in order

### 0. Right now: close the ports that are open to the internet (not PHP, but the worst thing found)

`ufw` is active, but Docker publishes container ports **around** ufw (the `DOCKER-USER` chain is empty). From the internet these
answer today: **15432 (realtors Postgres), 16379 (realtors Redis, protected-mode off and no password), 19000/19001, 9000/9001, 9090
(MinIO)**, and 3002/3003/3100/3101/3203/3211/8080/41443 (app and admin ports that only nginx on the host needs, via 127.0.0.1).
Redis showed no signs of abuse (save directory unchanged, only local/Docker clients, no odd keys), but it is wide open.

Drop new connections from the public interface to those published ports (the rule matches the *original* port, because Docker
rewrites the destination before this chain). nginx on the host reaches them through 127.0.0.1 and is unaffected; mail ports
(25, 110, 143, 465, 587, 993, 995) and 18185 are deliberately not in the list.

```bash
PUB_IF=$(ip route get 1.1.1.1 | awk '{for(i=1;i<=NF;i++) if($i=="dev") print $(i+1)}')
for p in 15432 16379 19000 19001 9000 9001 9090 3002 3003 3100 3101 3203 3211 8080 41443; do
  iptables -I DOCKER-USER -i "$PUB_IF" -p tcp -m conntrack --ctstate NEW --ctorigdstport "$p" -j DROP
done
# verify from OUTSIDE (your laptop): each of these must now time out
for p in 15432 16379 19000 9090 8080 3101; do nc -z -G 3 185.190.142.143 $p && echo "STILL OPEN $p" || echo "closed $p"; done
```

The rules above are applied by a small script and a systemd unit (see Status); they survive Docker restarts. As a second layer, also set each project's `ports:` to `127.0.0.1:PORT:PORT`
(realtors db/redis/minio, drip-emp-ops and shops-platform web/backend, gari-me minio) and set a Redis password for realtors.
To undo the rules: `iptables -D DOCKER-USER ...` with the same arguments.

### 1. Mautic (production and staging): swap in the patched image

Same Mautic version, only the PHP layer changes. Do **staging first**, then production. Take a database dump first with your usual method
(see `/root/mautic/SETUP.md`, backups in `/root/mautic-backups`).

```bash
cd /root/mautic-staging
cp .env .env.bak-$(date +%F)
sed -i 's/^MAUTIC_VERSION=.*/MAUTIC_VERSION=7.2.1-20261021-apache/' .env
docker compose pull && docker compose up -d
docker exec mautic_app_staging php -r 'echo PHP_VERSION, "\n";'      # expect 8.3.36
# log in to staging, open a campaign, confirm cron runs: docker logs --tail 20 mautic_cron_staging

cd /root/mautic            # production, once staging looks right
cp .env .env.bak-$(date +%F)
sed -i 's/^MAUTIC_VERSION=.*/MAUTIC_VERSION=7.2.1-20261021-apache/' .env
docker compose pull && docker compose up -d
docker exec mautic_app php -r 'echo PHP_VERSION, "\n";'              # expect 8.3.36
curl -s -o /dev/null -w "%{http_code}\n" https://m.dripemporium.store/s/login   # expect 200
```

Rollback: put the old value back in `.env` (`7.2.1-20260923-apache`, or `7.2.1-apache` while the old local image still exists) and `docker compose up -d`.

### 2. Roundcube webmail (BillionMail): the harder one

PHP 8.1 gets no official fix, and the 1.6 images are not yet rebuilt on a fixed PHP. Two parts:

**a. Interim protection today** (partial, per PHP's advisory). Add a file to BillionMail's mounted PHP config and restart the container:

```bash
D=/www/dk_project/dk_app/billionmail/billionmail
printf 'session.upload_progress.enabled = 0\n' > $D/conf/php/php/conf.d/zz-cve-2026-109619.ini
docker restart billionmail-webmail-billionmail-1
```

If webmail is not needed from the internet this week, the stronger interim step is to block it at nginx (a `location ^~ /roundcube/ { return 403; }`
in the extension file for `mail.dripemporium.store` and `engage.vitaldigitalmedia.net`), or put it behind an IP allow-list. IMAP/SMTP clients are unaffected.

**b. The real fix:** move to `roundcube/roundcubemail:1.7.5-fpm-alpine` (PHP 8.4.27). BillionMail mounts its own PHP config over
`/usr/local/etc` and keeps the app files in `data/webmail-data`, so back up first and expect to check logs:

```bash
D=/www/dk_project/dk_app/billionmail/billionmail
tar czf /root/billionmail-webmail-backup-$(date +%F).tgz -C $D conf data/webmail-data docker-compose.yml
cp $D/docker-compose.yml $D/docker-compose.yml.bak-$(date +%F)
sed -i 's#roundcube/roundcubemail:1.6.10-fpm-alpine#roundcube/roundcubemail:1.7.5-fpm-alpine#' $D/docker-compose.yml
cd $D && docker compose up -d webmail-billionmail && docker logs --tail 40 billionmail-webmail-billionmail-1
curl -s -o /dev/null -w "%{http_code}\n" https://mail.dripemporium.store/roundcube/    # expect 200, then log in and open a message
```

Rollback: restore `docker-compose.yml.bak-*`, extract the tarball, `docker compose up -d webmail-billionmail`. If 1.7 does not work with
BillionMail's config, keep the interim step in (a), re-check in a few days whether `1.6.x-fpm-alpine` is rebuilt on PHP >= 8.4.27
(`docker run --rm roundcube/roundcubemail:1.6.x-fpm-alpine php -v`, with the current 1.6.x tag), and watch BillionMail's releases.

### 3. The server itself

66 packages are pending, including `docker-ce`, `containerd.io`, `docker-compose-plugin`, `apparmor`, `libkrb5`, `libglib2.0`.
`unattended-upgrades` is enabled but does not cover the Docker repository. No reboot is required now (running kernel is the newest installed).
Upgrading Docker restarts the daemon, which restarts every container: do it in a quiet window, after steps 1 and 2.

```bash
apt-get update && apt-get -s upgrade | tail -5        # preview
apt-get upgrade -y
docker ps --format '{{.Names}}|{{.Status}}' | grep -v healthy   # then check anything not healthy
```

Also: remove the old kernel (see clean-up), and add Docker log limits (below) in the same window.

## Disk clean-up

`/` is 193 GB with **153 GB used (79%)**. About **130 GB sits in Docker's image store**, and Docker itself reports **112 GB of build cache, all reclaimable**.
Realistic total: roughly **125-135 GB back**. Do these after the patches, in this order (safest first):

| # | What | Size | Command |
|---|---|---|---|
| 1 | Docker build cache | **~112 GB** | `docker builder prune -af --filter until=168h` (use `-af` alone for everything; the next deploy just rebuilds from scratch, a few minutes slower once) |
| 2 | Unused images: Mautic 5, 5.2.11, 6.0.9, MySQL 8.0, `debug-builder`, `node:18-alpine`, and the old `mautic:7.2.1-apache` once patched | ~8 GB | `docker image rm mautic/mautic:5-apache mautic/mautic:5.2.11-apache mautic/mautic:6.0.9-apache mysql:8.0 debug-builder:latest node:18-alpine` |
| 3 | Orphaned anonymous volumes: 74 empty Postgres data dirs (~51 MB each) plus 21 tiny ones | ~3.6 GB | see below; **keep `gari_me_minio_data`** (named, may hold real data) |
| 4 | One 5.8 GB nginx access log (`/www/wwwlogs/dripemporium.store.log`), never rotated | ~6.5 GB | see below |
| 5 | systemd journal, no size limit | ~3.6 GB | `journalctl --vacuum-size=500M` |
| 6 | Old kernel `6.8.0-124` and apt cache | ~0.5 GB | `apt-get autoremove --purge -y && apt-get clean` |

Orphaned volumes (only 64-hex anonymous names, so the named volume is never matched; check one first with
`docker run --rm -v VOLUME:/v alpine ls /v`; they are empty Postgres clusters):

```bash
docker volume ls -qf dangling=true | grep -E '^[0-9a-f]{64}$' | xargs -r docker volume rm
```

nginx logs: archive-and-empty the big one now, then rotate weekly so it cannot grow again:

```bash
gzip -c /www/wwwlogs/dripemporium.store.log > /root/dripemporium.store.log.$(date +%F).gz && : > /www/wwwlogs/dripemporium.store.log
cat > /etc/logrotate.d/aapanel-sites <<'EOF'
/www/wwwlogs/*.log {
    weekly
    rotate 8
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
EOF
```

### Stop it coming back

- **Volume leak:** the cause is `docker rm -f` (no `-v`) in `scripts/backup.sh`'s restore-verification step: every nightly run orphaned the throwaway
  Postgres container's volume. Fixed in this repo (commit "backup.sh: remove the verification container's volume too"); the realtors checkout in
  `/root/dirrir-realtors` runs the same script, so pull it there too.
- **Journal:** `printf '[Journal]\nSystemMaxUse=500M\n' > /etc/systemd/journald.conf.d/size.conf && systemctl restart systemd-journald`.
- **Container logs:** there is no `/etc/docker/daemon.json`. Add `{"log-driver":"json-file","log-opts":{"max-size":"20m","max-file":"3"}}` (applies to
  containers created after a Docker restart, so do it with the Docker upgrade).
- **Build cache:** a weekly `docker builder prune -f --filter until=168h` in cron keeps it from reaching 100 GB again.

## After patching: verify

```bash
for c in mautic_app mautic_cron mautic_app_staging mautic_cron_staging billionmail-webmail-billionmail-1; do
  echo "$c: $(docker exec $c php -r 'echo PHP_VERSION;')"; done
# expected: Mautic 8.3.36, Roundcube 8.4.27 (if you moved to 1.7.5)
df -h /   # expected: well under 30% used
```

Keep checking `https://www.php.net/` and the Mautic and Roundcube Docker Hub tags for rebuilds on newer PHP.
