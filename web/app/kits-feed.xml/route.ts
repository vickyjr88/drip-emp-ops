import { NextResponse } from 'next/server';
import { SITE_URL } from '../lib/site';
import { kitFeedRows, type KitFeedRow } from '../lib/kit-feed';
import { fetchKits, fetchKitsEnabled } from '../lib/kits';

/**
 * XML feed for the Kits line (Google Merchant Center and Meta Catalog), one item per size. Separate from the shoe
 * feeds on purpose: point a second catalogue at this URL so the shoe catalogue's performance stays its own.
 * Empty (404) while an admin has the Kits line switched off.
 */
// Checked on every request (not cached for an hour): switching the Kits line off must stop the feed at once.
export const dynamic = 'force-dynamic';

const escapeXml = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const cdata = (v: string) => `<![CDATA[${v.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;

function itemXml(row: KitFeedRow): string {
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
      <g:google_product_category>${escapeXml(row.googleCategory)}</g:google_product_category>
      <g:product_type>${escapeXml(row.productType)}</g:product_type>
      ${row.size ? `<g:size>${escapeXml(row.size)}</g:size>` : ''}
      <g:color>${escapeXml(row.color)}</g:color>
      <g:gender>${row.gender}</g:gender>
      <g:age_group>${row.ageGroup}</g:age_group>
      <g:custom_label_0>${escapeXml(row.customLabel0)}</g:custom_label_0>
      <g:custom_label_1>${escapeXml(row.customLabel1)}</g:custom_label_1>
    </item>`;
}

export async function GET() {
  // The live on/off answer first: a cached catalogue response must never keep a switched-off feed alive.
  if (!(await fetchKitsEnabled())) return new NextResponse('Not found', { status: 404 });
  const kits = await fetchKits();
  // The line is off (or has nothing): behave as if the feed does not exist rather than serve an empty catalogue.
  if (!kits.length) return new NextResponse('Not found', { status: 404 });
  const items = kitFeedRows(kits).map(itemXml).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Drip Emporium Kits</title>
    <link>${SITE_URL}/kits</link>
    <description>Fan-version football jerseys and custom T-shirts from Drip Emporium, Nairobi</description>${items}
  </channel>
</rss>
`;
  return new NextResponse(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
}
