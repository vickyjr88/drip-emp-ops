# Merging duplicate customers

Portal > Customers > **Find duplicates** (`/portal/customers/duplicates`) lists customers who are really the same person and merges them. **Nothing
is merged by itself**: a person looks at the groups and presses a button, and each merge asks for confirmation with a summary of what it will do.

## Where duplicates come from

Customers are keyed by a unique email. Someone who checks out with a phone number alone is stored under a stand-in address (`254722…@customer.invalid`),
so when they later sign up with a real email they become a second record. Walk-ins rung up twice, or one email typed in two cases, do the same.

## How records are linked

Two records are in one group when they share a **phone number** (the last nine digits, so `0722…`, `+254722…` and `254722…` match) or the same **email
ignoring case**. Links chain: A and B by phone, B and C by email, is one group of three.

Only **active retail** customers are considered. Reseller and wholesale accounts, anyone with a referral code, and inactive customers never appear, and
a merge that includes one is refused.

## Which record is kept

By default: a real email first, then a working portal sign-in, then the most orders, then the oldest. Staff can pick another with the radio button,
and untick any record they do not want in the merge.

## Safe, or check first

A group is **safe** when every other record is plainly the same person with nothing to lose: no second real email address, and the names agree (a stand-in
name such as "Walk-in" or "Guest", or the same first name). Anything else is marked **Check first** with the reason:

- two different real emails on one number (they may be two people who share a phone);
- different names on the same number.

"Merge all safe groups" merges exactly the safe groups the screen showed (the screen sends which record it saw kept in each). A group that has changed
since, or is no longer safe, is left alone and reported.

## What a merge does

In one transaction, so it happens whole or not at all:

- Orders (as buyer and as referred), invoices, receipts, consignments, cart leads, WhatsApp message history and documents **move** to the kept record.
- Favourites move, except ones the kept record already has.
- The merged records are **removed**.
- A `CustomerMerge` row keeps what each removed record was (name, email, phone, notes, dates and how many of each thing moved), **without** its password
  hash or reset token. It is not a database relation, so it outlives both customers. It is there to understand a merge later or to put a record back by hand.
- The kept record only **fills gaps**; it never loses what it has. If staff keep a phone-only record over a real account, it takes the real email (and the
  sign-in that goes with it) and the real names. Notes are combined.
- A merge involving reseller activity (commission, payouts, referral links, an application) is refused.
- Afterwards the kept customer is pushed to Mautic if they have a real email, which also upgrades a phone-only Mautic contact (see `docs/PHONE-CHECKOUT.md`).

Reviews are not records of the customer (a review is tied to a hash of the phone, email or customer id), so merging changes nothing about them.

## Permissions

Looking and previewing need `customer.read`. Merging deletes records, so it needs `customer.delete`. No new permission keys.

## Files

- `backend/src/customer/customer-duplicates.rules.ts`: grouping, which to keep, safe or not, what the kept record adopts (pure).
- `backend/src/customer/customer-merge.service.ts` and `customer-duplicates.controller.ts` (`GET /customer-duplicates`, `POST /preview`, `/merge`, `/merge-safe`).
- `web/app/portal/customers/duplicates/page.tsx`.
- Migration `20261122110000_add_customer_merges`; tests: `npm run test:customer-merge` (needs `KITS_TEST_DATABASE_URL`).

## Not done

- A merge cannot be undone from the screen. The `CustomerMerge` row has what is needed to restore a record by hand.
- Two real accounts for one person, with different emails, are shown for review but a person has to decide; they are never merged automatically.
- Duplicates that share neither a phone number nor an email (a misspelt number) are not found.
