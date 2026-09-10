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
  'EUR 36-46, on Ronald Ngala Street.';

/** Absolute URL for a site-relative path. */
export function absoluteUrl(path = '/') {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * The organisation, as one object reused by every page's structured data.
 * Repeating @id across pages lets search engines merge them into a single
 * entity rather than treating each page as a separate business.
 *
 * sameAs is what tells Google (and an AI engine checking whether a source is
 * legitimate) that these social profiles and this website are the same
 * business -- omitted when there is nothing to link, rather than an empty
 * array, so a fresh install with no social links filled in yet doesn't
 * publish a sameAs with nothing in it.
 */
export function organizationSchema(socialUrls: string[] = []) {
  return {
    '@type': 'ShoeStore',
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
    ...(socialUrls.length ? { sameAs: socialUrls } : {}),
  };
}

/**
 * The same handful of questions a shopper actually has before buying any one
 * shoe -- delivery, visiting the shop, authenticity, sizing -- repeated on
 * every product page rather than left only on /faq. An AI engine answering
 * "can I get this delivered" or "is this shoe original" from a search result
 * needs the answer attached to the product it was asked about, not three
 * clicks away on a separate page it may never reach. The sizing question is
 * the one genuinely per-product fact, built from what is actually in stock
 * for this shoe rather than a generic size range that may not apply to it.
 */
export function productFaqSchema(product: { name: string; sizesInStock: string[]; anyInStock: boolean }) {
  const sizingAnswer = product.sizesInStock.length
    ? `${product.name} is currently in stock in sizes ${product.sizesInStock.join(', ')}. If your size is not listed, message us on WhatsApp -- we can often source it.`
    : `${product.name} is not on the shelf in any size right now, but every listed size can still be ordered in from our supplier. Message us on WhatsApp with your size and we will tell you honestly how long it will take.`;

  return {
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'Do you deliver outside Nairobi?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes, Drip Emporium delivers countrywide across Kenya. Delivery cost depends on where the parcel is going, so we confirm it with you directly after you place your order.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can I visit the physical shop?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes, visit us at Dubai Merchants Mall, Shop F53, Ronald Ngala Street, Nairobi CBD. Open 08:00 to 20:00 daily.',
        },
      },
      {
        '@type': 'Question',
        name: `Is ${product.name} an original/authentic product?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. We stock genuine branded footwear and are happy for you to inspect any pair in person before you buy.',
        },
      },
      {
        '@type': 'Question',
        name: `What sizes does ${product.name} come in?`,
        acceptedAnswer: { '@type': 'Answer', text: sizingAnswer },
      },
    ],
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
