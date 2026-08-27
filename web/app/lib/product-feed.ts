import { SITE_URL } from './site';
import type { ShopProduct } from './shop';

/**
 * Shared row-shaping for the X (Twitter) Shopping product feeds.
 *
 * X's own docs point catalog operators at Shopping Manager's "Product Data
 * Specifications" for the authoritative field list rather than publishing one
 * on a fetchable page, so the field set here is the common denominator with
 * Google Merchant Center / Meta Catalog feeds that X's docs describe itself
 * as compatible with. Both the XML and CSV feeds build from this so testing
 * one against Shopping Manager and adjusting a field keeps the other in sync.
 *
 * One row per variant: price and stock live on the variant, not the product,
 * and X catalogs are priced per-SKU.
 */

export type FeedRow = {
  id: string;
  title: string;
  description: string;
  link: string;
  imageLink: string;
  availability: 'in stock' | 'out of stock';
  price: string;
  condition: 'new';
  brand: string;
  mpn: string;
  itemGroupId: string;
  productType: string;
};

export function feedRows(products: ShopProduct[]): FeedRow[] {
  const rows: FeedRow[] = [];

  for (const product of products) {
    const image = product.imageUrls?.[0];
    if (!image) continue;

    const link = `${SITE_URL}/shop/${product.slug}`;
    const description = product.description || product.name;

    for (const variant of product.variants) {
      rows.push({
        id: variant.sku,
        title: `${product.name} - ${variant.size}`,
        description,
        link,
        imageLink: image,
        // canOrder is drop-ship-always-true and would mark every variant "in
        // stock" regardless of actual shelf stock -- inStock is the real signal.
        availability: variant.inStock ? 'in stock' : 'out of stock',
        price: `${variant.priceKes.toFixed(2)} KES`,
        condition: 'new',
        brand: product.brand || 'Drip Emporium',
        mpn: variant.sku,
        itemGroupId: product.id,
        productType: product.category?.name ?? '',
      });
    }
  }

  return rows;
}
