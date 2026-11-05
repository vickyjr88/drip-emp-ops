# Kits and Design Center: design (draft for review, nothing built yet)

A second product line on Drip Emporium: jerseys and T-shirts a shopper can personalise (their name and number on a jersey,
artwork or text on a T-shirt) and see on a shirt before buying. It has its own listing page, its own design center and its own
feed, and it never mixes with the shoe catalogue.

## Decisions already made

| Question | Decision |
|---|---|
| Template images | **Both.** Generic SVG shirts in club colours (no crests, sponsors or maker logos) to start; staff can upload licensed photos per product that replace them. |
| Fonts | **Free look-alike fonts per club**, labelled by style, never as "official". Shoppers can swap between several. Staff can add more. |
| Ordering | **Existing cart and checkout.** Name, number, font, artwork and a preview image are saved on the order line. A print fee (per name, number, artwork) is editable in the portal. |
| Where it lives | A section of dripemporium.store, mobile first. The Android app can use the same API later. |

## 1. The main risk: keeping kits out of the shoe side

Today every public surface reads one `Product` table through `storefront.service.ts` (`/shop/products`, `/shop/categories`,
`/shop/filters`, search). Everything downstream trusts it: the shop page, brand and collection pages, `sitemap.ts`, `llms.txt`,
the four product feeds (`product-feed.xml/.csv`, TikTok xml/csv), the portal catalogue, and **Nairobi Gents**, whose
`DripSyncService` copies whatever `/shop/products` returns into its own shop. A kit that is just "another product" would leak into
all of those on day one.

**Approach: one table, a hard line between the two.**

- `Product.line` enum `SHOP | KIT`, default `SHOP`. Every existing row and every existing code path is untouched.
- One shared filter helper (`SHOP_LINE = { line: 'SHOP' }`) applied inside `storefront.service.ts`, the single place the public shoe
  endpoints read from. Because the feeds, sitemap, llms, collections and Nairobi Gents all go through those endpoints, one change
  covers them. The raw-SQL queries in that file (filters, search) get the same condition by hand.
- New `/kits/*` endpoints read only `line = KIT`.
- **A leak test** creates a kit, then asserts it is absent from every shoe-side endpoint and feed and from the Nairobi Gents
  response. It fails the build if a future change forgets the filter.
- The existing "Clothes" category and its products stay `SHOP`. Nothing existing moves.

Why not separate tables: orders, stock, receipts, accounting postings and reports all hang off `ProductVariant`. A second
variant table means rebuilding all of it. Why not "just a category": categories are already filtered inconsistently across
surfaces, which is the problem we are avoiding.

## 2. Data model (Prisma)

```
enum ProductLine { SHOP KIT }                       // Product.line, default SHOP, indexed

KitProduct        1:1 with Product (productId unique)
  kind            JERSEY | TSHIRT
  clubId?         -> KitClub          (null for plain / graphic T-shirts)
  season?         "2025/26"
  edition?        HOME | AWAY | THIRD | RETRO | NONE
  templateId      -> KitTemplate      (what the design center draws)
  photoOverrides  Json?               (front/back licensed photo + calibrated print areas, see 5)
  allowName, allowNumber, allowArtwork   booleans

KitClub           slug, name, aliases[] ("man u", "gunners"), league (EPL | LALIGA | SERIA | BUNDESLIGA | OTHER),
                  primary, secondary, trim colours, pattern, defaultFontId, sortOrder, isActive
KitTemplate       slug, name, kind, shape key, regions (body, sleeves, collar, trim) and print areas
                  (frontChest, frontCentre, backName, backNumber) as rectangles + optional curve
KitFont           slug, label ("Classic block"), family, woff2 file (media library), licence name + text,
                  clubIds[] it is suggested for, isActive, sortOrder
KitDesign         id, token (unguessable), spec Json, previewUrl, createdAt, customerId?
                  immutable once an order references it

OrderLine  + designId?  + customisation Json?  + printFee Decimal @default(0)  + printStatus?
           printStatus: AWAITING_REVIEW | APPROVED | PRINTED | READY
```

