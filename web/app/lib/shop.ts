/**
 * The public catalogue, as the storefront sees it.
 *
 * Deliberately mirrors what the API returns and nothing more: the shop window
 * has no business knowing cost, trade pricing or per-branch quantities, so
 * those never appear in these types either.
 */

const BROWSER_API = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
const SERVER_API = (process.env.INTERNAL_API_BASE_URL || BROWSER_API).replace(/\/$/, '');
const API = typeof window === 'undefined' ? SERVER_API : BROWSER_API;

export type ShopVariant = {
  id: string;
  sku: string;
  size: string;
  priceKes: number;
  /** Retail before the markdown. Null when nothing is discounted. */
  wasPriceKes?: number | null;
  offerLabel?: string | null;
  /** Availability, not a count. */
  inStock: boolean;
};

export type ShopProduct = {
  /** Set when any size is discounted, so a card can badge itself. */
  onOffer?: boolean;
  offerLabel?: string | null;
  id: string;
  slug: string;
  name: string;
  brand?: string | null;
  description?: string | null;
  imageUrls: string[];
  category?: { name: string; slug: string } | null;
  variants: ShopVariant[];
  priceFrom: number;
  priceTo: number;
  sizesInStock: string[];
  anyInStock: boolean;
  related?: ShopProduct[];
};

export type ShopCategory = { name: string; slug: string; productCount: number };
export type ShopStore = { code: string; name: string; location?: string | null };

/** A failed fetch returns empty rather than throwing: a shop window that is
 *  missing a section still sells; one that shows an error page does not. */
async function get<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${API}${path}`, { cache: 'no-store' });
    if (!response.ok) return fallback;
    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

export function fetchProducts(query: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return get<ShopProduct[]>(`/shop/products${suffix}`, []);
}

export function fetchProduct(slug: string) {
  return get<ShopProduct | null>(`/shop/products/${slug}`, null);
}

export const fetchCategories = () => get<ShopCategory[]>('/shop/categories', []);
export const fetchFilters = () => get<{ brands: string[]; sizes: string[] }>('/shop/filters', { brands: [], sizes: [] });
export const fetchStores = () => get<ShopStore[]>('/shop/stores', []);

export function formatKes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 'Price on request';
  return `KSh ${Math.round(value).toLocaleString('en-KE')}`;
}

/** "KSh 3,499" when every size is the same, "from KSh 3,499" when they differ. */
export function priceLabel(product: ShopProduct) {
  if (product.priceFrom <= 0) return 'Price on request';
  if (product.priceFrom === product.priceTo) return formatKes(product.priceFrom);
  return `from ${formatKes(product.priceFrom)}`;
}
