import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EliteLayout } from '../components/elite-layout';
import { ClubDirectory, FanVersionNote, FaqList, KitCard } from '../components/kit-parts';
import { KitShowcase } from '../components/kit-showcase';
import { JsonLd, SITE_NAME, absoluteUrl } from '../lib/site';
import { sharePreviewUrl } from '../lib/preview-image';
import { DESIGN_PATH, LEAGUES, fetchClubs, fetchKitConfig, fetchKits, leaguePath } from '../lib/kits';
import {
  breadcrumbSchema, faqSchema, itemListSchema, listingDescription, listingFaqs, listingTitle,
} from '../lib/kit-seo';

// Rendered per request: the grid reflects the filters in the URL, and a switched-off line is a 404 at once.
export const dynamic = 'force-dynamic';

const VIEW_PARAMS = ['kind', 'size', 'search', 'sort', 'inStockOnly', 'minPrice', 'maxPrice'];
type Params = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] ?? '' : value ?? '');

export async function generateMetadata({ searchParams }: { searchParams: Params }): Promise<Metadata> {
  const config = await fetchKitConfig();
  if (!config) return { title: 'Not found', robots: { index: false, follow: true } };
  const kits = await fetchKits();
  const title = listingTitle(config);
  const description = listingDescription(kits);
  // The listing shares the jersey card, including when a product photo exists. Filtered views are noindex.
  const image = absoluteUrl('/images/kits/link-preview.jpg');
  // A filtered grid is thin duplicate content: the canonical stays /kits and the view is kept out of the index.
  const filtered = VIEW_PARAMS.some((key) => Boolean(first(searchParams[key])));
  return {
    title,
    description,
    alternates: { canonical: '/kits' },
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
    openGraph: { title: `${title} | ${SITE_NAME}`, description, ...(image ? { images: [{ url: sharePreviewUrl(image), width: 1200, height: 630, type: 'image/jpeg' }] } : {}) },
    twitter: { card: image ? 'summary_large_image' : 'summary', title: `${title} | ${SITE_NAME}`, description },
  };
}

export default async function KitsPage({ searchParams }: { searchParams: Params }) {
  const config = await fetchKitConfig();
  if (!config) notFound();

  const query = {
    kind: first(searchParams.kind) || undefined,
    size: first(searchParams.size) || undefined,
    search: first(searchParams.search) || undefined,
    sort: first(searchParams.sort) || undefined,
    inStockOnly: first(searchParams.inStockOnly) || undefined,
  };
  const [kits, all, clubRows] = await Promise.all([fetchKits(query), fetchKits(), fetchClubs(true)]);
  const clubs = clubRows.filter((club) => club.kitCount > 0);
  const faqs = listingFaqs(config);
  const filtered = Object.values(query).some(Boolean);
  const sizes = Array.from(new Set(all.flatMap((k) => k.variants.map((v) => v.size).filter((s): s is string => Boolean(s)))));

  return (
    <EliteLayout active="kits">
      <JsonLd data={breadcrumbSchema([{ name: 'Home', url: absoluteUrl('/') }, { name: 'Kits', url: absoluteUrl('/kits') }])} />
      <JsonLd data={itemListSchema(kits, absoluteUrl, listingTitle(config))} />
      <JsonLd data={faqSchema(faqs)} />
      <main className="lp-main-content kt-page">
        {filtered ? null : (
          <KitShowcase fanVersionNote={config.fanVersionNote} activeClubSlugs={clubRows.map((club) => club.slug)} />
        )}
        <section className="lp-container kt-hero">
          <h1>{config.listing.heading}</h1>
          <p>{config.listing.intro}</p>
          <div className="kt-hero-actions">
            <Link href={DESIGN_PATH} className="lp-button lp-button-primary">Design your own</Link>
            {LEAGUES.slice(0, 3).map((league) => (
              <Link key={league.key} href={leaguePath(league.slug)} className="lp-button lp-button-ghost">{league.name}</Link>
            ))}
          </div>
          <FanVersionNote text={config.fanVersionNote} />
        </section>

        <section className="lp-container kt-filters" aria-label="Filter kits">
          <form method="get" action="/kits">
            <input type="search" name="search" defaultValue={query.search} placeholder="Search a club, e.g. Arsenal, Man U, Spurs" aria-label="Search kits" />
            <select name="kind" defaultValue={query.kind ?? ''} aria-label="Type">
              <option value="">All shirts</option>
              <option value="JERSEY">Jerseys</option>
              <option value="TSHIRT">T-shirts</option>
            </select>
            <select name="size" defaultValue={query.size ?? ''} aria-label="Size">
              <option value="">Any size</option>
              {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select name="sort" defaultValue={query.sort ?? ''} aria-label="Sort">
              <option value="">Newest</option>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
              <option value="name">Name</option>
            </select>
            <button type="submit" className="lp-button">Filter</button>
            {filtered ? <Link href="/kits" className="kt-clear">Clear</Link> : null}
          </form>
        </section>

        <section className="lp-container de-grid-wrap">
          {kits.length ? (
            <div className="de-grid">{kits.map((kit) => <KitCard key={kit.id} product={kit} />)}</div>
          ) : (
            <p className="kt-empty">
              {filtered ? 'Nothing matches that. ' : 'No shirts are listed yet. '}
              <Link href={DESIGN_PATH}>Design one in the design center</Link> and we will make it for you.
            </p>
          )}
        </section>

        <ClubDirectory clubs={clubs} />
        <FaqList faqs={faqs} />
      </main>
    </EliteLayout>
  );
}
