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
| `BEGIN_CHECKOUT` | The checkout form is submitted. |
| `WHATSAPP_CLICK` | Any WhatsApp button, with where it was. Added to the existing tap record in `use-enquiry-contact.ts`. |
| `SEARCH` | A shop search is submitted. |

Crawlers and link-preview fetchers are ignored. The route allows 600 events a minute per address.

Orders (`Order.sessionId`) and WhatsApp leads (`CartLead.sessionId`) carry the session. A website checkout is linked directly;
an order staff create from a WhatsApp lead takes the visit from the lead. Cancelled and refunded orders never count.

## The tabs

- **Visits & ads**: the funnel from visit to order, by source and device; what ads return (cost per visit, per WhatsApp tap,
  per order, sales per KES 1); products people look at against what sells; what people search for. Ad spend is entered here
  (`AdSpend`, one line per day and platform) and set against visits tagged as ads or carrying an ad click id.
  Campaign and reseller links (`?camp=`, `?ref=`) keep their own reporting under Campaigns.
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
