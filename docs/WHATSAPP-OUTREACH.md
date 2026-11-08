# WhatsApp outreach

Portal > **WhatsApp Outreach** sends a customer one of six WhatsApp messages from the Drip Emporium business number:
**download the app**, **join the WhatsApp group**, **rate us on Google** (these three use the customer's name and a link),
and three fixed messages: **rate us on Google (full message)**, **our range of shoes**, **where to find us**. Staff choose the message, tick the customers
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

### Fixed-text templates

Three more templates are complete as approved: the link or number is inside the text, so they take **no variables**, use no
name, and need nothing from Site content. They are sent with no parameters.

| Template name | Screen label | Setting to rename it |
|---|---|---|
| `google_review` | Rate us on Google (full message) | `WHATSAPP_TEMPLATE_GOOGLE_REVIEW` |
| `shoe_variety` | Our range of shoes | `WHATSAPP_TEMPLATE_SHOE_RANGE` |
| `shop_location` | Where to find us | `WHATSAPP_TEMPLATE_LOCATION` |

Like the others, each is recorded per customer and is not sent twice to the same person unless forced. These messages do not
join the Mautic onboarding sequence below, which sends the first three only.

## Where the links come from

| Message | Link |
|---|---|
| App | `APP_DOWNLOAD_URL`, default the Play Store listing `com.dripemporium.app` |
| Group | Site content > Footer > Google reviews and WhatsApp group > *WhatsApp group invite link* (until edited there, the built-in default in `page-content.defaults.ts`, which is what the live footer shows) |
| Rating | the same section > *Google profile / review link* |

These are read the way the website reads them, with the defaults filling anything not yet edited, so the messages carry the same links the footer shows. A message whose link is blank in both places cannot be sent; the screen says so.

## Behaviour

- A customer who already **received** a message is skipped unless "Send again" is ticked. A failed attempt does not count, so it can be retried. Neither does a message Meta accepted and later **reported as failed** (a number not on WhatsApp, an account payment problem): they stay on the list for the next send once the cause is fixed. One with no report yet counts as received.
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

## People who message the shop (automatic)

Advertising brings many people to the shop's WhatsApp number. The first time someone writes, the app replies (a normal message, allowed
within 24 hours of theirs): *"Thanks for messaging Drip Emporium! You'll now receive updates on new arrivals and offers on this number.
Reply STOP at any time to opt out."* They are then put through the same three messages as the Mautic campaign, one day after the
notice and then 2 and 3 days apart (`WHATSAPP_SEQUENCE_DELAYS_HOURS=24,48,72`): the app, the group, the Google rating.

- **STOP** (the whole message: "stop", "STOP.", "unsubscribe", "opt out", "end") unsubscribes them at once and sends a confirmation.
  A sentence that merely contains the word is not an opt-out, and "cancel" is left out on purpose because people use it for orders.
  From then on **nothing** reaches that number: not the sequence, not a batch picked on the Outreach screen. **START** brings them back.
- **Not subscribed, only recorded:** a number that belongs to a reseller, a wholesaler or a supplier.
- **Guards:** messages go out 08:00 to 20:00 Nairobi time only; never more than `WHATSAPP_DAILY_SEND_CAP` (default 200) template
  messages a day, under Meta's 250 for an unverified business; nobody is put through the sequence until the notice has actually been
  sent; a number that keeps failing is given up on after 5 tries. `WHATSAPP_AUTO_SUBSCRIBE=false` switches it off (STOP still works).
- **Which ad:** a click-to-WhatsApp ad's details arrive with the first message and are stored (ad id, headline, click id).
- **Delivery reports:** Meta's reports (delivered, read, failed with the reason) are stored and shown on Daily Report and in
  "Recent messages". Until now a message Meta *accepted* was shown as sent whether or not it arrived.
- **See and stop it:** Portal > WhatsApp Outreach > "People who messaged us", with a button to unsubscribe someone who asked another way.

### Setting it up

1. Set `WHATSAPP_WEBHOOK_SECRET` in the server `.env` to a long random string and deploy. Optionally set `WHATSAPP_APP_SECRET`.
2. Subscribe the app to the WhatsApp account's messages, pointing at this server. With the same token, one call:

   ```
   POST https://graph.facebook.com/v21.0/<WABA id>/subscribed_apps
   { "override_callback_uri": "https://api.dripemporium.store/whatsapp/webhook/<WHATSAPP_WEBHOOK_SECRET>", "verify_token": "<WHATSAPP_WEBHOOK_SECRET>" }
   ```

   Meta immediately calls the address to check it, so the app must already be deployed.
3. Message the number from a phone: you should get the notice, and a row appears under "People who messaged us".

The address contains the secret so that nobody else can post events here: a forged "message from 0712..." would otherwise make the shop
message that number. Without the secret set the endpoint does not exist (404).

## "Get the app" link on the website

The storefront links to the Google Play listing in four places, all from one component (`web/app/components/app-download.tsx`) and one
address (`APP_STORE_URL` in `web/app/lib/site.tsx`): a green **Get the app** pill in the header (at every width, "App" on small phones),
a **Google Play** button at the top of the mobile menu, a full-width band directly under the home page hero, and the first item in the
footer strip (heading, one line of text and a button, like the Google and WhatsApp items beside it; its wording is editable under
Site content > Footer > App, Google reviews and WhatsApp group). Each link carries a Play install referrer (`utm_campaign=header|menu|home|footer`), so Play Console shows which spot
brought each install. To change the address, edit `APP_STORE_URL`; it is not in the CMS.
