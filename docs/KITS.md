# Kits and Design Center

Fan-version football jerseys and custom T-shirts on dripemporium.store, with a design center where a shopper adds a name and
number (or text and artwork), swaps the lettering and sees the front and back before ordering. It has its own listing pages,
design center, feed and sitemap entries, and it is **off until an admin switches it on**. The reasoning behind the design is in
[KITS-DESIGN-NOTES.md](KITS-DESIGN-NOTES.md).

## Turning it on and off

**Portal > Kits > Public site > Turn on / Turn off.** Anyone who may edit Site content (`page-content.update`) can use it; the
server enforces the same permission. The change is recorded with who and when.

While it is **off**, nothing about Kits is visible: every public `/kits/*` API route answers 404, the pages `/kits`, `/design`,
club, league, product and guide pages answer 404, the Kits link leaves the menu and footer, the kit URLs leave `sitemap.xml` and
`llms.txt`, and `/kits-feed.xml`, `/kits-feed.csv` and the kit images answer 404. Checkout refuses a personalised line. The staff
side (kits, clubs, print queue) keeps working so the catalogue can be prepared first. Orders already placed are unaffected.

An emergency override exists for an operator who cannot reach the portal: set `KITS_ENABLED=false` on the backend and restart;
the line is then held off whatever the portal says (the portal shows a notice). Leave it empty normally.

It starts **off** on first deploy (no settings row), and also if the database cannot be read.

## What is where

| Page | Address | Indexed |
|---|---|---|
| Listing | `/kits` (filtered views `noindex`) | yes |
| League | `/kits/league/<premier-league, la-liga, serie-a, bundesliga, ligue-1, kenyan-teams, national-teams>` | yes |
| Club | `/kits/club/<slug>` (a club with nothing on sale is `noindex`) | yes |
| Kit | `/kits/<slug>` | yes |
| Guides | `/kits/guides`, `/kits/guides/<slug>` (7 guides, in `web/app/lib/kit-guides.ts`) | yes |
| Design center | `/design` (opened on a kit or saved design: `noindex`) | yes |
| Saved design | `/design/<token>` | no (shared by link only) |
| Feeds | `/kits-feed.xml`, `/kits-feed.csv` | n/a |
| Drawn-shirt PNG | `/kits/image/<slug>` (`?og=1` for 1200x630) | n/a |

**Shoes are never mixed in.** Products carry a `line` (`SHOP` or `KIT`); every public shop query is limited to `SHOP`
(`SHOP_LINE` in `backend/src/storefront/storefront.service.ts`; watches are a third line, see [WATCHES.md](WATCHES.md)), so a kit cannot reach the shop, its search, the four shoe feeds,
`llms.txt`'s shop section or the **Nairobi Gents sync** (which copies `/shop/products`). `backend/test/kits.test.ts` has a leak test
that fails if a future change forgets the filter. Kits still use normal variants, so stock, orders, receipts and accounting work.

## Staff: setting it up

1. **Site content > Kits and Design Center**: print fees (name, number, name and number together, artwork, extra text), the printing
   lead time, the returns wording, the fan-version notice and the page headings. All editable; the server recalculates every price
   from these, so they cannot be changed from the browser. Defaults (printing costs KSh 300 to 700): name 500, number 300, name and number together 700, artwork 700, extra text 400 KES. Lead time default: delivered in 1 to 3 days, including printing and sourcing a shirt that is not in stock.
2. **Portal > Kits > Clubs**: 46 starter clubs and teams are loaded automatically (23 Premier League: the 2025/26 twenty plus three recently relegated; La Liga,
   Serie A, Bundesliga, Ligue 1, Harambee Stars, Gor Mahia, AFC Leopards, national teams), **all switched off**. Only clubs that are on appear in
   the design center and have a page, so switch on the clubs whose shirts you sell. A club is switched on automatically when you add a shirt for it,
   and **Switch on clubs that have shirts** / **Switch off clubs without shirts** do it in one click; there is also search and a league filter.
   `backend/src/kits/kit-catalogue.ts` holds their colours and nicknames.
3. **Portal > Kits > Shirt templates**: what the design center draws a design on. The site comes with generic **drawn shirts**; if they do not
   look like what you sell, untick them (they disappear from the design center) and add your own. A template is a **photo of the front and back in
   each colour** (chosen from the media library) with the **print areas marked** by dragging a box over the photo (T-shirt: front and back print
   area; jersey: name and number area). Tick "also create the shirt customers order on this template" to set its price and sizes in the same form.
   The design center then shows the customer's design on your actual shirt, in your colours. A template that shirts use cannot be deleted; switch it
   off instead.
