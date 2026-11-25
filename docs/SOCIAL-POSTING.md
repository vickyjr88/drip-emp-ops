# Social posting: products posted to Facebook, Instagram, Threads, X and TikTok automatically

Portal > **Social Posting**. At set times each day (default **09:00, 13:00 and 19:00 Nairobi**, up to six) the engine picks a product and
posts it to the Drip Emporium Facebook Page, Instagram, Threads, X and TikTok (each switched on separately): the product photo with a caption of the name, price, sizes in stock, a link to the product,
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

## Threads

Same product, same times, same rules, in its own rotation (a product is not repeated on Threads for 30 days, whatever Facebook posted). The text is
shorter and plainer, always within Threads' 500 characters: name, price and sizes, the tagged link (`utm_source=threads`, so Insights shows Threads), WhatsApp
and the location; if the text is too long the location goes first, then the sizes, then the name is cut. The link and the price are never dropped.
A Threads post is a photo post: the app creates it, waits until Threads has fetched the picture, then publishes it and keeps the post's link.

**Threads has its own login**, separate from the Facebook Page's. The Facebook tokens are refused by Threads ("Cannot parse access token"). To get one:
1. Meta App Dashboard > the app > **Add use case** > **Access the Threads API**. Its permissions are `threads_basic` and `threads_content_publish`.
2. App roles > Roles > add the shop's Threads account as a **Threads Tester**, and accept the invitation in the Threads app (Settings > Account > Website permissions > Invites).
3. In the Threads use case settings, use the **User token generator** for that account and copy the token.
4. Put it in the server `.env` as `THREADS_ACCESS_TOKEN` and deploy (migration `20261116090000_add_threads_posting`). The account id is found from the token
   (`THREADS_USER_ID` is only needed to override it).
5. Portal > Social Posting > Threads: **Preview the next posts**, then **Start posting**.

The token lasts 60 days. The app keeps its own copy and **renews it itself** once it is within 20 days of ending (Threads only renews a long-lived token that is more
than a day old); the screen shows when it ends. If it cannot be renewed the screen says why, and the current token keeps working until it ends. A new token put in
`.env` replaces the app's copy. If the generator gives a short-lived token (about an hour), exchange it for a long-lived one first
(`GET https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=<app secret>&access_token=<short token>`).

Taking a Threads post down from the screen uses Threads' delete call; if Threads refuses it (it needs its delete permission), delete the post in the Threads app.

## Instagram, X and TikTok

> **Where the keys go.** Every token and key below is entered in **Portal > Settings** (System), where it is stored encrypted: see docs/CREDENTIALS.md. The
> `.env` names (`FACEBOOK_PAGE_ACCESS_TOKEN`, `X_API_KEY` ...) are still read for any credential never saved in Settings, and on first start the `.env` values are copied across.

Each has its own switch, its own rotation (a product is not repeated on a channel for 30 days whatever the others posted) and its own caption, shaped to what
that platform allows. Migration `20261125120000_social_more_channels` adds the switches and TikTok's login fields.

| | Caption | Link | Delete from the portal | Costs |
|---|---|---|---|---|
| Instagram | up to 2,200 characters, at most 30 hashtags | not clickable on Instagram, so the address is written plainly and the WhatsApp number given to dial | **No**: Instagram offers no delete call; delete it in the Instagram app | free |
| X | up to 280 (a link counts as 23, an emoji as 2): name, price, sizes, the tagged link, number, tags; the location, sizes and number go first when it is too long | `utm_source=x` | yes | **per post** (below) |
| TikTok | a title of at most 90 characters (the product name) and a description | not clickable: plain address and number | **No**: delete it in the TikTok app | free |

**The picture.** Instagram takes JPEG only (no PNG or WebP), 8 MB at most, and only a shape between 4:5 and 1.91:1. Product photos are PNG, WebP or JPEG in any shape,
so the app converts each one: transparency becomes white, the colours are made sRGB, a photo outside the allowed shape is centred on white to the nearest allowed shape (nothing is cut off),
and it is brought to 1080 wide. Instagram and TikTok fetch the converted copy from `<API address>/social-posting/media/<post id>.jpg`, a public address that only answers for a real post's
random id. X is sent the same copy directly. (The API address is `PUBLIC_API_ORIGIN`, else `MEDIA_PUBLIC_BASE_URL`, which production already has.)

### Instagram

Instagram posts through the same Facebook Page connection as the Page. Nothing new goes in `.env` if the Page token has the Instagram permissions.
1. The shop's Instagram account must be a **Professional** (Business or Creator) account **linked to the Facebook Page** (Page settings > Linked accounts).
2. Make the Page token again with `instagram_basic` and `instagram_content_publish` added to the Page permissions it already has, and put it in `FACEBOOK_PAGE_ACCESS_TOKEN`.
   The screen shows **Posts to @account** once the Page's linked account is found, or the reason it is not.
3. If the account cannot be found from a Page token (Meta's wording is not clear that a Page token is enough), set `INSTAGRAM_BUSINESS_ACCOUNT_ID` (the id from
   `GET /me/accounts?fields=instagram_business_account`) and, if needed, `INSTAGRAM_ACCESS_TOKEN` (a different token with the same permissions).
4. Portal > Social Posting > Instagram: **Preview**, one **Post now**, then **Start posting**.