- The kit's **blank shirt is a normal `ProductVariant`** (size S to 3XL, price, stock, cost). Stock, reservations, supplier
  ordering, receipts and accounting work unchanged. A personalised sale draws down the blank.
- **Print fee on the line:** `unitPrice = base + fee`, `listPrice = unitPrice`, `printFee` recorded separately. That way the margin
  reports (which read `listPrice - unitPrice` as a discount) do not show the fee as a negative discount, and revenue posting needs
  no change.
- `customisation` is a **snapshot** of the spec at order time, so later edits to fonts or templates never change what was
  bought.
- Print fees live in the existing editable page-content system (a `kits` document), not a new table.
- Cart lines gain an optional `designId`. Two identical shirts with different names are two lines (line id = variant + design).

Two migrations: the enum and kit tables, then the `OrderLine` columns. Both are additive, with no backfill.

## 3. Pages

| Page | Purpose |
|---|---|
| `/kits` | Listing: filter by league, club, kind, size, price; search that understands club nicknames. Cards show the personalise button. |
| `/kits/[slug]` | Product page: gallery, sizes, price, "Personalise this" opens the design center on this product. |
| `/kits/club/[slug]` | Club landing page (like the existing brand pages): intro, the club's kits, "Price in Kenya" SEO copy. Indexed from 2 kits, as brand pages are. |
| `/design` | Design center on its own: choose a garment, then design it. Also reachable from a product with the product preselected. |
| `/design/[token]` | A saved design, shareable by link ("look what I made"), with Add to cart. |

Header gets a **Kits** link next to Shop. `/shop` and its search do not show kits.

## 4. Design center behaviour

**Jersey flow:** pick a club and kit (home, away, third) → shirt appears front and back → type a name, pick a number → swap the
font (5 to 6 options shown, each previewing the shopper's own name) → choose size → price updates → Add to cart.

**T-shirt flow:** pick a garment and colour → front and back views → add **artwork** (upload, or pick from the shop's own media
library) and/or **text** (curated fonts, colours) → drag, scale and rotate inside the print area → price updates → Add to cart.

Rules shown in the UI and enforced on the server:

- Name: letters, spaces, hyphen and apostrophe, up to 12 characters, upper-cased the way jerseys are. Number: 0 to 99.
- Artwork must sit inside the print area; a warning shows when the image is too small to print sharply (under roughly 150 dpi at
  print size).
- A small notice that personalised items are made to order and are not returnable (wording is yours to approve).

**Renderer:** inline SVG, no canvas library. The shirt is layered SVG with named colour regions; name and number are SVG text. A
jersey name can sit on a slight arch. The design center is its own code-split route so it adds nothing to the shop pages' weight.
Fonts load only when chosen (self-hosted woff2, `font-display: swap`, no Google CDN at runtime).

**Preview image:** on Add to cart the browser renders the SVG to a PNG and uploads it with the spec to `POST /kits/designs`. The
**spec is what gets printed**; the PNG is only for showing the customer and staff what was ordered. Staff can re-export a print-ready
transparent PNG at full resolution from the same renderer in the portal.

## 5. Templates

- **Generic generator:** one function `renderKit({ shape, pattern, primary, secondary, trim })` draws the shirt. Shapes: short
  sleeve and long sleeve jersey, retro collar, crew and V-neck T-shirt, oversized T-shirt. Patterns: solid, stripes, hoops, halves,
  sash, pinstripe. A club is then just colours plus a pattern. Plain T-shirt templates are the same shapes in a colour palette
  (white, black, grey, navy, red, and so on). No crests, sponsors or maker logos are drawn.
- **Licensed photo override:** on a kit product, staff upload a front and back photo (through the media library) and drag a
  rectangle to mark the print area. The design center draws the shopper's text over that photo instead. This is how realistic
  licensed images get in without code changes.
- Template data is versioned, so editing a template never changes an old order's snapshot.

## 6. Fonts

Official Premier League and club typefaces are proprietary, so each club gets **style-alike open-licence fonts**. Starter set
to review visually before committing (all SIL Open Font Licence, free to self-host): Oswald, Bebas Neue, Anton, Teko, Saira
Condensed, Barlow Condensed, Archivo Black, Alfa Slab One, Russo One, Chakra Petch. Each is labelled by look ("Classic block",
"Condensed", "Slab"), and the portal lets staff set a club's default and its suggested alternatives, or add a font (upload woff2
plus licence text). I will not claim any of them is the club's real font, and the UI will not either.

