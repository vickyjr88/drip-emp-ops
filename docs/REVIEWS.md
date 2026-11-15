# Product reviews

Customers can review the pairs they bought. **A product's reviews are shown only once it has enough approved ones**, so a shop with one or two reviews
never looks empty or lopsided, and a handful of early reviews cannot give a misleading average.

## When reviews show

| Where | Approved reviews needed | Env override |
|---|---|---|
| A product page | 3 | `REVIEWS_MIN_PRODUCT` |
| Site-wide rating (API only, `GET /shop/reviews/summary`) | 10 | `REVIEWS_MIN_SITE` |

Overrides must be whole numbers from 1 to 1000; anything else falls back to the default.

Below the threshold the public API reveals **only** `count` and `minToShow`. No list, no average, no distribution. The product page then shows
nothing but the "write a review" option, and the Product JSON-LD (`aggregateRating` / `review`) is left out, so search engines are never given a
rating the page does not show. Turning a review away, or deleting it, can take a product back under the threshold and hide its reviews again.

Only `APPROVED` reviews count. `PENDING` and `REJECTED` never appear and never count.

## How a review gets in

1. **Product page**: anyone can write one (stars, optional title, text, name, and a phone or email so staff can check it is real). It is stored `PENDING`.
2. **Order link**: staff send a customer `/review/<token>` from the portal (Reviews, "Ask for reviews"). The token is `<orderNumber>.<signature>`,
   signed with `REVIEW_TOKEN_SECRET`, falling back to `JWT_SECRET`. Set `REVIEW_TOKEN_SECRET` in production so the links do not depend on the login secret.
   Reviews sent this way are marked **verified purchase**, but only when the order is `PAID`, `PACKED`, `SHIPPED` or `DELIVERED`. They still wait for approval.
3. **Staff**: reviews added by staff (Reviews, "Add one") are approved at once, marked source `staff`, and never shown as verified.

## Automatic review requests (email and WhatsApp)

After an order is marked **Delivered**, the customer is asked to review it by **email and by WhatsApp**, each carrying that order's own review link
(so what they write is a verified purchase). `ReviewRequestsService` checks every ten minutes; both backend slots run it and the request for an order
is claimed in the database first (`ReviewRequest.orderId` is unique), so it goes out once.

**It is off until you switch it on:** set `REVIEW_REQUESTS_ENABLED=true` in the server `.env` and restart.

| Setting | Default | Meaning |
|---|---|---|
| `REVIEW_REQUESTS_ENABLED` | off | Master switch. Blank it to stop. |
| `REVIEW_REQUEST_DELAY_HOURS` | 24 | Wait this long after "Delivered" so the customer has had the pair on. `0` sends straight away. |
| `REVIEW_REQUEST_MAX_AGE_DAYS` | 7 | Orders delivered longer ago than this are never asked. This is what stops switching it on from messaging everyone who ever bought. |
| `WHATSAPP_TEMPLATE_REVIEW_REQUEST` | `drip_review_request` | The approved WhatsApp template. |

**Create the template in WhatsApp Manager first** (Category: Marketing, Language: English, two variables: `{{1}}` first name, `{{2}}` the link):

> `drip_review_request`: Hi {{1}}, thank you for shopping at Drip Emporium! How are your pairs? A short review helps other shoppers choose, and takes a minute: {{2}} Thank you!

Until it is approved the WhatsApp half fails and is retried (4 attempts, 6 hours apart); the email is independent and goes regardless.

Who is asked, and who is not:

- Only **retail** orders in status Delivered. Never a reseller or wholesale buyer.
- **Email** only to a real address. A phone-only customer has none, so the email is skipped (the reason is recorded) and they are asked on WhatsApp only.
- **WhatsApp** only to a usable number, never to someone who replied **STOP**, only 08:00 to 20:00 Nairobi, and within the shared `WHATSAPP_DAILY_SEND_CAP`. The message is recorded in the WhatsApp log (kind `REVIEW_REQUEST`), so it counts towards the cap and Meta's delivery reports attach to it.
- Someone with several orders is **not asked again within 14 days** of the last request, on that channel.
- A customer who has **already reviewed** every pair in the order is not asked.
- A channel that fails is retried on its own; the one that worked is never sent again. A request caught mid-send by a crash is left alone rather than risk a second message.

Staff see the result per order under Reviews > Ask for reviews (chips: Email sent / WhatsApp skipped, with the reason on hover), and a line saying whether it is on.
The Ask tab's manual "Ask on WhatsApp" and "Copy link" still work for older orders or anyone the automation skipped.

## Moderation (portal, Reviews)

Tabs: Waiting, Approved, Turned away, plus Ask for reviews and Add one. Staff can approve, turn away (with a reason only staff see), reply publicly,
and delete. Staff see the reviewer's contact; the public never does. After each action the screen says where the product now stands, for example
"has 2 of the 3 approved reviews it needs before its reviews show on its page."

Permissions are the usual generated set: `product-review.create`, `.read`, `.update`, `.delete`. Run the bootstrap/seed after deploy so existing roles get them.

## Rules that keep it honest

- **One review per person per product.** `reviewerKey` is a hash of the phone's last 9 digits, else the email, else the customer id. It is never returned to staff or the public.
- **Names are shortened** to first name plus last initial ("Wanjiku K.").
- **Spam**: a hidden honeypot field, and 8 submissions per IP per hour.
- **Rating** is 1 to 5, enforced by a database check as well as the API.
- Links and email addresses in the text are refused.

## Files

- Schema: `ProductReview` and `ReviewStatus` in `backend/prisma/schema.prisma`; migrations `20261122090000_add_product_reviews` (the table and the 1 to 5 check) and `20261122100000_add_review_requests` (`ReviewRequest`).
- Backend: `backend/src/reviews/` (`reviews.rules.ts` has the pure rules, `reviews.service.ts`, `reviews.controller.ts`; `review-requests.rules.ts` and `review-requests.service.ts` are the automatic request); `StorefrontService.bySlug` returns `reviews` with the product.
- Web: `web/app/components/product-reviews.tsx`, `stars.tsx`, `web/app/lib/reviews.ts`, `web/app/review/[token]/`, `web/app/portal/reviews/`.
- Tests: `npm run test:reviews` and `npm run test:review-requests` (need `KITS_TEST_DATABASE_URL`, a scratch Postgres).

## Not done

- Product cards and category lists do not show stars yet.
- The site-wide rating exists in the API but no page displays it.
- The automatic request goes out once per order. There is no second reminder if the customer ignores it.
- "Fulfilled" means the order's status is Delivered; an order staff never mark Delivered is never asked automatically.
