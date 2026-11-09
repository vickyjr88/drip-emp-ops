# Facebook comment replies

Read first: `drip-crm/docs/FACEBOOK-COMMENTS.md`, then `backend/src/facebook-comments/facebook-comments.ts` (pure), `.service.ts`, `facebook-webhook.controller.ts`.

## What it does

When someone comments on a Page post or ad, the shop sends them **one private Messenger reply** (opens a conversation staff answer from the Page inbox in Meta Business Suite) and, only if that went, a **short public reply** under the comment.
Default private text: greeting by first name, "reply here with the pair and your size", the WhatsApp link, and an invitation to follow the Page. Default public text: "We've sent you a message … Shop online: {site} / Visit us: {location}".
Placeholders: `{name} {whatsapp} {page} {site} {location}`; all overridable in settings; blank link values default from shop settings (`shopFacts`).

## Platform rules that shaped it

- Private reply: `POST /{page-id}/messages` with `recipient: { comment_id }`, within **7 days**, **one** message until they answer. Needs `pages_messaging` (+ `pages_read_engagement`). The public reply (`POST /{comment-id}/comments`) needs `pages_manage_engagement`.
- **People who only like or react cannot be messaged or invited by any API.** Say so; do not promise it.
- Until the app has Advanced Access, only people with a role on the app are served: test with them.
- The Page event is `feed` with `item=comment`, `verb=add`; the commenter is `from.id`/`from.name`; `post_id`, `parent_id`, `comment_id`, `created_time`, `message`. Whether every ad's comments reach the webhook must be checked with one real comment on a live ad.

## Guards

Ignore the Page's own comments (`from.id == page id`, which also stops our public reply looping); top-level only (`parent_id == post_id`); skip comments containing links (spam); one private reply per person per 7 days;
daily cap (200); the commenter's `commentId` unique so redelivery does nothing; transient failures retry (3, within 6 days); "already replied" codes (10900/10901/10903) become SKIPPED; a RETRY/PENDING row is re-claimed before sending.
The public reply failing (e.g. missing permission) never changes the row from SENT; its reason is recorded in `detail`.

## Data, endpoints, screen

`FacebookCommentReply` (commentId unique, post, page, from id/name, message, status PENDING|SENT|RETRY|FAILED|SKIPPED, detail, attempts, recipientId, privateMessageId, publicReplyId, repliedAt).
`GET /facebook-comments/status` (configured, enabled, whether the Page is subscribed to `feed`, counts, today vs cap) and list. Portal card "Facebook comments" shows "Page is sending us comments" / "not yet", counts and the latest comments with reasons.
Webhook route `/facebook/webhook/<secret>` (GET verify, POST receive; signature if the app secret is known).

## As ported to Nairobi Gents

See "Phase 3 as built" in `nairobi-gents-plan.md`: per-shop webhook (each shop has its own app), shop-aware wording that drops empty lines, textarea settings, off by default.

## Multi-tenant port

One app-level callback, so the route resolves the shop from `entry[].id` (page id → FACEBOOK integration `externalId`). Per-shop caps, per-shop `shopId` in the unique key, per-shop texts. The token and page id come from the credential store;
the "subscribe Page to feed" helper becomes a button using the stored Page token.

## Acceptance

A comment from a non-role account is ignored in dev mode (expected); from a role account: private reply arrives, public reply appears (or the card shows its reason), a second comment within a week is SKIPPED, the Page's own reply does not trigger anything, a duplicate delivery changes nothing.
