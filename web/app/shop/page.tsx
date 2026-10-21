import type { Metadata } from 'next';
import { Suspense } from 'react';
import { seoMetadata } from '../lib/page-metadata';
import { fetchCategories, fetchFilters, fetchProducts, resolveShopCategory } from '../lib/shop';
import { ShopClient } from './shop-client';

// Any of these in the URL means a filtered or searched view of the same catalogue, not a page of its own.
const VIEW_PARAMS = ['brand', 'size', 'search', 'sort', 'inStockOnly'];

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}): Promise<Metadata> {
  const filtered = VIEW_PARAMS.some((key) => Boolean(first(searchParams[key])));
  const metadata = await seoMetadata({
    key: 'properties',
    path: '/shop',
    title: 'Shop Sneakers & Streetwear',
    description:
      'Nike, Adidas, Jordan and Puma in EUR 36–46. Filter by size, brand and price. Ronald Ngala Street, Nairobi.',
    shareTitle: 'Shop Sneakers in Nairobi | Drip Emporium',
  });
  // Kept out of the index (links still followed): the canonical already points at /shop, and a
  // filtered grid is thin, duplicate content that should not compete with the pages it filters.
  return filtered ? { ...metadata, robots: { index: false, follow: true } } : metadata;
}

// Rendered per request: a crawler or a shopper's first paint should see the
// grid for whatever filters are actually in the URL (a shared/bookmarked
// filtered link included), not always the unfiltered catalogue.
export const dynamic = 'force-dynamic';

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const query = {
    category: resolveShopCategory(first(searchParams.category)),
    brand: first(searchParams.brand),
    size: first(searchParams.size),
    search: first(searchParams.search),
    sort: first(searchParams.sort),
    inStockOnly: first(searchParams.inStockOnly) === 'true' ? 'true' : undefined,
  };

  // No customer token here -- this is the anonymous, server-rendered first
  // paint a crawler sees. ShopClient re-fetches client-side once it knows
  // the signed-in customer's tier, the same way the product detail page
  // already does its own retail-to-reseller price update after load.
  const [initialProducts, initialCategories, initialFilters] = await Promise.all([
    fetchProducts(query),
    fetchCategories(),
    fetchFilters(),
  ]);

  // useSearchParams needs a Suspense boundary or the route fails to prerender.
  return (
    <Suspense fallback={null}>
      <ShopClient
        initialProducts={initialProducts}
        initialCategories={initialCategories}
        initialBrands={initialFilters.brands}
        initialSizes={initialFilters.sizes}
      />
    </Suspense>
  );
}
