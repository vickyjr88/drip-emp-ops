/**
 * Frequently asked questions.
 *
 * Unlike Terms and Privacy, this ships with real answers. Those two are legal
 * copy that has to be written and approved, so an invented placeholder would be
 * worse than an empty page; these are just the questions the shop already
 * answers on WhatsApp every day, and a shopper reading them at midnight is the
 * whole point. Every one is editable in the portal.
 *
 * Server-rendered: the content is static text that belongs in the HTML for
 * crawlers, and FAQ pages earn their keep in search results.
 */

import { EliteLayout } from './elite-layout';
import { contentValue, fetchPageContent } from '../lib/page-content';

type FaqItem = { question?: string; answer?: string };

/**
 * The answers as the shop actually operates today.
 *
 * Deliberately consistent with the rest of the site: delivery is arranged after
 * the order rather than charged at checkout, and payment is by card or M-Pesa
 * through Paystack. If either changes, these change with them -- which is why
 * they are editable rather than hardcoded in the markup.
 */
const DEFAULT_FAQS: FaqItem[] = [
  {
    question: 'Do you deliver, and what does it cost?',
    answer:
      'Yes, countrywide. Delivery is not charged at checkout because the cost depends on where the parcel is going. Place your order and we will call you to arrange delivery and confirm the cost separately.',
  },
  {
    question: 'Can I collect my order instead?',
    answer:
      'Yes. Choose collection at checkout and pick up from either shop on Ronald Ngala Street, Nairobi — Dubai Merchants Mall shop F53 or Palms Mall shop BF75. Both are open 08:00 to 20:00.',
  },
  {
    question: 'How do I pay?',
    answer:
      'By card or M-Pesa through Paystack when you check out online. You can also send your order on WhatsApp and pay on collection.',
  },
  {
    question: 'What sizes do you stock?',
    answer:
      'Sizes run from EUR 36 to EUR 46, though the run varies by style — each product page lists the sizes that shoe actually comes in. If a size shows as "to order" we can still get it for you.',
  },
  {
    question: 'What if the size I want is not listed?',
    answer:
      'Message us on WhatsApp with the shoe and the size. We often source sizes we do not have on the shelf, and we will tell you honestly how long it will take.',
  },
  {
    question: 'Can I try the shoes before I pay?',
    answer:
      'At either shop, yes. Come in, try them on, and pay only if they fit. That is the advantage of collecting rather than having them delivered.',
  },
  {
    question: 'Are your shoes original?',
    answer:
      'Yes. We stock genuine branded footwear and are happy for you to inspect anything in person before you buy.',
  },
  {
    question: 'Can I exchange or return something?',
    answer:
      'Talk to us on WhatsApp or in the shop as soon as you can. Unworn shoes in their original box are the easiest to exchange, and we would rather sort out a wrong size than leave you with shoes you will not wear.',
  },
  {
    question: 'Do you sell wholesale or to other shops?',
    answer:
      'Yes. We price separately for resellers and for bulk orders. Get in touch on WhatsApp or by phone and ask for trade pricing.',
  },
];

export async function FaqPage() {
  const content = await fetchPageContent('faq');

  const kicker = contentValue(content, 'hero.kicker', 'Help');
  const heading = contentValue(content, 'hero.heading', 'Frequently Asked Questions');
  const intro = contentValue(
    content,
    'hero.intro',
    'Delivery, sizing, payment and collection — the things people ask us most. Anything else, message us on WhatsApp.',
  );

  // An empty list in the CMS falls back to the built-in answers rather than
  // rendering a blank page: a shop with no FAQs looks unfinished, and these are
  // true until someone deliberately changes them.
  const edited = contentValue<FaqItem[]>(content, 'items', []).filter(
    (item) => item.question?.trim() || item.answer?.trim(),
  );
  const faqs = edited.length ? edited : DEFAULT_FAQS;

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
          {faqs.map((item, index) => (
            // <details> rather than a JS accordion: it opens without hydration,
            // works before the bundle loads, and is searchable by the browser's
            // own find-in-page, which a collapsed div is not.
            <details key={`${item.question}-${index}`} className="de-faq-item">
              <summary>{item.question}</summary>
              {item.answer
                ? item.answer.split(/\n{2,}/).map((paragraph, pIndex) => (
                    <p key={pIndex}>{paragraph}</p>
                  ))
                : null}
            </details>
          ))}
        </section>
      </main>
    </EliteLayout>
  );
}
