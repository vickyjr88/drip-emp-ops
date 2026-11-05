import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

/**
 * Link-preview images. WhatsApp commonly drops the thumbnail for an image over ~300 KB and ignores one whose real
 * size differs from what the page declared, but the hero and product photos are uploaded straight from a camera or
 * a designer (the home hero is a 2 MB, 1672x941 PNG). Pointing og:image at the upload therefore gave no preview or
 * a badly cropped one. /og/share.jpg serves the same picture recomposed to exactly 1200x630 as a small JPEG.
 */

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const FETCH_TIMEOUT_MS = 10_000;
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

/**
 * Hosts an image may be fetched from. The source address arrives in a query string, so fetching it blindly would let
 * anyone make this server request arbitrary addresses, internal ones included. Only the site's own media host (the
 * API origin) plus anything listed in OG_IMAGE_EXTRA_HOSTS (comma-separated hostnames) is allowed.
 */
function siteHost(): string | null {
  try {
    const raw = process.env.NEXT_PUBLIC_SITE_URL;
    return raw ? new URL(raw).hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Dev rewrites 127.0.0.1 to localhost inside the request. Those are the same machine, and only then. */
function sameSiteHost(actual: string, expected: string): boolean {
  const a = actual.toLowerCase();
  const b = expected.toLowerCase();
  if (a === b) return true;
  const loopback = new Set(['localhost', '127.0.0.1', '::1']);
  return loopback.has(a) && loopback.has(b);
}

/**
 * A picture shipped with the storefront, under public/images. The share route otherwise only fetches the media
 * host, so a file in public/ would be refused, and fetching this server's own origin from inside the container
 * can stall. Same-site /images/ paths are read off disk instead. Anything else on the site host stays refused.
 */
function bundledImageFile(url: URL): string | null {
  const host = siteHost();
  if (!host || !sameSiteHost(url.hostname, host)) return null;
  let pathname: string;
  try { pathname = decodeURIComponent(url.pathname); } catch { return null; }
  if (!pathname.startsWith('/images/')) return null;
  const segments = pathname.split('/').slice(1);
  if (segments.length < 2) return null;
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes('\0'))) return null;
  if (segments[0] !== 'images') return null;
  const root = path.resolve(process.cwd(), 'public', 'images');
  const file = path.resolve(root, ...segments.slice(1));
  if (file !== root && !file.startsWith(root + path.sep)) return null;
  return file;
}

function allowedHosts(): Set<string> {
  const hosts = new Set<string>();
  for (const value of [process.env.NEXT_PUBLIC_API_BASE_URL, process.env.NEXT_PUBLIC_MEDIA_BASE_URL]) {
    try { if (value) hosts.add(new URL(value).hostname); } catch { /* ignore a malformed value */ }
  }
  for (const host of (process.env.OG_IMAGE_EXTRA_HOSTS || '').split(',')) {
    if (host.trim()) hosts.add(host.trim().toLowerCase());
  }
  return hosts;
}

/**
 * Where to actually fetch a permitted address from. Images are published under the public API origin, but this
 * container reaches the API faster and more reliably on its internal address (the public hostname has been seen
 * to time out from inside the container), so a public-origin address is swapped for the internal one.
 */
function fetchableUrl(url: URL): URL {
  const internal = process.env.INTERNAL_API_BASE_URL;
  const publicOrigin = (() => { try { return new URL(process.env.NEXT_PUBLIC_API_BASE_URL || '').origin; } catch { return null; } })();
  if (!internal || !publicOrigin || url.origin !== publicOrigin) return url;
  try {
    const target = new URL(internal);
    return new URL(`${url.pathname}${url.search}`, target.origin);
  } catch {
    return url;
  }
}

/** Centres the photo on a blurred copy of itself, so portrait and wide shots fill the card without being cropped. */
async function compose(source: Buffer): Promise<Buffer> {
  // Flattened onto white first: a transparent PNG would otherwise come out black in a JPEG.
  const base = await sharp(source, { failOn: 'none' }).rotate().flatten({ background: '#ffffff' }).toBuffer();
  const [background, foreground] = await Promise.all([
    sharp(base).resize(OG_WIDTH, OG_HEIGHT, { fit: 'cover' }).blur(24).modulate({ brightness: 0.92 }).toBuffer(),
    sharp(base).resize(OG_WIDTH, OG_HEIGHT, { fit: 'inside' }).toBuffer(),
  ]);
  return sharp(background)
    .composite([{ input: foreground, gravity: 'centre' }])
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer();
}

// Recomposing a multi-megabyte upload takes a moment; crawlers re-fetch the same card often. A small in-process
// cache (an hour, at most 40 pictures) keeps that from repeating.
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX = 40;
const cache = new Map<string, { at: number; jpeg: Buffer }>();

/**
 * Anything unexpected -- a host that isn't allowed, a slow or failing fetch, a file that isn't an image -- redirects
 * to the original image rather than failing, so a preview is never worse than it was before this existed.
 */
export async function ogImageResponse(sourceUrl: string | null | undefined): Promise<Response> {
  if (!sourceUrl) return new Response('No image', { status: 404 });

  let url: URL;
  try { url = new URL(sourceUrl); } catch { return new Response('No image', { status: 404 }); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return new Response('No image', { status: 404 });

  const key = url.toString();
  const hit = cache.get(key);
  const headers = {
    'Content-Type': 'image/jpeg',
    // A changed photo shows up within a day; crawlers re-fetching the same preview don't re-render it.
    'Cache-Control': 'public, max-age=3600, s-maxage=86400',
  };
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return new Response(new Uint8Array(hit.jpeg), { headers });

  const bundled = bundledImageFile(url);
  if (bundled) {
    try {
      const bytes = await readFile(bundled);
      if (bytes.length > MAX_SOURCE_BYTES) return new Response('Image too large', { status: 400 });
      const jpeg = await compose(bytes);
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
      cache.set(key, { at: Date.now(), jpeg });
      return new Response(new Uint8Array(jpeg), { headers });
    } catch {
      return new Response('No image', { status: 404 });
    }
  }

  // Not one of ours: never fetched here, and never redirected to either (an open redirect through our own domain).
  if (!allowedHosts().has(url.hostname)) return new Response('Image host not allowed', { status: 400 });

  try {
    // redirect: 'error' -- an allowed host must not be able to bounce this fetch on to somewhere that isn't.
    const res = await fetch(fetchableUrl(url), { redirect: 'error', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok || !(res.headers.get('content-type') || '').startsWith('image/')) return Response.redirect(url.toString(), 302);
    if (Number(res.headers.get('content-length') || 0) > MAX_SOURCE_BYTES) return Response.redirect(url.toString(), 302);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > MAX_SOURCE_BYTES) return Response.redirect(url.toString(), 302);

    const jpeg = await compose(bytes);
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
    cache.set(key, { at: Date.now(), jpeg });
    return new Response(new Uint8Array(jpeg), { headers });
  } catch {
    return Response.redirect(url.toString(), 302);
  }
}
