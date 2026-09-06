/**
 * The public blog, as the storefront sees it -- published posts only,
 * mirroring how shop.ts's fetchProduct only ever returns what a shopper
 * should see.
 */

const BROWSER_API = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
const SERVER_API = (process.env.INTERNAL_API_BASE_URL || BROWSER_API).replace(/\/$/, '');
const API = typeof window === 'undefined' ? SERVER_API : BROWSER_API;

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  coverImageUrl: string | null;
  author: string;
  publishedAt: string;
  updatedAt: string;
};

type PagedResult<T> = { items: T[]; total: number; skip: number; take: number };

const EMPTY_PAGE: PagedResult<BlogPost> = { items: [], total: 0, skip: 0, take: 0 };

/** A failed fetch returns empty rather than throwing -- a blog outage should
 *  never take the rest of the site down with it. */
async function get<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${API}${path}`, { cache: 'no-store' });
    if (!response.ok) return fallback;
    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

export function fetchBlogPosts(params: { skip?: number; take?: number } = {}) {
  const query = new URLSearchParams();
  if (params.skip) query.set('skip', String(params.skip));
  if (params.take) query.set('take', String(params.take));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return get<PagedResult<BlogPost>>(`/public/blog-posts${suffix}`, EMPTY_PAGE);
}

export function fetchBlogPost(slug: string) {
  return get<BlogPost | null>(`/public/blog-posts/${slug}`, null);
}

/** "3 June 2026", matching the site's other long-form date displays. */
export function formatBlogDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** A rough words-per-minute estimate for a "5 min read" label -- helpful
 *  context before someone commits to an article. Strips tags first since
 *  body is stored as HTML; an exact word count isn't the point, a plausible
 *  minute figure is. */
export function readingTime(html: string) {
  const words = html.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
