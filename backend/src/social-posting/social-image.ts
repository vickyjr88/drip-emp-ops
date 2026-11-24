import sharp from 'sharp';

/**
 * The picture sent to Instagram, TikTok and X: the product's photo as a JPEG those platforms accept.
 *
 * Instagram takes JPEG only (no PNG or WebP), 8 MB at most, and only a shape between 4:5 (tall) and 1.91:1 (wide); product photos arrive
 * as PNG, WebP or JPEG in any shape. Every one is converted here: transparency becomes white, the colours are made sRGB, a picture
 * outside the allowed shape is centred on white to the nearest allowed shape (nothing is cut off), and the size is kept modest.
 * TikTok and X accept the result as it is.
 */

export const MAX_WIDTH = 1080;
export const MIN_WIDTH = 320;
const TALLEST = 4 / 5;
const WIDEST = 1.91;
/** Well under Instagram's 8 MB and X's 5 MB. */
const MAX_BYTES = 4_000_000;
const MAX_SOURCE_BYTES = 25_000_000;

/** The size to draw a picture of width x height at, and whether it needs a white canvas to reach an allowed shape. */
export function plan(width: number, height: number): { width: number; height: number; pad: boolean } {
  const ratio = width / height;
  if (ratio < TALLEST) return { width: MAX_WIDTH, height: Math.round(MAX_WIDTH / TALLEST), pad: true };
  if (ratio > WIDEST) return { width: MAX_WIDTH, height: Math.ceil(MAX_WIDTH / WIDEST), pad: true };
  const w = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));
  return { width: w, height: Math.round(w / ratio), pad: false };
}

/** A JPEG made from any picture sharp can read. */
export async function toJpeg(source: Buffer): Promise<Buffer> {
  const upright = sharp(source, { failOn: 'none' }).rotate();
  const meta = await upright.clone().metadata();
  const width = meta.autoOrient?.width ?? meta.width ?? 0;
  const height = meta.autoOrient?.height ?? meta.height ?? 0;
  if (!width || !height) throw new Error('The picture could not be read');
  const target = plan(width, height);
  const base = upright.clone().flatten({ background: '#ffffff' }).resize({
    width: target.width, height: target.height, fit: target.pad ? 'contain' : 'fill', background: '#ffffff',
  }).toColourspace('srgb');
  for (const quality of [88, 80, 70, 60]) {
    const out = await base.clone().jpeg({ quality, mozjpeg: true }).toBuffer();
    if (out.length <= MAX_BYTES) return out;
  }
  return base.clone().jpeg({ quality: 50, mozjpeg: true }).toBuffer();
}

/** Downloads a product photo and converts it. Only https addresses; a photo that is huge or not a picture is refused. */
export async function renditionFromUrl(url: string, fetchImpl: typeof fetch = fetch): Promise<Buffer> {
  if (!/^https:\/\//i.test(url)) throw new Error('The picture is not an https address');
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`The picture could not be fetched (HTTP ${response.status})`);
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > MAX_SOURCE_BYTES) throw new Error('The picture is too large');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_SOURCE_BYTES) throw new Error('The picture is too large');
  return toJpeg(bytes);
}
