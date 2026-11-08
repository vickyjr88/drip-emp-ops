# Social posting engine (Facebook Page + Threads)

Read first: `drip-crm/docs/SOCIAL-POSTING.md`, then `backend/src/social-posting/social-post.ts` (pure rules), `social-posting.service.ts`, the screen `web/app/portal/social/social-posting-view.tsx`.

## What it does

At set Nairobi times (default 09:00, 13:00, 19:00; up to six) it picks a product and posts it to each channel that is switched on: a photo post with a caption (name, price or offer, sizes in stock, a tagged product link, WhatsApp link,
location, hashtags). **Fully automatic, no review**, so it is built to be safe unattended. Facebook and Threads each have their own switch, rotation and rows.

## Choosing

`postableProducts()` on the storefront service returns what a shopper could buy now: active, live category, line SHOP (watches and kits have their own pages), at least one size in stock, an https photo, a price, using today's offer price.
`pickProduct`: never-posted first (best `score`: sizes in stock, units, offer, newness), then longest ago; cooldown 30 days per channel; a small shop repeats the oldest only after 7 days; avoid the same brand twice in a row.

## Per-channel facts

- **Facebook**: `POST /{page-id}/photos { url, caption, published: true }` → `post_id`. Delete: `DELETE /{post_id}`. Needs `pages_manage_posts`.
- **Threads**: three calls. `POST /{user-id}/threads { media_type: IMAGE, image_url, text, access_token }` → container id; poll `GET /{id}?fields=status,error_message` until `FINISHED` (3 s steps, up to 60 s; `ERROR`/`EXPIRED` = permanent;
  timeout = transient retry); `POST /{user-id}/threads_publish { creation_id }` → id; `GET /{id}?fields=permalink`. **500 characters**: `buildThreadsCaption` drops the location, then sizes, then WhatsApp, then cuts the name; link and price are never dropped.
  250 posts per 24 h. Delete may need extra permission: if refused, tell the user to delete in the Threads app.
- **Threads login**: its own OAuth token (`THAA…`), 60 days, renewed by refresh when within 20 days of ending and at least a day old, at most once an hour. In drip-crm the app keeps a copy (`SocialCredential`) keyed by the hash of the env token so a new env
  token replaces it. **In Nairobi Gents the shop's THREADS secrets row is the source of truth and renewal writes back to it**; delete the hash dance. Surface `tokenExpiresAt` and the last renewal error on the screen; if renewal fails the current token still works until it ends.
  The account id is found from `/me`, so only the token is needed.

## Guards (all of them)

Off until a person presses Start posting (dialog explains); `SOCIAL_POSTING=false` (platform kill switch in the new design) overrides everything; unique `slotKey` per channel so two slots cannot double-post; slot posted only within 90 min of its time;
transient failure retries up to 3 within 2 h; permanent failure is shown and not retried; SKIPPED rows record "No product in stock…"; **Preview** (posts nothing) and **Post now** (posts the previewed product); **Take down** per post; posts list with channel chip and link.
Tagged links: `utm_source=facebook|threads`, `utm_medium=social`, `utm_campaign=autopost`.

## Data and endpoints

`SocialSetting` (singleton: `facebookEnabled`, `threadsEnabled`, `times[]`, `cooldownDays`; per shop in the multi-tenant port), `SocialPost` (channel, slotKey, product, caption, image, status PENDING|POSTED|RETRY|FAILED|SKIPPED|REMOVED, detail, attempts, externalId, permalink, scheduledFor, postedAt, triggeredBy; unique `(channel, slotKey)`),
`SocialCredential` (drip-crm only). `GET /social-posting/status`, `PUT /settings`, `GET /preview`, `GET /posts`, `POST /post-now {channel, productId?}`, `DELETE /posts/:id`.

## Multi-tenant port

Per shop: settings row, posts, rotation, caps. The scheduler tick loops over shops with an enabled FACEBOOK/THREADS integration and handles each in a try/catch. `postableProducts(shopId)` must respect Nairobi Gents' sections (watches, clothes,
electronics, devices) and per-shop domains (`storefrontOriginForShop`); decide per section how the caption reads (sizes mean nothing for watches and devices; use the attribute the section defines). Product images live in object storage: they must be public https URLs for Meta to fetch.

## Verify

Tests cover caption limits, slot windows, rotation, per-channel independence, retries, token renewal and take-down (18 tests in `social-posting.test.ts`). Production: read the `SocialPost` rows, open the permalink, confirm Insights shows the source. Before turning a channel on: Preview, then one Post now, then Start posting.
