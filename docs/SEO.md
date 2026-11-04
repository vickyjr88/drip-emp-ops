# Search, answer-engine and AI visibility (SEO / AEO / GEO)

What dripemporium.store publishes for search engines and AI assistants, where it comes from, and the
one-off server settings it depends on.

## What the site publishes

| Surface | Where | Notes |
|---|---|---|
| `robots.txt`, `sitemap.xml` | `web/app/robots.ts`, `web/app/sitemap.ts` | Sitemap lists every active product, category, guide and page. `lastmod` is only set where a real change date exists (products carry `updatedAt`); static pages carry none, because a date that is "now" on every request is ignored by search engines. |
| Page titles, descriptions, share cards | `web/app/lib/page-metadata.ts` | CMS-editable under the `seo` document, with the compiled-in copy as fallback. |
| Structured data | `web/app/lib/site.tsx`, each page | `ShoeStore` + `WebSite` on every page (one `@id`, linked by every other block), `BreadcrumbList`, `Product` (SKU, new condition, seller), per-product `FAQPage`, `FAQPage` on `/faq`, `BlogPosting`, `LocalBusiness` on `/contact`. |
| Filtered catalogue views | `web/app/shop/page.tsx` | `/shop?size=…`, `?search=…`, `?brand=…`, `?sort=…` are `noindex, follow`; the canonical is `/shop`. Categories have real URLs (`/shop/category/<slug>`) and are indexed. |
| `/llms.txt`, `/llms-full.txt` | `web/app/lib/llms.ts` | See below. |

## /llms.txt and /llms-full.txt

A plain-text briefing for AI assistants (the llmstxt.org convention). `/llms.txt` states who the shop is, where, opening
hours, contact details, prices and main brands, then links the categories, every blog guide and the information pages.
`/llms-full.txt` adds every FAQ answer in full. Both are generated per request from the same sources as the pages
(CMS `contact`/`header`/`footer`/`faq` documents, the live catalogue, the blog), so they cannot go stale, and are cached for an hour.

- The phone number is the Contact page's; WhatsApp is the number the WhatsApp buttons use (`header` document, `enquiries.whatsapp`). When they are the same number it is printed once as "Phone and WhatsApp".
- "Main brands" lists only brands with at least three products, so a stray value in the product `brand` field is not
  quoted as a brand the shop stocks.
- The shop address and hours are constants in `web/app/lib/site.tsx` (`STORE_ADDRESS`, `STORE_HOURS`); change them there.
- Treat it as a cheap extra, not a ranking lever: no major AI provider has said it reads `llms.txt` when choosing what to cite.

## Brand and model landing pages

`/shop/brand/<brand>` ("Nike Sneakers in Nairobi, Kenya") and `/shop/collection/<model>` ("Nike Air Force 1 Price in Kenya") target
the searches people actually type: a brand or model plus "price in Kenya" / "Nairobi". They are built from the live catalogue
(`web/app/lib/collections.ts`), so the price range, sizes and "n of m on the shelf" in the opening paragraph and FAQ are always current.
Each page has a direct answer first, the product grid, a visible FAQ marked up as `FAQPage` (the markup repeats exactly what is shown),
`CollectionPage` + `BreadcrumbList`, and links to related brands, models and categories. They are in the sitemap and `/llms.txt`, linked
from the footer (their own **Popular Brands** column, editable under Site content > Footer > Popular brands links, where more brands or models can be added) and from each product's brand name.

- A brand page is indexed from 3 products, a model page from 2; smaller ones exist but are `noindex, follow`.
- **Adding a model page:** add an entry to `SERIES` in `lib/collections.ts` (a slug, a display name, a regex matched against product names,
  and one factual sentence: only a safe fact such as the year it first appeared).
- **Luxury names are excluded** (`NO_BRAND_PAGE`: Rolex, Hublot, Patek Philippe, Seiko, Versace, Dior, ...). Some catalogue items are described as
  "styled after" such a brand; a page titled "Rolex watches in Nairobi" with a price of a few thousand shillings would mislead searchers.

