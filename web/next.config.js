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
    { source: '/en-gb/information/terms', destination: '/terms', permanent: true },
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

    // --- Categories that still exist: send to the matching filter ---
    { source: '/en-gb/catalog/sneakers', destination: '/shop?category=sneakers', permanent: true },
    { source: '/en-gb/catalog/casuals', destination: '/shop?category=casuals', permanent: true },
    { source: '/en-gb/catalog/officials', destination: '/shop?category=officials', permanent: true },

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

/** @type {import('next').NextConfig} */
const nextConfig = {
  redirects,
};

module.exports = nextConfig;
