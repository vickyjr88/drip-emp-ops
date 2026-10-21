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

## Server settings this depends on (aaPanel / nginx)

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
- **One set of contact details.** Phone and WhatsApp are +254 113 206 481 everywhere (CMS `contact`, `header`, `footer`, `terms`,
  `privacy`). The email still differs: the Contact page and footer document say `support@dripemporium.store`, while the rendered
  footer shows `info@dripemporium.store`. Pick one and use it in the CMS, Google Business Profile and socials.
