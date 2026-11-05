import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EliteLayout } from '../../components/elite-layout';
import { KitShirt, areasFor, areasFromFractions } from '../../components/kit-shirt';
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
  // A design on an uploaded template is drawn on that template's photo for the chosen colour.
  const template = config.templates.find((t) => t.key === spec.templateKey && t.custom);
  const colour = template?.colours?.find((c) => c.hex.toLowerCase() === spec.colors.primary.toLowerCase()) ?? template?.colours?.[0];
  const photos = { front: template ? colour?.front ?? null : product?.kit.photoFront ?? null, back: template ? colour?.back ?? null : product?.kit.photoBack ?? null };
  const aspect = template?.aspect ?? product?.kit.photoAspect ?? null;
  const fractions = (template?.areas ?? product?.kit.printAreas ?? null) as Record<string, { x: number; y: number; w: number; h: number }> | null;
  const areas = photos.front || photos.back ? areasFromFractions(fractions, aspect, product?.kit.kind ?? 'TSHIRT') : areasFor(spec.templateKey);

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
              <KitShirt templateKey={spec.templateKey} colors={spec.colors} side={s} name={spec.name} number={spec.number} items={spec.items} areas={areas} photo={s === 'back' ? photos.back : photos.front} photoAspect={aspect} title={`${s} of the design`} />
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
