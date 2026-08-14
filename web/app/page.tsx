import type { Metadata } from 'next';
import { JsonLd, SITE_DESCRIPTION, SITE_NAME, SITE_URL, absoluteUrl } from './lib/site';
import { seoMetadata } from './lib/page-metadata';
import HomeClient from './home-client';

/**
 * Server wrapper for the home page. The page itself is interactive (search,
 * carousels), but title, description and structured data must be server-
 * rendered or a crawler sees an empty shell.
 */

export async function generateMetadata(): Promise<Metadata> {
  // No title: home uses the layout's default rather than the "%s | Brand"
  // template, so it reads as the site rather than a section of it.
  return seoMetadata({
    key: 'home',
    path: '/',
    description: SITE_DESCRIPTION,
    shareTitle: `${SITE_NAME} | Property Sales, Rentals and Management in Nairobi`,
  });
}

export default function HomePage() {
  return (
    <>
      {/* The questions a person actually asks before calling an agent. This is
          the content an assistant can quote directly, and it is what earns a
          place in an answer rather than only a blue link. */}
      <JsonLd
        data={{
          '@type': 'FAQPage',
          '@id': `${SITE_URL}/#faq`,
          mainEntity: [
            {
              '@type': 'Question',
              name: `What does ${SITE_NAME} do?`,
              acceptedAnswer: {
                '@type': 'Answer',
                text: `${SITE_NAME} sells and lets residential property in Nairobi, and manages portfolios on behalf of owners. That covers finding a buyer or tenant, collecting rent, handling statements and payments, and overseeing construction on developments still being built.`,
              },
            },
            {
              '@type': 'Question',
              name: 'Where are your properties?',
              acceptedAnswer: {
                '@type': 'Answer',
                text: 'Our developments are in Nairobi and the surrounding area. Each listing shows its project, location and floor, along with the price in Kenyan shillings.',
              },
            },
            {
              '@type': 'Question',
              name: 'How do I arrange a viewing?',
              acceptedAnswer: {
                '@type': 'Answer',
                text: 'Every listing has an inquiry form that reaches our team directly, or you can use the contact page. Tell us which unit you are interested in and we will arrange a time.',
              },
            },
            {
              '@type': 'Question',
              name: 'Can I pay for a unit in instalments?',
              acceptedAnswer: {
                '@type': 'Answer',
                text: 'Yes. Sales contracts can carry a payment schedule rather than a single payment, and you can see what has been paid and what is outstanding at any time through the client portal.',
              },
            },
            {
              '@type': 'Question',
              name: 'I already own or rent through you. Where do I see my statement?',
              acceptedAnswer: {
                '@type': 'Answer',
                text: `Sign in to the client portal at ${absoluteUrl('/portal')}. Owners and tenants can see payments, statements and documents there.`,
              },
            },
          ],
        }}
      />
      <HomeClient />
    </>
  );
}