## Titles written for the searches people actually make

Added 2026-11-04 from Search Console queries ("smart casual shoes", "bagolee watch", "how much is a adidas samba", "dunks shoes", "drip shop").

- **Model pages** (`/shop/collection/...`) are titled "Adidas Samba Price in Kenya: From KSh 3,500", with the live starting price (`collectionTitle` in `lib/collections.ts`).
  Their FAQ opens with "How much is the Adidas Samba in Kenya?" and a second question lists the styles and prices actually stocked. `alias` on a `SERIES`
  entry sets the plural shoppers use ("Nike Dunks", "Adidas Sambas") for that second question.
- **Category pages** use search wording instead of stockroom names (`lib/category-seo.ts`): "Smart Casual Shoes in Nairobi, Kenya", "Official Shoes...", "Casual Shoes...".
  The description is built from the category's own products (count, starting price, brands with 3+ products), so watches no longer say "Nike, Adidas, Jordan and Puma".
  Related categories are linked under the copy (`RELATED_CATEGORIES`).
- **Product pages** are titled "<name> Price in Kenya: KSh X" and say whether the pair is on the shelf.
- **Home** is titled "Drip Emporium | Official Sneaker & Streetwear Shop in Nairobi" and the description opens "The official Drip Emporium shop". The `ShoeStore` schema carries `alternateName`.
- **Single-product brands** (e.g. Bagolee, one watch) have no indexable brand page by design (`MIN_BRAND_PRODUCTS`); the product page carries the search.
- Blog: `smart-casual-shoes-guide` was retitled "Smart Casual Shoes in Kenya: What to Wear and When" and expanded (original kept in `docs/blog-drafts/`).
  `are-premium-casual-shoes-worth-buying` is an unpublished draft.

## IndexNow (Bing and AI search)

`scripts/indexnow.sh` posts every sitemap URL to IndexNow (Bing, Yandex, Seznam, Naver). Bing's index also feeds ChatGPT search and Copilot,
so fresh pages there help AI visibility. The key file lives in `web/public/<key>.txt`. Run it after a deploy that adds pages, or weekly from cron
(see the script header). Google does not use IndexNow: submit the sitemap in Search Console.

## Link previews (WhatsApp, Facebook, X, LinkedIn)

`og:image` never points at the raw upload any more. Every page's share image is `/og/share.jpg?src=<picture>`
(`web/app/lib/og-image.ts`), the same picture recomposed to exactly 1200x630 as a small JPEG (the 2 MB home hero is about
110 KB). WhatsApp drops images over ~300 KB and ignores one whose real size differs from the declared size, which is what
made previews fail intermittently.

- Pages without a picture of their own (categories, blog posts with no cover, the FAQ, ...) use the home hero as the card.
- The route only fetches pictures from the site's own media host (the API origin, plus `OG_IMAGE_EXTRA_HOSTS`, comma-separated, if ever
  needed); any other address is refused. It fetches over `INTERNAL_API_BASE_URL`, not the public hostname, and falls back to
  redirecting to the original if anything goes wrong, so a preview is never worse than before.
- Platforms **cache previews**, failures included. After a fix, ask them to re-fetch: Facebook/Instagram/WhatsApp (Meta) use the
  Sharing Debugger (developers.facebook.com/tools/debug/ -> Scrape Again); for a single WhatsApp chat, share the link with
  `?v=2` on the end.
- A preview also needs the page itself to answer within a few seconds, with its meta tags in the first part of the HTML. If
  previews fail again, first time `curl -s -o /dev/null -w "%{time_starttransfer}\n" https://dripemporium.store/` and check it is
  well under 2 seconds; a slow page was once caused by the web slot b pointing at a backend that was not running.

## Server settings this depends on (aaPanel / nginx)

