# The portal on a phone

Below 760px wide (and 900px for the page frame) the day-to-day screens change shape. A desktop is untouched: every rule is in `web/app/portal/portal-mobile.css` inside a width query, and the components below render their children as before on a wide screen.

## What changes on a phone
- The shop's own header, footer and floating WhatsApp/checkout buttons are hidden inside the portal (`EliteLayout` marks portal pages with `is-portal`). The top bar is one slim row: menu, page name, who is signed in. The Getting started panel is hidden.
- Buttons are 44px, not uppercase shouting; boxes are 16px so iOS does not zoom.
- **Long forms become steps** (`components/wizard.tsx`): a progress strip, one step on screen, Back/Next pinned to the bottom. Next checks that step's required fields first. Steps: Add product (Basics, Prices, Sizes & stock, Photos), New order (Customer, Items, Delivery & pay, Review), Issue pickup (Reseller, Items, Confirm). On a desktop the same form is one page.
- **Long screens fold into sections** (`components/collapse-card.tsx`): edit product (Sizes, Details, Images), customer (Contact, Portal access, Orders, Documents), order (Customer, Order, Items, Payments).
- **Wide tables become a card per row** (`table.is-stack` + `data-label` on cells): product sizes (prices, SKU and status open per size), order items and payments, pickup lines.
- **Lists** fold their filters behind one Filters button and a row's secondary actions behind More (`components/mobile-bits.tsx`).
- **Pinned actions**: Take payment on an order, Save on the customer form. Recording a payment and settling a pickup open as a sheet from the bottom.

## Turning a pickup into an order
Open pickup, More, **Turn into order**. The reseller keeps what is still out:
- an order is created for those pairs at the prices agreed on the pickup (channel `CONSIGNMENT`, price list as on the pickup, unpaid);
- the pairs leave the consignment bucket as sold (same movement settle writes), and nothing is taken off the shop floor, because they were never on it;
- cost of goods is booked once, as the order's own entry, so delivering the order later does not book it again;
- the debt lives on the order. The pickup's sold value is not increased, so the pickup does not also claim it; money already paid on the pickup stays there;
- the pickup closes as settled with a note naming the order.
Needs `consignment.update` and `order.create`. API: `POST /consignments/:id/convert-to-order`.

## Also fixed
The pickups list and its CSV showed no reseller name (the screen read `customer.name`; the API never sent it). The API now sends it.

## Tests
`npm run test:consignment-name` (no database). `npm run test:consignment-convert` needs `KITS_TEST_DATABASE_URL` pointing at a scratch database that has the default chart of accounts.
