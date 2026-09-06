import type { Metadata } from 'next';
import Link from 'next/link';
import { seoMetadata } from '../lib/page-metadata';
import { EliteLayout } from '../components/elite-layout';
import { contentValue, fetchPageContent } from '../lib/page-content';

/**
 * Affiliate / reseller program landing page.
 *
 * The application itself lives on /account (a logged-in customer applies
 * from a panel there; customer-portal.controller.ts's reseller-application
 * endpoint is what actually receives it), and the reseller's own dashboard
 * is /account/reseller once approved. This page's job is narrower: explain
 * the program in plain terms to someone who has never heard of it -- often
 * arriving from an old bookmarked link or a search result -- and send them
 * to sign in or apply, rather than duplicating the application form here.
 */

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata({
    key: 'affiliate',
    path: '/affiliate',
    title: 'Affiliate Program',
    description:
      'Earn commission referring customers to Drip Emporium, or buy at reseller pricing. Apply from your account.',
  });
}

// Rendered per request so CMS edits appear without a rebuild.
export const dynamic = 'force-dynamic';

type FaqItem = { question?: string; answer?: string };

const DEFAULT_FAQS: FaqItem[] = [
  {
    question: 'How does the referral link work?',
    answer:
      'Once approved, your account page gives you a personal link to the shop. Anyone who buys through it is credited to you, whether they check out online or message us on WhatsApp.',
  },
  {
    question: 'What do I earn?',
    answer:
      'Commission on every order your link brings in, tracked on your own dashboard alongside your balance and payout history. Staff arrange payouts once your balance is ready to release.',
  },
  {
    question: 'Can I also buy at reseller prices?',
    answer:
      'Yes. Approved accounts see reseller or wholesale pricing on the shop, separate from referral commission -- useful if you stock or resell yourself rather than only referring.',
  },
  {
    question: 'How do I apply?',
    answer:
      'Sign in (or create an account first), then apply from the "Affiliate program" panel on your account page with a little about your business. We review every application by hand.',
  },
];

export default async function AffiliatePage() {
  const content = await fetchPageContent('affiliate');

  const kicker = contentValue(content, 'hero.kicker', 'Affiliate Program');
  const heading = contentValue(content, 'hero.heading', 'Earn by Sharing What You Already Love');
  const intro = contentValue(
    content,
    'hero.intro',
    'Refer customers to Drip Emporium and earn commission on what they buy, or apply for reseller pricing if you sell yourself.',
  );

  const faqs = contentValue<FaqItem[]>(content, 'items', []).filter(
    (item) => item.question?.trim() && item.answer?.trim(),
  );
  const items = faqs.length ? faqs : DEFAULT_FAQS;

  return (
    <EliteLayout active="none">
      <main className="lp-main-content lp-services-page">
        <section className="lp-services-hero">
          <div className="lp-container lp-services-hero-inner">
            <p>{kicker}</p>
            <h1>{heading}</h1>
            <span className="lp-divider" aria-hidden="true" />
            {intro ? <p className="lp-services-intro">{intro}</p> : null}
          </div>
        </section>

        <section className="lp-container de-faq">
          {items.map((item, index) => (
            <details key={`${item.question}-${index}`} className="de-faq-item">
              <summary>{item.question}</summary>
              {item.answer ? <p>{item.answer}</p> : null}
            </details>
          ))}
        </section>

        <section className="lp-area-cta">
          <div className="lp-container">
            <h2>Ready to apply?</h2>
            <p>Sign in to your account and apply from the Affiliate program panel — we review every application by hand.</p>
            <div className="lp-area-cta-actions">
              <Link className="lp-button lp-button-primary" href="/account">Go to your account</Link>
              <Link className="lp-button lp-button-ghost" href="/shop">Browse the shop</Link>
            </div>
          </div>
        </section>
      </main>
    </EliteLayout>
  );
}
