# WhatsApp reports, reminders and follow-up links

Read first: `drip-crm/docs/DAILY-REPORT.md`, `docs/REMINDERS.md`, `docs/WHATSAPP-FOLLOW-UP.md`. **Nairobi Gents already has a daily report and follow-up buttons** (`shops-platform` commits `ca8033a`, `d940b78`); this file is what to
carry over or compare, not rebuild.

## Daily owner report

An email and a WhatsApp template message at 07:00 Nairobi describing yesterday: revenue, paid orders, change vs the day before and last week, what needs attention, restock, carts left, catalogue health. Sent every day (silence means something is wrong).
- **Recipients** live in a settings row edited on a Daily Report screen (WhatsApp numbers, emails, on/off); with no row it defaults to the owner (drip-crm: `OWNER_WHATSAPP` default; Nairobi Gents: the shop notification email, else owners).
  Saving an empty list means nobody on that channel. **Saving WhatsApp recipients on a shop with no row would silently stop the email**, so when creating the first row copy the effective email list in.
- **Template** `daily_report` with 6 variables (shop, date, paid orders, revenue, change, what to act on, full report is in the email). WhatsApp only starts conversations with an approved template.
- **No duplicates**: one repeatable BullMQ job (`upsertJobScheduler`) plus a claim per `(shop, day, channel, recipient)` in `DailyReportRun`; a retry sends only to those not yet sent; a missed run is queued after 08:00 if nothing is recorded.
  The scheduled run throws on failure so the queue retries; **Send now** reports the failure instead of throwing (`throwOnFailure: false`).
- **Delivery** state from the status webhook is shown on the runs list: a "sent" row can still be "Not delivered".
- Resending missed days: preview them, send with `force`, verify delivery; the owner will not have received them otherwise.

## Reminders

`REMINDERS_*` scheduler for staff sweeps; cart reminders are controlled by their **own** flag (`CART_REMINDERS_ENABLED`). Check which flag controls what before telling the user something is on or off.

## Follow-up buttons (abandoned carts and orders)

A button on cart-lead and order rows opens `https://wa.me/<number>?text=<message>` with the message already written: greeting by first name, what is in the cart/order, totals, balance, and a link to each product page with the real
storefront origin (shoes `/shop/<slug>`, watches `/watches/<slug>`, kits `/kits/<slug>`). Nothing is sent by the app; staff read and press send. Builder: `backend/src/common/follow-up.ts` (`buildFollowUp`, `productPath`, `greetingName`),
tests `follow-up.test.ts`. Lines cap at 8; phone numbers normalised with `normalizePhoneNumber`; a hand-typed size has no product page and gets no link.

## Port notes for multi-tenant

Reports already exist per shop in Nairobi Gents; the work is (a) read the WhatsApp sender from the credential store (`forShop`/platform default) instead of env, (b) per-shop `enabled` replacing `DAILY_REPORT_SHOPS`,
(c) add delivery columns and the status webhook so "sent" stops meaning "arrived", (d) keep the two-slot scheduler rule.
