# Facebook comments: opening a conversation with people who comment on the ads

People who like an ad cannot be messaged: Facebook gives a Page no way to write to someone who only reacted. People who **comment**
can: a Page may send one **private reply** to the author of a comment, within 7 days of the comment. It lands in their Messenger, and
when they answer, a normal conversation opens that staff handle from the Page inbox (Meta Business Suite).

## What happens to a comment

1. Facebook posts the new comment to `/facebook/webhook/<FACEBOOK_WEBHOOK_SECRET>`.
2. The commenter gets a private message: *"Hi Wanjiru! Thanks for your interest in Drip Emporium. Reply here with the pair and your size
   and we'll confirm the price and delivery, or chat to us on WhatsApp: https://wa.me/254113206481. Follow our page for new arrivals and
   offers: https://www.facebook.com/..."* (the WhatsApp link and the Page link are the ones in Site content, unless overridden).
3. Only if that went, a public reply goes under the comment: *"Thanks Wanjiru! We've sent you a message with the details. Check your
   Messenger inbox (or Message requests). Shop online: https://dripemporium.store / Visit us: Dubai Merchants Mall shop F53, Ronald Ngala Street, Nairobi"*

Not answered: the Page's own comments, replies to other comments (top-level only), comments containing a link (spam), a second comment
from someone already messaged in the last 7 days, and anything beyond `FACEBOOK_REPLY_DAILY_CAP` (default 200) a day. A comment is answered
once however many times Facebook delivers it. If Facebook is down the reply is retried (3 tries, within 6 days); a reply that Facebook says
was already sent is not sent again.

The screen is Portal > WhatsApp Outreach > **Facebook comments**: whether the Page is sending us comments, how many were messaged, skipped
or failed, and the latest comments with the reason for each.

## Setting it up

1. **A Page token.** In Meta Business Suite / Graph API Explorer, for the Drip Emporium Page, create a long-lived Page access token with
   `pages_messaging`, `pages_manage_metadata`, `pages_read_engagement` and `pages_manage_engagement`. Put it in `.env` as
   `FACEBOOK_PAGE_ACCESS_TOKEN`, with the Page's id as `FACEBOOK_PAGE_ID`.
2. **A secret.** Set `FACEBOOK_WEBHOOK_SECRET` to a long random string, then deploy. Optionally set `FACEBOOK_APP_SECRET` (the app's secret) to
   have Facebook's signature on every event checked.
3. **Tell Facebook where to send comments.** App Dashboard > Webhooks > object **Page** > Edit subscription:
   Callback URL `https://api.dripemporium.store/facebook/webhook/<FACEBOOK_WEBHOOK_SECRET>`, Verify token the same secret. Subscribe the
   field **feed**. (This is app-level and cannot be done with the Page token.)
4. **Subscribe the Page to the app.** With the Page token:

   ```
   POST https://graph.facebook.com/v21.0/<PAGE_ID>/subscribed_apps?subscribed_fields=feed
   ```

   The Facebook comments card then shows "Page is sending us comments".
5. **Test** by commenting on a Page post from a personal account that has a role on the app.

## Limits worth knowing

- **App review.** Until the app has Advanced Access to `pages_messaging` (App Review, which usually needs business verification), Facebook only
  delivers and allows replies for people who have a role on the app (admins, developers, testers). Test with those first.
- **Ads.** Comments on ads are Page-post comments and are sent through the same feed webhook; whether a given ad (a "dark post") reaches the
  webhook is worth checking with one test comment on a live ad.
- **One message.** A private reply is a single message; Facebook allows more only after the person answers, and then for 24 hours.
- **Not marketing.** It answers a comment; it is not a way to broadcast. Use the WhatsApp subscription for updates.
- **Instagram** works the same way for its own comments but is not connected here.

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `FACEBOOK_COMMENT_REPLIES` | `true` | `false` switches it all off |
| `FACEBOOK_PUBLIC_REPLY` | `true` | `false` sends only the private reply |
| `FACEBOOK_REPLY_DAILY_CAP` | `200` | Private replies per day (Nairobi time) |
| `FACEBOOK_REPLY_WHATSAPP` | Site content > enquiries WhatsApp number | The number in the WhatsApp link |
| `FACEBOOK_PAGE_URL` | Site content > footer > Facebook, else facebook.com/<page id> | The Page link |
| `FACEBOOK_REPLY_SITE_URL` | the storefront address (`STOREFRONT_ORIGIN`), else https://dripemporium.store | The website link in the public reply (`{site}`) |
| `FACEBOOK_REPLY_LOCATION` | Site content > footer > Contact > address | The shop location in the public reply (`{location}`) |
| `FACEBOOK_PRIVATE_REPLY_TEXT`, `FACEBOOK_PUBLIC_REPLY_TEXT` | built in | The wording; `{name}`, `{whatsapp}`, `{page}`, `{site}` and `{location}` are filled in |
