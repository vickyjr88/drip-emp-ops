---
name: meta-commerce-integrations
description: Build, port, verify or operate the WhatsApp, Facebook and Threads integrations proven out on Drip Emporium (drip-crm): WhatsApp Cloud API templates, webhooks, delivery reports, STOP/opt-out and auto-subscription, daily owner reports, abandoned-cart follow-up links, Facebook comment-to-private-reply, fully automatic product posting to a Facebook Page and Threads, the WhatsApp Status kit, and the Mautic contact sync. Use this whenever the user mentions WhatsApp Business/Cloud API, Meta tokens or System Users, Page or Threads access tokens, webhooks, templates, Messenger private replies, auto-posting products, WhatsApp Status, Meta error codes like 131042, porting any of this to Nairobi Gents / shops-platform / another shop, or moving integration ids and secrets out of environment variables into admin settings, even when they name only one piece of it.
---

# Meta commerce integrations

The reference implementation lives in **drip-crm** (`/Users/vickyjunior/projects/dirrir/drip-crm`, single tenant, NestJS + Prisma + Next.js,
production at `garime:/root/drip-emp-ops`). Everything below was built, tested on scratch databases, deployed and verified there between Nov 2026
commits `7d0d1d2` and `15acc50`. The second consumer is **Nairobi Gents** (`/Users/vickyjunior/projects/shops-platform`, multi-tenant). This skill
exists so the second (and third) app gets the same behaviour without re-deriving the hard-won lessons, **with one deliberate change: every id,
token and secret lives in admin settings (the database), not in environment variables.**

Do not copy code from this file; read the real source (paths in `references/source-map.md`). The skill tells you what to build, why each rule
exists, what went wrong the first time, and how to prove it works.

## The integrations (read only the reference you need)

| Piece | What it does | Reference |
|---|---|---|
| Credentials in admin settings | Platform + per-shop encrypted store, masked reads, test buttons, webhook routing by shop. **The change for multi-tenant.** | `references/credentials-admin-settings.md` |
| Meta setup runbook | WABA, templates, System User tokens, webhooks, permissions, Threads login, rotation, error codes | `references/meta-setup-runbook.md` |
| WhatsApp outreach, subscription, delivery | Webhook, STOP/START, onboarding sequence, batch sends, delivery truth, Mautic hook | `references/whatsapp-outreach-subscription.md` |
| WhatsApp reports and follow-up | Daily owner report (email + WhatsApp), reminders, follow-up buttons on carts and orders | `references/whatsapp-reports-followup.md` |
| Facebook comment replies | Private Messenger reply + public reply to every commenter on Page posts and ads | `references/facebook-comment-replies.md` |
| Social posting engine | Products to Facebook Page and Threads, unattended, with guards and token renewal | `references/social-posting.md` |
| WhatsApp Status kit | Daily 9:16 pictures + text to share by hand (no API exists) | `references/status-kit.md` |
| Mautic sync | WhatsApp contacts as tagged Mautic contacts, no campaign enrolment | `references/mautic-sync.md` |
| Cross-cutting rules | Idempotency, windows, failure classes, schedulers on two slots, test patterns, verification protocol | `references/engineering-rules.md` |
| Where the code is | Files, tests, docs, migrations, commits per piece | `references/source-map.md` |
| Applying to Nairobi Gents | Gap analysis, decisions to confirm, phases with acceptance checks | `references/nairobi-gents-plan.md` |

## Workflow when applying this to an app

1. **Read the target first.** What already exists (Nairobi Gents already has a daily report, WhatsApp follow-up links, analytics, per-shop encrypted
   Paystack keys, platform SMTP settings, an audit log), what its conventions are (jest not node:test, shop scoping, roles), what differs (product
   model, sections, per-shop domains). `references/nairobi-gents-plan.md` has the gap analysis; verify it against the code, it ages.
2. **Settle decisions with the user before building** (the ones in the plan file: whose Meta assets a shop uses, which number customers see,
   which features each shop gets). These are the user's to make; a wrong guess here is expensive to undo because messages and posts are public.
3. **Build the credential store first** (`credentials-admin-settings.md`). Every later piece reads its ids and tokens through it. Porting a
   feature that still reads `process.env` means doing the migration twice.
4. **Port one piece at a time**, in the order in the plan. For each piece: schema + migration, the pure rules with tests first, then the service,
   controller, screen, docs. Read that piece's reference and the source it points to before writing.
5. **Prove it** with the protocol in `engineering-rules.md`: tests on a scratch database with a fake Meta, the real screen in a browser, then
   read-only checks on production after the user deploys. Say plainly what was and was not tested.
6. **Hand over for deploy.** In shops-platform the user pushes and the push deploys; commit locally with the Co-Authored-By trailer and stop. In drip-crm
   the user also deploys. Verify afterwards with read-only commands.

## Rules that are never worth breaking (and why)

- **Accepted is not delivered.** Meta accepting a send says nothing about arrival; delivery arrives later by webhook. A whole batch once showed "sent"
  while every message failed with 131042 (payment). Store the delivery state, count only non-failed sends as received, and put people back in line
  when a message fails after being accepted.
- **Anything public or sent to a stranger is guarded.** Unattended posting, auto-replies and auto-messages ship **off by default**, with a kill
  switch, a daily cap, once-only keys in the database, a late-slot cutoff, and a way to take things down. A bug here is visible to customers.
- **Consent is explicit.** Tell people they will receive updates and how to stop, honour STOP (whole message only, never "cancel"), never message
  resellers/suppliers, send only in a daytime window, and keep WhatsApp consent separate from email consent.
- **Webhook addresses carry a secret.** A forged event would make the shop message a stranger. Wrong secret answers 404, as if the endpoint did not
  exist. Verify Meta's signature too when the app secret is known.
- **Schedulers run on both deploy slots.** A rolling two-slot deploy once left nothing running the daily report for four days because one slot had the
  scheduler hard-coded off. Use database claims so running twice is safe, and never switch a scheduler off per slot.
- **Secrets never appear in output.** Not in logs, replies, URLs, error messages or this chat. Reading them back through an API returns "set" and the
  last four characters. When a user pastes a token into chat, use it, then tell them to rotate it.
- **Nothing is claimed that was not checked.** Prefer a read-only check that proves the thing (a handshake, a quota query, a row in the table) over
  an assumption, and report failures with the output.

## Working agreements with this user

- They deploy; you commit locally. A request to "redeploy" for an env-only change has been authorised before, but the permission layer can block
  production deploys: do not work around it, say what you wanted to run and let them decide.
- Production writes (a `.env` line, a database row) are made only when the user has asked for that specific thing. Back the file up first, never print
  its secret values, and write secrets through a script on stdin with `umask 077`, not on a command line.
- They want a short summary with what to do next, plus the honest limits (what you could not test, what is still pending on Meta's side).
- Verify in a browser for anything visible, including at phone width. Tell them when you did and did not.
