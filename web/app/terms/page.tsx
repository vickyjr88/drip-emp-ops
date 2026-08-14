import type { Metadata } from 'next';
import { seoMetadata } from '../lib/page-metadata';
import { LegalPage } from '../components/legal-page';

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata({
    key: 'terms',
    path: '/terms',
    title: 'Terms of Service',
    description: 'The terms on which the Drip Emporium website and services are offered.',
  });
}

// Rendered per request so CMS edits appear without a rebuild.
export const dynamic = 'force-dynamic';

export default function TermsPage() {
  return (
    <LegalPage
      slug="terms"
      defaultHeading="Terms of Service"
      defaultIntro="The terms on which this website and our services are offered."
    />
  );
}
