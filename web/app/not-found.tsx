import type { Metadata } from 'next';
import Link from 'next/link';
import { EliteLayout } from './components/elite-layout';
import { previewFor } from './lib/preview-image';

/**
 * Custom 404.
 *
 * A 404 is usually reached by someone who wanted something specific -- a
 * listing that has since sold, a mistyped URL, a stale link from elsewhere.
 * So this is a set of routes onward rather than an apology: the destinations
 * are ordered by what a lost visitor most likely wanted, with listings first
 * because that is what the site is for.
 *
 * Next returns HTTP 404 for this route automatically, which matters -- a soft
 * 404 (a "not found" page served as 200) gets the URL indexed as real content.
 */

export async function generateMetadata(): Promise<Metadata> {
  const preview = await previewFor('/404');
  return {
    title: 'Page not found',
    description:
      'That page could not be found. Browse available listings, explore our services, or get in touch with the Dirrir Realtors team.',
    // Keep dead URLs out of the index while still serving a useful page.
    robots: { index: false, follow: true },
    // noindex does not stop a chat client or messaging app unfurling the link
    // someone pasted, so the card should still look like the site.
    openGraph: { ...preview, title: 'Page not found | Dirrir Realtors' },
  };
}

const DESTINATIONS = [
  {
    href: '/listings',
    title: 'Browse listings',
    body: 'Apartments, townhouses and plots currently available, with prices, floor plans and photos.',
  },
  {
    href: '/services',
    title: 'What we do',
    body: 'Sales, lettings, portfolio management and construction oversight.',
  },
  {
    href: '/about',
    title: 'About Dirrir Realtors',
    body: 'Who we are, how we work, and the developments we have delivered.',
  },
  {
    href: '/contact',
    title: 'Talk to us',
    body: 'Ask about a specific property or arrange a viewing.',
  },
  {
    href: '/portal',
    title: 'Client portal',
    body: 'Owners and tenants: statements, payments and documents.',
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
            The link may be out of date, or a property that has since been sold or let. Here is
            where most people go next.
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
