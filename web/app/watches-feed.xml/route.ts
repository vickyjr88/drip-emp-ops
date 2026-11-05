import { NextResponse } from 'next/server';
import { SITE_URL } from '../lib/site';
import { watchFeedRows, type WatchFeedRow } from '../lib/watch-feed';
import { fetchWatches } from '../lib/watches';

/**
 * XML feed for the Watches line (Google Merchant Center and Meta Catalog). Separate from the shoe feeds on purpose: point a
 * second catalogue at this URL so the shoe catalogue's results stay its own. No size field: a watch has none.
 * 404 while there are no watches on sale.
 */
export const dynamic = 'force-dynamic';

const escapeXml = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const cdata = (v: string) => `<![CDATA[${v.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;

function itemXml(row: WatchFeedRow): string {
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
      <g:gender>${row.gender}</g:gender>
      <g:age_group>${row.ageGroup}</g:age_group>
      <g:custom_label_0>${escapeXml(row.customLabel0)}</g:custom_label_0>
    </item>`;
}

export async function GET() {
  const rows = watchFeedRows(await fetchWatches(), SITE_URL);
  if (!rows.length) return new NextResponse('Not found', { status: 404 });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Drip Emporium Watches</title>
    <link>${SITE_URL}/watches</link>
    <description>Watches from Drip Emporium, Nairobi</description>${rows.map(itemXml).join('')}
  </channel>
</rss>
`;
  return new NextResponse(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
}
