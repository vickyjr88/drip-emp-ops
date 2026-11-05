import type { WatchProduct } from './watches';

/**
 * Rows for the Watches product feeds (Meta, Google, X catalogue format). One row per option: a plain watch is one row, a
 * watch in two strap colours is two. Built from the watches line only, so the shoe feeds never carry a watch and this
 * feed never carries a shoe. There is no size column: a watch has none.
 */
export type WatchFeedRow = {
  id: string; title: string; description: string; link: string; imageLink: string;
  availability: 'in stock' | 'available for order'; price: string; condition: 'new'; brand: string; mpn: string;
  itemGroupId: string; productType: string; googleCategory: string; gender: 'unisex'; ageGroup: 'adult'; customLabel0: string;
};

/** `siteUrl` is passed in (not imported) so this stays a plain module that tests can load. */
export function watchFeedRows(products: WatchProduct[], siteUrl: string): WatchFeedRow[] {
  const rows: WatchFeedRow[] = [];
  for (const watch of products) {
    // The feeds need a picture; a watch without one is left out rather than listed broken.
    const image = watch.imageUrls[0];
    if (!image) continue;
    for (const variant of watch.variants) {
      rows.push({
        id: variant.sku,
        title: watch.variants.length > 1 ? `${watch.name} - ${variant.name}` : watch.name,
        description: watch.description || watch.name,
        link: `${siteUrl}/watches/${watch.slug}`,
        imageLink: image,
        availability: variant.inStock ? 'in stock' : 'available for order',
        price: `${variant.priceKes.toFixed(2)} KES`,
        condition: 'new',
        brand: watch.brand || 'Drip Emporium',
        mpn: variant.sku,
        itemGroupId: watch.id,
        productType: ['Watches', watch.brand].filter(Boolean).join(' > '),
        googleCategory: 'Apparel & Accessories > Jewelry > Watches',
        gender: 'unisex',
        ageGroup: 'adult',
        customLabel0: 'WATCH',
      });
    }
  }
  return rows;
}
