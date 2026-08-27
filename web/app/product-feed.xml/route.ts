import { NextResponse } from 'next/server';
import { SITE_URL } from '../lib/site';
import type { ShopProduct } from '../lib/shop';

/**
 * Product feed for X (Twitter) Shopping / Ads catalogs.
 *
 * X's catalog manager can pull a scheduled feed from a public URL instead of
 * a manual upload -- this is that URL. Format follows the same RSS 2.0 /
 * `g:` namespace convention as Google Merchant Center and Meta Catalog, which
 * X's catalog ingestion also accepts. One `<item>` per variant, since price
 * and stock live on the variant, not the product, and X catalogs are priced
 * per-SKU.
 *
 * https://developer.x.com/en/docs/x-ads-api/catalog-management/overview
 */

const API_BASE_URL = (
  process.env.INTERNAL_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:3100'
).replace(/\/$/, '');

// Hourly, matching sitemap.ts: the catalogue does not move minute to minute,
// and X itself only refetches on its own schedule (as infrequently as daily).
export const revalidate = 3600;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cdata(value: string): string {
  return `<![CDATA[${value.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

function productItems(product: ShopProduct): string {
  const link = `${SITE_URL}/shop/${product.slug}`;
  const image = product.imageUrls?.[0];
  if (!image) return '';

  return product.variants
    .map((variant) => {
      // canOrder is drop-ship-always-true and would mark every variant "in
      // stock" regardless of actual shelf stock -- inStock is the real signal.
      const availability = variant.inStock ? 'in stock' : 'out of stock';
      const title = `${product.name} - ${variant.size}`;
      const description = product.description || product.name;

      return `
    <item>
      <g:id>${escapeXml(variant.sku)}</g:id>
      <title>${cdata(title)}</title>
      <description>${cdata(description)}</description>
      <link>${escapeXml(link)}</link>
      <g:image_link>${escapeXml(image)}</g:image_link>
      <g:availability>${availability}</g:availability>
      <g:price>${variant.priceKes.toFixed(2)} KES</g:price>
      <g:condition>new</g:condition>
      <g:brand>${escapeXml(product.brand || 'Drip Emporium')}</g:brand>
      <g:mpn>${escapeXml(variant.sku)}</g:mpn>
      <g:item_group_id>${escapeXml(product.id)}</g:item_group_id>
      ${product.category ? `<g:product_type>${escapeXml(product.category.name)}</g:product_type>` : ''}
    </item>`;
    })
    .join('');
}

export async function GET() {
  let products: ShopProduct[] = [];

  try {
    const response = await fetch(`${API_BASE_URL}/shop/products`, { next: { revalidate } });
    if (response.ok) products = (await response.json()) as ShopProduct[];
  } catch {
    // An empty feed is a stale-but-valid response for X to fetch again on its
    // next schedule; a thrown error would surface as a 500 in its dashboard.
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Drip Emporium Product Feed</title>
    <link>${SITE_URL}</link>
    <description>Sneakers and streetwear catalogue for X Shopping</description>
    ${products.map(productItems).join('')}
  </channel>
</rss>`;

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': `public, max-age=0, s-maxage=${revalidate}`,
    },
  });
}
