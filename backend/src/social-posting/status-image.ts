import * as opentype from 'opentype.js';
import sharp from 'sharp';
import { BRAND_FONT_BASE64 } from './brand-font';
import { PostableProduct, compactSizes, formatKenyanPhone } from './social-post';

/** WhatsApp Status is a full-screen 9:16 picture. */
export const STATUS_WIDTH = 1080;
export const STATUS_HEIGHT = 1920;

const INK = '#f5f2ea';
const MUTED = '#b9b4a6';
const GOLD = '#d9b26a';
const BG = '#0d0d0d';

let cachedFont: opentype.Font | null = null;
function font(): opentype.Font {
  if (!cachedFont) {
    const buf = Buffer.from(BRAND_FONT_BASE64, 'base64');
    cachedFont = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }
  return cachedFont;
}

const widthOf = (text: string, size: number, spacing = 0) => font().getAdvanceWidth(text, size) + spacing * Math.max(0, Array.from(text).length - 1);

/** Text as an SVG path, centred on the picture. Drawn from the font's outlines, so it looks the same on any machine. */
function line(text: string, size: number, baseline: number, fill: string, opts: { spacing?: number; strike?: boolean } = {}): string {
  const spacing = opts.spacing ?? 0;
  const total = widthOf(text, size, spacing);
  let x = (STATUS_WIDTH - total) / 2;
  const parts: string[] = [];
  if (spacing) {
    for (const ch of Array.from(text)) {
      parts.push(font().getPath(ch, x, baseline, size).toPathData(2));
      x += font().getAdvanceWidth(ch, size) + spacing;
    }
  } else {
    parts.push(font().getPath(text, x, baseline, size).toPathData(2));
  }
  const strike = opts.strike ? `<rect x="${(STATUS_WIDTH - total) / 2}" y="${baseline - size * 0.3}" width="${total}" height="${Math.max(3, size / 16)}" fill="${fill}"/>` : '';
  return `<path d="${parts.join(' ')}" fill="${fill}"/>${strike}`;
}

/** Words onto lines no wider than `max`, the text shrinking from `size` (to `min`) until it fits in `maxLines`. Returns the lines and the size used. */
function fit(text: string, size: number, min: number, max: number, maxLines: number): { lines: string[]; size: number } {
  const words = text.trim().split(/\s+/).filter(Boolean);
  for (let s = size; s >= min; s -= 2) {
    const lines: string[] = [];
    let current = '';
    for (const w of words) {
      const trial = current ? `${current} ${w}` : w;
      if (widthOf(trial, s) <= max || !current) current = trial; else { lines.push(current); current = w; }
    }
    if (current) lines.push(current);
    if (lines.length <= maxLines && lines.every((l) => widthOf(l, s) <= max)) return { lines, size: s };
  }
  // Still too long at the smallest size: keep what fits on the allowed lines and end with an ellipsis.
  const s = min;
  const out: string[] = [];
  let current = '';
  for (const w of words) {
    const trial = current ? `${current} ${w}` : w;
    if (widthOf(trial, s) <= max) current = trial; else { out.push(current); current = w; }
    if (out.length === maxLines) break;
  }
  if (out.length < maxLines && current) out.push(current);
  const last = out.slice(0, maxLines);
  while (last.length && widthOf(`${last[last.length - 1]}…`, s) > max) last[last.length - 1] = last[last.length - 1].slice(0, -1);
  if (last.length) last[last.length - 1] += '…';
  return { lines: last, size: s };
}

export type StatusFacts = { whatsapp: string; site: string };

/** The picture, as the drawing instructions (everything except the product photo). Kept separate so it can be tested without a photo. */
export function statusOverlay(product: PostableProduct, facts: StatusFacts): string {
  const max = STATUS_WIDTH - 120;
  const parts: string[] = [`<rect width="${STATUS_WIDTH}" height="${STATUS_HEIGHT}" fill="${BG}"/>`];

  parts.push(line('DRIP EMPORIUM', 44, 100, INK, { spacing: 12 }));
  parts.push(`<rect x="${STATUS_WIDTH / 2 - 40}" y="128" width="80" height="4" fill="${GOLD}"/>`);

  // The photo sits at y 170-1250 (placed separately). Text flows below it.
  let y = 1250;
  const name = fit(product.name, 66, 44, max, 2);
  y += 40 + name.size;
  for (const l of name.lines) { parts.push(line(l, name.size, y, INK)); y += name.size * 1.12; }

  y += 20;
  const priceText = `KES ${Math.round(product.offer ? product.offer.price : product.priceFrom).toLocaleString('en-KE')}`;
  const prefix = !product.offer && product.priceTo && product.priceTo !== product.priceFrom ? 'From ' : '';
  if (product.offer) {
    const was = `was KES ${Math.round(product.offer.was).toLocaleString('en-KE')}`;
    parts.push(line(was, 40, y + 30, MUTED, { strike: true }));
    y += 56;
  }
  parts.push(line(`${prefix}${priceText}`, 104, y + 84, product.offer ? GOLD : INK));
  y += 84 + 34;

  const sizes = compactSizes(product.sizesInStock);
  if (sizes) {
    const s = fit(`Sizes  ${sizes}`, 40, 28, max, 2);
    y += 20 + s.size;
    for (const l of s.lines) { parts.push(line(l, s.size, y, MUTED)); y += s.size * 1.2; }
  }

  // Fixed foot of the picture, so the call to action is always in the same place.
  parts.push(`<rect x="60" y="1738" width="${STATUS_WIDTH - 120}" height="2" fill="#2a2a2a"/>`);
  parts.push(line('Reply to this status to order', 46, 1806, GOLD));
  const phone = facts.whatsapp ? formatKenyanPhone(facts.whatsapp.replace(/^https?:\/\/wa\.me\//, '')) : '';
  const host = facts.site.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  parts.push(line([host, phone ? `WhatsApp ${phone}` : ''].filter(Boolean).join('   ·   '), 34, 1868, MUTED));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${STATUS_WIDTH}" height="${STATUS_HEIGHT}" viewBox="0 0 ${STATUS_WIDTH} ${STATUS_HEIGHT}">${parts.join('')}</svg>`;
}

/** The finished 1080x1920 picture for a product: its photo, the name, the price, the sizes in stock and how to order. */
export async function renderStatusImage(product: PostableProduct, photo: Buffer, facts: StatusFacts): Promise<Buffer> {
  const picture = await sharp(photo, { failOn: 'none' }).rotate().resize(STATUS_WIDTH, 1080, { fit: 'cover', position: 'attention' }).toBuffer();
  return sharp(Buffer.from(statusOverlay(product, facts)))
    .composite([{ input: picture, left: 0, top: 170 }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

/** Fetches a product photo. Bounded in time and size: it is someone else's file, fetched by address. */
export async function fetchPhoto(url: string): Promise<Buffer> {
  if (!/^https:\/\//i.test(url)) throw new Error('The product photo is not an https address');
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`The product photo could not be fetched (HTTP ${response.status})`);
  const length = Number(response.headers.get('content-length') || 0);
  if (length > 20_000_000) throw new Error('The product photo is too large');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 20_000_000) throw new Error('The product photo is too large');
  return buffer;
}
