# Insights: from an ad to an order, and what it means for stock and customers

Portal, **Insights** (beside Analytics). Analytics answers "how much did we make, and where". Insights answers what comes
before and after: which ads are worth their money, which pairs sit on the shelf, which sold-out pairs people still ask for,
and who has stopped coming back.

## What is recorded

The storefront reports what a shopper does to `POST /storefront-events`, anonymously. A session is a random id held in the
browser tab; it carries no name, phone or email. This sits beside the ad pixels, GA and PostHog already on the site: those
answer to Meta, TikTok and Google, this is the copy the shop owns, and it is what makes WhatsApp sales visible.

| Event | When |
| --- | --- |
| `SESSION_START` | First page of a visit, with where it came from (UTM tags, `fbclid`/`ttclid`/`gclid`, referrer), the device and the landing page. Counts as started once the server accepts it. |
| `VIEW_PRODUCT` | A product page opens: `/shop/<slug>`, `/watches/<slug>`, `/kits/<slug>`. Recognised by address, so every product page is covered. |
| `ADD_TO_CART` | Anything is added to the cart (`lib/cart.tsx`). |
| `VIEW_CART` | The cart page opens with something in it (once per visit to the page). The cart and the checkout form are one page, so this is the step between "added" and "pressed Pay". |
| `BEGIN_CHECKOUT` | The checkout form is submitted (Pay is pressed). |
| `WHATSAPP_CLICK` | Any WhatsApp button, with where it was (`product-page`, `product-bar`, `cart`, `float`). Added to the existing tap record in `use-enquiry-contact.ts`. |
| `CALL_CLICK` | Any `tel:` link, wherever it sits, with where it was (`product-page`, `product-bar`, `cart`, or `site`). One listener for the whole site (`lib/contact-taps.ts`, wired in `StorefrontAnalytics`), so a phone link added later is counted without more code. |
| `SEARCH` | A shop search is submitted. |

Crawlers and link-preview fetchers are ignored. The route allows 600 events a minute per address.

Orders (`Order.sessionId`) and WhatsApp leads (`CartLead.sessionId`) carry the session. A website checkout is linked directly;
an order staff create from a WhatsApp lead takes the visit from the lead. Cancelled and refunded orders never count.

## The tabs

- **Visits & ads**: the funnel from visit to order, by source and device; what ads return (cost per visit, per WhatsApp tap,
  per order, sales per KES 1); products people look at against what sells; what people search for. Ad spend is entered here
  (`AdSpend`, one line per day and platform) and set against visits tagged as ads or carrying an ad click id.
  Campaign and reseller links (`?camp=`, `?ref=`) keep their own reporting under Campaigns.
- **WhatsApp** (`GET /insights/whatsapp`, `marketing-campaign.read`): new chats and how many came from an ad, subscribed, replied STOP
  (with the STOP rate), and how many became buyers; a table of which ads brought chats and which of those people went on to order
  (matched by phone number, in any spelling, against orders placed after the first message); where subscribers are in the app,
  group and rating messages; what was sent by message type and whether it arrived (delivered, read, not delivered, waiting, could not
  send, from Meta's delivery reports); and the reasons Meta gave for failures. It warns when someone has not yet been told about the
  subscription, when the STOP rate passes about 10%, and when under 80% of reported messages arrive.
- **Products & stock** (shoes and watches; kits are printed to order and left out): stock at price and at cost; dead stock
  (on the shelf, not sold for 30 to 180 days, valued at cost where known); fast sellers with under two weeks of cover;
  out-of-stock products people still view or ask about on WhatsApp.
- **Customers** (retail only): a buyer is recognised by phone number first, then email, then account. New against
  returning, share of money from repeat buyers, lifetime value, and a "gone quiet" list with a WhatsApp link per person
  (the message opens ready to send; nothing is sent automatically).

## Permissions

`marketing-campaign.read` for Visits & ads (`.create` and `.delete` to enter and remove ad spend), `journal-entry.read` for
stock (it shows what stock costs), `customer.read` for Customers. A tab a role cannot read is not shown.

## Notes

- Migration `20261112090000_add_storefront_events_and_ad_spend` is additive.
- Events are never deleted. Prune old rows (for example older than 13 months) when volume warrants it.
- Tests: `npm run test:insights` (the database tests need `KITS_TEST_DATABASE_URL`, a scratch database).

## Calls, cart views and the ad pixels

The visit funnel now also counts **Opened the cart** and **Tapped call**, and "Visit to an order, a WhatsApp tap or a call" counts all three.
Both are new: they start counting from the day this is deployed, so compare periods from then on, not against older ones.
Reading them together tells carts that were never opened (the Checkout button after adding is the problem) from carts opened and left
(the form, the price or the wish to ask first is the problem); the screen says which in words.

WhatsApp taps, call taps and opening the cart are also sent to the ad pixels, which only ever heard about product views, add to cart and purchases:

| What the shopper does | Meta Pixel | TikTok Pixel |
| --- | --- | --- |
| Taps WhatsApp or a phone number | `Contact` (`content_name` = `whatsapp` or `call`, `content_category` = the button) | `Contact` |
| Opens the cart | `InitiateCheckout` (value, number of items) | `InitiateCheckout` |

This shop's sales mostly start in a chat or a call, and only a handful of payments happen online, so campaigns told only about purchases have almost nothing to
learn from. **In Meta Ads Manager, set the campaign's conversion event to `Contact`** (and in TikTok Ads Manager, `Contact`) once a few days of events have arrived;
until you do, nothing about how the ads are delivered changes. The pixels receive no name, phone or email.
