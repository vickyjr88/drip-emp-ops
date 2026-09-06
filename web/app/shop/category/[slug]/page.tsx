import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { JsonLd, SITE_NAME, absoluteUrl } from '../../../lib/site';
import { fetchCategories, fetchFilters, fetchProducts } from '../../../lib/shop';
import { ShopClient } from '../../shop-client';

// Rendered per request, matching /shop: a crawler's first paint should see
// the real grid for this category, and stock/price are never stale.
export const dynamic = 'force-dynamic';

/**
 * A real, crawlable, indexable URL per category -- unlike /shop?category=x,
 * which Google treats unreliably as a parameterized variant of /shop rather
 * than a distinct page worth indexing. The category dropdown and filter
 * behavior on /shop are unchanged; this is the canonical entry point for a
 * link, a share, or a search result to land a shopper on one category.
 */
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const categories = await fetchCategories();
  const category = categories.find((item) => item.slug === params.slug);
  if (!category) return { title: 'Category not found', robots: { index: false, follow: true } };

  const description = `Shop ${category.name} at Drip Emporium -- ${category.productCount} style${
    category.productCount === 1 ? '' : 's'
  } in stock. Nike, Adidas, Jordan and Puma, EUR 36-46, two shops on Ronald Ngala Street, Nairobi.`;

  return {
    title: `${category.name} | Shop`,
    description,
    alternates: { canonical: `/shop/category/${category.slug}` },
    openGraph: { title: `${category.name} | ${SITE_NAME}`, description },
    twitter: { card: 'summary', title: `${category.name} | ${SITE_NAME}`, description },
  };
}

export default async function ShopCategoryPage({ params }: { params: { slug: string } }) {
  const categories = await fetchCategories();
  const category = categories.find((item) => item.slug === params.slug);
  if (!category) notFound();

  // No customer token here, matching /shop's own server render -- ShopClient
  // re-fetches client-side once auth resolves, same as the plain shop page.
  const [initialProducts, initialFilters] = await Promise.all([
    fetchProducts({ category: category.slug }),
    fetchFilters(),
  ]);

  return (
    <>
      <JsonLd
        data={{
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: absoluteUrl('/') },
            { '@type': 'ListItem', position: 2, name: 'Shop', item: absoluteUrl('/shop') },
            { '@type': 'ListItem', position: 3, name: category.name, item: absoluteUrl(`/shop/category/${category.slug}`) },
          ],
        }}
      />
      {/* useSearchParams needs a Suspense boundary or the route fails to prerender. */}
      <Suspense fallback={null}>
        <ShopClient
          lockedCategory={category.slug}
          initialProducts={initialProducts}
          initialCategories={categories}
          initialBrands={initialFilters.brands}
          initialSizes={initialFilters.sizes}
        />
      </Suspense>
    </>
  );
}
