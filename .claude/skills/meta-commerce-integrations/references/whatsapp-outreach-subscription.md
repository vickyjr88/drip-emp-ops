# WhatsApp outreach, auto-subscription and delivery reporting

Read first: `drip-crm/docs/WHATSAPP-OUTREACH.md` (behaviour as built), then `whatsapp-subscription.ts` (the pure rules), then the services.

## What it is

1. **Portal screen "WhatsApp Outreach"** sends one of six approved templates to chosen customers (batches of 25 with a short pause; "select everyone who has not received it"): three with a name and a link
   (`APP`, `GROUP`, `REVIEW`) and three fixed-text ones with no variables (`GOOGLE_REVIEW`, `SHOE_RANGE`, `LOCATION`). Links come from the same site content the footer shows, with built-in defaults.
2. **Auto-subscription**: anyone who messages the shop's number (usually from a click-to-WhatsApp ad) is recorded in `WhatsappContact`, told once *"you'll now receive updates … Reply STOP at any time to opt out"* (a normal
   text, allowed inside the 24 h window their message opened), then put through `APP`, `GROUP`, `REVIEW` at 24/48/72 h. The ad that brought them (id, headline, click id from Meta's `referral`) is stored.
3. **STOP / START**: the **whole message** must be the keyword (`STOP`, `stop.`, `unsubscribe`, `opt out`, `end`). A sentence containing "stop" is not an opt-out and `cancel` is excluded because people use it for orders.
   STOP is confirmed by a text and from then on **nothing** reaches that number (sequence and portal batches), until START.
4. **Delivery**: Meta's status webhooks (sent, delivered, read, failed + error) are stored (`WhatsappMessageStatus`) and copied onto the row they belong to (`WhatsappOutreach`, `DailyReportRun`) by message id.
5. **Mautic hook** (`POST /whatsapp-outreach/hook`, header `X-Outreach-Secret`): lets a Mautic campaign step trigger the same send path for new signups (optional; see `mautic-sync.md`).

## Rules and the reasons

| Rule | Why |
|---|---|
| Dedupe: a customer who already *received* a kind is skipped unless "send again". "Received" = `SENT` and delivery is null or not `failed` (`RECEIVED` constant) | 100 sends once showed SENT while all failed 131042; they must stay eligible for the next batch |
| Sequence advances on acceptance but **reopens the step** when a failure is reported (`reopenStep`) | otherwise people lose a message forever; account-level errors retry in 6 h without counting |
| Notice sent exactly once, claimed atomically (`updateMany where noticeSentAt is null`) | Meta delivers the same webhook twice |
| Nobody enters the sequence until the notice has actually been sent; a failed notice is retried on their next message | consent must precede marketing |
| Send window 08:00-20:00 Nairobi; daily cap 200 template sends (under Meta's 250 for unverified businesses); give up on a number after 5 failures | quality rating, throughput, politeness |
| `TRADE` contacts (customer with non-retail price tier, or supplier, matched on last 9 digits) are recorded, never subscribed | resellers write for business |
| A customer with no usable phone is skipped with a reason | 22 of 130 had none |
| Failure of an account-level code (131042/131031/131048) does not count against the person | not their fault |
| Resend after a billing fix = `unsentIds(kind)` minus those whose failure was 131026, in batches of 25, then re-read delivery | avoids hammering numbers not on WhatsApp |

## Data

`WhatsappContact` (phone unique, name, ad fields, `subscribed`, `unsubscribedReason` STOP|TRADE, `noticeSentAt`, `nextStep`, `nextStepAt`, `failures`, Mautic sync columns),
`WhatsappOutreach` (kind, template, phone, status SENT|FAILED, error, `messageId`, `delivery`, `deliveryError`, `contactId`, `triggeredBy`), `WhatsappMessageStatus` (unique `messageId + status`).
**Multi-tenant**: add `shopId` to all three and to the unique keys (`[shopId, phone]`).

## Endpoints and screens

`GET/POST` outreach (status, candidates, send, history), `whatsapp-contacts` (stats, list, unsubscribe), the webhook controller (GET verify, POST receive). Screen: Outreach page with templates, selection, "People who messaged us"
(stats, unsubscribe button) and delivery chips on "Recent messages" (Reached WhatsApp / Delivered / Read / Not delivered + reason). Insights has a WhatsApp tab (chats, ads, opt-outs, onboarding progress, delivery,
failures, chats that became orders matched by last 9 digits).

## As ported to Nairobi Gents

See "Phase 2 as built" in `nairobi-gents-plan.md` for what differs (no TRADE, phone-keyed outreach over a derived customer list, per-shop template names, opt-in welcome series, a "Connect incoming messages" button).

## Port checklist

Schema + migration → pure rules and tests (`classifyKeyword`, `parseWebhook`, `verifySignature`, `pickDelivery`, sequence delays, windows) → `WhatsAppClient` taking a resolved config → webhook controller (per-shop secret, 404) → contacts service
→ sequence service (per-shop loop, claims, cap, window) → outreach service (`RECEIVED`) → screens → docs. Acceptance: STOP stops everything; duplicate webhook sends one notice; failure report reopens the step; cap holds; two shops never see each other's contacts.
