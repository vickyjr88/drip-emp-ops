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
 * On-page localized copy under each category's grid -- what a search engine
 * or AI engine actually reads to understand this page is about, distinct
 * from the product cards above it (which carry little running text of their
 * own). Keyed by slug rather than generated from the category name alone,
 * since "Ladies' Shoes" and "Smart Casuals" need genuinely different framing
 * to read as written for a real shopper rather than templated. New
 * categories fall back to a generic paragraph until someone writes one
 * specific to them.
 */
const CATEGORY_COPY: Record<string, string> = {
  sneakers:
    'Looking for genuine Nike, Adidas, Jordan or Puma sneakers in Nairobi? Drip Emporium stocks authentic sneakers in EUR 36 to 46, from everyday styles like Air Force 1 and Campus to sought-after Jordan colourways, at Dubai Merchants Mall, Shop F53, Ronald Ngala Street, Nairobi CBD. Every pair can be inspected in person before you buy, and we deliver countrywide across Kenya if you would rather shop online. If the size or colourway you want is not shown as in stock, message us on WhatsApp -- we regularly source specific sizes on request.',
  casuals:
    'Everyday casual shoes for Nairobi weather and daily wear, from Drip Emporium at Dubai Merchants Mall, Shop F53, Ronald Ngala Street, Nairobi CBD. Our casuals are picked for versatility -- shoes that work with jeans on a weekday and still look right on a weekend out -- in genuine stock you can try on in the shop before paying. Countrywide delivery is available if you are ordering from outside Nairobi, with the delivery cost confirmed directly with you after checkout.',
  officials:
    'Smart, hard-wearing official shoes for the office or a formal occasion, in genuine leather stock at Drip Emporium, Dubai Merchants Mall, Shop F53, Ronald Ngala Street, Nairobi CBD. Whether you need a reliable everyday pair for work in Nairobi or something sharper for an event, our officials range is chosen for fit and durability rather than looking good only in the box. Visit the shop to try a pair on, or order online with countrywide delivery across Kenya.',
  'smart-casuals':
    'Smart casual shoes that sit between formal and everyday wear -- the pair you reach for when a full official shoe is too much but sneakers are too little. Drip Emporium stocks genuine smart casuals at Dubai Merchants Mall, Shop F53, Ronald Ngala Street, Nairobi CBD, with countrywide delivery if you are not in Nairobi. Come in and try a pair on, or message us on WhatsApp if you are after a specific size.',
  'ladies-shoes':
    "Genuine women's shoes from Drip Emporium, Dubai Merchants Mall, Shop F53, Ronald Ngala Street, Nairobi CBD. Our ladies' range is stocked in real sizes, not just what looks good in a photo, and every pair can be tried on in the shop before you commit. Order online with countrywide delivery across Kenya, or message us on WhatsApp if the size or style you want is not currently listed -- we can often source it.",
  watches:
    'Genuine watches at Drip Emporium, Dubai Merchants Mall, Shop F53, Ronald Ngala Street, Nairobi CBD. We stock watches alongside our sneaker and streetwear range for anyone finishing a look rather than just buying shoes, all inspectable in person before you buy. Countrywide delivery is available across Kenya, and we are happy to answer sizing or strap questions on WhatsApp before you order.',
};

const DEFAULT_CATEGORY_COPY = (name: string) =>
  `Shop genuine ${name} at Drip Emporium, Dubai Merchants Mall, Shop F53, Ronald Ngala Street, Nairobi CBD. Every item can be inspected in person before you buy, and we deliver countrywide across Kenya if you are ordering online. Message us on WhatsApp if the size or style you are after is not currently listed -- we can often source it.`;

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
  } in stock. Nike, Adidas, Jordan and Puma, EUR 36-46, on Ronald Ngala Street, Nairobi.`;

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
          categoryCopy={CATEGORY_COPY[category.slug] || DEFAULT_CATEGORY_COPY(category.name)}
        />
      </Suspense>
    </>
  );
}
