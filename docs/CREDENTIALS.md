# Integration credentials: Portal > Settings

The ids and secrets that connect the shop to Facebook, Instagram, Threads, X and TikTok, and the X and TikTok ad-tracking pixels, are edited in
**Portal > System > Settings** and kept **encrypted in the database**. Before this they lived only in the server's `.env`.

## What is kept

| Group | Names (the same ones the `.env` always used) |
|---|---|
| Facebook Page | `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN`, `FACEBOOK_APP_SECRET`, `FACEBOOK_WEBHOOK_SECRET` |
| Instagram | `INSTAGRAM_BUSINESS_ACCOUNT_ID`, `INSTAGRAM_ACCESS_TOKEN` (both optional: Instagram uses the Facebook Page connection) |
| Threads | `THREADS_ACCESS_TOKEN`, `THREADS_USER_ID` |
| X | `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET` |
| TikTok | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` |
| Ad tracking | `X_PIXEL_ID`, `X_PIXEL_TOKEN`, `TIKTOK_PIXEL_ID`, `TIKTOK_ACCESS_TOKEN` |

Not kept here: WhatsApp, Mautic, email, database and Paystack settings (still in the `.env`), and the web app's `NEXT_PUBLIC_*` pixel ids (they are built into the pages).

## How it is protected

- Every value, secret or not, is stored as AES-256-GCM ciphertext with a fresh random IV (`enc:v1:<iv>:<tag>:<ciphertext>`). The credential's own name is part of what is
  authenticated, so a ciphertext copied from one row to another is refused.
- The key is **`CREDENTIALS_ENCRYPTION_KEY`** in the server's `.env` (32 random bytes as base64; `openssl rand -base64 32`). It is not in the database, so a database
  copy or backup alone reveals nothing. **Keep a copy of the key somewhere safe.** Lose it and the saved values cannot be read: enter them again in Settings.
- The Settings page is never sent a secret. It is told whether one is set, where it came from and, for a secret of 12 or more characters, its last four characters.
  To change a secret you type the new value; leave a box empty to keep the saved one. Ids (Page ID, pixel IDs, client key) are shown, because they are not secret.
- Saving, removing and testing need the `credential.update` permission; seeing the page needs `credential.read` (the admin role has both). The audit log records each
  change with the values redacted (every secret's name contains `token`, `secret` or `key`, and a test checks that).
- A check ("Test connection") makes one harmless read against the platform with the saved values and reports the platform's own wording. X may charge a fraction of a cent for it.

## Which value wins

1. A name that has a row in the table (even an empty one) is read from the table. **Removing** a credential in Settings empties it and keeps the row, so the `.env` value does not come back in its place.
2. A name with no row is read from the `.env`.
3. On every start, each name that has a value in the `.env` and **no row** is copied into the table, encrypted (`source = ENV_SEED`). That is how the existing `.env` values were brought in without anyone handling them.
   After that the `.env` copy is only a fallback: **a later change to the `.env` does not override the table.** Change it in Settings.
4. The server keeps a copy in memory and re-reads the table every 30 seconds, so a change saved through one backend slot reaches the other within that time.

Without `CREDENTIALS_ENCRYPTION_KEY` nothing is read from or written to the table: the app keeps working from the `.env`, Settings says it cannot save, and no plaintext is ever stored.
If a saved value cannot be opened (the key was changed), the field says so, the `.env` value is used meanwhile, and entering the value again fixes it.

## Rotating the key

There is no automatic re-encryption. To change the key: put the new key in `.env`, deploy, then re-enter each credential in Settings (the old rows cannot be opened and show
"cannot be opened"). Doing this deliberately is the same as the recovery after losing the key.

## Once everything works

The `.env` still holds the plaintext values it always held. When Settings shows every group as expected and the checks pass, those lines can be removed from the `.env`
(keep `CREDENTIALS_ENCRYPTION_KEY`, `DATABASE_URL` and `JWT_SECRET`, which cannot live in the database). Remove them only after confirming Settings holds each value: the table is then the only copy.
