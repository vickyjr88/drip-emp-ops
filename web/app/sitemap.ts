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

/** The newest change in a list of dated rows, or undefined when none has a usable date. */
function latest(dates: Array<string | undefined>): Date | undefined {
  const times = dates.map((d) => (d ? new Date(d).getTime() : NaN)).filter((t) => Number.isFinite(t));
  return times.length ? new Date(Math.max(...times)) : undefined;
}
type Category = { slug: string };
type BlogPost = { slug: string; updatedAt?: string };

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // lastModified is only ever a date something actually changed: a date that is "now" on every request
  // teaches search engines to ignore it. The static pages are edited in the CMS with no change date
  // available here, so they carry none; the catalogue pages use the newest product change.
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/shop`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/about`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/contact`, changeFrequency: 'monthly', priority: 0.6 },
    // Higher priority than the other static pages: FAQ answers are what people
    // search for by name ("does drip emporium deliver"), so it is the one most
    // worth indexing.
    { url: `${SITE_URL}/faq`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/delivery`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/affiliate`, changeFrequency: 'monthly', priority: 0.5 },
  ];

  try {
    const [productsResponse, categoriesResponse, blogResponse] = await Promise.all([
      fetch(`${API_BASE_URL}/shop/products`, { next: { revalidate } }),
      fetch(`${API_BASE_URL}/shop/categories`, { next: { revalidate } }),
      fetch(`${API_BASE_URL}/public/blog-posts?take=200`, { next: { revalidate } }),
    ]);
    if (!productsResponse.ok) return staticRoutes;

    const products = (await productsResponse.json()) as Product[];
    const categories = categoriesResponse.ok ? ((await categoriesResponse.json()) as Category[]) : [];
    const blogPosts = blogResponse.ok ? ((await blogResponse.json()).items as BlogPost[]) : [];

    const catalogueChanged = latest(products.map((p) => p.updatedAt));
    const blogChanged = latest(blogPosts.map((p) => p.updatedAt));
    const dated = staticRoutes.map((route) =>
      route.url === `${SITE_URL}/` || route.url === `${SITE_URL}/shop`
        ? { ...route, ...(catalogueChanged ? { lastModified: catalogueChanged } : {}) }
        : route,
    );

    return [
      ...dated,
      ...categories.map((category) => ({
        url: `${SITE_URL}/shop/category/${category.slug}`,
        ...(catalogueChanged ? { lastModified: catalogueChanged } : {}),
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      })),
      ...products.map((product) => ({
        url: `${SITE_URL}/shop/${product.slug}`,
        ...(product.updatedAt ? { lastModified: new Date(product.updatedAt) } : {}),
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      })),
      { url: `${SITE_URL}/blog`, ...(blogChanged ? { lastModified: blogChanged } : {}), changeFrequency: 'weekly' as const, priority: 0.7 },
      ...blogPosts.map((post) => ({
        url: `${SITE_URL}/blog/${post.slug}`,
        ...(post.updatedAt ? { lastModified: new Date(post.updatedAt) } : {}),
        changeFrequency: 'monthly' as const,
        priority: 0.6,
      })),
    ];
  } catch {
    // A sitemap missing the catalogue is far better than a build or request
    // that fails outright because the API was briefly unreachable.
    return staticRoutes;
  }
}
