import type { Metadata } from 'next';
import Link from 'next/link';
import { EliteLayout } from './components/elite-layout';
import { previewFor } from './lib/preview-image';

/**
 * Custom 404.
 *
 * A 404 is usually reached by someone who wanted something specific -- a
 * size that sold out and was delisted, a mistyped URL, a stale link from
 * elsewhere (this site used to run on a different platform, so old bookmarks
 * and search results for it still turn up occasionally). So this is a set of
 * routes onward rather than an apology: the destinations are ordered by what
 * a lost visitor most likely wanted, with the shop first because that is
 * what the site is for.
 *
 * Next returns HTTP 404 for this route automatically, which matters -- a soft
 * 404 (a "not found" page served as 200) gets the URL indexed as real content.
 */

export async function generateMetadata(): Promise<Metadata> {
  const preview = await previewFor('/404');
  return {
    title: 'Page not found',
    description:
      'That page could not be found. Shop sneakers and streetwear, or get in touch with the Drip Emporium team.',
    // Keep dead URLs out of the index while still serving a useful page.
    robots: { index: false, follow: true },
    // noindex does not stop a chat client or messaging app unfurling the link
    // someone pasted, so the card should still look like the site.
    openGraph: { ...preview, title: 'Page not found | Drip Emporium' },
  };
}

const DESTINATIONS = [
  {
    href: '/shop',
    title: 'Shop All',
    body: 'Sneakers and streetwear from Nike, Adidas, Jordan and Puma, EUR 36-46.',
  },
  {
    href: '/cart',
    title: 'Your cart',
    body: 'Pick up where you left off if you were mid checkout.',
  },
  {
    href: '/about',
    title: 'About Drip Emporium',
    body: 'Who we are, and where to find our two shops on Ronald Ngala Street.',
  },
  {
    href: '/contact',
    title: 'Talk to us',
    body: 'Ask about a size, an order, or anything else.',
  },
  {
    href: '/account',
    title: 'Your account',
    body: 'Sign in to track an order or see what is on its way.',
  },
];

export default function NotFound() {
  return (
    <EliteLayout active="none">
      <main className="lp-main-content">
        <section className="lp-container notfound-hero">
          <p className="lp-about-eyebrow">Error 404</p>
          <h1>We couldn&rsquo;t find that page</h1>
          <p className="notfound-lede">
            The link may be out of date, or a pair that has since sold out. Here is where most
            people go next.
          </p>
        </section>

        <section className="lp-container notfound-grid" aria-label="Where to go next">
          {DESTINATIONS.map((destination) => (
            <Link key={destination.href} href={destination.href} className="notfound-card">
              <h2>{destination.title}</h2>
              <p>{destination.body}</p>
              <span className="notfound-card-cue" aria-hidden>
                →
              </span>
            </Link>
          ))}
        </section>

        <section className="lp-container notfound-footnote">
          <p>
            Looking for something specific and not finding it?{' '}
            <Link href="/contact">Tell us what you need</Link> and we will point you to it.
          </p>
        </section>
      </main>
    </EliteLayout>
  );
}
