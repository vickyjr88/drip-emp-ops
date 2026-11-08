# Credentials and ids in admin settings (not environment variables)

Drip Emporium reads ~55 integration variables from `process.env` (list at the end). Nairobi Gents must not: a multi-tenant app cannot have one `.env`
for many shops, and the user wants every id and secret editable by an administrator. This file is the design to build **first**, before porting any
feature. It extends what Nairobi Gents already has instead of inventing a parallel system.

## What exists in Nairobi Gents to build on (verify, it ages)

- `backend/src/common/secrets.ts`: AES-256-GCM `encryptSecret` / `decryptSecret`, stored as `enc:v1:<iv>:<tag>:<ciphertext>`, legacy plaintext passes through.
  Its key is `SECRETS_ENCRYPTION_KEY` in the environment. **That one stays an env var**: the key that decrypts the database cannot live in the database.
  Keep it together with `DATABASE_URL`, `JWT_SECRET`, `REDIS_URL` as the only bootstrap variables.
- Per-shop secrets on `Shop` (`paystackSecretKey`, ...) with the pattern: read side returns "is it set", write side treats blank as "leave alone"
  (`ShopService.getPortalSettings` / `updateSettings`).
- Platform settings: `PlatformSettings` singleton (SMTP) behind `AdminJwtGuard` at `admin/platform-settings`, with `AdminAuditLog` rows that record
  field **names**, never values, and a "send test email" action that reports the server's own error.
- `@NoShopScope()` routes for things that run without a shop in the request (webhooks must be one of these).
- Operator console pages in `web/app/admin/*`, portal pages in `web/app/portal/*`, owner-only routes via `OWNER_ONLY_PATHS`.

## The model

Two scopes, one resolution service.

- **Platform scope** (operator console, `PlatformIntegration`, one row per provider): only what is genuinely the operator's: an optional default WhatsApp sender
  used for owner notices (daily report) when a shop has no connection of its own, and global kill switches (the old `SOCIAL_POSTING=false`) and caps.
  **Decision (Nov 2026): every shop brings its own Meta app**, so there is no platform Meta app: app id and app secret are per-shop fields.
- **Shop scope** (portal, owner-only "Connections" screen, `ShopIntegration`, one row per shop and provider): that shop's own Meta app id/secret, WhatsApp number id,
  Page id, Threads login, templates, texts, caps, switches.

```prisma
enum IntegrationProvider { WHATSAPP FACEBOOK THREADS MAUTIC }

model ShopIntegration {
  id           String              @id @default(cuid())
  shopId       String
  shop         Shop                @relation(fields: [shopId], references: [id], onDelete: Cascade)
  provider     IntegrationProvider
  enabled      Boolean             @default(false)
  /// The id the provider calls this by: WhatsApp phone_number_id, Facebook page id, Threads user id. Webhooks are routed by it.
  externalId   String?
  config       Json                @default("{}")   // not secret: names, caps, texts, template names, language
  secrets      String?                              // encryptSecret(JSON.stringify({ accessToken, appSecret, ... }))
  /// sha256 of the shop's webhook path secret, so a request is matched to its shop by lookup, never by scanning.
  webhookKey   String?             @unique
  tokenExpiresAt DateTime?
  lastCheckedAt DateTime?
  lastError    String?
  updatedBy    String              @default("system")
  updatedAt    DateTime            @updatedAt

  @@unique([shopId, provider])
  @@unique([provider, externalId])
}

model PlatformIntegration {            // same columns minus shop/webhookKey/externalId
  provider IntegrationProvider @id
  enabled  Boolean @default(false)
  config   Json    @default("{}")
  secrets  String?
  ...
}
```

