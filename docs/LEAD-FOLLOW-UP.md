# Automatic follow-up of leads and abandoned carts

An hour after a shopper stops, they are followed up by **email and WhatsApp**, between **08:00 and 20:00 Nairobi time**, unless they have **already opened a WhatsApp conversation** with the shop. The last **30 days** of leads that were never followed up are worked through the same way, newest first, a few at a time. Every lead ends up **marked**, with the reason, and every email is **logged**.

Portal > **Cart Leads** shows it: a panel at the top (running or paused, what is waiting, what went today), a chip on every lead, a filter, a **Mark done** button, and on each lead's page a Follow-up card listing every message sent. It replaces the day-old cart email while it is on.

## What happens to a lead

| Step | Rule |
|---|---|
| **Due** | An hour after the shopper last did anything (`lastActivityAt`). A cart still being added to is not abandoned yet. |
| **Window** | Sent only 08:00 to 20:00 Nairobi time. Marking (below) happens at any hour; sending does not. |
| **Already talking** | If the number has messaged the shop's WhatsApp at or just before the lead (`WhatsappContact.lastMessageAt`), a conversation exists: **nothing is sent on either channel** and the lead is marked *Already chatting on WhatsApp*. |
| **Staff got there first** | A lead marked Contacted (opening the WhatsApp Follow up button does that) is *Followed up by staff*. |
| **Not a lead any more** | Converted or dismissed leads are marked *Closed*. Older than 30 days: *Too old*. No phone and no real email: *No contact details*. |
| **WhatsApp** | One approved template (below) to the number, unless they replied STOP, or an earlier message to that number came back undeliverable. |
| **Email** | One email to the shopper's own address (a `...@customer.invalid` stand-in is not one), through the email log. Not sent again to a lead that already had the old 24-hour reminder. |
| **Once per person** | The same number or address is not followed up twice in a day, however many leads they have. The older lead is marked *Followed up on another lead*. |

Both channels go **together or not at all**: if WhatsApp cannot go (cap spent, template not ready) the email waits for it, so a lead is never marked done on email alone and never gets its WhatsApp message.

## How a lead is marked

| Mark | Meaning |
|---|---|
| **Waiting** (`PENDING`) | Not handled yet, or waiting for a retry. |
| **Done** (`DONE`) | It reached the customer (WhatsApp and/or email), or a conversation already existed, or staff did it. |
| **Failed** (`FAILED`) | Nothing reached them: the number is not on WhatsApp **and** there was no email that worked (*WhatsApp failed*), or three tries failed (*Not delivered*). |
| **Skipped** (`SKIPPED`) | Not applicable: closed, too old, no contact details, asked us to stop. |

The WhatsApp result is also kept on its own (`followUpWhatsapp`): `SENT` (the template went and opened a conversation), `FAILED` (this number cannot be reached there), `CONVERSATION` (they had already written). So **a number that fails is marked as failed even when the email got through**, and a lead whose email is `SENT` and WhatsApp `FAILED` shows both.

**Accepted is not delivered.** Meta accepts a message and reports a failure later. Every run looks at the reports for follow-ups sent in the last three days: if the number cannot receive WhatsApp (131026 and similar) the lead is marked *WhatsApp failed*; if the report blames the shop's own account or template, nobody is marked and the lead goes back to waiting.

Staff can mark a lead by hand (**Mark done**, for a call, a visit, a chat from their own phone), or **put it back in the queue**. What was already sent is remembered, so a channel that went is never repeated.

## Failures: whose problem is it

| Failure | Read as | What happens |
|---|---|---|
| 131026, 131021 (undeliverable, not on WhatsApp) | the **number** | That lead's WhatsApp is marked failed; the run carries on. |
| 131042 (payment), 131049, 131048, 131056, rate limits | the **shop's account** | **Nobody is marked.** The run pauses (6 hours), nothing is emailed, and the lead is untouched. |
| 132001 and 132xxx (template missing, paused, not approved), token errors | the **setup** | Same, but checked again after an hour, so approving the template starts it moving soon. The panel says so, with Meta's words. |
| Anything else | unknown | Retried an hour later; given up on after three tries (*Not delivered*). |
| An email that fails | the provider | Logged as failed; retried an hour later; three tries, then left. |

## The WhatsApp templates to create

WhatsApp only lets a business start a conversation with an approved template. Create two in WhatsApp Manager (**Category: Marketing, Language: English**), each with three variables: `{{1}}` first name, `{{2}}` what they left, `{{3}}` a link. A variable cannot be first or last in the body, hence the closing sentence. Nothing is sent until they are **Approved**: until then the run pauses and says why, and no email goes either.

| Template name | Body |
|---|---|
| `drip_cart_followup` | `Hi {{1}}, it's Drip Emporium 👋 You left {{2}} in your cart. Want us to reserve it and arrange delivery or pickup? Reply here and we'll sort it out, or pick up where you stopped: {{3}} Reply STOP to opt out.` |
| `drip_order_followup` | `Hi {{1}}, it's Drip Emporium 👋 Thanks for asking about {{2}}. Shall we go ahead? Reply with where to deliver and how you'd like to pay, or take another look: {{3}} Reply STOP to opt out.` |

