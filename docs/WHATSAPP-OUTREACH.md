# WhatsApp outreach

Portal > **WhatsApp Outreach** sends a customer one of three WhatsApp messages from the Drip Emporium business number:
**download the app**, **join the WhatsApp group**, **rate us on Google**. Staff choose the message, tick the customers
(or "select everyone who has not received it"), and confirm. Nothing is sent automatically.

## Templates (create these in WhatsApp Manager)

WhatsApp only lets a business start a conversation with an approved template. Create three, **Category: Marketing,
Language: English**, each with two variables: `{{1}}` the customer's first name and `{{2}}` the link. The link is a variable so
the group or review address can change without another Meta review.

| Template name | Body |
|---|---|
| `drip_app_download` | `Hi {{1}}, thanks for joining Drip Emporium. Order faster and track your pairs in our app: {{2}} See you in the app!` |
| `drip_join_group` | `Hi {{1}}, join the Drip Emporium WhatsApp group for new arrivals and offers before anyone else: {{2}} See you there!` |
| `drip_rate_us` | `Hi {{1}}, enjoying your Drip Emporium shoes? A quick rating on Google helps other shoppers find us: {{2}} Thank you!` |

Sample values for the review form: `Wanjiku`, and a real link. A variable cannot be the first or last thing in the body, hence the
closing sentences. Other names can be set with `WHATSAPP_TEMPLATE_APP`, `WHATSAPP_TEMPLATE_GROUP`, `WHATSAPP_TEMPLATE_REVIEW`.

## Where the links come from

| Message | Link |
|---|---|
| App | `APP_DOWNLOAD_URL`, default the Play Store listing `com.dripemporium.app` |
| Group | Site content > Footer > Google reviews and WhatsApp group > *WhatsApp group invite link* (until edited there, the built-in default in `page-content.defaults.ts`, which is what the live footer shows) |
| Rating | the same section > *Google profile / review link* |

These are read the way the website reads them, with the defaults filling anything not yet edited, so the messages carry the same links the footer shows. A message whose link is blank in both places cannot be sent; the screen says so.

## Behaviour

- A customer who already **received** a message is skipped unless "Send again" is ticked. A failed attempt does not count, so it can be retried.
- Inactive customers and customers with an unusable phone number are skipped.
- Every attempt is recorded in `WhatsappOutreach` (who, which message, who sent it, the result) and listed under "Recent messages".
- "Sent" means Meta accepted the message, not that the phone received it. A rejection (template not approved, number not on
  WhatsApp, token problem) is shown with Meta's reason.
- The screen sends in batches of 25 with a short pause between messages.
- Permissions: reading uses `customer.read`, sending uses `customer.update`; no new permission to seed.

## Setup on the server

Uses the same `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_ACCESS_TOKEN` as the daily report. Apply the migration
`20261104120000_add_whatsapp_outreach` when deploying.

## Automatic sequence for new signups (Mautic)

Mautic campaign **8, "Drip Emporium Store - WhatsApp onboarding"** sends the same three messages to new signups on a timeline:

| Step | When | Message |
|---|---|---|
| 1 | straight away | Download the app (`APP`) |
| 2 | 2 days after step 1 | Join the WhatsApp group (`GROUP`) |
| 3 | 3 days after step 2 | Rate us on Google (`REVIEW`) |

Each step is a Mautic "Send a webhook" action that posts `{kind, email}` to `https://api.dripemporium.store/whatsapp-outreach/hook`
with the shared secret in the `X-Outreach-Secret` header. The backend finds the customer by email and sends through the same code
as the portal screen, so the once-per-person rule and the log apply here too.

- **Only new signups.** The campaign's source segment is an empty one ("enrolled by the app"). `MauticService.syncSignup` adds a
  new customer to the campaign when `MAUTIC_WHATSAPP_CAMPAIGN_ID` is set. Orders, cart leads and inquiries never enrol anyone, and
  the 128 customers from before go through the portal screen instead.
- **Only customers.** A contact with no customer record is skipped ("Not a customer").
- **Responses.** Sent or deliberately skipped: `200`. A failed send: `502`, so Mautic marks the step failed and retries it later;
  that also covers a template still in review. A wrong or missing secret: `401`. With `OUTREACH_HOOK_SECRET` unset the endpoint is off (`503`).
- **Shared secret.** `OUTREACH_HOOK_SECRET` in the server `.env` must equal the `X-Outreach-Secret` header value stored in the three
  campaign steps. To rotate it, change it in both places (edit each step in the campaign builder).

### Going live

1. The three templates are **Approved** and the group and review links are set in Site content > Footer.
2. The backend with the hook is deployed (it reads `OUTREACH_HOOK_SECRET`, already in the server `.env`).
3. Set `MAUTIC_WHATSAPP_CAMPAIGN_ID=8` in the server `.env` and restart the backend. New signups are then enrolled.

To stop it, blank `MAUTIC_WHATSAPP_CAMPAIGN_ID` (no new enrolments) or unpublish the campaign in Mautic (pauses everyone in it).

### Mautic API caveats found while building it

- The campaigns API does not save the source segment (`lists`) on this Mautic version. It was linked with one row in
  `campaign_leadlist_xref` (campaign 8, segment 7). Campaign 6 is linked the same way.
- A campaign's canvas must connect the `lists` node to the first step, or every later API edit is refused as "orphaned events".
- The Mautic API sits behind a firewall that refuses Python's default user agent; send a normal `User-Agent`.

## "Get the app" link on the website

The storefront links to the Google Play listing in four places, all from one component (`web/app/components/app-download.tsx`) and one
address (`APP_STORE_URL` in `web/app/lib/site.tsx`): a green **Get the app** pill in the header (at every width, "App" on small phones),
a **Google Play** button at the top of the mobile menu, a full-width band directly under the home page hero, and the first button in the
footer strip. Each link carries a Play install referrer (`utm_campaign=header|menu|home|footer`), so Play Console shows which spot
brought each install. To change the address, edit `APP_STORE_URL`; it is not in the CMS.
