/**
 * Canonical site identity, shared by metadata, structured data, sitemap and
 * robots.
 *
 * SITE_URL must be the real public origin: canonical URLs, Open Graph images
 * and sitemap entries are all absolute, and a wrong origin here points search
 * engines and social scrapers at the wrong host. It is read at build time, so
 * NEXT_PUBLIC_SITE_URL is wired as a build arg in docker-compose.yml the way
 * NEXT_PUBLIC_API_BASE_URL is.
 *
 * The fallback is localhost rather than the production domain on purpose: a
 * misconfigured deploy then produces obviously-wrong local URLs, instead of
 * confidently publishing canonicals for a domain it may not actually be
 * serving. Matches the default in .env.sample and docker-compose.yml.
 */

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3002').replace(
  /\/$/,
  '',
);

export const SITE_NAME = 'Drip Emporium';

export const SITE_DESCRIPTION =
  'Quality affordable sneakers and streetwear in Nairobi. Nike, Adidas, Jordan and Puma in ' +
  'EUR 36-46, at two shops on Ronald Ngala Street.';

/** Absolute URL for a site-relative path. */
export function absoluteUrl(path = '/') {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * The organisation, as one object reused by every page's structured data.
 * Repeating @id across pages lets search engines merge them into a single
 * entity rather than treating each page as a separate business.
 */
export function organizationSchema() {
  return {
    '@type': 'RealEstateAgent',
    '@id': `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    areaServed: {
      '@type': 'City',
      name: 'Nairobi',
      containedInPlace: { '@type': 'Country', name: 'Kenya' },
    },
    knowsLanguage: ['en', 'sw'],
  };
}

/**
 * Renders a JSON-LD block.
 *
 * Structured data is what lets an assistant answer "what does Drip Emporium
 * sell and where" without parsing prose, and what a search engine reads for
 * rich results. dangerouslySetInnerHTML is the documented way to emit it --
 * React would otherwise escape the JSON into unusable text.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({ '@context': 'https://schema.org', ...data }).replace(/</g, '\\u003c'),
      }}
    />
  );
}
