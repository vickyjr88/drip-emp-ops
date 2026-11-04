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
| Group | Site content > Footer > Google reviews and WhatsApp group > *WhatsApp group invite link* |
| Rating | the same section > *Google profile / review link* |

A message whose link is blank cannot be sent; the screen says so.

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
