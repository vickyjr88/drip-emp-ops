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

## Where to find it

A "Share & earn" / "Share products" panel on the account page, and a button at the top of the affiliate dashboard.

## Files

- Backend: `backend/src/share-kit/` (`share-kit.ts` the rules, `share-kit.service.ts`, `share-kit.controller.ts`: `GET /customer-portal/share-kit` and `GET /customer-portal/share-kit/picture/:slug`),
  the `mode: 'affiliate'` picture in `social-posting/status-image.ts`.
- Web: `web/app/account/share/`, `web/app/lib/share-links.ts` (links and each channel's share address), styles at the end of `globals.css`.
- Tests: `npm run test:share-kit` (rules, picture, gating) and `npm run test:share-links` (the page's links, tied to the server's).

## Not done

- No posting on anyone's behalf, and no share-click counts: visits show in Insights by channel, but a share that nobody clicks is not seen.
- Instagram and TikTok have no web share address, so they go through More... or Copy link.
- Watches and kits can be shared as links, but only shop products get a picture.
