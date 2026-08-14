/**
 * Link preview images.
 *
 * Listings and projects use their own featured image. Every other page --
 * home, listings index, about, services, contact, the 404 -- has no image of
 * its own, so it borrows one from the live portfolio rather than shipping a
 * static placeholder that goes stale as the developments change.
 *
 * "Random" here is deterministic per page, not per request: a scraper that
 * fetches a URL twice, or two people sharing the same link, should not get
 * different cards. The path seeds the choice, so /about always draws the same
 * image while /services draws a different one.
 */

import { absoluteUrl } from './site';

const API_BASE_URL = (
  process.env.INTERNAL_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:3100'
).replace(/\/$/, '');

/** Open Graph's recommended aspect; most scrapers crop toward 1.91:1. */
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

type PublicListing = {
  featuredImageUrl?: string | null;
  galleryImages?: string[] | null;
  project?: { name?: string | null } | null;
};

/**
 * Every distinct image the public listings expose, in a stable order.
 *
 * Revalidated hourly: a scraper hitting several pages should not fan out into
 * a request per page, and the portfolio's imagery does not change by the
 * minute.
 */
async function portfolioImages(): Promise<string[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/public/listings`, {
      next: { revalidate: 3600 },
    });
    if (!response.ok) return [];

    const listings = (await response.json()) as PublicListing[];
    const seen = new Set<string>();
    for (const listing of listings) {
      if (listing.featuredImageUrl) seen.add(listing.featuredImageUrl);
      for (const image of listing.galleryImages || []) seen.add(image);
    }

    // Sorted so the order does not depend on how the API happened to return
    // listings that day -- otherwise a page's image would drift as units sell.
    const all = Array.from(seen).sort();

    // Prefer images actually uploaded for these developments. The demo seed
    // ships Unsplash stock, and a link preview showing someone else's building
    // is worse than showing fewer of your own. Falls back to whatever exists
    // if a fresh install has no uploads yet.
    const uploaded = all.filter((image) => !image.includes('unsplash.com'));
    return uploaded.length > 0 ? uploaded : all;
  } catch {
    return [];
  }
}

/** Stable small hash, so a given path always picks the same image. */
function hashPath(path: string): number {
  let hash = 0;
  for (let index = 0; index < path.length; index += 1) {
    hash = (hash << 5) - hash + path.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * The handful of pages most likely to be shared, given fixed offsets.
 *
 * Hashing alone clusters badly over a pool this small -- home and /listings
 * collided on the first attempt, so the two most-shared links previewed
 * identically. Spreading the known pages by index guarantees they differ as
 * long as there are enough images; everything else still falls back to the
 * hash.
 */
const SPREAD: Record<string, number> = {
  '/': 0,
  '/shop': 1,
  '/about': 2,
  '/contact': 3,
  '/terms': 4,
  '/privacy': 5,
  '/404': 6,
};

/**
 * An image for a page that has none of its own.
 *
 * Returns undefined when the portfolio has no imagery yet, in which case the
 * caller should omit og:image entirely -- a card with no image is better than
 * one pointing at a broken URL.
 */
export async function previewImageFor(path: string): Promise<string | undefined> {
  const images = await portfolioImages();
  if (images.length === 0) return undefined;

  const index = path in SPREAD ? SPREAD[path] : hashPath(path);
  return images[index % images.length];
}

/**
 * Open Graph image entry, ready to spread into a metadata object. Dimensions
 * are declared so scrapers can lay the card out before the image loads.
 */
export async function openGraphImages(path: string, explicit?: string | null) {
  const url = explicit || (await previewImageFor(path));
  if (!url) return undefined;
  return [
    {
      url,
      width: OG_IMAGE_WIDTH,
      height: OG_IMAGE_HEIGHT,
      alt: 'Drip Emporium property',
    },
  ];
}

/** Absolute page URL plus its preview image, the pair every card needs. */
export async function previewFor(path: string, explicit?: string | null) {
  const images = await openGraphImages(path, explicit);
  return { url: absoluteUrl(path), images };
}
