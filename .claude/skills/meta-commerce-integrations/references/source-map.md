# Source map (drip-crm, the reference implementation)

Root: `/Users/vickyjunior/projects/dirrir/drip-crm`. Paths are relative to it. Read the file, do not rely on this summary of it. Commits are in `git log`; the migration directories are in `backend/prisma/migrations/`.

| Piece | Backend | Tests (`backend/test/`) | Web | Docs | Migrations |
|---|---|---|---|---|---|
| WhatsApp outreach, subscription, delivery | `backend/src/whatsapp-outreach/` (`whatsapp-subscription.ts` pure rules; `whatsapp-contacts.service.ts`; `whatsapp-sequence.service.ts`; `whatsapp-outreach.service.ts` + `.kinds.ts`; `whatsapp-webhook.controller.ts`) and `daily-report/whatsapp.service.ts` (the Cloud API client: `sendTemplate`, `sendText`) | `whatsapp-outreach.test.ts`, `whatsapp-subscription.test.ts` | `web/app/portal/outreach/page.tsx` | `docs/WHATSAPP-OUTREACH.md` | `20261104120000_add_whatsapp_outreach`, `20261108120000_add_whatsapp_contacts_and_delivery` |
| Daily report, reminders | `backend/src/daily-report/` (`daily-report.service.ts`, `-queue.service.ts`, `.render.ts`, `.window.ts`) | `daily-report.test.ts`, `scheduler-replicas.test.ts` | `web/app/portal/daily-report/` | `docs/DAILY-REPORT.md`, `docs/REMINDERS.md`, `docs/DEPLOYMENT.md` ("Schedulers and the two slots") | `20261104000000_add_daily_report` |
| Follow-up buttons | `backend/src/common/follow-up.ts`, `cart-lead.service.ts`, `order.service.ts` | `follow-up.test.ts` | `web/app/portal/components/follow-up-button.tsx` | `docs/WHATSAPP-FOLLOW-UP.md` | none |
| Insights / first-party funnel / WhatsApp report | `backend/src/insights/` (`visit.ts`, `events.service.ts`, `funnel.service.ts`, `whatsapp-report.service.ts`, `stock.service.ts`, `buyers.service.ts`, `ad-spend.service.ts`) | `insights.test.ts` | `web/app/portal/insights/`, `web/app/lib/first-party.ts` | `docs/INSIGHTS.md` | `20261112090000_add_storefront_events_and_ad_spend` |
| Facebook comment replies | `backend/src/facebook-comments/` (`facebook-comments.ts` pure; `.service.ts`; `facebook-webhook.controller.ts`; `shop-facts.ts`) | `facebook-comments.test.ts` | card in `web/app/portal/outreach/page.tsx` | `docs/FACEBOOK-COMMENTS.md` | `20261114090000_add_facebook_comment_replies` |
| Social posting (Facebook + Threads) | `backend/src/social-posting/` (`social-post.ts` pure; `social-posting.service.ts`; `social-posting.controller.ts`, `dto.ts`); `storefront/storefront.service.ts` `postableProducts()` | `social-posting.test.ts` | `web/app/portal/social/` | `docs/SOCIAL-POSTING.md` | `20261115090000_add_social_posting`, `20261116090000_add_threads_posting` |
| Status kit | `backend/src/social-posting/status-kit.service.ts`, `status-image.ts`, `brand-font.ts` (+ `compactSizes`, `buildStatusCaption`, `formatKenyanPhone` in `social-post.ts`) | `status-kit.test.ts` | `web/app/portal/status-kit/` | `docs/SOCIAL-POSTING.md` | none (rows in `SocialPost`, channel `STATUS`) |
| Mautic sync | `backend/src/mautic/mautic.service.ts`, `whatsapp-outreach/whatsapp-mautic-sync.service.ts` | `whatsapp-mautic-sync.test.ts` | "In Mautic" tile in the Outreach page | `docs/WHATSAPP-OUTREACH.md` | `20261113090000_add_whatsapp_contact_mautic_sync` |
| Env wiring | `docker-compose.yml`, `.env.sample` (the list the credential store replaces) | | | `docs/DEPLOYMENT.md` | |

Reference commits (drip-crm, oldest first): `7d0d1d2` insights funnel · `85a91fd` follow-up · `685d4f6` fixed-text templates · `435f109` daily report screen · `bdea987` schedulers on both slots · `b157fb8` auto-subscription · `9a1e4be` WhatsApp report ·
`30ac043`/`13f0f93` failed-after-accepted handling · `6031aea` Mautic sync · `ebd1e9d`…`cd5262b` comment replies · `010b688` posting · `f059f5b` table fix · `1207361` Threads · `15acc50` Status kit.

Nairobi Gents (`/Users/vickyjunior/projects/shops-platform`) already contains: daily report (`backend/src/daily-report/`, commit `ca8033a`), follow-up links (`d940b78`), first-party analytics, ad spend and stock/buyers (`portal-analytics/`),
`common/secrets.ts` (AES-GCM), `platform-settings/` (SMTP), `common/storefront-origin.ts` (per shop), `common/shop-scope.guard.ts` (`@NoShopScope()`), sections (`common/sections.ts`), docs `ANALYTICS.md`, `DAILY-REPORT.md`, `WHATSAPP-FOLLOW-UP.md`, `TESTING.md`.

Server access (both apps share the host): `ssh -o BatchMode=yes garime`; drip-crm `/root/drip-emp-ops` (containers `drip-emp-ops-*`, slot file `.deploy-active-slot`), shops-platform `/root/shops-platform` (containers `shops-platform-*`).