4. **Portal > Kits > Kits > Add a kit**: name, type, club and kit (home/away/third), shape, price, sizes, photos. Tick "sourced from
   the supplier" for supplier-ordered shirts, untick if you hold stock (then add stock in Inventory). Create one **generic custom
   jersey** (no club) and one **custom T-shirt per shape**: the design center orders on those when there is no ready-made shirt for the
   chosen club and kit.
5. **Print queue**: every personalised order line with the exact name, number and font, the preview, and the steps Awaiting review,
   Approved, Printed, Ready, plus notes. Check names before approving: customers type this text.
6. Turn the line on (Public site), then submit `/kits-feed.xml` as a **second** catalogue in Meta and Google (so the shoe catalogue's
   results stay separate) and add the kit URLs to Search Console by resubmitting `sitemap.xml`.

## The design center

A shopper can always design the shirt: a jersey takes a name and number, a T-shirt takes text and artwork. Whether it can be **ordered** depends on a shirt
being set up for that combination (club and kit on a template, or a generic jersey or T-shirt on that template); if not, the controls still work, ordering
is held back and "Send this design on WhatsApp" is offered. Only templates that have a shirt set up are shown (all of them if none is yet).

The shirt colour is saved with the design ("Shirt colour Navy") and appears in the print queue, so the print shop picks the right blank.

## How a personalised order works

The browser draws the shirt (SVG) and, on Add to cart, sends the design to the server, which validates it against the rules for that
shirt (name up to 12 letters, number 0 to 99, a blocklist, allowed fonts and colours, artwork only from our own upload route), prices
it, stores the **cleaned** copy and returns a token. The cart holds the token. At checkout the server re-validates and re-prices the
design under today's fees, adds the print fee to the line (price and list price, so the margin reports show no discount or
surcharge), and keeps a frozen copy on the order line (`customisation`) with `printFee` and `printStatus`. A preview picture of front
and back is made in the browser and attached once.

## Fonts, artwork, and what is not official

The shirts are generic: shapes, colours and a pattern, no crest, sponsor or maker's mark. Everything is labelled **fan version**
and says it is not endorsed by any club, league or kit maker; tests (`kits-seo.test.ts`) fail if page copy claims the shirts are
official, authentic, original or licensed. The ten lettering styles are open-licence (SIL OFL) fonts served from
`web/public/kit-fonts` with `LICENSES.txt`, labelled by look, never as a club's typeface. Artwork uploads are re-encoded to PNG;
SVG is refused.

## SEO

Per-page titles, descriptions and canonicals (`lib/kit-seo.ts`, with the wording tested); JSON-LD: `Product` with offers (made-to-order
shirts are `PreOrder`, not `InStock`), `BreadcrumbList`, `ItemList`, `CollectionPage`, `FAQPage` on every page, `WebApplication` and
`HowTo` on the design center, `Article` on guides; sitemap and `llms.txt` sections; a visible, crawlable directory of every league and
club on the listing, design center and club pages; the drawn-shirt PNG as the image for every kit without a photo; internal links
between kit, club, league, guides and design center. Filtered and per-design URLs are `noindex`. A kit page's title drops
"(Fan Version)" if it would not fit in a search result; the page and description carry it.

## Deploying

Apply migrations `20261106090000_add_kits` and `20261107090000_kit_templates_and_hidden_templates` (additive: the `line` column defaults to `SHOP`, new tables, new `OrderLine` columns), rebuild
both images, and restart. No new packages. The kits tables and starter clubs are created on first start. The line stays off until
switched on in the portal. Remember `docker-compose.yml` passes `KITS_ENABLED`.

## Not built

- **Print-ready file export.** Staff print from the stored name, number and font and the preview; a transparent full-resolution PNG
  export is not built.
- **Fonts** are defined in code (`kit-catalogue.ts`), not editable in the portal; staff choose each club's suggested fonts through the API only.
- Cropping a template photo in the media library after marking its print areas moves the picture under the box: re-mark the area afterwards.
- Hoodies, embroidery, team name lists and Android app screens.

## Tests

`npm run test:kits` (needs `KITS_TEST_DATABASE_URL`, a **scratch** database with every migration applied: it deletes every kit in it),
`npm run test:kits-seo` (no database). They cover the leak test, the switch, clubs and search, design validation and pricing,
checkout, the print queue, preview and artwork handling, titles, claims, structured data, and the feed.
