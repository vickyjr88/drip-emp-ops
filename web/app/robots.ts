import type { MetadataRoute } from 'next';
import { SITE_URL } from './lib/site';

/**
 * robots.txt.
 *
 * The portal and account areas are behind auth and have no business in a
 * search index -- disallowing them keeps crawl budget on the public pages that
 * do. This is not a security control: it stops well-behaved crawlers, nothing
 * else, and the routes are protected by authentication regardless.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/portal', '/portal/', '/account', '/account/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
