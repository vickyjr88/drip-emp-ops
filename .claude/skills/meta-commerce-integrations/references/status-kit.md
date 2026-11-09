# WhatsApp Status kit

Read first: `drip-crm/docs/SOCIAL-POSTING.md` (section "WhatsApp Status kit"), `backend/src/social-posting/status-kit.service.ts`, `status-image.ts`, `web/app/portal/status-kit/status-kit-view.tsx`.

## The fact that decides the design

**WhatsApp has no way to post a Status automatically.** The Cloud API cannot; services that do it (Whapi, Wassenger and similar) log in as a hidden linked device, which breaks WhatsApp's terms and risks banning the shop's number. Do not build or recommend that on the real number.
Paid Status ads exist via Ads Manager (unverified details); they are campaigns, not posts. So the kit prepares the post and a person shares it in ten seconds.

## What it does

Each day it chooses `STATUS_KIT_COUNT` (default 3, max 8) products the way the feed posts are chosen (separate rotation, cooldown capped at 14 days). For each it makes a **1080x1920 JPEG**: shop wordmark, the product photo (1080x1080, cropped by attention), the name (shrinks to fit two lines),
price (the offer in gold with the old price struck through), sizes in short form, "Reply to this status to order", website and WhatsApp number. Text beside it: name, price, sizes, "Reply to this status to order", link tagged `utm_source=whatsapp&utm_campaign=status`.
The screen (made for the shop's phone): **Share to WhatsApp** (Web Share API with the image `File` and the text; WhatsApp > My status), Download, Copy text, Swap product, Mark as posted (moves the product to the back of the line).
The day's kit is made once (`slotKey = "<day>#<n>"`, channel `STATUS`, status READY → POSTED) and is identical for everyone who opens it; a product that sells out is flagged and its picture is no longer made.

## Hard-won implementation notes

- **Text in images**: the `sharp` text input with `fontfile` silently fell back to a system font here (fontconfig had no config), and a server may have no fonts. Draw text from the **font outlines** with `opentype.js` (`font.getPath(...).toPathData()`) into an SVG
  and composite the photo under it with sharp. The brand serif (Libre Caslon Text Bold) is embedded as a base64 string in `brand-font.ts`, so the Docker image needs no extra files. Avoid emoji in the picture; they need a colour font.
- Letter-spacing is done by placing glyphs one at a time. Wrap by measuring `getAdvanceWidth`, shrink the size until it fits the allowed lines, end with an ellipsis if it still does not.
- Fetch the product photo server-side with a 20 s timeout and a 20 MB cap; pictures are made on request and not stored.
- The portal fetches the picture with the login token and shows it from a blob. A long link in the text must wrap (`overflow-wrap: anywhere`) or the card widens past a phone; the image takes `height: auto` (9:16 is already the picture's shape).
- Sizes in short form: `compactSizes(["EUR 36","EUR 37","EUR 38","EUR 41"]) = "EUR 36–38, 41"` (shared prefix once, runs collapsed, non-numeric kept as given). The Facebook/Threads captions still list sizes in full; shortening them was offered, not done.

## Multi-tenant port

Per-shop kit rows, per-shop wordmark (shop name; the Libre Caslon wordmark font is Drip Emporium's, decide per shop whether to keep it or let a shop choose from a few bundled OFL fonts), per-shop colours (the picture uses near-black, off-white and gold: take them from the shop theme settings Nairobi Gents already has),
the shop's WhatsApp number and origin. Sections change the layout: watches and devices have no sizes; the sizes line must disappear cleanly.

## Verify

Look at the pictures (a long name, an offer, no sizes, thirty sizes), measure the displayed ratio in the browser (0.563), run the screen at 375 px, then try Share on a real phone after deploy (the share sheet cannot be tested in a desktop browser; it falls back to Download).

## As ported to Nairobi Gents

See "Phase 5 as built" in `nairobi-gents-plan.md`: per-shop theme colours with a contrast guarantee, section-aware option lines, text laid out before the photo is sized, a careful photo fetch, `STATUS` rows in `SocialPost`.
