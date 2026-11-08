# Social posting: products posted to the Facebook Page automatically

Portal > **Social Posting**. At set times each day (default **09:00, 13:00 and 19:00 Nairobi**, up to six) the engine picks a product and
posts it to the Drip Emporium Facebook Page: the product photo with a caption of the name, price, sizes in stock, a link to the product,
the WhatsApp link and the shop's location. It is **fully automatic**: no one approves a post first. Because every post is public it is
**off until someone turns it on** on the screen.

## What gets posted

Only a product a shopper could buy right now, as the shop shows it: active, in a live category, shoes and general goods (watches and kits have
their own pages and are not posted), with at least one size in stock, an https photo and a price. A running offer is shown with both prices.

Which one: products never posted come first (best stocked first: more sizes, more units, an offer, newly added), then whichever was posted longest
ago. A product is not posted again for **30 days** (`cooldownDays`). A small shop that runs out of products repeats the one posted longest ago, but never
within a week. Two posts of the same brand in a row are avoided when there is another choice.

```
Pick of the day ✨

Nike Air Force 1 White
💰 KES 4,200
📏 Sizes available: 40, 41, 42

🛒 Order online: https://dripemporium.store/shop/nike-air-force-1?utm_source=facebook&utm_medium=social&utm_campaign=autopost
💬 WhatsApp: https://wa.me/254113206481
📍 Dubai Merchants Mall shop F53, Ronald Ngala Street, Nairobi

#DripEmporium #NairobiShoes #Nike
```

The opening line varies by product and day. The link is tagged, so **Insights counts these visits as Facebook** (campaign `autopost`), next to ad traffic.
The comments they draw are answered by the Facebook comment replies (docs/FACEBOOK-COMMENTS.md): a private Messenger reply and a public one.

## Guards (because nothing is reviewed)

- Off until switched on in the portal; `SOCIAL_POSTING=false` in `.env` stops everything whatever the portal says.
- Each slot is posted once: the slot (`2026-11-08@09:00`) is unique per channel, so the two backend slots and repeated checks cannot post it twice.
- A slot is posted only within **90 minutes** of its time. After a long outage or a late switch-on the missed slots are dropped, not posted in a burst.
- If Facebook is unavailable the same post is tried again a few minutes later, three times at most. A refusal (a permission, an invalid token) is not retried and is shown on the post.
- With nothing eligible the slot is recorded as skipped, with the reason.
- Any post can be **taken down** from the screen (it is deleted from the Page).
- **Post now** posts one immediately (a real post), optionally for a product chosen from the preview. **Preview the next post** shows what would go out and posts nothing.

## Setting it up

The Page connection is the one the comment replies use: `FACEBOOK_PAGE_ID` and `FACEBOOK_PAGE_ACCESS_TOKEN`. The token needs `pages_manage_posts` (it
is part of managing the Page), `pages_read_engagement` and `pages_show_list`. Deploy (it adds two tables, migration `20261115090000_add_social_posting`),
open Portal > Social Posting, check **Preview the next post**, and press **Start posting**.

| Setting | Where | Default |
|---|---|---|
| Switch, times, days before a repeat | Portal > Social Posting | off; 09:00, 13:00, 19:00; 30 days |
| `SOCIAL_POSTING` | server `.env` | `true`; `false` stops all posting |
| The WhatsApp link, location and website in the post | Site content (header enquiries WhatsApp, footer address), or `FACEBOOK_REPLY_WHATSAPP`, `FACEBOOK_REPLY_LOCATION`, `FACEBOOK_REPLY_SITE_URL` | as the comment replies use |

## Not built yet

- **Threads.** The same posts to Threads need the Threads API added to the Meta app and the Threads account authorised once (Threads uses its own login,
  with `threads_content_publish`); the engine is built around channels so it is an addition, not a rewrite.
- **Instagram.** The token has `instagram_content_publish`; not connected here.
- Several photos per post (only the first photo is used), and choosing by sales rather than stock.
