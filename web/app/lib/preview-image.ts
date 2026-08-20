/**
 * Link preview images.
 *
 * A page passes its own image when it has one (see the `image` field on
 * SeoDefaults in page-metadata.ts) -- home and about do this with their CMS
 * hero image, for instance. A page with none of its own simply gets no
 * og:image, which is a better outcome than a card pointing at a broken URL.
 */

import { absoluteUrl } from './site';

/** Open Graph's recommended aspect; most scrapers crop toward 1.91:1. */
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

/**
 * Open Graph image entry, ready to spread into a metadata object. Dimensions
 * are declared so scrapers can lay the card out before the image loads.
 */
export function openGraphImages(path: string, explicit?: string | null) {
  if (!explicit) return undefined;
  return [
    {
      url: explicit,
      width: OG_IMAGE_WIDTH,
      height: OG_IMAGE_HEIGHT,
      alt: 'Drip Emporium',
    },
  ];
}

/** Absolute page URL plus its preview image, the pair every card needs. */
export function previewFor(path: string, explicit?: string | null) {
  return { url: absoluteUrl(path), images: openGraphImages(path, explicit) };
}
