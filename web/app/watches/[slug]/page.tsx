import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JsonLd, SITE_NAME, absoluteUrl } from '../../lib/site';
import { fetchWatch, watchBrandPath, watchPath, brandSlug } from '../../lib/watches';
import { breadcrumbSchema, faqSchema } from '../../lib/kit-seo';
import { watchDescription, watchFaqs, watchProductSchema, watchTitle } from '../../lib/watch-seo';
import { WatchClient } from './watch-client';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const watch = await fetchWatch(params.slug);
  if (!watch) return { title: 'Watch not found', robots: { index: false, follow: true } };
  const title = watchTitle(watch);
  const description = watchDescription(watch);
  const image = watch.imageUrls[0];
  const preview = image ? absoluteUrl(`/og/share.jpg?src=${encodeURIComponent(image)}`) : null;
  return {
    title,
    description,
    alternates: { canonical: watchPath(watch.slug) },
    openGraph: { title: `${watch.name} | ${SITE_NAME}`, description, ...(preview ? { images: [{ url: preview, width: 1200, height: 630, type: 'image/jpeg' }] } : {}) },
    twitter: { card: preview ? 'summary_large_image' : 'summary', title: `${watch.name} | ${SITE_NAME}`, description, ...(preview ? { images: [preview] } : {}) },
  };
}

export default async function WatchPage({ params }: { params: { slug: string } }) {
  const watch = await fetchWatch(params.slug);
  if (!watch) notFound();
  const faqs = watchFaqs(watch);
  return (
    <>
      <JsonLd data={breadcrumbSchema([
        { name: 'Home', url: absoluteUrl('/') },
        { name: 'Watches', url: absoluteUrl('/watches') },
        ...(watch.brand ? [{ name: watch.brand, url: absoluteUrl(watchBrandPath(brandSlug(watch.brand))) }] : []),
        { name: watch.name, url: absoluteUrl(watchPath(watch.slug)) },
      ])} />
      <JsonLd data={watchProductSchema(watch, absoluteUrl)} />
      <JsonLd data={faqSchema(faqs)} />
      <WatchClient watch={watch} faqs={faqs} />
    </>
  );
}
