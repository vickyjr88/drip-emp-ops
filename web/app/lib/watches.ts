/**
 * The Watches line, as the storefront sees it. Separate from lib/shop.ts on purpose: watches are never mixed with the
 * shoe catalogue, and every call here goes to /watches/*. A watch has no size, so none appears in these types.
 */

import type { ShopProduct } from './shop';

const BROWSER_API = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
const SERVER_API = (process.env.INTERNAL_API_BASE_URL || BROWSER_API).replace(/\/$/, '');
const API = typeof window === 'undefined' ? SERVER_API : BROWSER_API;

/** A choice within one watch (a strap or dial colour). Absent for a watch that comes one way. */
export type WatchOption = { id: string; name: string };
export type WatchProduct = Omit<ShopProduct, 'related'> & { options: WatchOption[]; related?: WatchProduct[] };
export type WatchBrand = { name: string; slug: string; count: number };

async function get<T>(path: string, fallback: T, token?: string | null): Promise<T> {
  try {
    const response = await fetch(`${API}${path}`, {
      ...(typeof window === 'undefined' ? { next: { revalidate: 60 } } : { cache: 'no-store' as const }),
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    });
    if (!response.ok) return fallback;
    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

export function fetchWatches(query: Record<string, string | undefined> = {}, token?: string | null) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => { if (value) params.set(key, value); });
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return get<WatchProduct[]>(`/watches/products${suffix}`, [], token);
}
export const fetchWatch = (slug: string, token?: string | null) => get<WatchProduct | null>(`/watches/products/${slug}`, null, token);
export const fetchWatchBrands = () => get<WatchBrand[]>('/watches/brands', []);
/** How many watches are on sale: the menu shows a Watches link only when there are some. */
export const fetchWatchCount = async () => (await get<{ count: number }>('/watches/status', { count: 0 })).count;

export const WATCHES_PATH = '/watches';
export const watchPath = (slug: string) => `/watches/${slug}`;
export const watchBrandPath = (slug: string) => `/watches/brand/${slug}`;
export const brandSlug = (brand: string) => brand.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
