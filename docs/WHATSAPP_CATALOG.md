# WhatsApp Business catalog

Products shoppers see in the shop's WhatsApp Business chat — browsable
thumbnails, prices, and a "view catalog" button, backing the click-to-chat
flow already on the storefront (`use-enquiry-contact.ts`) — come from the same
feed already built for Meta Commerce Manager: `GET /shop/catalog.csv`
(`storefront.controller.ts`, `StorefrontService.catalogCsv()`). WhatsApp does
not have its own separate catalog format; a WhatsApp Business catalog **is** a
Commerce Manager catalog, so connecting it is a Meta Business Suite
configuration task, not a new integration to build. There is no code to write
here — this doc is the setup walkthrough.

## How it fits together

```
Meta Commerce Manager ──(fetches on schedule, e.g. hourly)──▶ GET /shop/catalog.csv
        │                                                            │
        │ ingests each row's `id` as that item's retailer_id         │
        ▼                                                            ▼
   Catalog (Commerce Manager)                              StorefrontService.catalogCsv()
        │                                                    one row per size/variant,
        │ connected to                                       sourced from Product +
        ▼                                                     ProductVariant + StockLevel
WhatsApp Business Account (via Business Suite)
        │
        ▼
Shopper opens the shop's WhatsApp chat → taps "View catalog" → browses,
optionally taps a product → sends a message referencing it (Cloud API sees
this as an order/product message carrying that same retailer_id)
```

Nothing calls out to Meta from this app. Meta's crawler pulls the feed on its
own schedule; the shop's backend has no awareness that WhatsApp exists.

## What's already in the feed

One CSV row per active, in-stock-or-orderable product variant (a specific
size), columns: `id`, `item_group_id`, `title`, `description`, `availability`,
`condition`, `price`, `sale_price`, `link`, `image_link`,
`additional_image_link`, `brand`, `google_product_category`, `size`,
`gender`, `age_group`. Full field-by-field rationale is in the doc comment
above `catalogCsv()` in `backend/src/storefront/storefront.service.ts`.

Two fields worth knowing about specifically because WhatsApp is the consumer:

- **`id`** is the variant SKU. Once Meta ingests the feed, this becomes that
  item's `retailer_id` — the identifier the WhatsApp Cloud API uses when a
  shopper's message references a catalog item (product/order messages, cart
  events). There is no separate `retailer_id` column to add; `id` already
  serves that role once ingested. If SKUs are ever renumbered, treat that the
  same as changing a product URL slug: existing references (and past
  WhatsApp order messages) point at the old value.
- **`price` / `sale_price`** are formatted `"<amount>.00 KES"` (e.g.
  `"2000.00 KES"`) — a plain amount, a space, then the ISO-4217 code, per
  Meta's catalog feed spec. KES is on Meta's supported currency list. Don't
  "fix" this format to a bare number; the currency suffix is required, not
  decorative.

## One-time setup in Meta Business Suite

1. **Business Manager**: create or use an existing one at
   [business.facebook.com](https://business.facebook.com), with the shop's
   WhatsApp Business Account (WABA) already added to it.
2. **Commerce Manager**: in Business Suite, go to *Commerce Manager → Add
   catalog*. Choose *E-commerce* as the catalog type (not "Real estate" or
   any other vertical).
3. **Connect the data source**: inside the new catalog, *Data sources → Add
   items → Data feed → Set a schedule*. Enter the feed URL:
   `https://api.dripemporium.store/shop/catalog.csv` — the production API's
   public HTTPS origin (`NEXT_PUBLIC_API_BASE_URL` in `.env.sample`), which
   must also be what `MEDIA_PUBLIC_BASE_URL` resolves to, since that's what
   builds every `image_link`. Never point this at `localhost` or an internal
   docker hostname. Set the fetch schedule to
   **hourly** (Meta's minimum interval) so a price change or a product going
   out of stock reaches WhatsApp promptly without needing a manual push.
4. **First fetch**: trigger it manually the first time (*Data sources → your
   feed → Fetch now*) rather than waiting for the schedule, so you can see
   errors immediately. Common first-run rejections are covered below.
5. **Connect the catalog to WhatsApp**: *Commerce Manager → Catalog
   settings → WhatsApp Business Accounts → Connect*, then pick the shop's
   WABA. This is what actually makes *View catalog* appear in the shop's
   WhatsApp chat — adding items to a catalog alone does not surface them on
   WhatsApp without this step.
6. **Verify on-device**: open the shop's WhatsApp Business number as a
   customer would, open the chat, and confirm *View catalog* now lists
   products with correct images, sizes, and prices.

No backend deploy, env var, or restart is needed to reach this point — steps
1–6 are entirely inside Meta's own dashboard, against the feed URL that
already exists.

## Env vars this depends on (already required for other things)

| Variable | Why the catalog needs it |
|---|---|
| `STOREFRONT_ORIGIN` / `NEXT_PUBLIC_SITE_URL` | Builds each `link` column — where "view on site" sends a WhatsApp shopper. Must be the real public storefront origin, not `localhost`. |
| `MEDIA_PUBLIC_BASE_URL` (falls back to `NEXT_PUBLIC_API_BASE_URL`, then `NEXT_PUBLIC_API_URL` — see `MediaService`'s constructor) | Builds `image_link`. Meta's crawler fetches every image URL directly; if this resolves to an internal-only address (a docker service name, a `localhost` port), Meta cannot reach it and the whole row — sometimes the whole feed — is rejected. |

Neither is new. If Meta rejects the feed for bad image URLs, the fix is
almost always that one of these is misconfigured for the environment Meta
can actually reach, not a feed bug.

## What could go wrong

- **Feed fetch fails or times out**: confirm `GET /shop/catalog.csv` is
  reachable from outside your network (not just from inside the VPC/docker
  network) — `curl` it from a machine that isn't on the same LAN as the
  server. Meta's crawler is a public client like any other.
- **Rows silently missing**: `catalogCsv()` skips a product entirely if it
  has no image (`imageLink` required) — see the `if (!imageLink) continue;`
  line. A product with no photo uploaded in the portal will never appear on
  WhatsApp; add an image and wait for the next scheduled fetch (or trigger
  one manually in Commerce Manager).
- **Stale prices/stock on WhatsApp after a change in the portal**: the feed
  is only as fresh as Meta's last fetch. An hourly schedule means up to an
  hour of lag by design — this is a pull feed, not a push. If a price needs
  to update *immediately* (a mispriced item live on WhatsApp right now),
  fix it in the portal and trigger *Fetch now* in Commerce Manager rather
  than waiting.
- **A size/variant shows "out of stock" that the shop can actually still
  sell**: won't happen — `availability` is deliberately always `in stock`
  for every active, orderable variant (including drop-ship items sourced
  from a supplier rather than shelf stock), matching what the storefront
  itself allows a shopper to order. See the rationale in the `catalogCsv()`
  doc comment if this ever needs to change.
- **Currency shows wrong or feed is rejected for currency reasons**: the
  feed is single-currency (KES) by design — Meta does not support mixing
  currencies in one feed. If the shop ever sells in a second currency, that
  needs a second, separate feed/catalog, not a new column on this one.
