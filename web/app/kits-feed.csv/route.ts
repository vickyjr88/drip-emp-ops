import { NextResponse } from 'next/server';
import { SITE_URL } from '../lib/site';
import { kitFeedRows } from '../lib/kit-feed';
import { fetchKits, fetchKitsEnabled } from '../lib/kits';

/** The same kits feed as CSV (Meta Commerce Manager scheduled feed). 404 while the Kits line is off. */
// Checked on every request (not cached for an hour): switching the Kits line off must stop the feed at once.
export const dynamic = 'force-dynamic';

const field = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

export async function GET() {
  // The live on/off answer first: a cached catalogue response must never keep a switched-off feed alive.
  if (!(await fetchKitsEnabled())) return new NextResponse('Not found', { status: 404 });
  const kits = await fetchKits();
  if (!kits.length) return new NextResponse('Not found', { status: 404 });
  const columns = ['id', 'item_group_id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'brand', 'google_product_category', 'product_type', 'size', 'color', 'gender', 'age_group', 'custom_label_0', 'custom_label_1'];
  const lines = [columns.join(',')];
  for (const r of kitFeedRows(kits, SITE_URL)) {
    lines.push([r.id, r.itemGroupId, r.title, r.description, r.availability, r.condition, r.price, r.link, r.imageLink, r.brand, r.googleCategory, r.productType, r.size, r.color, r.gender, r.ageGroup, r.customLabel0, r.customLabel1].map(field).join(','));
  }
  return new NextResponse(lines.join('\r\n') + '\r\n', {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  });
}
