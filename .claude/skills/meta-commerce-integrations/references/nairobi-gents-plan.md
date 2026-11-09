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

## Decisions (answered by the user, 2026-11-08)

1. Each shop uses **its own** WhatsApp number, Facebook Page and Threads account. Owner notices (daily report) may fall back to the platform sender; anything customers see uses the shop's own connection. **Yes.**
2. Every feature is **off** for a shop until its owner connects and switches it on. **Yes.**
3. **One Meta app per shop** (not one platform app). App id/secret are per-shop fields; webhooks (WhatsApp and Facebook Page) are per shop.
4. **Mautic: skip** for Nairobi Gents.
5. **Owners connect their own Meta accounts**, with an in-portal guide and test buttons.

The list below is the original question set, kept for reference.

## Questions that were asked

1. **Whose Meta assets does a shop use?** Drip Emporium's WABA/number is currently used for Nairobi Gents' owner report. For customer-facing messages and posts each shop should have its own WABA/number, Page and Threads account. Default: owner notices may
   use the platform sender (`inheritPlatform`), everything customer-facing uses the shop's own connection and is off until connected.
2. **Which features per shop**, and which are platform-wide switches. Default: all off until a shop owner connects and switches them on.
3. **The Meta app**: one app for all shops (single callback for Page events, routed by page id) or one per shop. Default: one platform app.
4. **Mautic** for Nairobi Gents at all? Default: skip.
5. **Wording and brand** per shop: names, wordmark font and colours for Status pictures, hashtags, default texts. Default: shop name from settings, theme colours, hashtags from shop name.
6. **Merchant onboarding**: do merchants connect their own Meta assets themselves (needs a clear in-portal guide and test buttons) or does the operator do it for them? Default: owner self-serve with a guide, operator can edit any shop's connection.
7. **Who may see tokens**: nobody. Confirm the masked-read contract is acceptable.

## Phases (each ends with a verified, committed state the user can push)

**Phase 1 — Credential store (the requested change). DONE, committed in shops-platform as `60b0a5d` (not yet pushed/deployed when written).** `ShopIntegration`, `PlatformIntegration`, `IntegrationConfigService`, owner Connections screen, operator Platform integrations page, audit rows, test-connection buttons, one-time import of existing
`WHATSAPP_*` env into the platform row, move the existing daily report's `WhatsAppService` to the resolved config, per-shop `enabled` replacing `DAILY_REPORT_SHOPS`, remove the variables, add the grep test.
*Accept:* daily report still sends tomorrow; no integration `process.env` reads remain; shop A cannot see shop B; masked reads; secrets absent from responses and logs.

