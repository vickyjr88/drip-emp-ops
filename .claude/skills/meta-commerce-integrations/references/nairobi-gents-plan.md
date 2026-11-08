# Applying this to Nairobi Gents (shops-platform)

Verify this against the code before relying on it; it was written from a read of both repos in Nov 2026.

## How Nairobi Gents differs from drip-crm

| Area | drip-crm | Nairobi Gents | Consequence |
|---|---|---|---|
| Tenancy | one business | many shops, each with its own domain (`storefrontOriginForShop`) | `shopId` on every table and unique key; per-shop settings, caps, rotation, webhooks |
| Config | env vars | env vars today; encrypted per-shop Paystack keys and platform SMTP in the database | credential store first (`credentials-admin-settings.md`) |
| Products | `Product` + variants with size attributes | **sections** (watches, clothes, electronics, devices & accessories) with per-section options (`common/sections.ts`), `costKes` private | `postableProducts(shopId)` and captions must be section-aware; no sizes line for watches/devices |
| Auth | RBAC permission keys from model names | shop roles `OWNER` / `STAFF`, owner-only routes, platform operator via `AdminJwtGuard` | connections screens owner-only; operator page for platform rows |
| Tests | node:test + scratch DB | jest, `TEST_DATABASE_URL` ending `_test`, `test/unit` and `test/integration` | translate cases, keep them |
| Deploy | user deploys | user **pushes**; the push triggers the deploy | commit locally, do not push |
| Already there | | daily report (email + WhatsApp), follow-up links, funnel/ad spend/stock/buyers, domains, media library | extend, do not rebuild |
| Missing | | WhatsApp webhook and delivery state, outreach and auto-subscription, comment replies, social posting, Status kit, Mautic | the work below |

## Decisions to confirm with the user before building (ask in one go, recommend a default)

1. **Whose Meta assets does a shop use?** Drip Emporium's WABA/number is currently used for Nairobi Gents' owner report. For customer-facing messages and posts each shop should have its own WABA/number, Page and Threads account. Default: owner notices may
   use the platform sender (`inheritPlatform`), everything customer-facing uses the shop's own connection and is off until connected.
2. **Which features per shop**, and which are platform-wide switches. Default: all off until a shop owner connects and switches them on.
3. **The Meta app**: one app for all shops (single callback for Page events, routed by page id) or one per shop. Default: one platform app.
4. **Mautic** for Nairobi Gents at all? Default: skip.
5. **Wording and brand** per shop: names, wordmark font and colours for Status pictures, hashtags, default texts. Default: shop name from settings, theme colours, hashtags from shop name.
6. **Merchant onboarding**: do merchants connect their own Meta assets themselves (needs a clear in-portal guide and test buttons) or does the operator do it for them? Default: owner self-serve with a guide, operator can edit any shop's connection.
7. **Who may see tokens**: nobody. Confirm the masked-read contract is acceptable.

## Phases (each ends with a verified, committed state the user can push)

**Phase 1 — Credential store (the requested change).** `ShopIntegration`, `PlatformIntegration`, `IntegrationConfigService`, owner Connections screen, operator Platform integrations page, audit rows, test-connection buttons, one-time import of existing
`WHATSAPP_*` env into the platform row, move the existing daily report's `WhatsAppService` to the resolved config, per-shop `enabled` replacing `DAILY_REPORT_SHOPS`, remove the variables, add the grep test.
*Accept:* daily report still sends tomorrow; no integration `process.env` reads remain; shop A cannot see shop B; masked reads; secrets absent from responses and logs.

**Phase 2 — WhatsApp core.** Per-shop webhook (GET verify, POST receive, 404), status columns on `DailyReportRun`, `WhatsappMessageStatus`, delivery chips on the Daily Report screen. Then `WhatsappContact`, STOP/START, auto-subscription notice, the sequence
(with the shop's own templates), the outreach screen and the WhatsApp report in analytics. Template names and links per shop.
*Accept:* STOP stops all; duplicate webhook sends one notice; a reported failure reopens a step; delivery shows on the report list; caps are per shop.

**Phase 3 — Facebook comment replies.** App-level Page callback routed by page id, per-shop texts and caps, card on the shop's Marketing screen.
*Accept:* a comment from an app-role account gets a private reply (public reply or the reason on the card); the Page's own reply is ignored; duplicate event does nothing.

**Phase 4 — Social posting (Facebook, then Threads).** Section-aware `postableProducts(shopId)`, per-shop settings/rows/rotation, the posting screen, Threads login renewal writing back to the shop's row.
*Accept:* Preview matches what is posted; one Post now per channel looks right; Start posting is off by default; kill switch works; a slot posts once with two backend slots.

**Phase 5 — Status kit.** Per-shop pictures with section-aware layout, phone screen.
*Accept:* pictures for a watch (no sizes), a phone (storage/colour), and a shirt (sizes) look right; measured 9:16 in the browser; Share tested on a real phone.

**Phase 6 (only if asked) — Mautic sync, operator view across shops, a daily digest.**

## For each phase

Schema and migration first (the user's push runs `prisma migrate deploy`, so migrations must be additive and safe on live data); pure rules and tests; services; screens (browser-verified at desktop and 375 px); docs next to `docs/DAILY-REPORT.md`;
a final check list for the user (what to deploy, what to click, what to rotate). Production data changes go through `ssh garime` psql in a transaction, dry-run with `ROLLBACK` first, back up affected rows, and only when the user has asked.
The msa and nairobigents shop content is hand-curated: never run the feed sync (see the user's memory note).