## 7. Feed

- New `kits-feed.xml` and `kits-feed.csv`, one row per size, built from `line = KIT` only: own `google_product_category`
  (Apparel & Accessories > Clothing), `item_group_id` per kit, `custom_label_0 = KIT`, links to `/kits/[slug]`, base price (the print
  fee is not in the feed).
- The four existing feeds are untouched and, through the filter in section 1, cannot contain kits.
- In Meta and Google you would create a **second catalogue** pointing at the kits feed, so the shoe catalogue's performance stays clean.
- `sitemap.ts` and `llms.txt` get kit URLs in their own sections.

## 8. Portal (staff)

New **Kits** area: Kits (create a kit, pick club, template, sizes, prices, stock), Clubs, Templates, Fonts, Print pricing, and a
**Print queue**: every order line with a design, with the preview, the exact name, number and font, a download of the print file,
and the status steps Awaiting review, Approved, Printed, Ready. Review before printing exists because customers type text that
goes on clothing. Permissions reuse the existing Product and Order keys, so no new permission seeding.

## 9. Security and abuse

- **Price is computed on the server.** Checkout recomputes base plus fee from the saved spec and ignores any client price.
- Artwork upload: image bytes checked, size and pixel limits, re-encoded with sharp (strips metadata and hidden payloads). **No SVG
  uploads.** Preview PNGs are validated the same way.
- `POST /kits/designs` is public (shoppers need not sign in), so it is rate limited, size capped, and designs are only reachable by an
  unguessable token.
- All user text is rendered as text, never as HTML, in the shop, the portal and the print queue.
- A basic blocklist on names, plus the manual review step above. Customer artwork containing club crests or brand logos is something
  review catches; it is not detected automatically.

## 10. Build order (each step ships and tests on its own)

1. **Foundation:** `ProductLine`, kit tables, the shoe-side filter and the leak test, Kits catalogue in the portal, `/kits` listing and
   product page, kits feed. Shoppers can browse and buy a blank kit; nothing on the shoe side changes.
2. **Jersey design center:** generic generator, clubs, fonts, name and number, font swap, preview, saved designs.
3. **T-shirt design center:** artwork and text, print areas, media library reuse, print-quality warning.
4. **Checkout and print queue:** cart lines with designs, server-side pricing, order line snapshot, review and print steps, print file export.
5. **Growth:** club landing pages, SEO, licensed photo override tool, sharable design pages.

Tests: unit tests for pricing, validation and the leak filter; HTTP-level tests for the endpoints; browser checks of the design center
at desktop and 375px; a snapshot check that the same spec always renders the same SVG.

## 11. What I need from you before building

1. **Print fees:** amounts for name, number, artwork (and whether a name and number together is a bundle price).
2. **Returns and lead time:** are personalised items final sale, and how many days do you quote for printing?
3. **Clubs to start with:** all 20 Premier League clubs plus which other leagues or national teams? (More can be added in the portal.)
4. **Blank stock:** do you hold blanks and print in-house or via a supplier? This decides whether kit variants default to
   made-to-order (supplier) or stock.
5. **Nairobi Gents:** should it ever sell kits? The default here is no, and the kits stay off its sync.
6. **Wording and licensing:** selling "Arsenal home kit with your name" implies licensed goods. Please confirm how you want these listed
   (for example "Arsenal-style jersey" versus the club name), and take advice if unsure; I will follow what you decide.

## 12. Out of scope for the first version

Hoodies and other garments, embroidery, 3D or mannequin views, live pricing against real print suppliers, bulk team orders with name
lists, and the Android app screens. All fit the same model later.
