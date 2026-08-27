import { NextResponse } from 'next/server';
import { feedRows, type FeedRow } from '../lib/product-feed';
import type { ShopProduct } from '../lib/shop';

/**
 * CSV product feed for X (Twitter) Shopping / Ads catalogs.
 *
 * X's Scheduled Feeds API defaults its feed_format to CSV, so this is likely
 * the format X actually expects rather than the XML in product-feed.xml --
 * ship both and see which one Shopping Manager validates cleanly, since X's
 * field spec lives in Shopping Manager's UI rather than a fetchable docs page.
 *
 * https://developer.x.com/en/docs/x-ads-api/catalog-management/overview
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
    // An empty feed is a stale-but-valid response for X to fetch again on its
    // next schedule; a thrown error would surface as a 500 in its dashboard.
  }

  const lines = [HEADERS.join(','), ...feedRows(products).map(rowCsv)];

  return new NextResponse(`${lines.join('\n')}\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Cache-Control': `public, max-age=0, s-maxage=${revalidate}`,
    },
  });
}