**Phase 2 — WhatsApp core. DONE, committed in shops-platform as `55cf44e` (on top of phase 1 `60b0a5d`; neither pushed when written).** Per-shop webhook (GET verify, POST receive, 404), status columns on `DailyReportRun`, `WhatsappMessageStatus`, delivery chips on the Daily Report screen. Then `WhatsappContact`, STOP/START, auto-subscription notice, the sequence
(with the shop's own templates), the outreach screen and the WhatsApp report in analytics. Template names and links per shop.
*Accept:* STOP stops all; duplicate webhook sends one notice; a reported failure reopens a step; delivery shows on the report list; caps are per shop.

**Phase 3 — Facebook comment replies. DONE, committed in shops-platform as `72caaf2` (after phase 2 `55cf44e` and phase 1 `60b0a5d`; none pushed when written).** App-level Page callback routed by page id, per-shop texts and caps, card on the shop's Marketing screen.
*Accept:* a comment from an app-role account gets a private reply (public reply or the reason on the card); the Page's own reply is ignored; duplicate event does nothing.

**Phase 4 — Social posting (Facebook, then Threads). DONE, committed in shops-platform as `cd31b0f` (after `72caaf2`, `55cf44e`, `60b0a5d`; none pushed when written).** Section-aware `postableProducts(shopId)`, per-shop settings/rows/rotation, the posting screen, Threads login renewal writing back to the shop's row.
*Accept:* Preview matches what is posted; one Post now per channel looks right; Start posting is off by default; kill switch works; a slot posts once with two backend slots.

**Phase 5 — Status kit. DONE, committed in shops-platform as `c47f592` (after `cd31b0f`, `72caaf2`, `55cf44e`, `60b0a5d`; none pushed when written).** Per-shop pictures with section-aware layout, phone screen.
*Accept:* pictures for a watch (no sizes), a phone (storage/colour), and a shirt (sizes) look right; measured 9:16 in the browser; Share tested on a real phone.

**Phase 6 — operator view across shops and a daily digest. DONE, committed in shops-platform as `29ed2ba` (after `c47f592`, `cd31b0f`, `72caaf2`, `55cf44e`, `60b0a5d`; none pushed when written). Mautic stayed skipped (decision 4).**

## For each phase

Schema and migration first (the user's push runs `prisma migrate deploy`, so migrations must be additive and safe on live data); pure rules and tests; services; screens (browser-verified at desktop and 375 px); docs next to `docs/DAILY-REPORT.md`;
a final check list for the user (what to deploy, what to click, what to rotate). Production data changes go through `ssh garime` psql in a transaction, dry-run with `ROLLBACK` first, back up affected rows, and only when the user has asked.
The msa and nairobigents shop content is hand-curated: never run the feed sync (see the user's memory note).


## Phase 1 as built (read this before phase 2)

- Code: `shops-platform/backend/src/integrations/` (`integration-providers.ts` = the one definition of each provider's fields and validation; `integrations.service.ts` = storage, masking,
  `resolve(shopId, provider, {allowPlatform})`, `test`, `rotateWebhookSecret`, `findByWebhookSecret`, `importFromEnvironment`; `whatsapp-client.ts` = `WhatsAppClient` for one resolved connection),
  routes `/portal/integrations` (owner only) and `/admin/platform-settings/integrations/whatsapp`; screens `web/app/portal/integrations/page.tsx` and a card in `web/app/admin/settings/page.tsx`;
  tables `ShopIntegration`, `PlatformIntegration` (migration `20261117090000_add_integration_credentials`); doc `shops-platform/docs/INTEGRATIONS.md`. 18 integration tests + unit tests, including a
  test that fails the build if code other than `integrations/env-import.ts` reads a `WHATSAPP_/FACEBOOK_/THREADS_/META_/MAUTIC_/OUTREACH_` variable.
- **Later phases must call `IntegrationsService.resolve(shopId, provider)` (no `allowPlatform`) for anything a customer sees**, and build their client from the result (`new WhatsAppClient({...})`). Only the daily report
  (owner notices) passes `allowPlatform: true`. Add `shopId` to every new table and unique key.
- Webhooks (phases 2 and 3) use the already-built `rotateWebhookSecret` / `findByWebhookSecret`: the controller is `@Public()` + `@NoShopScope()`, looks the shop up from the path secret, checks the event's
  `phone_number_id` / page id against the connection's `externalId`, and verifies `X-Hub-Signature-256` with that shop's `appSecret`. The Connections screen has a `webhookConfigured` flag ready; add the address
  display, a "Rotate" button and a "Connect" helper (WABA `subscribed_apps` with `override_callback_uri`; Page `subscribed_apps?subscribed_fields=feed`) when the webhook routes exist.
- Operational config that is **not** an id or secret stays in the environment (`DAILY_REPORT_HOUR`, `DAILY_REPORT_ENABLED`, cron/timezones). `DAILY_REPORT_SHOPS` was removed: a shop is scheduled by saving its
  Daily Report settings switched on.
- The four `WHATSAPP_*` lines in `docker-compose.yml` are **transitional**: read once to copy the existing sender into the platform settings. After the first deploy shows it under Admin > Settings, delete them
  from the server `.env` and the compose file in a follow-up commit.
- Lessons from building it: list only the *missing* required fields in "cannot be switched on" messages; reused ids in tests collide with the one-shop-per-number rule, so clear connections between tests;
  two backend slots import at once, so the import must treat a duplicate-key error as "someone else did it".


## Phase 2 as built (read this before phase 3)

- Code: `shops-platform/backend/src/whatsapp/` (pure rules `whatsapp-subscription.ts`; `whatsapp-kinds.ts`; `whatsapp-connection.service.ts` = a shop's own ready client; contacts, outreach and sequence services;
  `whatsapp-webhook.controller.ts`; `whatsapp.controller.ts` at `/portal/whatsapp`, owner only). Screens `web/app/portal/whatsapp/page.tsx` and the incoming-messages panel on Connections. Doc `shops-platform/docs/WHATSAPP.md`.
  Migration `20261118090000_add_whatsapp_messaging`. 24 integration tests + 9 unit tests.
- Differences from drip-crm, all deliberate: every method takes `shopId`; **no price tiers or suppliers in Nairobi Gents, so no TRADE class**; customers are a **derived list** (accounts plus guests keyed by email/phone,
  `PortalCustomerService`), so outreach is keyed by the list's `key` and **deduped by normalised phone**, and `messageable()` was added to that service; **kinds are `GROUP, REVIEW, LOCATION, RANGE`** with template names in the
  shop's WhatsApp settings (defaults `join_group`, `rate_us`; the fixed-text ones have none until named); the links come from the shop's Store info (`whatsappGroupUrl`, `googleReviewsUrl`); the welcome series is two steps
  (24 h after the notice, 48 h after the first); **autoSubscribe defaults OFF** and is a toggle field (`input: 'toggle'`) in the provider definition; no Mautic.
- The shop's **webhook secret is made by the "Connect incoming messages" button** (`connectWhatsappWebhook`): it rotates the secret, registers the address with the WABA (`subscribed_apps` + `override_callback_uri`), and returns
  the address once. Meta refuses until the app's "messages" field is subscribed in the dashboard; the refusal text is passed on with the address for pasting by hand.
- **Lessons from building it:** (1) a first message delivered twice at once makes two creates: catch the duplicate-key error and let the other request send the notice; (2) STOP must be recorded even when the shop has
  switched WhatsApp off, so signature checking needs `appSecretFor` (reads the saved secret regardless of `enabled`) and the controller must not drop events for a disabled connection; (3) in tests, a shop with the welcome off records
  nobody, so create the waiting contact directly; (4) set "due" times from the test's pretend `now`, not the real clock; (5) a step with no link or template must be advanced past, or the person is stuck failing it five times and never
  gets the next message; (6) clearing connections between tests is mandatory (one number belongs to one shop).
- Phase 3 (Facebook comments) reuses everything: `IntegrationsService.findByWebhookSecret('FACEBOOK', ...)`, `appSecretFor`, `rotateWebhookSecret`; add a `connectFacebookWebhook` helper (Page `subscribed_apps?subscribed_fields=feed`) beside
  `connectWhatsappWebhook`, and the Facebook card's "Connect comments" button. The WhatsApp analytics tab was left for later; the ad each contact came from is already stored.


## Phase 3 as built (read this before phase 4)

- Code: `shops-platform/backend/src/facebook/` (pure `facebook-comments.ts`; `facebook-connection.service.ts` = a shop's Page, token, settings and the facts the wording is filled with; `facebook-comments.service.ts`;
  `facebook-webhook.controller.ts`; `facebook.controller.ts` at `/portal/facebook`, owner only). Screens `web/app/portal/facebook/page.tsx` and the Facebook card on Connections. Doc `shops-platform/docs/FACEBOOK.md`.
  Migration `20261119090000_add_facebook_comment_replies`. 17 integration tests + 8 unit tests.
- **Per-shop apps made the webhook per shop**: `/facebook/webhook/<secret>` resolved with `findByWebhookSecret('FACEBOOK', ...)`, the event's page id checked against the connection's `externalId`, the signature checked with the
  shop's own `appSecret`. "Connect comments" (`connectFacebookWebhook`) subscribes the Page to `feed` with the shop's Page token and returns the address **to paste into the shop's own Meta app** (Webhooks > Page); that app-level step
  cannot be done with a token. `POST /portal/integrations/:provider/webhook` is now generic (WhatsApp or Facebook).
- New provider-definition capability: `input: 'textarea'` (owner's own reply wording), alongside `toggle` and `number`. Settings: `commentReplies` (default OFF), `publicReply` (default on), `replyDailyCap` (200), `privateReplyText`, `publicReplyText`.
- **Wording changes from drip-crm:** a new `{shop}` placeholder, the default text names the shop (no hard-coded brand), and **a line containing a placeholder the shop has no value for is dropped** (no "WhatsApp:" with nothing after it).
  Facts come from the shop (`whatsappNumber`, `address`, `facebookUrl`, `storefrontOriginForShop`).
- The retry loop runs across all shops (oldest 25 due rows), each row re-resolving its own shop's connection; a row whose shop has since switched replies off is skipped. The per-person "once a week" and the daily cap are per shop.
- **Lessons:** (1) when testing a webhook from a shell, do not generate ids with `$RANDOM` inside `$(...)`: older bash returns the same number in every subshell, so the "new" comments reused one id and were (correctly) dropped as
  duplicates, which looked like a bug; pass explicit unique ids. (2) a test counting rows by Page id across the whole shared test database also counts earlier tests' rows; scope counts to the shops in the test.
- Phase 4 (posting) needs `pages_manage_posts` on the Page token and the Threads login; both live in the same connections. The "Test connection" for Facebook already reports whether comments reach the shop.

## Phase 4 as built (read this before phase 5)

- Code: `shops-platform/backend/src/social/` (pure `social-post.ts`: wording per section, `compactSizes`, `pickProduct`, slots; `postable-products.service.ts` = what a shop could post, at today's price, only options still in stock;
  `social-posting.service.ts` = engine, claims, retries, Threads renewal, take-down; `social-posting.controller.ts` at `/portal/social`, owner only). Screen `web/app/portal/social/page.tsx`, nav entry "Social posting".
  Doc `shops-platform/docs/SOCIAL.md`. Tables `SocialSetting` (one row per shop) and `SocialPost` (unique `shopId + channel + slotKey`), migration `20261120090000_add_social_posting`. 10 unit + 14 integration tests.
- **Nothing was read from `process.env` for ids/secrets**, and the guard test (`integrations-no-env.spec.ts`) earned its keep: it failed on `THREADS_PUBLISH_WAIT_MS`/`THREADS_POLL_MS` (timing knobs, not secrets). They are now
  `SOCIAL_PUBLISH_WAIT_MS` / `SOCIAL_POLL_MS`. Keep the guard blanket; rename rather than allow-list. The only environment name the engine uses is the operator kill switch `SOCIAL_POSTING=false`.
- Each channel has its own on/off (`facebookEnabled`, `threadsEnabled`, default off) and the times (max six, default 09:00/13:00/19:00 Nairobi, same for both). Starting a channel asks for confirmation in the screen.
- Threads token renewal writes the new token and `tokenExpiresAt` back to the shop's own THREADS connection through `IntegrationsService.updateStored` (new in this phase; it does not touch `updatedBy`/audit because it is the engine, not a person).
- Rotation: never-posted first, then longest ago; cooldown 30 days; a small shop may repeat after a week; brand varied. Threads captions drop address, then WhatsApp, then options, then cut the name; price and link are never dropped.
- The tick (every 5 minutes, on both slots) loops over shops with a saved, enabled setting; each shop is in its own try/catch; retry loop picks the oldest due rows across shops and re-resolves each shop's connection.
- **Lessons:** (1) when seeding for a browser check, a Threads account id must be digits and long (the validator rejects short ones); (2) seed through the services (`IntegrationsService.save`) so secrets are encrypted the real way;
  (3) a "Post now" with a fake token reaches the real Graph API and comes back as Meta's own error (190), which is a useful end-to-end check of the failure path without posting anything.
- Not covered by tests (needs a real shop): an actual Facebook photo post and a real Threads publish; the first one should be a **Post now** after previewing, with the owner watching.

## Phase 5 as built (read this before phase 6)

- Code: `shops-platform/backend/src/social/` `status-kit.service.ts`, `status-kit.controller.ts` (`/portal/status-kit`; staff may use it, `PUT settings` is owner-only), `status-image.ts`, `status-palette.ts`, `photo-fetch.ts`, `brand-font.ts`;
  `statusDetails` and `buildStatusCaption` in `social-post.ts`; screen `web/app/portal/status-kit/page.tsx`. Doc `shops-platform/docs/STATUS-KIT.md`. Migration `20261121090000_add_status_kit_count` (one column on `SocialSetting`). New dependency `opentype.js`.
  21 integration-style checks in 19 tests + 51 unit tests.
- **No new table and no Meta connection**: items are `SocialPost` rows with channel `STATUS` (`<day>#<n>`, READY then POSTED), unique per shop, so the same claim trick makes "two people open it at once" safe. Anything that lists or takes down posts
  must now exclude `STATUS` (the Social posting list and `remove` were changed for this).
- **Section-aware, by options not by section name**: `statusDetails(options)` gives sizes for shoes and clothes, storage then colour for a phone, nothing for a one-form watch, never `condition`, at most two lines.
- **Per-shop colours**: `statusPalette(primary, accent)` = background is the primary colour mixed 82% with black (so any theme gives a dark picture), text colours are moved toward white until they reach 4.5:1 (tests include white, black, yellow and near-white themes).
  One bundled font (Libre Caslon, OFL) for every shop; letting a shop choose a font is a possible later step.
- **Bug the layout test caught in the drip-crm version too (not fixed there)**: with a two-line name, an offer and a sizes line the text ran past the call-to-action rule at y 1738. In Nairobi Gents the text block is laid out first
  and the photo takes what is left (760 to 1080 px), tested for the worst case. A fractional photo height also made sharp throw, so the height is floored.
- **Security point for multi-tenant**: the photo address is a shop owner's choice, so `fetchPhoto` refuses non-https, private/loopback/link-local/CGNAT/multicast addresses (including IPv4-in-IPv6) and checks every redirect (3 at most).
  Known gap: DNS is resolved, checked and then fetched, so a rebinding DNS could answer differently the second time. drip-crm's version has no such check (single tenant, own photos).
- **Screen bug found only in the browser**: a swapped item keeps its id but is a different product, so a picture cache keyed by id kept showing the old product's picture under the new name. Key pictures by id plus product, and
  prove it by comparing the displayed picture's bytes with a fresh render.
- A desktop browser cannot open the share sheet; `navigator.canShare({files})` is false there and the screen downloads the picture and says so. **Share to WhatsApp on a real phone is the one thing not tested**: do it once after deploy.

## Phase 6 as built (the plan's last phase)

- Code: `shops-platform/backend/src/marketing/` (`marketing-health.ts` pure rules for "needs a person" and "uses any of it"; `marketing-summary.service.ts` with `forShops`/`forShop`/`overview`; `marketing.module.ts`). Wired into `daily-report/` (optional `messaging` on `DailyReport`,
  `messagingSection` in the email only, **the approved WhatsApp template is untouched**) and `admin/` (`GET /admin/messaging?days=1|7`, a Health check). Screen `web/app/admin/messaging/page.tsx`. Doc `shops-platform/docs/MESSAGING-OVERVIEW.md`. **No migration.**
  26 unit + 12 integration tests.
- **Decision I made without asking (say so if it is wrong):** "daily digest" = a section in the owner's existing morning email, not a second message. The operator is not emailed; the signal is the page plus a Health warning. "Operator view" is read-only: editing a shop's
  connection is left to the shop (Portal > Connections), reachable by the existing audited impersonation.
- **One place decides "needs a person"** so the email and the operator page cannot disagree. Severity: problem = a saved error on a switched-on connection, a feature on with nothing connected, a Threads login ended, >=20% of >=5 WhatsApp messages failed, >=3 failed comment replies and at least half
  of those tried, every post to a channel failed; warning = Threads login ending within 14 days, switched on but never tested, some posts failed, posting off on the server. A switched-off connection is never reported. Too few messages to judge are not reported.
- **Accepted is not delivered** again: a send Meta accepted and later reported as `failed` counts as failed in the totals.
- **Operator page as cards, not a table**, so it reads on a phone with no sideways scroll; one grouped read per table across all shops; never selects `secrets` or `webhookKey` (a test asserts the overview contains no token text).
- The Health check is a **warning, never a failure**: one shop's setup is not a platform outage.
- **Test-writing lesson:** the filter "only shops that need attention" cannot be proven on data where every shop has something to report; make one shop genuinely healthy first.
- Not done, on purpose: an operator email/WhatsApp alert, and a per-shop "posting stalled" rule (posting on but nothing posted for N hours), which needs the schedule's due slots and was left out to avoid false alarms.

