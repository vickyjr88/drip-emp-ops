# Meta setup runbook (what the user does in Meta's dashboards, and how to verify it)

Most failures in this work were setup, not code. Walk the user through the steps they must do themselves, do everything else with their tokens, and
prove each step with a read-only call before moving on. Menus move often; describe by name and be ready for the screen to differ.

## Vocabulary that was confused more than once

- **Business portfolio** owns assets: a WhatsApp Business Account (WABA), Pages, ad accounts, the Meta **app**.
- **App id / app secret**: the Meta app (Facebook side). **Threads has its own app id and secret**, shown in its own use case.
- **System User**: a robot account in Business settings. Its token never expires (unless revoked) and needs no person to be logged in. Use it for WhatsApp and Page work.
- **Phone number id** is not the phone number. It is the id the Cloud API sends from. `wa.me/…` links use the real number.
- Tokens seen in this work: `EAAN…` System User or Page tokens (Facebook family), `THAA…` Threads user tokens (Threads only). They are not interchangeable.

## WhatsApp Cloud API

1. A WABA with a connected number: its **phone number id** and **WABA id** are in WhatsApp Manager / API setup.
2. A **payment method** on the WABA. Without one, accepted sends fail later with **131042** ("business eligibility: payment"). Having just added a card, a $ pre-authorisation
   shows as Pending for a day or two; test with one message before a batch.
3. A **System User token** with `whatsapp_business_messaging` and `whatsapp_business_management`, assigned the WABA (full control).
4. **Templates** in WhatsApp Manager, language `en`, category Marketing or Utility. Rules that cost review rounds: a `{{variable}}` cannot be the first or last thing
   in the body; every variable needs a sample; a template with no variables is sent with **no `components` key**; names are lowercase with underscores. Approval
   takes minutes to days. Free-form text is allowed only within 24 hours of the person's last message (the "window"); everything else must be a template.
5. **Business verification** and **display name approval** are separate, slow, and gate throughput. Unverified: about 250 business-initiated conversations per
   24 hours. Plan caps below that (Drip uses 200). Quality rating (GREEN/YELLOW/RED) falls with blocks and reports; watch it after any bulk send.
6. **Webhook** (messages from people, and delivery statuses): two things, in this order.
   - App Dashboard > WhatsApp > Configuration > Webhook fields: subscribe **messages**. This is app-level and cannot be done with a token.
     Until it is done Meta refuses the next step with an error about `override_callback_uri`.
   - Point the WABA at the shop's URL with its token:
     `POST https://graph.facebook.com/v21.0/<WABA id>/subscribed_apps` body `{ "override_callback_uri": "https://api.example/whatsapp/webhook/<secret>", "verify_token": "<secret>" }`.
     Meta calls the URL immediately, so the app must already be deployed and the secret already saved.
7. Verify: send one template to the owner's own number and read the delivery status arriving at the webhook (`sent` → `delivered`).

### Error codes worth recognising

| Code | Meaning | What to do |
|---|---|---|
| 131042 | Payment / eligibility problem on the WABA | account-level: retry in hours without counting against the person; fix billing |
| 131026 | Undeliverable (not on WhatsApp, blocked, outdated) | give up after a few tries; do not resend in bulk |
| 130472 | Person is in a Meta marketing experiment | not retryable for that person |
| 131031 / 131048 | Account locked / spam rate limit | account-level; stop and look at quality |
| 131047 | Outside the 24 h window for free text | use a template |
| 132000 / 132001 | Template parameter mismatch / template not found | wrong variable count or name or language |
| 190 | Token invalid or expired | new token |
| 10 | Permission missing | permission not on the app or token |

## Facebook Page (comments, posting)

1. **System User** assigned the **Page** (full control) and the **app**. Generate a token with: `pages_show_list`, `pages_read_engagement`, `pages_messaging`,
   `pages_manage_metadata`, `pages_manage_engagement` (public replies), `pages_manage_posts` (posting).
   A permission missing from the generator list is not enabled on the app: App Dashboard > Use cases > the Page use case ("Manage everything on your Page") > Customize >
   Permissions and features > add it. Assigning more permissions to the user does not add what the app lacks.
2. **Exchange for the Page's own token**: `GET /{page-id}?fields=access_token` with the System User token. Store that token; it does not expire and is
   narrower. Page tokens cannot list their permissions (`/me/permissions` errors), so check the System User token's permissions with `/me/permissions` instead.
3. **Webhook**: App Dashboard > Webhooks > object **Page** > callback URL and verify token (the same secret) > subscribe **feed**. This is app-level. Then, with the Page
   token: `POST /{page-id}/subscribed_apps?subscribed_fields=feed`; confirm with `GET /{page-id}/subscribed_apps` that your app lists `feed`.
4. **App mode**: until the app has Advanced Access to `pages_messaging`, Facebook only delivers and allows replies for people with a role on the app. Test with them.
   Advanced Access needs App Review and usually business verification.
5. **Check publishing without posting**: upload a product photo with `published=false` to `/{page-id}/photos`, then `DELETE` it. Success proves `pages_manage_posts`.
6. Private reply rules (Messenger Platform): one message to the author of a comment, within 7 days, recipient `{ "comment_id": … }`, sent from `POST /{page-id}/messages`.
   People who only react cannot be messaged by any API; there is no API to invite them to like the Page.

## Threads

Threads uses its own login. A Facebook token sent to `graph.threads.net` returns `190 Cannot parse access token`.

1. App Dashboard > Add use case > **Access the Threads API** (permissions `threads_basic`, `threads_content_publish`).
2. Add the shop's Threads account as a **Threads Tester** (App roles) and have the account accept it in the Threads app (Settings > Account > Website permissions > Invites).
3. Use the use case's **User token generator** for that account. A token starting `THAA` is the result. It may be long-lived already.
4. Check: `GET https://graph.threads.net/v1.0/me?fields=id,username`, `GET /{id}/threads_publishing_limit?fields=quota_usage,config` (250 per 24 h).
5. Lifetime: long-lived tokens last 60 days. `GET https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=<token>` returns a new 60-day token; it is
   refused for a token under 24 hours old. A short-lived (one hour) token is exchanged with the Threads **app secret**:
   `GET https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=<secret>&access_token=<short token>`. A refresh test on a long-lived token
   succeeds and returns a new token; the old one keeps working, so a test refresh is harmless.
6. Publishing is two calls (create the item, wait until `status=FINISHED`, publish), text up to 500 characters, image URLs must be public https.

## Rotation and clean-up

- A token, secret or app secret pasted into chat is in the transcript: use it, then say so and ask the user to rotate it. Tell them what to update after the rotation
  (System user > Generate new token > revoke the old ones; new webhook secret means editing the callback URL **and** verify token in Meta; resetting an app secret
  breaks signature checks and the Threads exchange until the new value is saved).
- Never put a token in a URL that gets logged. Threads GETs need `access_token` as a query parameter, so log the endpoint label, never the URL.

## Read-only proofs to run (no side effects)

- WhatsApp: `GET /{phone-number-id}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier`.
- Webhook handshake: `GET <webhook url>?hub.mode=subscribe&hub.verify_token=<secret>&hub.challenge=4242` must echo `4242`; a wrong address must be 404 (a reverse proxy that rate-limits
  repeated 404s may answer 502 on later probes; that is the proxy, not the app).
- Page: `GET /{page-id}?fields=name,fan_count` and `/subscribed_apps`.
- Threads: `/me`, the quota, and (optionally) a refresh.
- Delivery: a row in the status table for the message id of a test send.
