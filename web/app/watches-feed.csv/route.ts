import { NextResponse } from 'next/server';
import { SITE_URL } from '../lib/site';
import { watchFeedRows } from '../lib/watch-feed';
import { fetchWatches } from '../lib/watches';

/** The same watches feed as CSV (Meta Commerce Manager scheduled feed). 404 while there are no watches on sale. */
export const dynamic = 'force-dynamic';

const field = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

export async function GET() {
  const rows = watchFeedRows(await fetchWatches(), SITE_URL);
  if (!rows.length) return new NextResponse('Not found', { status: 404 });
  const columns = ['id', 'item_group_id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'brand', 'google_product_category', 'product_type', 'gender', 'age_group', 'custom_label_0'];
  const lines = [columns.join(',')];
  for (const r of rows) {
    lines.push([r.id, r.itemGroupId, r.title, r.description, r.availability, r.condition, r.price, r.link, r.imageLink, r.brand, r.googleCategory, r.productType, r.gender, r.ageGroup, r.customLabel0].map(field).join(','));
  }
  return new NextResponse(lines.join('\r\n') + '\r\n', { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
}