A post is three calls (make a container, wait until Instagram has fetched the picture, publish it). A refusal for permission is shown with the fix; a picture
Instagram cannot use fails at once; a slow one is retried. Instagram limits API posts to 50 or 100 a day (Meta's pages disagree); the engine makes six at most.

### X

X is paid per request. From X's pricing page (read 25 Nov 2026, "subject to change"): **$0.015** for a post, **$0.200** for a post that contains a URL. Every post this engine makes has the product link, so
**$0.20 each**: three a day is about **$18 a month**. Whether the picture upload is charged on top is not documented (a developer reported X staff saying each upload counts like a post, which would make
a picture post about $0.23); check your first days' usage in the console. There is no free tier. Credit is bought in advance in the X developer console, where an auto-recharge and a spending limit
can be set. **When the credit runs out the posts fail** (the screen says "X has no credit left") and are not retried until credit is added.
1. X developer console (console.x.com): create an app in a project. Under **User authentication settings** set the app permission to **Read and write**.
2. **Keys and tokens**: copy the **API Key** and **API Key Secret**; generate the **Access Token** and **Access Token Secret** for the shop's X account (do this after setting Read and write,
   or the token will be read-only and X answers 401/403).
3. Server `.env`: `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`, then deploy. These keys do not expire, so no sign-in or renewal is needed.
4. Portal > Social Posting > X: **Preview**, one **Post now**, then **Start posting** (the dialog repeats the cost).

The app signs each request itself (OAuth 1.0a) and uploads the picture to `POST /2/media/upload` then posts with `POST /2/tweets`; a post is deleted with `DELETE /2/tweets/:id`.

### TikTok

TikTok is connected from the portal, because its login is short-lived and its refresh token changes every time it is used: the app keeps the newest one, renews it ahead of time, and
two backend slots never renew at once (whoever loses picks up the winner's login). The connection lasts as long as it is used.
1. TikTok for Developers: create an app. Add the products **Login Kit** and **Content Posting API**, with the scopes `user.info.basic`, `video.publish` and `video.upload`.
2. Login Kit > Redirect URI: `https://api.dripemporium.store/social-posting/connect/tiktok/callback` (it must match exactly; it must be https).
3. **Verify the picture address.** TikTok only fetches pictures from an address you have proven you own. In the app's **URL properties** add either the domain `api.dripemporium.store`
   (verified with a DNS record) or the URL prefix `https://api.dripemporium.store/social-posting/media/` (verified with a signature file). Without this every post fails with `url_ownership_unverified`.
4. Server `.env`: `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET`, then deploy.
5. Portal > Social Posting > TikTok > **Connect TikTok**, and sign in with the shop's TikTok account. The screen then shows **Connected as ...**.
6. Choose how posts reach TikTok:
   - **Send to the TikTok inbox** (the default, and the only thing that works before TikTok audits the app): each post is sent to the connected account's TikTok inbox and **someone has to open TikTok and press post**.
     It needs a recent TikTok app (31.8 or later) and TikTok allows at most 5 unfinished inbox posts a day, so finish or discard them.
   - **Publish directly**: posts go public on their own. TikTok blocks this (`unaudited_client_can_only_post_to_private_accounts`) until the app has passed its audit
     (apply from the Content Posting API page in the developer portal). Switch to it only then.

Photo posts are one picture (TikTok "photo mode"). A post is checked until TikTok reports it posted or in the inbox; if it is still processing after 90 seconds it is recorded as sent, with the id to look for in the TikTok app, and not posted twice.

### What was and was not tested

Everything above is tested against **fakes** of the three platforms (their requests and answers as their documentation describes them), never against the real ones: no X, Instagram or TikTok
account was used. The X request signing was checked against an independent OAuth 1.0 implementation. Expect the first real posts to turn up what the fakes could not (a permission, an unverified address,
a picture shape). Preview, then one **Post now**, before **Start posting**, as for Facebook and Threads.

## Not built yet

- Several photos per post (only the first photo is used), and choosing by sales rather than stock.
- TikTok videos, Instagram Reels and Stories, X threads.

## WhatsApp Status kit

WhatsApp has **no way to post a Status automatically** (the Cloud API cannot; services that do it log into the shop's WhatsApp as a hidden linked device, which
WhatsApp's terms forbid and can get the number banned, so they are not used). The Status kit makes the manual post a ten-second job.

Portal > **WhatsApp Status**, meant for the phone that has the shop's WhatsApp:
- Each day the server picks three products (`STATUS_KIT_COUNT`, up to eight) the way the Page posts are picked: in stock, with a photo, not shown lately. A
  product marked posted is not offered again for 14 days at most (or the Social Posting repeat period, if shorter), a separate rotation from Facebook and Threads.
- For each it makes a 1080x1920 picture: the shop name, the product photo, the name, the price (the offer, with the old price struck through, when there is one),
  the sizes in stock in short form (`EUR 36–39, 41–44`), "Reply to this status to order", the website and the WhatsApp number. The text is drawn from the site's serif font,
  which is built into the app, so it looks the same on any server.
- Next to each picture is the text to go with it (name, price, sizes, "Reply to this status to order", and a product link tagged `utm_source=whatsapp&utm_campaign=status`,
  so Insights shows visits from Status as WhatsApp).
- **Share to WhatsApp** opens the phone's share sheet with the picture and the text; choose WhatsApp > **My status**. Where the browser cannot share files it downloads the picture instead.
  **Download** and **Copy text** are there too. **Swap product** brings the next one in line; **Mark as posted** moves the product to the back.
- The day's kit is made once and is the same for everyone who opens the screen. If a product sells out during the day, its card says so and its picture is no longer made.
- People who reply to a Status arrive in the shop's WhatsApp chat.

Pictures are made on request from the product photo (fetched by its address, within 20 seconds and 20 MB) and are not stored. Permissions: viewing uses SocialPost read, Swap and Mark as posted SocialPost update.
