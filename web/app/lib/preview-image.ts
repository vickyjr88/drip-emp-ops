/**
 * Link preview images.
 *
 * A page passes its own image when it has one (see the `image` field on
 * SeoDefaults in page-metadata.ts) -- home and about do this with their CMS
 * hero image, for instance. A page with none of its own simply gets no
 * og:image, which is a better outcome than a card pointing at a broken URL.
 */

import { contentValue, fetchPageContent } from './page-content';
import { absoluteUrl } from './site';

/** Open Graph's recommended aspect; most scrapers crop toward 1.91:1. */
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

/**
 * Open Graph image entry, ready to spread into a metadata object. Dimensions
 * are declared so scrapers can lay the card out before the image loads.
 */
/**
 * The address of a picture's link-preview version: the same image recomposed to exactly 1200x630 as a small JPEG
 * (see /og/share.jpg and lib/og-image.ts). Pointing og:image at the raw upload gave no preview in WhatsApp,
 * which drops images over ~300 KB.
 */
export function sharePreviewUrl(source: string) {
  return absoluteUrl(`/og/share.jpg?src=${encodeURIComponent(source)}`);
}

export function openGraphImages(path: string, explicit?: string | null) {
  if (!explicit) return undefined;
  return [
    {
      url: sharePreviewUrl(explicit),
      width: OG_IMAGE_WIDTH,
      height: OG_IMAGE_HEIGHT,
      alt: 'Drip Emporium',
      type: 'image/jpeg',
    },
  ];
}

/**
 * The brand banner (the home page hero), for pages with no picture of their own -- a category, a blog post with no
 * cover. A shared link to those otherwise shows a bare card with no image; the banner at least says whose shop it is.
 */
export async function brandPreviewImage(): Promise<string | null> {
  const home = await fetchPageContent('home');
  return contentValue(home, 'hero.backgroundImage', '').trim() || null;
}

/** Absolute page URL plus its preview image, the pair every card needs. */
export function previewFor(path: string, explicit?: string | null) {
  return { url: absoluteUrl(path), images: openGraphImages(path, explicit) };
}
