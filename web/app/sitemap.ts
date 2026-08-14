import type { MetadataRoute } from 'next';
import { SITE_URL } from './lib/site';

/**
 * Sitemap, including every live listing.
 *
 * Listings are the pages worth crawling and they change as units sell, so the
 * sitemap is generated per request rather than frozen at build: a unit listed
 * this morning should be discoverable this afternoon, not at the next deploy.
 */

const API_BASE_URL = (
  process.env.INTERNAL_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:3100'
).replace(/\/$/, '');

// Revalidate hourly. Listings do not change minute to minute, and this keeps a
// crawler hitting the sitemap from putting load on the API.
export const revalidate = 3600;

type PublicListing = { id: string; updatedAt?: string };

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/properties`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/areas`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/listings`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    { url: `${SITE_URL}/services`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/contact`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
  ];

  try {
    const response = await fetch(`${API_BASE_URL}/public/listings`, {
      next: { revalidate },
    });
    if (!response.ok) return staticRoutes;

    const listings = (await response.json()) as PublicListing[];
    return [
      ...staticRoutes,
      ...listings.map((listing) => ({
        url: `${SITE_URL}/listings/${listing.id}`,
        lastModified: listing.updatedAt ? new Date(listing.updatedAt) : now,
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      })),
    ];
  } catch {
    // A sitemap missing its listings is far better than a build or request
    // that fails outright because the API was briefly unreachable.
    return staticRoutes;
  }
}
