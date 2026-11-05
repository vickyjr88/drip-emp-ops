import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EliteLayout } from '../../components/elite-layout';
import { JsonLd, SITE_NAME, absoluteUrl } from '../../lib/site';
import { fetchKitsEnabled } from '../../lib/kits';
import { KIT_GUIDES } from '../../lib/kit-guides';
import { breadcrumbSchema } from '../../lib/kit-seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Football Jersey & Custom T-Shirt Guides',
  description: 'Guides for buying a football jersey or custom T-shirt in Kenya: sizes, names and numbers, lettering styles, printing and gifts.',
  alternates: { canonical: '/kits/guides' },
  openGraph: { title: `Football Jersey & Custom T-Shirt Guides | ${SITE_NAME}` },
};

export default async function GuidesPage() {
  if (!(await fetchKitsEnabled())) notFound();
  return (
    <EliteLayout active="kits">
      <JsonLd data={breadcrumbSchema([{ name: 'Home', url: absoluteUrl('/') }, { name: 'Kits', url: absoluteUrl('/kits') }, { name: 'Guides', url: absoluteUrl('/kits/guides') }])} />
      <main className="lp-main-content kt-page">
        <section className="lp-container kt-hero">
          <h1>Jersey and T-shirt guides</h1>
          <p>Everything to know before you order a football jersey or custom T-shirt in Kenya.</p>
        </section>
        <section className="lp-container kt-guides">
          <ul>
            {KIT_GUIDES.map((guide) => (
              <li key={guide.slug}>
                <h2><Link href={`/kits/guides/${guide.slug}`}>{guide.title}</Link></h2>
                <p>{guide.description}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </EliteLayout>
  );
}
