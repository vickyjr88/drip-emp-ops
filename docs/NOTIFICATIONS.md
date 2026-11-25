# Notifications: telling the shop's people, by email and WhatsApp

Anything worth a quick follow-up is sent to the shop's people the moment it happens, by email and by WhatsApp, each with a button that opens the customer's WhatsApp chat with a reply already written (nothing is sent to the customer from here: a person reads it and presses send).

Code: `backend/src/alerts` (the service, the renderers, the kinds), `backend/src/email-log/owner-notification.service.ts` (says what happened, per event). Screen: Portal, System, **Notifications** (`/portal/notifications`).

## What raises an alert
| Kind | When |
|---|---|
| order.paid | Money for an order arrives (online or recorded by staff) |
| order.placed | A shopper checks out on the website, before paying (new) |
| cart.abandoned | A shopper leaves a cart after giving a phone or email |
| lead.whatsapp | A shopper sends their cart to the shop on WhatsApp (new: this one had no alert at all) |
| whatsapp.message | Someone writes to the shop's WhatsApp number; one alert per person per 10 minutes; the recipients' own messages do not alert them (new) |
| inquiry.contact | The contact form on the website |
| facebook.comment | A comment on a Page post or ad, not a reply in a thread (new) |
| customer.signup | A new customer account |
| reseller.application | A reseller application |
| review.submitted | A product review (new) |
| stock.low | A sale takes a size to or below its reorder level, once a day per size (new) |

Every kind starts on for both channels. The Notifications page switches each kind on or off per channel, and has a master switch.

## How a WhatsApp alert is sent
WhatsApp lets a business message someone first only with a template that Meta has approved. So:
- if the recipient has written to the shop's number in the last 23 hours (the shop's WhatsApp contacts record it), the whole message goes as ordinary text, with the reply and portal links;
- otherwise it goes as the approved template, which carries a headline, the facts on one line and the way to reply.

**One template to create, once**, in WhatsApp Manager (Message templates, Create, category Utility, language English), named `admin_alert` (the name is editable on the Notifications page):

```
Drip Emporium alert: {{1}}

{{2}}

{{3}}
```
Example values for Meta: `{{1}}` Contact form: Wanjiku, `{{2}}` Name: Wanjiku Kamau · Phone: 0712 345 678 · Message: Do you have size 42?, `{{3}}` Reply: https://wa.me/254712345678.
Until it is approved, WhatsApp alerts show "not approved" in the Recent alerts list and email is unaffected. **Send a test alert** on the page shows what happened to each recipient on each channel.

## Guards
- a daily limit on WhatsApp alerts (default 80, editable); past it WhatsApp is skipped and said so, email is never limited;
- an event is raised once: `dedupeKey` with the kind is unique (a webhook replay, or the same size twice in a day, is one alert);
- an alert never fails the thing it reports: a failure is logged and shown, not thrown;
- every alert is kept in `AdminAlert` with what happened on each channel.

## Recipients
Default to the owner's email (`OWNER_EMAIL`) and WhatsApp number (`OWNER_WHATSAPP`) until saved on the page. Add the people who follow up with customers; saving replaces the defaults, and an empty list means nobody on that channel.

## Not covered (yet)
Reminders and the daily report have their own recipients and are unchanged. Overdue consignments, failed payments and the automatic follow-up pausing are not alerts yet.

## Tests
`npm run test:alerts` (the renderers need nothing; the delivery tests need `KITS_TEST_DATABASE_URL`).
