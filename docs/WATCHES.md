# Watches

Watches are their own section of dripemporium.store (`/watches`), with their own pages, feed and staff screen, treated the way kits
are: **never mixed into the shoe shop, its filters, its search, its sitemap section or its feeds.** A watch has **no size**.

## How it is kept separate

Products carry a `line`: `SHOP` (shoes and the general shop), `KIT` (jerseys and T-shirts, see [KITS.md](KITS.md)) or `WATCH`.
Every public shop query is limited to `SHOP` (`SHOP_LINE` in `backend/src/storefront/storefront.service.ts`), so a watch cannot
reach `/shop/products`, the shop's filters or search, the Meta catalogue (`/shop/catalog.csv`), the four shoe feeds, the shoe
sitemap entries or the **Nairobi Gents sync**.

Which line a product is in is decided by **the database**, not by whichever screen created it: a trigger on `Product`
(`product_line_by_category`, migration `20261108090100_watches_line_data`) files any product in the **Watches category (or a
sub-category of it)** under `WATCH` and anything else under `SHOP`; kits are never touched. A watch added in the portal's
Catalogue, by an import, by a script or from Portal > Watches therefore lands in the right place, and moving a product to or from
the Watches category moves it between sections. `backend/test/watches.test.ts` covers the trigger and has a leak test that fails if a
watch ever appears on the shoe side.

## No size

- Adding a watch asks for a name, a price and photos. It creates **one** variant ("Standard") with no attributes. Choices (a strap
  or dial colour) are offered only if you list them; they are plain options, never sizes.
- The migration removes any size attribute from the Watches category, and the watches API reports `size: null` and no sizes even
  where an old variant still carries one.
- The watch page, cards, cart, WhatsApp message, feed and structured data never mention a size. The one mention is the FAQ answer
  "Do watches come in sizes? No."

## Pages

| Page | Address |
|---|---|
| Listing (search, brand, price, sort) | `/watches` (filtered views `noindex`; 404 while there are no watches on sale) |
| Brand | `/watches/brand/<slug>` (a brand with one watch is `noindex`) |
| Watch | `/watches/<slug>` |
| Feeds | `/watches-feed.xml`, `/watches-feed.csv` (404 with no watches) |

The **Watches** link appears in the menu and the footer's Shop column only while there are watches on sale. The home-page search
also searches watches. Titles, descriptions, FAQs and structured data are in `web/app/lib/watch-seo.ts` and are tested
(`backend/test/watches-seo.test.ts`): no copy calls a brand genuine or authentic or promises a warranty the shop has not stated.

### Old addresses

Watches used to be sold under `/shop`. Their old addresses now redirect permanently (308): `/shop/<watch>` to `/watches/<watch>`,
`/shop/category/watches` to `/watches`, and `/shop/brand/<brand>` to `/watches/brand/<brand>` for a watch brand, so existing links and
search results carry over.

## Staff

**Portal > Watches**: add a watch (name, brand, price, optional cost, optional choices, supplier-sourced or from stock, description,
photos), switch watches on or off sale and feature them. Stock and prices are edited in Catalogue and Inventory as for any product.

## Deploying

1. Apply both migrations (`20261108090000_add_watch_line` adds the value; `20261108090100_watches_line_data` moves the existing
   watches and installs the rule). They are separate because PostgreSQL cannot use a new enum value in the transaction that adds it.
2. Rebuild and restart the backend and the web app.
3. **Existing watches move out of the shop on this deploy.** The shoe feeds and the Meta shop catalogue lose them the next time they
   are fetched. In Meta and Google, create a separate catalogue pointing at `/watches-feed.xml` so they keep selling there.
4. Nairobi Gents: the sync only ever adds, so watches it already has stay, and new ones are no longer copied.
5. Resubmit `sitemap.xml` in Search Console.

## Not included

Watch-specific filters (strap, movement, case size) and per-brand editorial copy: there is no data for them yet.
