import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EliteLayout } from '../../../components/elite-layout';
import { FaqList } from '../../../components/kit-parts';
import { BrandDirectory, WatchCard } from '../../../components/watch-parts';
import { JsonLd, SITE_NAME, absoluteUrl } from '../../../lib/site';
import { fetchWatchBrands, fetchWatches, watchBrandPath } from '../../../lib/watches';
import { breadcrumbSchema, faqSchema } from '../../../lib/kit-seo';
import { brandDescription, brandFaqs, brandIntro, brandTitle, watchListSchema } from '../../../lib/watch-seo';

export const dynamic = 'force-dynamic';

async function load(slug: string) {
  const brands = await fetchWatchBrands();
  const brand = brands.find((b) => b.slug === slug);
  if (!brand) return null;
  return { brand, brands, watches: await fetchWatches({ brand: brand.name }) };
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const data = await load(params.slug);
  if (!data) return { title: 'Not found', robots: { index: false, follow: true } };
  const title = brandTitle(data.brand.name, data.watches);
  const description = brandDescription(data.brand.name, data.watches);
  const image = data.watches.find((w) => w.imageUrls[0])?.imageUrls[0];
  return {
    title,
    description,
    alternates: { canonical: watchBrandPath(data.brand.slug) },
    // A brand with a single watch is thin; it stays reachable but out of the index.
    ...(data.watches.length < 2 ? { robots: { index: false, follow: true } } : {}),
    openGraph: { title: `${title} | ${SITE_NAME}`, description, ...(image ? { images: [{ url: absoluteUrl(`/og/share.jpg?src=${encodeURIComponent(image)}`), width: 1200, height: 630, type: 'image/jpeg' }] } : {}) },
    twitter: { card: image ? 'summary_large_image' : 'summary', title: `${title} | ${SITE_NAME}`, description },
  };
}

export default async function BrandPage({ params }: { params: { slug: string } }) {
  const data = await load(params.slug);
  if (!data) notFound();
  const { brand, brands, watches } = data;
  const faqs = brandFaqs(brand.name, watches);
  return (
    <EliteLayout active="watches">
      <JsonLd data={breadcrumbSchema([{ name: 'Home', url: absoluteUrl('/') }, { name: 'Watches', url: absoluteUrl('/watches') }, { name: brand.name, url: absoluteUrl(watchBrandPath(brand.slug)) }])} />
      <JsonLd data={{ '@type': 'CollectionPage', name: brandTitle(brand.name, watches), url: absoluteUrl(watchBrandPath(brand.slug)), description: brandDescription(brand.name, watches) }} />
      <JsonLd data={watchListSchema(watches, absoluteUrl, `${brand.name} watches`)} />
      <JsonLd data={faqSchema(faqs)} />
      <main className="lp-main-content kt-page wt-page">
        <nav className="lp-container de-crumbs" aria-label="Breadcrumb"><Link href="/watches">Watches</Link><span aria-hidden="true">/</span><span>{brand.name}</span></nav>
        <section className="lp-container kt-hero">
          <h1>{brand.name} Watches in Kenya</h1>
          <p>{brandIntro(brand.name, watches)}</p>
        </section>
        <section className="lp-container de-grid-wrap">
          <div className="de-grid">{watches.map((w) => <WatchCard key={w.id} watch={w} />)}</div>
        </section>
        <BrandDirectory brands={brands.filter((b) => b.slug !== brand.slug)} heading="More watch brands" />
        <FaqList faqs={faqs} />
      </main>
    </EliteLayout>
  );
}
