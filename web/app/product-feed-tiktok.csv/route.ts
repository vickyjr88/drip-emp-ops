import { NextResponse } from 'next/server';
import { feedRows, type FeedRow } from '../lib/product-feed';
import type { ShopProduct } from '../lib/shop';

/**
 * CSV product feed for TikTok Catalog Manager.
 *
 * TikTok's Data Feed setup accepts a scheduled feed URL in the same
 * Google Merchant Center / Meta Catalog-compatible column format that
 * product-feed.csv already builds for X -- reused here via the shared
 * feedRows() rather than a second row-shaping implementation, so the two
 * platforms' feeds cannot drift apart on what a row actually contains.
 * A dedicated route (rather than handing TikTok the X feed URL directly)
 * keeps each platform's fetch schedule and logs separate.
 *
 * Column names follow the Google Merchant Center convention (`id`, not
 * TikTok-specific naming like `sku_id`) since that is what TikTok's own docs
 * describe this feed format as compatible with, and it matches every other
 * feed already built from feedRows(). Validate against Catalog Manager's own
 * "Fetch now" report after pointing it at this URL -- if it reports an
 * unrecognized or missing required column, adjust HEADERS/rowCsv here to
 * match rather than guessing further.
 *
 * https://ads.tiktok.com/help/article/data-feed-management
 */

const API_BASE_URL = (
  process.env.INTERNAL_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:3100'
).replace(/\/$/, '');

export const revalidate = 3600;

const HEADERS = [
  'id',
  'title',
  'description',
  'link',
  'image_link',
  'availability',
  'price',
  'condition',
  'brand',
  'mpn',
  'item_group_id',
  'product_type',
] as const;

function csvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function rowCsv(row: FeedRow): string {
  return [
    row.id,
    row.title,
    row.description,
    row.link,
    row.imageLink,
    row.availability,
    row.price,
    row.condition,
    row.brand,
    row.mpn,
    row.itemGroupId,
    row.productType,
  ]
    .map(csvField)
    .join(',');
}

export async function GET() {
  let products: ShopProduct[] = [];

  try {
    const response = await fetch(`${API_BASE_URL}/shop/products`, { next: { revalidate } });
    if (response.ok) products = (await response.json()) as ShopProduct[];
  } catch {
    // An empty feed is a stale-but-valid response for TikTok to fetch again
    // on its next schedule; a thrown error would surface as a failed pull
    // in Catalog Manager instead.
  }

  const lines = [HEADERS.join(','), ...feedRows(products).map(rowCsv)];

  return new NextResponse(`${lines.join('\n')}\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Cache-Control': `public, max-age=0, s-maxage=${revalidate}`,
    },
  });
}
