import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JsonLd, SITE_NAME, absoluteUrl } from '../../lib/site';
import { sharePreviewUrl } from '../../lib/preview-image';
import { clubPath, fetchKit, fetchKitConfig, kitPath, leagueByKey, leaguePath } from '../../lib/kits';
import { breadcrumbSchema, faqSchema, kitDescription, kitFaqs, kitProductSchema, kitTitle } from '../../lib/kit-seo';
import { KitClient } from './kit-client';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const [product, config] = await Promise.all([fetchKit(params.slug), fetchKitConfig()]);
  if (!product || !config) return { title: 'Not found', robots: { index: false, follow: true } };
  const title = kitTitle(product);
  const description = kitDescription(product, config);
  // Link previews use the photo; a kit with none uses its drawn-shirt PNG in the 1200x630 shape.
  const preview = product.imageUrls[0] ? sharePreviewUrl(product.imageUrls[0]) : absoluteUrl(`/kits/image/${product.slug}?og=1`);
  return {
    title,
    description,
    alternates: { canonical: kitPath(product.slug) },
    openGraph: { title: `${product.name} | ${SITE_NAME}`, description, images: [{ url: preview, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title: `${product.name} | ${SITE_NAME}`, description, images: [preview] },
  };
}

export default async function KitPage({ params }: { params: { slug: string } }) {
  const [product, config] = await Promise.all([fetchKit(params.slug), fetchKitConfig()]);
  if (!product || !config) notFound();
  const league = product.kit.club ? leagueByKey(product.kit.club.league) : undefined;
  const faqs = kitFaqs(product, config);

  return (
    <>
      <JsonLd data={breadcrumbSchema([
        { name: 'Home', url: absoluteUrl('/') },
        { name: 'Kits', url: absoluteUrl('/kits') },
        ...(league ? [{ name: league.name, url: absoluteUrl(leaguePath(league.slug)) }] : []),
        ...(product.kit.club ? [{ name: product.kit.club.name, url: absoluteUrl(clubPath(product.kit.club.slug)) }] : []),
        { name: product.name, url: absoluteUrl(kitPath(product.slug)) },
      ])} />
      <JsonLd data={kitProductSchema(product, absoluteUrl)} />
      <JsonLd data={faqSchema(faqs)} />
      <KitClient product={product} config={config} faqs={faqs} />
    </>
  );
}
