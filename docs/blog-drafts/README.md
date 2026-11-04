# Blog drafts (written 2026-10-31)

Four posts for dripemporium.store, aimed at searches where the current results are weak (spam, marketplace listings, one news article).
They are **unpublished drafts** in the blog (no publish date), so they are not on the site, in the sitemap or in `/llms.txt`. Open the portal,
go to **Blog**, read and edit a draft, then press **Publish** (list row or editor). Copies of the bodies are here as `.html`; `posts.py` is the source.

| Post | Targets | Notes |
|---|---|---|
| `sneaker-shops-ronald-ngala-street-nairobi` | "sneaker shops / where to buy sneakers on Ronald Ngala Street, Nairobi CBD" | Discloses that Drip Emporium is on the street. Says Ronald Ngala Street is known for footwear (reported by Nation and Business Daily); makes no claims about other shops. |
| `how-to-buy-sneakers-online-in-kenya-safely` | "how to buy sneakers online in Kenya", "is it safe to buy shoes online Kenya" | Seller checks, sizing, delivery cost, M-Pesa safety, inspecting on arrival, red flags. |
| `how-much-do-sneakers-cost-in-kenya` | "how much are sneakers in Kenya", "Air Force 1 / Jordan 4 price in Kenya" | **Contains live prices as of 2026-10-31.** Re-check them (or update) before publishing, and every few months after; each links to the live brand/model page. |
| `protect-sneakers-nairobi-rainy-season` | "protect sneakers rain Nairobi", seasonal | Short rains run October to December, so publish it soon. |

## Check before publishing

- **Prices** in the pricing post against `/shop` (they change as stock does).
- **Facts about the shop** (address, hours, "try on and pay only if they fit", "unworn shoes in the original box are easiest to exchange", delivery cost confirmed after
  ordering): all taken from the site's own FAQ, Delivery and Contact pages. Change the posts if any of those change.
- **Publish order:** the Ronald Ngala post links to the "buy sneakers online safely" post, so publish that one first or together with it, otherwise the link 404s. The other posts only link to articles that are already live.
- **Cover images:** none set (the existing posts have none either). Without one, shared links use the brand banner.
- After publishing, run `scripts/indexnow.sh` so Bing (and ChatGPT search) learn about them quickly, and submit the new URLs in Google Search Console.

## Added 2026-11-04

| Post | Status | Notes |
|---|---|---|
| `smart-casual-shoes-guide` | **Published, rewritten** | Retitled and expanded for "smart casual shoes". The previous text is `smart-casual-shoes-guide.original.html`; the new body is `smart-casual-shoes-guide.revised.html`. |
| `are-premium-casual-shoes-worth-buying` | Draft (unpublished) | Targets "are premium casual footwear options worth buying". Contains one illustrative cost-per-wear example (labelled as an example) and says Drip Emporium's prices run about KSh 2,000 to 5,000 "at the time of writing": re-check before publishing. Body: `are-premium-casual-shoes-worth-buying.html`. |
