# Share: search and share products, and the affiliate Status kit

**Account > Share** (`/account/share`) is for every signed-in customer and affiliate. It searches the shop and opens WhatsApp, Facebook, X and Telegram with the product, its price and the link
already in place, with **More...** (the phone's own share sheet, which reaches Instagram, TikTok, Messages and the rest) and **Copy link** for anywhere else. Affiliates also get a daily **Status kit**.
Nothing is posted for anyone: WhatsApp and the social networks give a website no way to do that, so this opens their own share screens and a person presses send.

## Who sees what

| | Customer | Affiliate (reseller or wholesale, with a referral code) |
|---|---|---|
| Search the shop and watches | yes | yes |
| Share on WhatsApp, Facebook, X, Telegram, More..., Copy link | yes | yes |
| The link | the product page, tagged `utm_campaign=customer-share` | the product page with `?ref=<their code>`, tagged `utm_campaign=affiliate` |
| Price shown | the price anyone sees (never a trade price) | the same, on purpose: they are selling to shoppers |
| **Status picture** for any product in stock with a photo | no | yes |
| **Today's Status kit** (six ready pictures) | no | yes |

The affiliate test is the account page's own (`priceTier` is not `RETAIL` and there is a `referralCode`), and the server repeats it: a customer who asks for the kit or a picture directly is refused (403).

## The link, and why it credits the affiliate

`?ref=<code>` is what the storefront already captures into its 30-day attribution cookie (`useCaptureReferral`) and attaches to any order or WhatsApp lead that follows, so a sale is credited to the affiliate
even when it closes later in a chat. The `utm_source` is the channel (`whatsapp`, `facebook`, `x`, `telegram`, `share`, `link`), so Insights counts the visits by channel. The page and the server make the very same address
for an affiliate (a test compares them), and a code is always encoded so it cannot break out of its parameter.

## The Status kit

Each day six products (`AFFILIATE_KIT_COUNT`, 1 to 12) are chosen from the better sellers (sizes to choose from, stock depth, an offer, newness), in an order that changes daily and is the same for every
affiliate on a day, so **nothing is stored per person**. For each there is a 1080 x 1920 picture (the same drawing as the shop's own WhatsApp Status kit) and the text: name, price, sizes in stock, and the affiliate's link.

The picture says **"Tap the link below to order"** and shows only the shop's address, not the shop's own chat number: a reply to the affiliate's Status goes to the affiliate, so the picture points at the link in the text, which is what
credits them. **Share picture** opens the phone's share sheet with the picture and text (choose **My status**); on a computer it downloads the picture and copies the text. **Send as a message** opens WhatsApp with the text and link.

A picture is drawn on request and not stored, 120 an hour per affiliate; the response varies by sign-in (`Vary: Authorization`) so a shared device cannot replay one.

## Share counts

Every tap on a share button is recorded (`ShareEvent`, migration `20261122120000_add_share_events`): who, where to (`whatsapp`, `facebook`, `x`, `telegram`, `share` the phone's share sheet, `link` copied, `download` a picture saved),
which kind (`PRODUCT` a search result, `PICTURE` a status picture, `KIT` an item of the day's kit) and which product. **It counts the intention, not the arrival**: the networks tell a website nothing about what happened next, so
a share is counted when its share screen was opened, the link was copied, or the picture was handed to the share sheet, and **not** when someone closed the share sheet. Two taps on the same button within two seconds are one share.
What a share brought in is counted where it always was: link clicks, orders and WhatsApp leads against the affiliate's code, and visits by channel in Insights.

- **The server decides** whether a share carried a referral code (from who the customer is, never from the request), accepts only the known channels, kinds and a valid product address, and limits a customer to 300 a hour.
- **Affiliates** see "Times you shared" (with the channels) and a 30-day trend on their dashboard, beside link clicks, orders and leads.
- **Staff** see the same on a reseller's page, and Portal > Insights > Visits & ads has a **Shares** card for the period: total, people who shared, with a code and plain links, by channel, most shared products, who shares most.
- Merging duplicate customers moves share history to the kept customer.

## Where to find it

A "Share & earn" / "Share products" panel on the account page, and a button at the top of the affiliate dashboard.

## Files

- Backend: `backend/src/share-kit/` (`share-kit.ts` the rules, `share-kit.service.ts`, `share-kit.controller.ts`: `GET /customer-portal/share-kit` and `GET /customer-portal/share-kit/picture/:slug`),
  the `mode: 'affiliate'` picture in `social-posting/status-image.ts`.
- Web: `web/app/account/share/`, `web/app/lib/share-links.ts` (links and each channel's share address), styles at the end of `globals.css`.
- Counting: `backend/src/share-kit/share-events.ts`, `POST /customer-portal/share-kit/shares`, `insights/share-stats.service.ts` (`GET /insights/shares`), `ShareEvent` in the schema.
- Tests: `npm run test:share-kit` (rules, picture, gating), `npm run test:share-links` (the page's links, tied to the server's) and `npm run test:share-events` (what is recorded and counted; needs `KITS_TEST_DATABASE_URL`).

## Not done

- No posting on anyone's behalf. A share is counted when it was started, not when it arrived or was read: there is no way to know that.
- Instagram and TikTok have no web share address, so they go through More... or Copy link.
- Watches and kits can be shared as links, but only shop products get a picture.