Sample values for the review form: `Wanjiku`, `Nike Air Force 1 (size 42)`, `https://dripemporium.store/shop/nike-air-force-1`. Other names: `WHATSAPP_TEMPLATE_CART_FOLLOWUP`, `WHATSAPP_TEMPLATE_ORDER_FOLLOWUP`. `{{2}}` is built as "Nike Air Force 1 (size 42) and 2 more", on one line, at most 90 characters. `{{3}}` is the first product's page, or the cart, tagged `utm_source=whatsapp&utm_medium=auto-followup&utm_campaign=abandoned-cart` (`whatsapp-order` for an enquiry), so Insights counts the visits it brings back. A reply STOP is honoured by the existing subscription rules.

## The backlog

When it goes live, every lead from the last 30 days that is still open and never followed up is picked up, **newest first, 10 at a time every 5 minutes** (`LEAD_FOLLOWUP_BATCH`), a little over a second apart, inside 08:00-20:00. A lead that already had the old 24-hour email is not emailed again but still gets the WhatsApp message. The WhatsApp daily cap is shared with the onboarding sequence (`WHATSAPP_DAILY_SEND_CAP`, 200), and follow-ups may use a **reserve of 40 beyond it** (`LEAD_FOLLOWUP_RESERVE`) so onboarding messages cannot starve them. When the day's cap is spent, the rest wait until tomorrow.

On 24 Nov 2026 production had 18 open leads in the window (2 WhatsApp orders, 16 abandoned carts, 14 different phone numbers, 15 already given the old reminder), so the backlog clears in the first run or two after the templates are approved.

**See it before it happens:** the panel's *Show what happens next*, or `GET /cart-leads/follow-up/preview`, lists the next leads and what each would get (send WhatsApp and/or email, or be marked and why). It sends nothing and changes nothing. `GET /cart-leads/follow-up/summary` is the panel's data.

## Emails are logged

Every follow-up email goes through the email log (`EmailLog`, `kind = LEAD_FOLLOWUP`, `cartLeadId` = the lead): who, subject, when, whether it went, and the provider's reason if it did not. Each lead's page lists them under **Sent**, with the WhatsApp messages (from `WhatsappOutreach`, kinds `FOLLOWUP_CART` and `FOLLOWUP_ORDER`, with their delivery state). The day-old cart email this replaces was **not** logged.

## Going live

1. Deploy. Migration `20261124090000_add_lead_followup` is additive; it also marks leads that are already converted or dismissed as *Closed*, and records the old 24-hour reminder as an email already sent.
2. Create and get the two templates approved (above). Until then the first run tries once, gets Meta's "template does not exist", pauses for an hour and says so in the panel. **Nobody is marked and nothing is emailed.**
3. Nothing else: it is on by default. Check the panel and *Show what happens next*.

To stop it: `LEAD_FOLLOWUP_ENABLED=false` in the server `.env` and restart both backend slots. Both slots run the scheduler on purpose (a deploy swaps them); a lead is claimed in the database before anything is sent, so two slots never message the same person. While it is on, the old 24-hour email (`CART_REMINDERS_ENABLED`) sends nothing, so nobody is emailed twice; turn the follow-up off and the old email resumes for new carts.

## Tuning (all optional, shown with their defaults)

`LEAD_FOLLOWUP_DELAY_MINUTES=60`, `LEAD_FOLLOWUP_MAX_AGE_DAYS=30`, `LEAD_FOLLOWUP_BATCH=10`, `LEAD_FOLLOWUP_RESERVE=40`, `LEAD_FOLLOWUP_MAX_ATTEMPTS=3`, `LEAD_FOLLOWUP_RETRY_MINUTES=60`, `LEAD_FOLLOWUP_PAUSE_HOURS=6`, `LEAD_FOLLOWUP_CONFIG_PAUSE_MINUTES=60`. They are passed through `docker-compose.yml`.

## Files and tests

`backend/src/cart-lead/lead-followup.ts` (the rules: due, window, decide, resolve, failure reading), `lead-followup.service.ts` (the run, claims, reconcile, summary, preview, marking), `lead-followup-email.ts` (the email), `cart-lead.controller.ts` (`follow-up/summary`, `follow-up/preview`, `PATCH :id/follow-up`); `web/app/portal/components/lead-followup.tsx`. Tests: `npm run test:lead-followup` (31 rule tests, and 21 against a scratch database via `KITS_TEST_DATABASE_URL`, with WhatsApp and email faked: the window, the backlog in batches, the cap, a conversation already open, a dead number, a delivery failure reported later, an account problem pausing the run, a missing template, STOP, one person with two leads, a failing email retried three times, two backend slots at once).
