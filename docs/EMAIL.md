# Transactional email

Every outgoing email — owner alerts, the abandoned-cart reminder, password
resets, invoice and supplier-invoice notices, payment reminders — goes through
one funnel (`EmailSenderService`) and comes out wrapped in the same branded
HTML shell (`backend/src/email-log/email-html.util.ts`). A caller only ever
builds its own content fragment (a heading, a paragraph, maybe a button); the
navy header, card, and footer are added once, centrally, for free.

## How it decides where to send from

```
send() ──▶ smtp configured? ──▶ try it ──▶ delivered? ──▶ done
              │ no / failed                    │ no
              ▼                                ▼
           brevo configured? ──▶ try it ──▶ delivered? ──▶ done
              │ no / failed                    │ no
              ▼                                ▼
         billionmail configured? ─▶ try it ──▶ done (or recorded as FAILED)
```

Each send tries providers **in this order** — `smtp`, then `brevo`, then
`billionmail` — moving to the next only when the one before it actually fails
to deliver, not just once at boot. That's deliberate: SMTP (pointed at the
self-hosted BillionMail server) is the intended primary for cost and control;
Brevo exists purely as a fallback for when that specific send fails.

Setting `EMAIL_PROVIDER` forces exactly one provider and turns this off
entirely — useful for locking to Brevo during SMTP maintenance, for example.

## Env vars — what you actually need to set

**Minimum to get any email sending at all**: the three `SMTP_*` values below,
or a `BREVO_API_KEY`. Nothing else is required — the rest have working
defaults or are optional refinements.

