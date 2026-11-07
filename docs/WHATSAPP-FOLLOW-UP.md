# WhatsApp follow-up on carts and orders

A **Follow up on WhatsApp** button sits on every open cart lead and every order that has a phone number: Cart Leads (list and
detail), Orders (list, detail, and the lead list inside Orders). It opens the customer's WhatsApp chat with the message
already written: what was in the cart or order, a link to each product, and the total. **Nothing is sent from the portal.**
Staff read it, change it in WhatsApp if they like, and press send. Detail pages show the message first under "See the message".

When a new lead's follow-up is opened it is marked **Contacted**, so the list shows who has already been chased.

## The wording

Built on the server (`backend/src/common/follow-up.ts`), so it is the same everywhere and the product links use the real
storefront address (`STOREFRONT_ORIGIN`, else `NEXT_PUBLIC_SITE_URL`).

| Situation | Opens with | Closes with |
| --- | --- | --- |
| Abandoned cart | "You left these in your cart" | Offer to reserve them and arrange delivery or pickup |
| WhatsApp order request | "Following up on the order you asked about" | Ask where to deliver and how they would like to pay |
| Order, unpaid | "Thank you for your order DE-0042" | The balance still owed, and how they would like to pay |
| Order, paid or packed | "Your order is confirmed and we are getting it ready" | We will message to arrange delivery |
| Order, shipped | "Your order is on its way" | Tell us when it arrives |
| Order, delivered | "We hope you are enjoying your order" | Ask for a photo; offer to show what is new |

No button for a cancelled or refunded order, for a lead already converted or dismissed, or when there is no phone number
(the lead detail says so). Shoes link to `/shop/<slug>`, watches to `/watches/<slug>`, kits to `/kits/<slug>`; a size typed
by hand has no page and gets no link. A product in two sizes is linked once, and a cart over eight items is cut short with
"...and N more". Products with no sizes (stored as "Standard") are not given one in the message.

## Tracking

Each product link carries `utm_source=whatsapp&utm_medium=followup&utm_campaign=<situation>`, so a customer who comes back
through it shows up in **Insights** as WhatsApp follow-up traffic, and an order that follows can be traced to it.

## Notes

- Cart lead and order list/detail responses gain a `followUp` field (`{ phone, message, url }`, or null); lead lines gain a
  `path`. Both are additive.
- The text is not editable in the portal: it is edited in WhatsApp before sending. To change the standing wording, edit
  `wording()` in `follow-up.ts`.
- Tests: `npm run test:follow-up`.
