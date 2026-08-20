import type { Metadata } from 'next';
import { JsonLd, SITE_DESCRIPTION, SITE_NAME, SITE_URL, absoluteUrl } from './lib/site';
import { seoMetadata } from './lib/page-metadata';
import { contentValue, fetchPageContent } from './lib/page-content';
import HomeClient from './home-client';

/**
 * Server wrapper for the home page. The page itself is interactive (search,
 * carousels), but title, description and structured data must be server-
 * rendered or a crawler sees an empty shell.
 */

export async function generateMetadata(): Promise<Metadata> {
  const content = await fetchPageContent('home');
  // No title: home uses the layout's default rather than the "%s | Brand"
  // template, so it reads as the site rather than a section of it.
  return seoMetadata({
    key: 'home',
    path: '/',
    description: SITE_DESCRIPTION,
    shareTitle: `${SITE_NAME} | Quality Affordable Sneakers & Streetwear in Nairobi`,
    image: contentValue(content, 'hero.backgroundImage', ''),
  });
}

export default function HomePage() {
  return (
    <>
      {/* The questions a shopper actually asks before buying. This is the
          content an assistant can quote directly, and it is what earns a
          place in an answer rather than only a blue link. */}
      <JsonLd
        data={{
          '@type': 'FAQPage',
          '@id': `${SITE_URL}/#faq`,
          mainEntity: [
            {
              '@type': 'Question',
              name: `What does ${SITE_NAME} sell?`,
              acceptedAnswer: {
                '@type': 'Answer',
                text: `${SITE_NAME} stocks genuine sneakers and streetwear from Nike, Adidas, Jordan and Puma, in sizes EUR 36-46, at two shops in Nairobi.`,
              },
            },
            {
              '@type': 'Question',
              name: 'Where are your shops?',
              acceptedAnswer: {
                '@type': 'Answer',
                text: 'Dubai Merchants Mall shop F53 and Palms Mall shop BF75, both on Ronald Ngala Street, Nairobi. Open 08:00 to 20:00 daily.',
              },
            },
            {
              '@type': 'Question',
              name: 'How do I order?',
              acceptedAnswer: {
                '@type': 'Answer',
                text: 'Buy online with card through the shop, or message us on WhatsApp with the shoe and your size and we will confirm availability and arrange payment and delivery or collection.',
              },
            },
            {
              '@type': 'Question',
              name: 'What if my size is not shown as in stock?',
              acceptedAnswer: {
                '@type': 'Answer',
                text: 'You can still order it. Sizes not on the shelf are sourced from our supplier, and the order is tracked the same way as any other until it reaches the shop.',
              },
            },
            {
              '@type': 'Question',
              name: 'Where do I see my order?',
              acceptedAnswer: {
                '@type': 'Answer',
                text: `Sign in to your account at ${absoluteUrl('/account')} to track an order, or message us on WhatsApp with your order number.`,
              },
            },
          ],
        }}
      />
      <HomeClient />
    </>
  );
}