**Status: both applied on 2026-10-31** (backup of the extension folders in `/root/nginx-backup-drip-20261031-000832`). Verified: missing pages
(`/no-such-page`, `/shop/not-a-real-shoe`, `/blog/not-a-post`) now answer **404**, not 502; `www.dripemporium.store` answers **301** to the same path on
`dripemporium.store` (path and query kept, http and https); real pages, `/llms.txt`, the brand/model pages and the IndexNow key file still answer 200; a real
certificate challenge file on `www` is still served (200), so certificate renewal is unaffected. Two details: `www` is proxied by Cloudflare while the apex is not;
and when the app answers 404 for a path on `www`, nginx's `error_page` internal redirect makes the redirect rule fire, so the visitor is sent to the apex, which
returns the real 404. That is harmless and needs no action.


Both are per-site extension files, included at server level, so they only affect the site they sit in. Back up the folder first
(`cp -a /www/server/panel/vhost/nginx/extension/dripemporium.store /root/nginx-backup-drip-$(date +%F)`).

### 1. A missing page must answer 404, not 502

aaPanel's global `/www/server/nginx/conf/proxy.conf` sets
`proxy_next_upstream error timeout invalid_header http_500 http_503 http_404;`. A 404 from the app is then treated as a
failed upstream, nginx retries, runs out of servers and returns **502** for every missing URL (a retired product, a typo,
`/favicon.ico`). Search engines read that as a server fault and slow down or drop crawling.

`/www/server/panel/vhost/nginx/extension/dripemporium.store/next-upstream.conf`:

```nginx
proxy_next_upstream error timeout invalid_header http_500 http_502 http_503 http_504;
```

### 2. One address: redirect www to the apex

`www.dripemporium.store` is a separate vhost that proxies to the same app, so the whole site was served twice. Redirect it
(the ACME challenge path is left alone so the www certificate can still renew).

`/www/server/panel/vhost/nginx/extension/www.dripemporium.store/redirect-to-apex.conf`:

```nginx
if ($uri !~ "^/\.well-known/") { return 301 https://dripemporium.store$request_uri; }
```

Then test and reload:

```bash
/www/server/nginx/sbin/nginx -t && /www/server/nginx/sbin/nginx -s reload
curl -s -o /dev/null -w "%{http_code}\n" https://dripemporium.store/no-such-page      # expect 404
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://www.dripemporium.store/shop   # expect 301 https://dripemporium.store/shop
curl -s -o /dev/null -w "%{http_code}\n" https://dripemporium.store/llms.txt          # expect 200
```

To undo either, delete its file and reload nginx.

## Off-site, to do by hand

- **Google Search Console and Bing Webmaster Tools:** verify the domain and submit `https://dripemporium.store/sitemap.xml`.
- **Google Business Profile:** claim "Drip Emporium, Dubai Merchants Mall, Shop F53, Ronald Ngala Street". Its name, address,
  phone and hours must match the site exactly.
- **Google Merchant Center:** upload `https://dripemporium.store/product-feed.xml` for free product listings.
- **One set of contact details.** Phone and WhatsApp are +254 113 206 481 and the public email is `hello@dripemporium.store`
  everywhere (CMS `contact`, `header`, `footer`, `terms`, `privacy`, and the compiled-in defaults). Use the same details in Google
  Business Profile and on the social profiles. The mail-sending and admin addresses (`no-reply@`, `noreply@`, `admin@`) are
  operational and unrelated to what customers see; leave them as configured.

## Google reviews and the WhatsApp group

A strip at the top of every page footer asks customers to rate the shop on Google (with the rating as it stands) and to join the WhatsApp
group. Both addresses, the rating and the review count are editable in the portal under **Site content > Footer > Google reviews and
WhatsApp group** (`footer` document, `community.*`); each button is hidden while its address is blank, and the rating line while the rating or
the count is blank.

- The rating is typed in by hand: Google has no free feed of it without a Places API key. Update it when the profile's rating changes.
- No `AggregateRating` markup is added on purpose: Google does not show review stars for a business's reviews of itself.
- For the link, a direct "write a review" link works best (Google Business Profile > Get more reviews). The `share.google` profile link opens the
  business panel, where "Write a review" is one tap away.
