/**
 * Legacy-URL redirects from the old OpenCart storefront (old.dripemporium.store).
 *
 * The old site's sitemap.xml (still live at old.dripemporium.store/sitemap.xml)
 * is the authoritative list of what Google has indexed -- there is no database
 * export of the old catalog to work from, so this list was built by reading
 * that sitemap directly rather than guessing at OpenCart's URL conventions.
 *
 * Every entry is a 301 (permanent): these are old URLs whose ranking/link
 * equity should transfer to their replacement, not a temporary reroute.
 *
 * - Information pages get a real one-to-one mapping to their new equivalent
 *   (creating /delivery, the one page that didn't already exist).
 * - Category pages that still exist under the same name go to their matching
 *   /shop?category= filter; categories retired since the migration (boots,
 *   sandals, Cleaning-Agents) fall through to plain /shop, same as products.
 * - Product URLs have no reliable old-slug-to-new-slug mapping (the catalog
 *   was substantially rebuilt, e.g. old "Air-Force-1" vs new "air-ma-90-black"
 *   are different products entirely), so every old product URL redirects to
 *   /shop rather than guessing at a specific new product.
 *
 * The `?route=...` query-string rules below leave the original `route` param
 * tacked onto the destination URL (a Next.js `has`-match quirk: an unreferenced
 * matched query key still gets forwarded). Confirmed harmless -- none of the
 * destination pages read a `route` param -- so it's left as a cosmetic
 * leftover rather than working around it.
 */
async function redirects() {
  return [
    // --- Information pages: one-to-one mapping ---
    // Order matters here: each of these is a `has`-gated match on the bare
    // /en-gb path (OpenCart's query-string routing), so they must all be
    // checked before the unconditional /en-gb fallback further down, or that
    // fallback would win first and swallow every one of them.
    //
    // The old site actually serves these information pages under two
    // different URL shapes -- a query-string form (?route=information/x, the
    // only form listed in the sitemap) and a path-based SEO-URL form
    // (/en-gb/information/<slug>, not in the sitemap but confirmed live and
    // indexed, e.g. /en-gb/information/about-us). Both need their own rule;
    // the path-based slugs below were found by probing the live old site
    // directly, since the sitemap alone missed them entirely.
    { source: '/en-gb/information/terms', destination: '/terms', permanent: true },
    { source: '/en-gb/information/about', destination: '/about', permanent: true },
    { source: '/en-gb/information/about-us', destination: '/about', permanent: true },
    { source: '/en-gb/information/delivery', destination: '/delivery', permanent: true },
    { source: '/en-gb/information/delivery-information', destination: '/delivery', permanent: true },
    { source: '/en-gb/information/shipping', destination: '/delivery', permanent: true },
    { source: '/en-gb/information/privacy', destination: '/privacy', permanent: true },
    { source: '/en-gb/information/privacy-policy', destination: '/privacy', permanent: true },
    // The old page at this slug is actually a copy of the Terms & Conditions
    // (its content covers the Affiliate Program under the site's general
    // terms), but /affiliate now exists as its own real page -- a visitor
    // following this link is looking for the program itself, not the legal
    // text that happens to mention it, so it goes there instead of /terms.
    { source: '/en-gb/information/affiliate', destination: '/affiliate', permanent: true },
    // "Find Your Favorite Brand" on the old site -- confirmed live there,
    // no equivalent brand-listing page exists yet, so this goes to /shop
    // rather than a dead end.
    {
      source: '/en-gb',
      has: [{ type: 'query', key: 'route', value: 'product/manufacturer' }],
      destination: '/shop',
      permanent: true,
    },
    {
      source: '/en-gb',
      has: [{ type: 'query', key: 'route', value: 'information/about' }],
      destination: '/about',
      permanent: true,
    },
    {
      source: '/en-gb',
      has: [{ type: 'query', key: 'route', value: 'information/contact' }],
      destination: '/contact',
      permanent: true,
    },
    {
      source: '/en-gb',
      has: [{ type: 'query', key: 'route', value: 'information/faq' }],
      destination: '/faq',
      permanent: true,
    },
    {
      source: '/en-gb',
      has: [{ type: 'query', key: 'route', value: 'information/privacy' }],
      destination: '/privacy',
      permanent: true,
    },
    {
      source: '/en-gb',
      has: [{ type: 'query', key: 'route', value: 'information/delivery' }],
      destination: '/delivery',
      permanent: true,
    },
    {
      source: '/en-gb',
      has: [{ type: 'query', key: 'route', value: 'account/login' }],
      destination: '/account/login',
      permanent: true,
    },
    {
      source: '/en-gb',
      has: [{ type: 'query', key: 'route', value: 'account/register' }],
      destination: '/account/signup',
      permanent: true,
    },

    // --- Categories that still exist: send straight to their own crawlable
    // page (/shop/category/[slug]) rather than the ?category= query form, so
    // this doesn't redirect into something that itself gets superseded. ---
    { source: '/en-gb/catalog/sneakers', destination: '/shop/category/sneakers', permanent: true },
    { source: '/en-gb/catalog/casuals', destination: '/shop/category/casuals', permanent: true },
    { source: '/en-gb/catalog/officials', destination: '/shop/category/officials', permanent: true },

    // The ?category= query form still works as a live filter on /shop (the
    // dropdown uses it for fast client-side filtering), but /shop/category/x
    // is now the canonical, indexable URL for a given category -- an old
    // bookmark or indexed link using the query form should land there too.
    {
      source: '/shop',
      has: [{ type: 'query', key: 'category', value: '(?<category>.*)' }],
      destination: '/shop/category/:category',
      permanent: true,
    },

    // --- Everything else broken: categories retired since migration, every
    // product page, brands, specials, and any other old route -- to /shop,
    // the closest living equivalent, rather than a dead end. ---
    { source: '/en-gb/catalog/:path*', destination: '/shop', permanent: true },
    { source: '/en-gb/product/:path*', destination: '/shop', permanent: true },
    { source: '/en-gb/brands', destination: '/shop', permanent: true },
    {
      source: '/en-gb',
      has: [{ type: 'query', key: 'route', value: 'product/special' }],
      destination: '/shop',
      permanent: true,
    },

    // --- Fallback: a bare /en-gb (no recognised query, home in the old
    // site's language-prefixed URL scheme) or any other /en-gb/* path with
    // no more specific rule above. Checked last, after every `has`-gated
    // rule on the same /en-gb source has had a chance to match first. ---
    { source: '/en-gb', destination: '/', permanent: true },
    { source: '/en-gb/:path*', destination: '/shop', permanent: true },
  ];
}

