import type { Metadata } from 'next';
import { seoMetadata } from '../lib/page-metadata';
import { FaqPage } from '../components/faq-page';

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

export default function Faq() {
  return <FaqPage />;
}
