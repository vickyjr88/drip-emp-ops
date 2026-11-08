# Mautic sync (WhatsApp contacts as tagged Mautic contacts)

Read first: `drip-crm/docs/WHATSAPP-OUTREACH.md` ("Mautic" section), `backend/src/mautic/mautic.service.ts` (`syncWhatsappContact`), `whatsapp-outreach/whatsapp-mautic-sync.service.ts`, `test/whatsapp-mautic-sync.test.ts`.
Nairobi Gents has no Mautic today; build this only if the user asks for it there.

## What it does

Every person in `WhatsappContact` is pushed to Mautic every ten minutes (first tick ~2.5 min after boot) with tags: `whatsapp-contact` (everyone), `whatsapp-subscriber` or `whatsapp-unsubscribed` (STOP moves it, START moves it back), `whatsapp-ad` (came from an ad). **Nobody is enrolled in a Mautic
campaign** (the app sends the onboarding messages itself; a campaign would send them twice). Resellers, wholesalers and suppliers are not synced.

## Which Mautic contact

The known one (`mauticContactId`), else the customer's by **email** (Mautic merges on email; only tags are added, names untouched), else one with the same `mobile` (`+254…`, searched with `search=mobile:<number>`), else a new contact with mobile and the WhatsApp name.
A contact deleted in Mautic (404 on edit) is found or made again. Tag removal uses `-tag` entries in the same request.

## How it stays current without hooks

`mauticSyncedAt == updatedAt` means up to date. A candidate is a row with `mauticSyncedAt IS NULL OR updatedAt > mauticSyncedAt` and not tried in the last 15 minutes. Claim by setting `mauticTriedAt` (claim bumps `updatedAt`, so re-read), do the work, finish with a conditional update
`where updatedAt = <read value>` setting `mauticSyncedAt = updatedAt = now`. If the tags signature (`+add|-remove`) is unchanged, skip the API call and just mark synced. Failures store `mauticError` and are retried after 15 minutes; the screen shows "In Mautic" and how many are retrying.

## Mautic API facts

OAuth2 client credentials (`/oauth/v2/token`); contacts `POST /api/contacts/new` (create-or-update by email), `PATCH /api/contacts/{id}/edit`, `GET /api/contacts?search=…`; the API sits behind a firewall that refuses Python's default user agent (send a normal one); the campaigns API does not save the source segment;
STOP is a **tag**, not Mautic's do-not-contact flag: WhatsApp consent and email consent are separate.

## Switches

`MAUTIC_WHATSAPP_SYNC=false` stops it (becomes a per-shop `enabled` in the credential store). Needs the Mautic base URL and client id/secret (platform or shop, a decision for the user).