/**
 * next/image needs every remote host it will ever serve an image from
 * allow-listed here at build time -- an unlisted host 400s instead of
 * loading. Product photos and CMS-uploaded images are NOT served straight
 * from MinIO: MediaController streams them through the backend API at
 * GET /media/:objectKey (see backend/src/media/media.controller.ts), and
 * MediaService builds every image URL as `${publicBaseUrl}/media/...`,
 * where publicBaseUrl falls back MEDIA_PUBLIC_BASE_URL ->
 * NEXT_PUBLIC_API_BASE_URL -> NEXT_PUBLIC_API_URL. So the real image host is
 * ordinarily just the API's own public origin, not a separate media
 * subdomain.
 *
 * Falls back NEXT_PUBLIC_MEDIA_BASE_URL -> NEXT_PUBLIC_API_BASE_URL, mirroring
 * that same chain -- the latter is a build arg every existing deploy already
 * sets, so images work without needing to provision the newer, narrower var.
 *
 * Uses the deprecated `images.domains` array, not `images.remotePatterns`,
 * on purpose: confirmed a real bug in next@14.2.15's remotePatterns handling
 * by tracing it into node_modules. `writeImagesManifest()`
 * (next/dist/build/index.js) pre-compiles each pattern's `hostname` into a
 * regex source string via picomatch at build time, but `matchRemotePattern()`
 * (next/dist/shared/lib/match-remote-pattern.js) runs picomatch over that
 * *already-compiled* string again at request time -- double-escaping it into
 * something that can no longer match the real hostname. Reproduced directly:
 * a pattern for exactly "localhost" ends up unable to match the literal
 * string "localhost", and the bug is pattern-shape-independent (a bare `*`
 * fails the same way), so no remotePatterns config can work around it in
 * this version. `domains` is untouched by writeImagesManifest() and matched
 * with plain string equality, sidestepping the bug entirely. Revert to
 * remotePatterns once next.js is upgraded past whatever version fixes this
 * (worth rechecking on the next Next.js upgrade -- see
 * https://github.com/vercel/next.js for the fix once one lands).
 */
function mediaImageHostname() {
  const raw = process.env.NEXT_PUBLIC_MEDIA_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!raw) return [];
  try {
    return [new URL(raw).hostname];
  } catch {
    // A malformed value should not fail the whole build -- images from it
    // just won't load, the same degraded-but-not-broken outcome as today.
    return [];
  }
}

/**
 * next/image's built-in optimizer fetches the *exact* image src server-side
 * -- there is no hook to fetch via one URL while embedding another in the
 * page, which a custom loader cannot fix either (a loader only controls the
 * displayed URL, not the optimizer's own internal fetch). That is fine
 * whenever the public image origin is reachable from both the browser and
 * this container -- true in production, where MEDIA_PUBLIC_BASE_URL /
 * NEXT_PUBLIC_API_BASE_URL is a real public domain DNS resolves the same way
 * everywhere.
 *
 * It breaks specifically in local Docker Compose dev: the browser reaches
 * the API at localhost:<published port>, but "localhost" from inside the
 * `web` container is the web container itself, not `backend` -- confirmed
 * directly (ECONNREFUSED ::1:<port> from image-optimizer.js's own fetch).
 * The docker-internal address (INTERNAL_API_BASE_URL, e.g. backend:3100) IS
 * reachable from here, but embedding that in the page would break the
 * browser instead, so there is no single URL that works for both. Detected
 * by the API origin's hostname being localhost/127.0.0.1, which the real
 * public origin used in production never is.
 */
function isLikelyUnreachableFromServer() {
  const raw = process.env.NEXT_PUBLIC_MEDIA_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!raw) return false;
  try {
    const { hostname } = new URL(raw);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  redirects,
  images: {
    domains: mediaImageHostname(),
    // Skips next/image's own optimize-and-cache fetch in local dev (see
    // isLikelyUnreachableFromServer above) -- images still render, just
    // without resizing/format conversion, rather than 500ing. Production
    // keeps full optimization.
    unoptimized: isLikelyUnreachableFromServer(),
  },
};

module.exports = nextConfig;