Whole-object encryption (one encrypted JSON string for all of a provider's secrets) beats a column per secret: new providers need no migration, and a
database dump shows nothing. Keep `config` plain so the screen and the logs can show it.

### What goes where (every drip-crm variable, mapped)

| drip-crm variable(s) | Destination | Secret | Notes |
|---|---|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | shop WHATSAPP `externalId` | no | webhook routing key |
| `WHATSAPP_ACCESS_TOKEN` | shop WHATSAPP secrets | yes | System User token, permanent |
| `WHATSAPP_WEBHOOK_SECRET` | generated per shop; only its hash is stored (`webhookKey`); the URL is shown once | yes | rotate button |
| `WHATSAPP_APP_SECRET`, `FACEBOOK_APP_SECRET` | shop WHATSAPP / FACEBOOK secrets (`appSecret`; `appId` in config) | yes | signature verification for that shop's own app |
| `WHATSAPP_REPORT_TEMPLATE`, `WHATSAPP_TEMPLATE_*`, `WHATSAPP_TEMPLATE_LANG`, `WHATSAPP_API_VERSION` | shop WHATSAPP config (API version: platform) | no | |
| `WHATSAPP_AUTO_SUBSCRIBE`, `WHATSAPP_DAILY_SEND_CAP`, `WHATSAPP_SEQUENCE_DELAYS_HOURS` | shop WHATSAPP config | no | a platform maximum can cap the shop's value |
| `OWNER_WHATSAPP`, `OWNER_EMAIL`, daily-report recipients | already in `DailyReportSetting` in Nairobi Gents | no | stay there |
| `APP_DOWNLOAD_URL` and the other outreach links | shop content settings | no | Drip reads them from Site content already |
| `FACEBOOK_PAGE_ID` | shop FACEBOOK `externalId` | no | webhook routing key for Page events |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | shop FACEBOOK secrets | yes | Page token derived from a System User token |
| `FACEBOOK_WEBHOOK_SECRET` | generated per shop; only its hash is stored (`webhookKey`) | yes | each shop's app has its own Page callback, so each shop has its own URL; the page id in the event is checked against `externalId` |
| `FACEBOOK_COMMENT_REPLIES`, `_PUBLIC_REPLY`, `_REPLY_DAILY_CAP`, `_PRIVATE_REPLY_TEXT`, `_PUBLIC_REPLY_TEXT`, `_PAGE_URL`, `_REPLY_SITE_URL`, `_REPLY_LOCATION`, `_REPLY_WHATSAPP` | shop FACEBOOK config | no | URL, WhatsApp and location default from shop settings |
| `THREADS_ACCESS_TOKEN`, `THREADS_USER_ID` | shop THREADS secrets / `externalId` | yes / no | the app renews and **writes the new token back to the row** |
| Threads app id/secret | shop THREADS (`appId` config, `appSecret` secret) | yes | needed for the short-lived token exchange |
| `SOCIAL_POSTING` | platform kill switch | no | per-channel enables are per shop (`SocialSetting`) |
| `STATUS_KIT_COUNT` | shop config | no | |
| `MAUTIC_BASE_URL`, `_CLIENT_ID`, `_CLIENT_SECRET` | platform MAUTIC (or shop, if shops have their own) | secret | decide with the user |
| `MAUTIC_CAMPAIGN_ID`, `MAUTIC_WHATSAPP_CAMPAIGN_ID`, `MAUTIC_WHATSAPP_SYNC` | shop MAUTIC config | no | |
| `OUTREACH_HOOK_SECRET` | per shop webhook key, same mechanism as above | yes | the Mautic step posts with it |
| `DAILY_REPORT_*`, `REMINDERS_*` (cron, timezone, enabled), `*_POLL_MS`, `*_WAIT_MS` | cron/timezone: platform config; enabled: per shop | no | test-only knobs may stay as non-secret constants |
| `STOREFRONT_ORIGIN` | derived: `storefrontOriginForShop(shop)` | no | already per shop in Nairobi Gents |

Operational non-secret settings (cron expressions, timezones, scheduler on/off, test-only wait knobs) may stay as environment variables: the rule is about **ids and secrets**.
Only four secret-bearing variables may remain: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `SECRETS_ENCRYPTION_KEY`.

## Resolution

`IntegrationConfigService.forShop(shopId, provider)` returns a typed object (validated, secrets decrypted) or `null`:

1. the shop's row if `enabled` or being tested; else
2. the platform row **only if the shop's config says `inheritPlatform: true`** (explicit; never silently send as another business); else
3. `null`. Callers report "not connected" in words the screen can show. There is no environment fallback.

Cache for ~60 s per (shop, provider); invalidate on save. Decrypt on read, never log the result, never put it in an error message. Every outbound
helper takes the resolved config as an argument (`new WhatsAppClient(cfg)`), so a service can serve many shops in one process and tests can pass a fake.

## Reading and writing (the secret-handling contract)

- GET returns config plus, per secret, `{ set: boolean, hint: "…a1b2" }` (last four only). Never the value.
- PUT: a blank or absent secret means keep; an explicit `clear: ["accessToken"]` removes it. Validate shape server-side (token prefix, numeric ids).
- Every change writes an audit row with the **field names** (and who), never values. The platform uses `AdminAuditLog`; give shops the same.
- Roles: platform rows need the operator (`AdminJwtGuard`); shop rows need `OWNER` (add the route to `OWNER_ONLY_PATHS`); STAFF may use the
  features but never see or change connections.
- **Test connection** per provider, read-only, showing the provider's own error text: WhatsApp `GET /{phone-number-id}?fields=display_phone_number,verified_name,quality_rating`;
  Facebook `GET /{page-id}?fields=name` and `/{page-id}/subscribed_apps`; Threads `GET https://graph.threads.net/v1.0/me` and `/{id}/threads_publishing_limit`;
  Mautic `POST /oauth/v2/token`. Store `lastCheckedAt` / `lastError` and show them.
- **Connect helpers** that need the stored token: subscribe the WABA (`POST /{waba}/subscribed_apps` with `override_callback_uri` + `verify_token`),
  subscribe the Page (`POST /{page}/subscribed_apps?subscribed_fields=feed`). Show the webhook URL and verify token to paste where Meta's dashboard
  requires it (the app-level Page callback, and the "messages" field, cannot be set with a token).

## Webhooks with many shops

- **WhatsApp**: Meta lets each WABA carry its own callback, so each shop gets its own URL `/whatsapp/webhook/<shop-secret>`. Hash the path secret
  (`sha256`), look up `webhookKey`, and you have the shop; also check `entry[].changes[].value.metadata.phone_number_id` equals that shop's `externalId`
  (defence in depth). Wrong secret: 404. The route is `@Public()` and `@NoShopScope()`, so pass `shopId` explicitly into every service call.
- **Facebook Page events**: the callback is per Meta *app*, and each shop has its own app, so each shop also has its own URL `/facebook/webhook/<shop-secret>`, resolved exactly like WhatsApp;
  also check `entry[].id` equals that shop's Page id (`externalId`); a different page: ignore with 200. (If a future deployment shares one app between shops, route by `entry[].id` instead.)
- Signature check (`X-Hub-Signature-256`) uses **that shop's** app secret when set. Raw body must be preserved (`rawBody: true` is already on in `main.ts`).
- Verification GET echoes `hub.challenge` only if the verify token equals the secret in the path.

## Everything that holds state needs the shop

Add `shopId` to `WhatsappContact`, `WhatsappOutreach`, `WhatsappMessageStatus`, `FacebookCommentReply`, `SocialPost`, `SocialSetting`, and put it in
every unique key: `@@unique([shopId, phone])`, `@@unique([shopId, channel, slotKey])`, `@@unique([shopId, commentId])`. Dedupe, caps ("200 a day"),
rotation ("not repeated for 30 days"), cooldowns and "today" are **per shop**. Schedulers loop over shops that have the feature enabled and use the
same claim-then-act idea per shop; the loop must tolerate one shop's failure without stopping the others.

## Migrating the existing env values

Nairobi Gents already uses `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_ACCESS_TOKEN` (Drip Emporium's number) for its daily report. On the first deploy of the
store, an idempotent import copies any present integration variables into the **platform** rows (never into a shop's row, which would silently make
the shop the number's owner), logs "imported WHATSAPP from environment", and does nothing if the row exists. After that the variables are removed
from `docker-compose.yml`, `.env.sample` and the server `.env`, and a test fails the build if any runtime code reads a provider variable again
(grep `process.env.(WHATSAPP|FACEBOOK|THREADS|MAUTIC|OUTREACH)_` outside the importer).

## Tests to write for the store itself

Encrypt/decrypt round trip and that the raw column contains no token; masked GET never contains the secret (assert on the whole JSON); blank PUT keeps and
`clear` removes; shop A cannot read or write shop B's row (including through the webhook); inheritance only when `inheritPlatform`; cache invalidates on
save; webhook routes the right shop and answers 404 for a wrong secret and for a right secret with the wrong `phone_number_id`; audit rows hold names, not values;
the grep test above. Use the same scratch-database approach Nairobi Gents already has (`TEST_DATABASE_URL`, name ending `_test`).

## UI

Owner "Connections" screen: one card per provider with status chip (Connected / Not connected / Error + the provider's message), the fields (secrets
shown as `••••a1b2` with a Replace button), Test connection, the webhook URL with a copy button and Rotate, and the feature switches that depend on it. Operator console: a
platform page with the Meta app, Threads app, platform sender, Mautic and the global kill switches. Phone-friendly, no horizontal scrolling.
