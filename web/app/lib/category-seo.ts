/**
 * Search titles, headings and descriptions for the category pages.
 *
 * The categories are named for the stockroom ("Smart Casuals", "Officials"); shoppers search for "smart casual shoes"
 * or "official shoes in Nairobi". The words below bridge the two. Descriptions are built from the live products in
 * the category, so a watch page names watch brands and a price instead of the sneaker line every page used to share.
 */
import { formatKes, type ShopProduct } from './shop';
import { MIN_BRAND_PRODUCTS, NO_BRAND_PAGE, slugify } from './collections';

type Words = { title: string; heading: string };

const WORDS: Record<string, Words> = {
  sneakers: { title: 'Sneakers in Nairobi, Kenya', heading: 'Sneakers' },
  casuals: { title: 'Casual Shoes in Nairobi, Kenya', heading: 'Casual Shoes' },
  officials: { title: 'Official Shoes in Nairobi, Kenya', heading: 'Official Shoes' },
  'smart-casuals': { title: 'Smart Casual Shoes in Nairobi, Kenya', heading: 'Smart Casual Shoes' },
  'ladies-shoes': { title: "Ladies' Shoes in Nairobi, Kenya", heading: "Ladies' Shoes" },
  watches: { title: 'Watches in Nairobi, Kenya', heading: 'Watches' },
};

export const categoryWords = (slug: string, name: string): Words => WORDS[slug] ?? { title: `${name} in Nairobi, Kenya`, heading: name };

/**
 * The brands that make up a category, most common first. Only brands with enough products to have their own page are
 * named (the brand field also holds model names such as "Mocassin"), and luxury names that only appear as "styled
 * after" are left out.
 */
function topBrands(products: ShopProduct[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const product of products) {
    const brand = product.brand?.trim();
    if (!brand || NO_BRAND_PAGE.has(slugify(brand))) continue;
    counts.set(brand, (counts.get(brand) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, n]) => n >= MIN_BRAND_PRODUCTS)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([brand]) => brand);
}

export function categoryDescription(slug: string, name: string, products: ShopProduct[]): string {
  const noun = categoryWords(slug, name).heading.toLowerCase();
  const prices = products.map((p) => p.priceFrom).filter((n) => Number.isFinite(n) && n > 0);
  const brands = topBrands(products, 3);
  const count = products.length;
  return [
    count
      ? `${categoryWords(slug, name).heading}: ${count} style${count === 1 ? '' : 's'}${prices.length ? ` from ${formatKes(Math.min(...prices))}` : ''}${brands.length ? `, including ${brands.join(', ')}` : ''}.`
      : `${categoryWords(slug, name).heading} at Drip Emporium.`,
    `Try ${noun === 'watches' ? 'them' : 'a pair'} on at Dubai Merchants Mall, Ronald Ngala Street, Nairobi, or order with delivery across Kenya.`,
  ].join(' ');
}

/** Where to go next from a category, for shoppers whose search is wider than the stockroom name. */
export const RELATED_CATEGORIES: Record<string, string[]> = {
  'smart-casuals': ['officials', 'casuals', 'sneakers'],
  officials: ['smart-casuals', 'casuals'],
  casuals: ['smart-casuals', 'officials', 'sneakers'],
};
