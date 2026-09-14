import { NextResponse } from 'next/server';
import { SITE_URL } from '../lib/site';
import { feedRows, type FeedRow } from '../lib/product-feed';
import type { ShopProduct } from '../lib/shop';

/**
 * XML product feed for TikTok Catalog Manager.
 *
 * Same RSS 2.0 / `g:` namespace convention as product-feed.xml (X's feed) and
 * product-feed.csv (this platform's own CSV alternative) -- built from the
 * same shared feedRows() so all three cannot drift apart on row content.
 * TikTok's Data Feed setup accepts a scheduled feed URL in this
 * Google Merchant Center-compatible shape; validate against Catalog
 * Manager's own "Fetch now" report after pointing it here.
 *
 * https://ads.tiktok.com/help/article/data-feed-management
 */

const API_BASE_URL = (
  process.env.INTERNAL_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:3100'
).replace(/\/$/, '');

// Hourly, matching product-feed.xml and sitemap.ts: the catalogue does not
// move minute to minute, and TikTok only refetches on its own schedule.
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
    // An empty feed is a stale-but-valid response for TikTok to fetch again
    // on its next schedule; a thrown error would surface as a failed pull in
    // Catalog Manager instead.
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Drip Emporium Product Feed</title>
    <link>${SITE_URL}</link>
    <description>Sneakers and streetwear catalogue for TikTok Shop</description>
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
