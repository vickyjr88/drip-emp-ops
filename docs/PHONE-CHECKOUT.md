# Checking out with a phone number alone

The email box at checkout is **optional**. A shopper who gives only a phone number can still order and pay; the shop keeps them as a customer and in Mautic, and gives
the same record their email the day it turns up. Nothing was removed: giving an email works exactly as it did.

## What happens

| The shopper gives | The customer | The order | Paystack is given | Mautic |
| --- | --- | --- | --- | --- |
| Phone only | One record per number (found again by the last nine digits, however it is typed) | No email on it | An address made from the number on a host with no mailbox, so the provider's receipt goes nowhere | A contact keyed by the **mobile number**, tagged `phone-only`, once the order is **paid**; not on the email campaign |
| Phone and email | As always, keyed by the email | The email | The email | Created or updated by email, enrolled in the campaign |
| Phone only first, email at a later checkout | The same record **gains the email** and keeps its orders | The email, from then on | The email | The same Mautic contact **gains the email**, loses `phone-only`, joins the campaign |

An account (a password) needs an email, because it signs in by it: ticking "create an account" requires one, and the server refuses a password without one before writing anything.

## How "no email" is stored

Customers are keyed by a unique email, so a customer with none is stored under a stand-in built from the phone number: `254722123456@customer.invalid`. This is the convention the
till already used for walk-ins (and `<code>@trade.invalid` for a trade account with no address). `.invalid` is reserved (RFC 2606): it can never receive mail, and it is unique per number,
which is what makes "one customer per phone number" true without a second key. **Anything that sends, syncs or displays an address goes through `realEmail()`** (`common/contact-email.ts`, and
`web/app/lib/contact-email.ts`), which says whether an address is a person's:

- Orders store `customerEmail` as the real address or null, never a stand-in. Owner notifications and the ad conversions (X, TikTok) therefore see none rather than junk.
- The email log refuses to send to a stand-in: it records a failed send with "no email address on file", instead of trying an address that never existed.
- The receipt PDF leaves the email line out. The staff customer list and the export show "No email" / blank.

## When the email turns up

The same person's record is updated, in each of these, and Mautic is told (without starting the WhatsApp onboarding sequence again):

- **A later checkout** with the same phone and an email (the record is found by phone, gains the email, keeps its orders).
- **Staff add it** on the customer's page (Portal > Customers > edit; the box is now optional and blank for a phone-only customer). It must be a real address and not another customer's.
- **The shopper makes an account** with that phone and an email: the phone-only record and its past orders become the account.

An email that already belongs to another customer is used as it always was (their record is used); the phone-only one is left alone rather than merged by guesswork.

## Mautic

`MauticService.syncContact()` is the one entry:

- **Phone only:** finds the contact by `mobile:+254...` (so a person who messaged the shop on WhatsApp is reused, not duplicated), else creates one with the mobile number and name, tagged `dripemporium-store` and `phone-only`. Not enrolled in the e-commerce campaign (it sends email).
- **Email, and a phone:** if Mautic has a contact for that number with no email, **that contact gains the email** (a name is only filled in if it has none), `phone-only` is removed, and it is enrolled. If Mautic refuses because the address is already on another contact, Mautic's own create-or-update by email takes over and merges into that one.
- **Never throws**, and returns what it did; a Mautic outage loses nothing the next event does not catch up.
- Abandoned carts are still synced only with an address; a phone-only lead is left to staff (the WhatsApp follow-up link).

To build a WhatsApp or SMS segment of customers who have not given an email, use the tag `phone-only`.

## Things worth knowing

- A phone-only checkout is **not** attached to an existing account just because the number matches: an account's orders are visible to its owner, and a stranger typing a number must not put an order there. It becomes a separate phone-only record. If the shopper later gives the account's email, the account is used.
- An abandoned cart left with a phone number is converted by an order from the same number.
- Receipts, invoices and password resets still need a real address; a customer with none is simply not mailed, and staff see why.
- Not covered: merging two records for one person after the fact (a phone-only record and an account that already existed).

## Files

`backend/src/common/contact-email.ts`, `phone-only-customer.ts`; `checkout/checkout.service.ts` (`upsertCustomer`, `start`, `resumePayment`); `checkout/dto/checkout.dto.ts`; `mautic/mautic.service.ts`;
`customer/customer.service.ts`; `customer-portal/customer-portal.service.ts`; `email-log/email-log.service.ts`. Storefront: `web/app/cart/cart-client.tsx`. Staff: `web/app/portal/customers/`.
Tests: `contact-email.test.ts`, `mautic-phone.test.ts` (against a fake Mautic), `phone-checkout.test.ts` (a real database; `KITS_TEST_DATABASE_URL`). No migration.
