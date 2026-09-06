import type { Metadata } from 'next';
import { seoMetadata } from '../lib/page-metadata';
import { FaqPage, fetchFaqs } from '../components/faq-page';
import { JsonLd, SITE_URL } from '../lib/site';

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata({
    key: 'faq',
    path: '/faq',
    title: 'Frequently Asked Questions',
    description:
      'Delivery, sizing, payment, collection and returns at Drip Emporium.',
  });
}

// Rendered per request so CMS edits appear without a rebuild.
export const dynamic = 'force-dynamic';

export default async function Faq() {
  const faqs = await fetchFaqs();
  const answeredFaqs = faqs.filter((item) => item.question?.trim() && item.answer?.trim());

  return (
    <>
      {/* Lives here rather than on the home page: an assistant or search
          result quoting an FAQ answer should link to the page that actually
          contains it. */}
      {answeredFaqs.length ? (
        <JsonLd
          data={{
            '@type': 'FAQPage',
            '@id': `${SITE_URL}/faq#faq`,
            mainEntity: answeredFaqs.map((item) => ({
              '@type': 'Question',
              name: item.question,
              acceptedAnswer: { '@type': 'Answer', text: item.answer },
            })),
          }}
        />
      ) : null}
      <FaqPage faqs={faqs} />
    </>
  );
}
