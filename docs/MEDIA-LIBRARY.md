# Media library

Portal > **Media** is every image on the site in one place. Upload (several at once, or drag and drop), search by file name,
crop, and copy a link. The same library feeds the **Choose existing** button wherever an image is set: product photos, page
content, and blog covers.

## Cropping replaces the image

Cropping changes the image itself. It keeps its address, so every product, page and post already using it now shows the
cropped picture, and nothing needs re-linking. There is one image in the library, not two.

- **Crop** opens a box you drag and resize, with shape presets (Free, Square 1:1, Original shape, 4:5, 3:4, 4:3, 16:9). A live
  readout shows the pixel size and warns when the result is small.
- **Make square** is one click: the largest centred square, confirmed first. To choose *which part* is kept, use Crop > Square 1:1
  and drag the box.
- **Restore previous version** undoes the last crop and puts back the earlier picture exactly. The picture as it was before each
  crop is kept (the last 5 per image) under `versions/` in the object store, never listed as a library image.
- In the picker, each image has **Crop** and **Square** buttons; after cropping, the image is used straight away.
- A camera photo is cropped as it appears (its rotation is respected). JPEG, PNG, WebP and AVIF keep their format; GIF and SVG
  become PNG (an animated GIF loses its animation, which Restore brings back).

## How it works

| Piece | Where |
|---|---|
| Table `MediaAsset` (name, size, dimensions, previous versions) | `backend/prisma/schema.prisma`, migration `20261105090000_add_media_asset` |
| Upload, library list + search, crop, restore | `backend/src/media/media.service.ts` and `media.controller.ts` |
| Media manager page | `web/app/portal/media/page.tsx` |
| Picker used by every image field | `web/app/portal/components/image-picker.tsx` |
| Crop dialog | `web/app/portal/components/crop-dialog.tsx` |

API: `GET /media/library?search=&cursor=`, `POST /media/upload` (`?purpose=document` for receipts), `POST /media/crop`
(`{assetId, x, y, width, height}` or `{assetId, square: true}`), `POST /media/restore` (`{assetId}`).

- **Existing images.** Anything uploaded before this table existed is added to the library the first time it is opened. Their
  name is the stored file name, since the original was never kept.
- **Receipts and scans** uploaded from Accounts payable and Petty cash are stored as *documents*: they are never offered by a picker
  or shown in the manager. (Ones uploaded before this change that were images will still appear.)
- **Caching.** An image keeps its address after a crop, so the image route sends `Cache-Control: no-cache` with an `ETag`:
  browsers and CDNs check back and get either "not modified" (cheap) or the new picture. The storefront's own image optimiser may
  take up to about a minute to pick up a change. The portal adds a version marker (`?v=`) only for what it *displays*; what is saved
  in a product or page is always the plain address.
- **Cropping is destructive until restored.** It changes the picture everywhere it is used, which is the point; the confirm text
  and the dialog say so.

## Deploying

The backend now depends on `sharp` (a native image library; the Alpine build installs its prebuilt binary the way the web app's
does), so the backend image must be rebuilt, not just restarted. Apply the migration, then open Portal > Media once to import the
existing images.

## Not included

Deleting images, renaming them, and showing where an image is used are not part of this.
