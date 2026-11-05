import sharp from 'sharp';
import { shirtSvg } from '../../../components/kit-shirt-svg';
import { fetchKit, fetchKitsEnabled } from '../../../lib/kits';

/**
 * A plain PNG of a kit's drawn shirt, for places that cannot take an SVG: the product feeds (Meta and Google reject
 * SVG), search results and link previews. Every kit has one, so a kit with no staff photo can still be listed.
 *
 * Only the drawn shirt (shapes, no lettering), so it needs no fonts. `?og=1` gives the 1200x630 link-preview shape.
 * Answers 404 while the Kits line is off, because the kit itself is then not found.
 */
// Not cached by Next: a kit that is switched off (or removed) must stop resolving. Browsers and CDNs may keep the PNG briefly.
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { slug: string } }) {
  if (!(await fetchKitsEnabled())) return new Response('Not found', { status: 404 });
  const product = await fetchKit(params.slug.replace(/\.png$/i, ''));
  if (!product) return new Response('Not found', { status: 404 });

  const og = new URL(request.url).searchParams.get('og') === '1';
  const [width, height] = og ? [1200, 630] : [1200, 1200];
  const inner = await sharp(Buffer.from(shirtSvg(product.kit.templateKey, product.kit.colors, 'front')), { density: 216 })
    .resize({ height: Math.round(height * 0.86), fit: 'inside' })
    .png()
    .toBuffer();
  const png = await sharp({ create: { width, height, channels: 3, background: '#ececea' } })
    .composite([{ input: inner, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toBuffer();

  return new Response(new Uint8Array(png), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=600, s-maxage=600' },
  });
}
