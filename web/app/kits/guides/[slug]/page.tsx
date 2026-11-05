import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EliteLayout } from '../../../components/elite-layout';
import { JsonLd, SITE_NAME, absoluteUrl } from '../../../lib/site';
import { DESIGN_PATH, fetchKitsEnabled } from '../../../lib/kits';
import { KIT_GUIDES, guideBySlug } from '../../../lib/kit-guides';
import { breadcrumbSchema } from '../../../lib/kit-seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const guide = guideBySlug(params.slug);
  if (!guide || !(await fetchKitsEnabled())) return { title: 'Not found', robots: { index: false, follow: true } };
  return {
    title: guide.title,
    description: guide.description,
    alternates: { canonical: `/kits/guides/${guide.slug}` },
    openGraph: { title: `${guide.title} | ${SITE_NAME}`, description: guide.description, type: 'article' },
  };
}

export default async function GuidePage({ params }: { params: { slug: string } }) {
  const guide = guideBySlug(params.slug);
  if (!guide || !(await fetchKitsEnabled())) notFound();
  const url = absoluteUrl(`/kits/guides/${guide.slug}`);
  const others = KIT_GUIDES.filter((g) => g.slug !== guide.slug).slice(0, 4);

  return (
    <EliteLayout active="kits">
      <JsonLd data={breadcrumbSchema([
        { name: 'Home', url: absoluteUrl('/') },
        { name: 'Kits', url: absoluteUrl('/kits') },
        { name: 'Guides', url: absoluteUrl('/kits/guides') },
        { name: guide.title, url },
      ])} />
      <JsonLd data={{
        '@type': 'Article',
        headline: guide.title,
        description: guide.description,
        dateModified: guide.updated,
        datePublished: guide.updated,
        mainEntityOfPage: url,
        author: { '@id': `${absoluteUrl('/')}#organization` },
        publisher: { '@id': `${absoluteUrl('/')}#organization` },
      }} />
      <main className="lp-main-content kt-page">
        <nav className="lp-container de-crumbs" aria-label="Breadcrumb">
          <Link href="/kits">Kits</Link><span aria-hidden="true">/</span><Link href="/kits/guides">Guides</Link>
        </nav>
        <article className="lp-container kt-article">
          <h1>{guide.title}</h1>
          <p className="kt-lead">{guide.intro}</p>
          {guide.sections.map((section) => (
            <section key={section.heading}>
              <h2>{section.heading}</h2>
              {section.paragraphs.map((text) => <p key={text}>{text}</p>)}
            </section>
          ))}
          <p className="kt-cta"><Link href={DESIGN_PATH} className="lp-button lp-button-primary">Design your own shirt</Link> <Link href="/kits" className="lp-button lp-button-ghost">Browse jerseys</Link></p>
        </article>
        <section className="lp-container kt-guides">
          <h2>More guides</h2>
          <ul>{others.map((g) => <li key={g.slug}><h3><Link href={`/kits/guides/${g.slug}`}>{g.title}</Link></h3></li>)}</ul>
        </section>
      </main>
    </EliteLayout>
  );
}
