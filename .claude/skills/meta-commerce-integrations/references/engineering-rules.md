# Engineering rules that apply to every piece

Each rule is here because the opposite happened once. Source locations are in `source-map.md`.

## Idempotency: claim in the database, then act

Two backend slots run during a rolling deploy, Meta redelivers webhooks, and people press buttons twice. So **the database decides who acts**:

- A unique key per unit of work, inserted before the work: `SocialPost(channel, slotKey)` with `slotKey = "2026-11-08@09:00"`, `FacebookCommentReply.commentId`,
  `WhatsappMessageStatus(messageId, status)`, `DailyReportRun(shopId, reportDate, channel, recipient)`. A duplicate-key error (`P2002`) means "someone has it": return quietly.
- For state that moves, claim with a conditional update: `updateMany({ where: { id, status: 'RETRY', updatedAt: <what you read> }, data: { status: 'PENDING' } })` and proceed only if `count === 1`.
- A row left `PENDING` by a crash is picked up again after ~10 minutes. If its message did go, the provider says so (Facebook 10900/10903) and the row becomes SKIPPED.
- When an operation must change one table after reading it, finish with a conditional write on `updatedAt` so a concurrent change is not lost (Mautic sync: `mauticSyncedAt = updatedAt` means up to date).

## Delivery truth

Provider acceptance ≠ arrival. Store the provider's message id on the row at send time; apply status webhooks to it with a rank (`read` > `delivered` > `sent`; a late `failed` never overwrites a
delivery). Counting a send as "received" requires `status SENT` **and** delivery `null` or not `failed`. A message reported failed after acceptance returns the person to that step
(`reopenStep`): account-level errors (131042/131031/131048) retry in 6 h without counting against them, others in 24 h and count toward giving up at 5.

## Failure classes

- **Transient** (HTTP 5xx, timeouts, provider codes 1, 2, 4, 17, 32, 341, 613): retry shortly (4 min), at most 3 attempts, within the freshness window of the thing (6 days for a Facebook private reply, 2 hours for a post slot).
- **Permanent** (permission, invalid token, bad picture): record the provider's words on the row, do not retry, show it on the screen.
- **Account-level** (payment, lock, rate): do not blame the recipient.
Always keep the provider's own error text; it is what the owner needs to act. Never swallow it into "failed".

## Time

Nairobi is UTC+3 all year. Slot arithmetic: `nairobiParts(now)` and `dueSlots(now, times)` with a **90-minute grace**: a slot older than that is dropped, never posted late and never in a burst after an outage or a late switch-on.
Send windows (WhatsApp onboarding 08:00-20:00) and "today" for caps start at Nairobi midnight. Never compare a JS date to a raw SQL timestamp without making the
timezone explicit (`${d}::timestamptz AT TIME ZONE 'UTC'`); a funnel once shifted by the session's timezone. All time-dependent code takes `now` as a parameter so tests do not depend on the time of day.

## Schedulers on a two-slot deploy

Both backend slots run every scheduler. That is safe only because of the claims above. Never set a scheduler off per slot (`backend2: DAILY_REPORT_ENABLED=false` silently stopped the report for four days). BullMQ jobs use `upsertJobScheduler`;
simple ticks use `setInterval` (5-10 min) with `safeTick` try/catch. There is a Redis-backed two-replica test (`scheduler-replicas.test.ts`); keep one for any new scheduler. The tick services wait ~2 minutes after boot before their first run (`setTimeout`), then repeat every 5-10 minutes.

## Webhooks

Authentic event → always answer 200, process each event in its own try/catch (one bad event must not block the rest or trigger days of Meta retries). Unknown or forged → 404. Preserve the raw body for the signature.
Handle duplicates: Meta delivers the same message event twice now and then.

## Unattended output (posts, replies, auto-messages)

Off by default and switched on by a person on the screen with a confirmation that says what will happen. Plus: a server-side kill switch that overrides the screen; a daily cap; once-only keys; eligibility rules (in stock, photo, price,
https image); rotation with a cooldown; a **preview** that posts nothing and a **post now** that posts exactly what was previewed; **take down** for every post; and a log row for every attempt with the reason for skipped and failed ones.
Link tagging so analytics can tell the source: `utm_source=<facebook|threads|whatsapp>&utm_medium=social&utm_campaign=<autopost|status>`; the first-party visit classifier honours `utm_source` before click ids and referrers.

## Matching people

