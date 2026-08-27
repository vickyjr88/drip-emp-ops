import { NextResponse } from 'next/server';
import { SITE_URL } from '../lib/site';
import { feedRows, type FeedRow } from '../lib/product-feed';
import type { ShopProduct } from '../lib/shop';

/**
 * XML product feed for X (Twitter) Shopping / Ads catalogs.
 *
 * X's catalog manager can pull a scheduled feed from a public URL instead of
 * a manual upload -- this is that URL. Format follows the same RSS 2.0 /
 * `g:` namespace convention as Google Merchant Center and Meta Catalog, which
 * X's docs describe as compatible. See product-feed.csv/route.ts for the same
 * data as X's other supported format -- try both against Shopping Manager,
 * since X's field spec lives there rather than on a fetchable docs page.
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

function itemXml(row: FeedRow): string {
  return `
    <item>
      <g:id>${escapeXml(row.id)}</g:id>
      <title>${cdata(row.title)}</title>
      <description>${cdata(row.description)}</description>
      <link>${escapeXml(row.link)}</link>
      <g:image_link>${escapeXml(row.imageLink)}</g:image_link>
      <g:availability>${row.availability}</g:availability>
      <g:price>${row.price}</g:price>
      <g:condition>${row.condition}</g:condition>
      <g:brand>${escapeXml(row.brand)}</g:brand>
      <g:mpn>${escapeXml(row.mpn)}</g:mpn>
      <g:item_group_id>${escapeXml(row.itemGroupId)}</g:item_group_id>
      ${row.productType ? `<g:product_type>${escapeXml(row.productType)}</g:product_type>` : ''}
    </item>`;
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
    ${feedRows(products).map(itemXml).join('')}
  </channel>
</rss>`;

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': `public, max-age=0, s-maxage=${revalidate}`,
    },
  });
}