| Variable | Required? | What it does |
|---|---|---|
| `SMTP_HOST` | For SMTP (primary) | The mail server's own hostname (e.g. `mail.dripemporium.store`) — **not** the website's domain, and not proxied through Cloudflare or any CDN (see the DNS-proxying note below) |
| `SMTP_PORT` | No — defaults to `587` | `587` for STARTTLS, `465` for implicit TLS |
| `SMTP_USER` | For SMTP | The mailbox to authenticate as |
| `SMTP_PASSWORD` | For SMTP | That mailbox's password |
| `SMTP_FROM_EMAIL` | No — defaults to `SMTP_USER` | The address mail appears to come from |
| `SMTP_FROM_NAME` | No — defaults to `Drip Emporium` | The display name recipients see |
| `SMTP_REJECT_UNAUTHORIZED` | No — defaults to rejecting | Set to `false` only if your mail server's TLS certificate doesn't match its hostname (BillionMail ships a stock `*.billionmail.com` cert that doesn't match a real domain). Mail stays encrypted either way; this only controls whether the server's identity is verified. The real fix is installing a matching certificate. |
| `BREVO_API_KEY` | For Brevo (fallback) | From your Brevo account's API keys page |
| `BREVO_SENDER_EMAIL` | No — defaults to `no-reply@dripemporium.store` | Must be a sender verified in Brevo, or sends are rejected |
| `BREVO_SENDER_NAME` | No — defaults to `Drip Emporium` | Display name |
| `EMAIL_PROVIDER` | No | Set to `smtp`, `brevo`, or `billionmail` to force one and disable the automatic fallback chain. Leave blank for the normal smtp → brevo → billionmail behavior. |

**BillionMail's own HTTP API** (`billionmail` provider) is a distinct, lower
priority path from SMTP-via-BillionMail above — it talks to BillionMail's
`/api/batch_mail/api/send` endpoint directly rather than through SMTP, and
needs its own template configured in the BillionMail dashboard (its API
carries no subject/body of its own — see the code comment in
`billionmail.provider.ts` for the exact template variables it expects). Only
set these if you specifically want that path; most setups don't need it since
plain SMTP already covers a self-hosted BillionMail server:

| Variable | Required? | What it does |
|---|---|---|
| `BILLIONMAIL_API_KEY` | For this path only | From an API entry created in the BillionMail dashboard |
| `BILLIONMAIL_BASE_URL` | For this path only | Your BillionMail server's origin, no trailing slash |
| `BILLIONMAIL_SENDER_EMAIL` | No | Must be a real mailbox with a password on the BillionMail server, or sends fail with "password not found" |

**Everything else that touches email:**

| Variable | Required? | What it does |
|---|---|---|
| `OWNER_EMAIL` | No — defaults to `emporiumdrip@gmail.com` | Where owner-facing alerts go (cart abandoned, order paid, new signup, contact form) |
| `CART_REMINDERS_ENABLED` | No — defaults to `true` | Set `false` on a replica that must not run the abandoned-cart reminder worker |
| `CART_REMINDER_DELAY_HOURS` | No — defaults to `24` | Hours after a cart is first recorded abandoned before the reminder email sends |
| `REDIS_URL` | Yes, for the abandoned-cart reminder | The reminder is a delayed job; without Redis it is skipped (and logged), not sent early |
| `STOREFRONT_ORIGIN` / `NEXT_PUBLIC_SITE_URL` | Yes, for links inside emails | The cart-reminder button and any other customer-facing link need the storefront's real public origin, not the API's — see `backend/src/common/storefront-origin.ts` |

## What "not delivered" looks like

A missing or invalid provider never throws — it's recorded as a failed send
and logged, so a mail outage can't take down checkout, signup, or the cart
sync that triggered the email. Look for:

- `EmailSenderService` startup log: `Email fallback order: smtp -> brevo` (or
  a warning if nothing is configured at all).
- Per-send warnings: `<provider> failed to deliver "<subject>" to <address>:
  <reason> — trying next provider`.
- Invoice, supplier-invoice, and customer-portal emails additionally write a
  row to `EmailLog` (visible in the portal) with a `FAILED` status and the
  provider's error message. Owner alerts and the abandoned-cart reminder do
  **not** write to `EmailLog` — check the backend logs for those.

## If SMTP sends hang or fail intermittently: check DNS proxying first

Diagnosed live in production (2026-09): `SMTP_HOST` pointed at a hostname
that was proxied through Cloudflare (the domain's DNS record was
"proxied"/orange-clouded rather than "DNS only"/grey-clouded). Cloudflare's
proxy only forwards HTTP(S) on 80/443 — a connection to any SMTP port
(25/465/587) on a proxied hostname either hangs indefinitely or gets
refused, unpredictably, which looked exactly like "emails aren't going out"
from the app's side while `curl`-ing port 443 on the same host worked fine.

To check: from the backend container (or any machine that can reach the
mail server), resolve the SMTP host's A/AAAA records and compare them
against Cloudflare's published IP ranges
([ipv4](https://www.cloudflare.com/ips-v4), [ipv6](https://www.cloudflare.com/ips-v6)).
If they match, the fix is entirely in the DNS provider's dashboard —
switch that record to "DNS only," not a code or env change. A quick
`nodemailer.createTransport({...}).verify()` from inside the container is
the fastest way to confirm SMTP is reachable at all before chasing
anything else.

## The branded template

`wrapEmailHtml(subject, bodyHtml)` in `email-html.util.ts` is the one place
that owns the look: navy (`#06166e`) header with the "Drip Emporium" wordmark
in Libre Caslon Text (matching the storefront's own brand font and color
ramp — see `web/app/globals.css`), a white content card for whatever fragment
the caller built, and a muted footer. There is no logo image in the repo, so
the header renders the wordmark as styled text, the same way the storefront's
own header and favicon do.

It's applied once, inside `EmailSenderService.send()`, so every caller —
including an operator's own custom wording typed into a `ReminderRule` in the
portal — gets the branded shell automatically, with no per-caller changes
needed. `ctaButton(href, label)` in the same file is the shared button style
for the few emails that need the reader to click through (password reset,
the cart reminder).