Phones are matched on the **last nine digits** (`254712345678`, `0712345678`, `+254 712…` are one person). A customer's name beats a WhatsApp profile name (people type anything there); never overwrite an existing
Mautic or customer name with it. Resellers, wholesalers and suppliers are never marketed to (`TRADE`). A test number can be classified TRADE because it matches a reseller record: explain, do not "fix".

## Testing patterns

- drip-crm uses `node:test` with `ts-node/register/transpile-only`, scratch databases via `KITS_TEST_DATABASE_URL`; Nairobi Gents uses jest (`TEST_DATABASE_URL` ending `_test`). Translate, keep the cases.
- Create a scratch database per task (`create database …`, `prisma migrate deploy`, drop afterwards). Never run tests against production data.
- Fake Meta by stubbing `globalThis.fetch` and routing on the URL; return `Response` objects with the provider's real shapes and error bodies. Fake Mautic with a tiny `http.createServer` implementing token, search, create-by-email and edit.
- Control time with `now` parameters; when a row's own `createdAt/updatedAt` matter, backdate them in the test. Clean up by key prefix, not by deleting tables, so a shared scratch database survives parallel suites.
- Assert the dangerous things: nothing sent while off, nothing sent twice, nothing sent to STOP/TRADE, secrets absent from output, wrong secret 404, caps hold, sizes/captions within limits (a 500-character Threads limit test caught an off-by-one).
- A test that "passes the first time" deserves a second look: add one deliberate failure case to see it fail.

## Verification protocol (use all three levels)

1. Unit and scratch-database tests, plus `tsc --noEmit` on backend and web.
2. Run the real backend against the scratch database (`prisma/bootstrap.js` seeds the admin and permissions) and the web dev server against it (temporary `.claude/launch.json` swap, restore it after). Seed a few products with https photos.
   Log in by putting the token in `localStorage` (`de_access_token`) and navigate. Look at the screen at desktop and at 375 px; measure widths in JS instead of trusting a glance.
3. After the user deploys: read-only checks on production (below). Report separately what ran in tests, locally, and in production.

## Production operations (drip-crm: `ssh garime`, `/root/drip-emp-ops`; shops-platform: `/root/shops-platform`)

- Check before acting: `git log -1`, `.deploy-active-slot`, `ps aux | grep deploy.sh`, `docker ps` (container names flip between `…-backend-1` and `…-backend2-1`).
- Run scripts by piping them over ssh stdin: `ssh -o BatchMode=yes garime 'bash -s' < /tmp/script.sh`; run Node in the live container with `docker exec -i -w /app <container> node -` and end the script with `process.exit(0)` (a dangling client hung one).
- Database reads: `docker exec drip-emp-ops-db-1 sh -c 'psql -U $POSTGRES_USER -d $POSTGRES_DB -c "…"'`; quoting is painful, write the SQL to a file and pipe it.
- `.env` edits: back up (`cp .env .env.bak-<timestamp>`), change one line with `sed`/append, confirm by counting matching lines (not printing them), `umask 077` for any file holding a token, delete temp files, never echo values. Env changes need a redeploy: `SKIP_FETCH=true ./scripts/deploy.sh` redeploys the code already on disk.
- Logs: filter (`grep -i social`) and never paste an access-log line for a webhook (the secret is in the path).
- Foreground `sleep` is blocked in the tool; wait inside the remote script with a bounded loop.
- If the permission layer blocks a production action (a deploy, an unrequested write), stop, say what you intended and why, and let the user decide.

## UI rules

- `.portal-data-table` has `min-width: 920px`; small tables in half-width cards need `is-compact` or they scroll sideways. Long unbroken strings (links) need `overflow-wrap: anywhere` or they widen the card on a phone. A picture that must not be cropped takes `height: auto`, not `object-fit: cover`.
- Anything public asks for confirmation in a dialog that says what will happen. Show the provider's error text where the owner can see it. Provide a Preview for anything that posts.
- Pictures that need the login are fetched with the token and shown from a blob; the share sheet takes the blob as a `File`.

## Mistakes already made (so they are not repeated)

Printed a webhook secret by showing a reverse-proxy log line; claimed cart reminders were off when only the daily report was (check which flag controls what); wrote a polling loop with broken quoting instead of a small script; ran a Node script in
the container that never exited; trusted the sharp/Pango `fontfile` option (it silently used a fallback font: draw text from font outlines with `opentype.js` instead); assumed a product category with size attributes in a seed that did not have one; wrote test assertions that were
tautologies; let a test depend on the time of day.
