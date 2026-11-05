import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EliteLayout } from '../../components/elite-layout';
import { KitShirt, areasFor } from '../../components/kit-shirt';
import { fetchDesign, fetchKit, fetchKitConfig } from '../../lib/kits';
import { formatKes } from '../../lib/shop';
import { SITE_NAME } from '../../lib/site';
import { summarise } from '../design-utils';

export const dynamic = 'force-dynamic';

// A saved design belongs to whoever made it and is not a page to find in search: shared by link only.
export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const design = await fetchDesign(params.token);
  return {
    title: design ? `A custom shirt design | ${SITE_NAME}` : 'Design not found',
    robots: { index: false, follow: false },
    ...(design?.previewUrl ? { openGraph: { images: [{ url: design.previewUrl }] } } : {}),
  };
}

export default async function SavedDesignPage({ params }: { params: { token: string } }) {
  const [design, config] = await Promise.all([fetchDesign(params.token), fetchKitConfig()]);
  if (!design || !config) notFound();
  const product = design.productSlug ? await fetchKit(design.productSlug) : null;
  const { spec } = design;
  const areas = (product?.kit.printAreas as Record<string, { x: number; y: number; w: number; h: number }> | null) ?? areasFor(spec.templateKey);

  return (
    <EliteLayout active="kits">
      <main className="lp-main-content kt-page">
        <section className="lp-container kt-hero kt-hero-compact">
          <h1>{product?.name ?? 'Custom shirt'}</h1>
          <p>{summarise(spec) || 'A plain shirt'}. Print fee {formatKes(design.feeKes)}.</p>
        </section>
        <section className="lp-container kt-saved">
          {(['front', 'back'] as const).map((s) => (
            <figure key={s}>
              <KitShirt templateKey={spec.templateKey} colors={spec.colors} side={s} name={spec.name} number={spec.number} items={spec.items} areas={areas} photo={s === 'back' ? product?.kit.photoBack : product?.kit.photoFront} title={`${s} of the design`} />
              <figcaption>{s === 'front' ? 'Front' : 'Back'}</figcaption>
            </figure>
          ))}
        </section>
        <section className="lp-container kt-hero-actions">
          <Link href={`/design?design=${design.token}`} className="lp-button lp-button-primary">Open in the design center to order or change it</Link>
        </section>
        <p className="lp-container kt-note">{config.fanVersionNote}</p>
      </main>
    </EliteLayout>
  );
}
