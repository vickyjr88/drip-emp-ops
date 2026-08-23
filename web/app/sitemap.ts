import type { MetadataRoute } from 'next';
import { SITE_URL } from './lib/site';

/**
 * Sitemap, including every active product and category.
 *
 * Products are the pages worth crawling and they change as stock is added or
 * retired, so the sitemap is generated per request rather than frozen at
 * build: a shoe listed this morning should be discoverable this afternoon,
 * not at the next deploy.
 */

const API_BASE_URL = (
  process.env.INTERNAL_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:3100'
).replace(/\/$/, '');

// Revalidate hourly. The catalogue does not change minute to minute, and this
// keeps a crawler hitting the sitemap from putting load on the API.
export const revalidate = 3600;

type Product = { slug: string; updatedAt?: string };
type Category = { slug: string };

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/shop`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/contact`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    // Higher priority than the other static pages: FAQ answers are what people
    // search for by name ("does drip emporium deliver"), so it is the one most
    // worth indexing.
    { url: `${SITE_URL}/faq`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
  ];

  try {
    const [productsResponse, categoriesResponse] = await Promise.all([
      fetch(`${API_BASE_URL}/shop/products`, { next: { revalidate } }),
      fetch(`${API_BASE_URL}/shop/categories`, { next: { revalidate } }),
    ]);
    if (!productsResponse.ok) return staticRoutes;

    const products = (await productsResponse.json()) as Product[];
    const categories = categoriesResponse.ok ? ((await categoriesResponse.json()) as Category[]) : [];

    return [
      ...staticRoutes,
      ...categories.map((category) => ({
        url: `${SITE_URL}/shop?category=${category.slug}`,
        lastModified: now,
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      })),
      ...products.map((product) => ({
        url: `${SITE_URL}/shop/${product.slug}`,
        lastModified: product.updatedAt ? new Date(product.updatedAt) : now,
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      })),
    ];
  } catch {
    // A sitemap missing the catalogue is far better than a build or request
    // that fails outright because the API was briefly unreachable.
    return staticRoutes;
  }
}
