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

- Schema: `ProductReview` and `ReviewStatus` in `backend/prisma/schema.prisma`; migration `20261122090000_add_product_reviews` (adds the table and the 1 to 5 check).
- Backend: `backend/src/reviews/` (`reviews.rules.ts` has the pure rules, `reviews.service.ts`, `reviews.controller.ts`); `StorefrontService.bySlug` returns `reviews` with the product.
- Web: `web/app/components/product-reviews.tsx`, `stars.tsx`, `web/app/lib/reviews.ts`, `web/app/review/[token]/`, `web/app/portal/reviews/`.
- Tests: `npm run test:reviews` (needs `KITS_TEST_DATABASE_URL`, a scratch Postgres).

## Not done

- Product cards and category lists do not show stars yet.
- The site-wide rating exists in the API but no page displays it.
- Nothing sends the review link automatically. The Ask tab lists paid orders with a "Copy link" button; staff paste it into WhatsApp or SMS themselves.
