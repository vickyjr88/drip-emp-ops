import type { Metadata } from 'next';
import { seoMetadata } from '../lib/page-metadata';
import { LegalPage } from '../components/legal-page';

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata({
    key: 'privacy',
    path: '/privacy',
    title: 'Privacy Policy',
    description: 'How Dirrir Realtors collects, uses and protects the information you share.',
  });
}

// Rendered per request so CMS edits appear without a rebuild.
export const dynamic = 'force-dynamic';

export default function PrivacyPage() {
  return (
    <LegalPage
      slug="privacy"
      defaultHeading="Privacy Policy"
      defaultIntro="How we collect, use and protect the information you share with us."
    />
  );
}
