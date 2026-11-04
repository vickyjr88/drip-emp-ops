# Daily report

An email (and optionally a WhatsApp message) at **07:00 Nairobi time** describing the day that just ended, sent to the
people listed in the portal. It is sent every day, including days with no orders: silence means something is wrong.

## What it contains

| Section | Source |
|---|---|
| Revenue, paid orders, items, average order, money received, unpaid and cancelled; change against the day before and the same weekday last week | `Order` (by `placedAt`), `OrderPayment` (by `receivedAt`) |
| Needs your attention: paid orders waiting to be packed, orders unpaid for over 24 hours (last 14 days), pending refunds, unanswered contact-form messages | `Order`, `Refund`, `Inquiry` |
| Orders of the day (first 15) and best sellers | `Order`, `OrderLine` |
| Restock: sizes that **sold** that day and are now sold out or have 3 or fewer left | `StockLevel`, summed across stores |
| Carts left behind, WhatsApp enquiry taps, campaign and reseller link visits | `CartLead`, `WhatsAppClick`, `CampaignClick`, `ReferralClick` |
| Where orders came from (campaigns, reseller referrals) | `Order.attributedCampaignId`, `referredByCustomerId` |
| Catalogue: live products, products with no photo (they cannot appear in the Meta/TikTok feeds), sizes in the feeds | `Product` |

**Revenue** counts orders whose status is PAID, PACKED, SHIPPED or DELIVERED. Unpaid, cancelled and refunded orders are
left out. **Money received** is payments that arrived that day, whichever day the order was placed.

Not included: website visits, ad spend and Search Console figures. They live in Google, Meta and TikTok; this app holds none of them.

## Who receives it

Edit in the portal API (or Swagger): `GET/PUT /daily-report/settings`.

```json
{ "enabled": true, "emailRecipients": ["emporiumdrip@gmail.com"], "whatsappRecipients": ["0722000111"] }
```

Until settings are saved, the report goes to `OWNER_EMAIL` only. Changes apply to the next send; no deploy needed.
Permissions: `daily-report-setting.read` / `daily-report-setting.update` (generated from the model by the permission seed; run the seed after deploy, or grant them to the role).

## Operating it

| | |
|---|---|
| Preview without sending | `GET /daily-report/preview?date=2026-11-04` (default yesterday) |
| Send now | `POST /daily-report/send?date=2026-11-04`. A day already sent is not sent again; add `&force=true` to send again |
| What was sent | `GET /daily-report/runs` (status per day, channel and recipient) |
| Schedule | `DAILY_REPORT_CRON` (default `0 7 * * *`), `DAILY_REPORT_TIMEZONE` (default `Africa/Nairobi`), `DAILY_REPORT_ENABLED` (false on `backend2`) |
| Switch off | `{"enabled": false}` in settings |

**No duplicates.** Redis holds a single repeatable job, and every message is claimed in `DailyReportRun` (unique per day, channel and
recipient) before it is sent. A retry after a partial failure sends only to the recipients who have not received it.
**Missed run.** If the app was down at 07:00, it queues the report once it is back (after 08:00 Nairobi time) if nothing was recorded for yesterday.
**Needs Redis.** Without `REDIS_URL` the schedule is off (the manual send still works).

## WhatsApp

WhatsApp only allows a business to start a conversation with an **approved message template**, so this needs one-time setup:

1. In Meta Business Suite > WhatsApp Manager, connect the sending number to a WhatsApp Business account.
2. Create a template named `daily_report`, category **Utility**, language English, with this body (six variables):

   > Daily report for {{1}} ({{2}}): {{3}} paid orders, {{4}} revenue, {{5}} vs the day before. To act on: {{6}}. Full report is in your email.

   Example values for the approval form: `Drip Emporium`, `Wed 4 Nov 2026`, `12`, `KES 54,000`, `+8%`, `3 items`. Approval usually takes minutes to a day.
3. Create a System User token with `whatsapp_business_messaging` and set, in the server `.env`:
   `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` (and `WHATSAPP_REPORT_TEMPLATE` / `WHATSAPP_TEMPLATE_LANG` if you named it differently).
4. Add the numbers under `whatsappRecipients` and redeploy so the backend picks up the variables.

Until 1-3 are done, WhatsApp recipients are recorded as `SKIPPED` and the email still goes out. Meta charges per template conversation; one a day per recipient is small.

## Tests

`cd backend && npm run test:daily-report` (day boundaries, revenue rules, comparisons, best sellers, stock warnings, escaping, WhatsApp number handling).
