import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EliteLayout } from '../components/elite-layout';
import { ClubDirectory, FaqList } from '../components/kit-parts';
import { JsonLd, SITE_NAME, absoluteUrl } from '../lib/site';
import { sharePreviewUrl, brandPreviewImage } from '../lib/preview-image';
import { LEAGUES, fetchClubs, fetchDesign, fetchKitConfig, fetchKits, leaguePath } from '../lib/kits';
import {
  DESIGN_DESCRIPTION, breadcrumbSchema, designApplicationSchema, designFaqs, designHowTo, designTitle, faqSchema,
} from '../lib/kit-seo';
import { DesignCenter } from './design-center';

export const dynamic = 'force-dynamic';

type Params = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] ?? '' : value ?? '');

export async function generateMetadata({ searchParams }: { searchParams: Params }): Promise<Metadata> {
  const config = await fetchKitConfig();
  if (!config) return { title: 'Not found', robots: { index: false, follow: true } };
  const title = designTitle(config);
  const image = await brandPreviewImage();
  const withState = ['kit', 'club', 'edition', 'design'].some((k) => Boolean(first(searchParams[k])));
  return {
    title,
    description: DESIGN_DESCRIPTION,
    alternates: { canonical: '/design' },
    // A design center opened on a particular shirt or saved design is the same page: keep it out of the index.
    ...(withState ? { robots: { index: false, follow: true } } : {}),
    openGraph: { title: `${title} | ${SITE_NAME}`, description: DESIGN_DESCRIPTION, ...(image ? { images: [{ url: sharePreviewUrl(image), width: 1200, height: 630, type: 'image/jpeg' }] } : {}) },
    twitter: { card: image ? 'summary_large_image' : 'summary', title: `${title} | ${SITE_NAME}`, description: DESIGN_DESCRIPTION },
  };
}

export default async function DesignPage({ searchParams }: { searchParams: Params }) {
  const config = await fetchKitConfig();
  if (!config) notFound();
  const token = first(searchParams.design);
  const [clubs, kits, design] = await Promise.all([fetchClubs(true), fetchKits(), token ? fetchDesign(token) : Promise.resolve(null)]);
  const faqs = designFaqs(config);
  const withKits = clubs.filter((c) => c.kitCount > 0);

  return (
    <EliteLayout active="kits">
      <JsonLd data={breadcrumbSchema([{ name: 'Home', url: absoluteUrl('/') }, { name: 'Kits', url: absoluteUrl('/kits') }, { name: 'Design center', url: absoluteUrl('/design') }])} />
      <JsonLd data={designApplicationSchema(absoluteUrl)} />
      <JsonLd data={designHowTo(absoluteUrl)} />
      <JsonLd data={faqSchema(faqs)} />
      <main className="lp-main-content kt-page">
        <section className="lp-container kt-hero kt-hero-compact">
          <h1>{config.designCenter.heading}</h1>
          <p>{config.designCenter.intro}</p>
        </section>

        <DesignCenter
          config={config}
          clubs={clubs}
          kits={kits}
          initial={{ kit: first(searchParams.kit) || undefined, club: first(searchParams.club) || undefined, edition: first(searchParams.edition) || undefined, design }}
        />

        {/* Plain, crawlable copy under the tool: what it is, who it is for, where to go next. */}
        <section className="lp-container kt-copy">
          <h2>Custom football jerseys with your name and number</h2>
          <p>
            Pick a Premier League, La Liga, Kenyan or national team, choose a home, away or third kit, then type your name and number
            and choose a lettering style. You see the back of the shirt as it will be printed before you order, and we deliver across
            Kenya from Nairobi. Browse by league: {LEAGUES.map((l, i) => (
              <span key={l.key}>{i ? ', ' : ''}<Link href={leaguePath(l.slug)}>{l.name}</Link></span>
            ))}.
          </p>
          <h2>Custom T-shirt printing in Nairobi</h2>
          <p>
            Choose a crew-neck, V-neck or oversized T-shirt in one of eight colours, then add your own text or upload a picture. Move it,
            resize it and see the front and back before you pay. Good for gifts, teams, groups and events; for larger orders message us on WhatsApp.
          </p>
        </section>

        <ClubDirectory clubs={withKits} heading="Ready-made club shirts" />
        <FaqList faqs={faqs} />
      </main>
    </EliteLayout>
  );
}
