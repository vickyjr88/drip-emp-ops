# Conversion: from a visit to an add to cart, a WhatsApp tap, a call or an order

What was found in the visit funnel (4,140 visits in the period measured), what was changed, and how to tell whether it worked.

## What the numbers said

| Step | Visits | Share of visits |
| --- | --- | --- |
| Opened a product | 3,774 | 91% |
| Added to cart | 59 | 1.4% |
| Tapped WhatsApp | 91 | 2.2% |
| Began checkout (pressed Pay) | 3 | 0.1% |
| Ordered | 3 | 0.1% |

Nine in ten visits land on a product page (from ads and shared links), so **the product page is the landing page**. Of 3,774 who opened a product, about 4% did
anything. 56 of 59 carts never reached checkout, and the call button could not be measured at all.

Measured on a 375 x 812 phone before the change: **Add to Cart sat at y = 926, WhatsApp at 976, Call at 1,028, and the reasons to trust the shop at 1,095, all below
the first screen.** Nothing a visitor could act on was visible without scrolling.

## What changed

**Product page (phones)**
- A **buy bar** stays at the bottom of the screen while the page's own buttons are out of view: price and chosen size, **Add to Cart**, a green **WhatsApp** button and a **Call** button.
  Once something is in the cart it also shows **"N items in your cart · Checkout →"**, which goes at the 56 abandoned carts directly. It steps aside (and the floating
  WhatsApp and Checkout buttons come back) when the real buttons are on screen, so there are never two sets.
- The photo is shorter on a phone, and a one-line **"Delivery across Kenya · M-Pesa or card · Try before you pay"** sits beside the price, so the photo, name, price, trust points
  and every size fit on the first screen above the bar. The full wording (including the delivery sentence you edit in the CMS) stays under the buttons.
- The size note is plain words ("In stock, ready to try on at the shop" / "Not on the shelf: we order it in for you") instead of an internal SKU.
- "Or order on WhatsApp" is now "Order on WhatsApp".

**Cart and checkout**
- Under the **Pay** button: "Pay by M-Pesa or card, secured by Paystack. No account needed." The email field says it is for the receipt. A **Call** link sits with the collection note.

**Measuring it** (see `INSIGHTS.md`)
- New visit events `CALL_CLICK` and `VIEW_CART`; Insights shows **Opened the cart** and **Tapped call**, calls by source, and a note saying whether carts are never opened or opened and left.
- WhatsApp taps, call taps and opening the cart are now also sent to **Meta and TikTok** as `Contact` and `InitiateCheckout`. Set the campaigns' conversion event to `Contact` (see `INSIGHTS.md`).

## How to tell whether it worked

Deploy, wait two weeks, then in Portal > Insights > Visits & ads compare with the figures above:
- **Added to cart** and **Tapped WhatsApp** as a share of "Opened a product" (4% together is the starting point), and **Tapped call**, which has no earlier figure.
- **Opened the cart** against **Added to cart**: below half means people add a pair and never go on; the Checkout strip is the lever.
- **Began checkout** against **Opened the cart**: low means the form, the price shown there, or the wish to ask first.
- Phones against desktop in "Devices".

Nothing here guarantees a figure. Traffic quality matters as much as the page: one source in the period sent 37 visits and no orders, calls or taps, which no page change fixes.

## Not done, and why

- **Email is still required at checkout.** Many shoppers here do not use email, and it is probably the biggest remaining barrier on the cart. It cannot simply be dropped: customers are keyed by email,
  receipts are sent to it and the Mautic sync uses it. A phone-only checkout is a real change to customers and receipts, worth its own piece of work.
- **No reviews or stock-left counts were added**, because the site has no review data and the catalogue API only says in stock or not; showing invented or guessed figures would cost trust.
- **The "Get the app" pill in the header** was left alone.
