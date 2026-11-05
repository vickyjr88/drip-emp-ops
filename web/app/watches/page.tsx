import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EliteLayout } from '../components/elite-layout';
import { FaqList } from '../components/kit-parts';
import { BrandDirectory, WatchCard } from '../components/watch-parts';
import { JsonLd, SITE_NAME, absoluteUrl } from '../lib/site';
import { fetchWatchBrands, fetchWatches } from '../lib/watches';
import { breadcrumbSchema, faqSchema } from '../lib/kit-seo';
import { LISTING_INTRO, listingDescription, listingFaqs, listingTitle, watchListSchema } from '../lib/watch-seo';

export const dynamic = 'force-dynamic';

const VIEW_PARAMS = ['brand', 'search', 'sort', 'maxPrice', 'inStockOnly'];
type Params = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] ?? '' : value ?? '');

export async function generateMetadata({ searchParams }: { searchParams: Params }): Promise<Metadata> {
  const [watches, brands] = await Promise.all([fetchWatches(), fetchWatchBrands()]);
  if (!watches.length) return { title: 'Watches', robots: { index: false, follow: true } };
  const title = listingTitle(watches);
  const description = listingDescription(watches, brands);
  const filtered = VIEW_PARAMS.some((key) => Boolean(first(searchParams[key])));
  const image = watches.find((w) => w.imageUrls[0])?.imageUrls[0];
  return {
    title,
    description,
    alternates: { canonical: '/watches' },
    // A filtered grid is thin duplicate content: the canonical stays /watches and the view stays out of the index.
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
    openGraph: { title: `${title} | ${SITE_NAME}`, description, ...(image ? { images: [{ url: absoluteUrl(`/og/share.jpg?src=${encodeURIComponent(image)}`), width: 1200, height: 630, type: 'image/jpeg' }] } : {}) },
    twitter: { card: image ? 'summary_large_image' : 'summary', title: `${title} | ${SITE_NAME}`, description },
  };
}

export default async function WatchesPage({ searchParams }: { searchParams: Params }) {
  const query = {
    brand: first(searchParams.brand) || undefined,
    search: first(searchParams.search) || undefined,
    sort: first(searchParams.sort) || undefined,
    maxPrice: first(searchParams.maxPrice) || undefined,
    inStockOnly: first(searchParams.inStockOnly) || undefined,
  };
  const [all, watches, brands] = await Promise.all([fetchWatches(), fetchWatches(query), fetchWatchBrands()]);
  // No watches on sale: the section does not exist yet.
  if (!all.length) notFound();
  const faqs = listingFaqs();
  const filtered = Object.values(query).some(Boolean);

  return (
    <EliteLayout active="watches">
      <JsonLd data={breadcrumbSchema([{ name: 'Home', url: absoluteUrl('/') }, { name: 'Watches', url: absoluteUrl('/watches') }])} />
      <JsonLd data={watchListSchema(watches, absoluteUrl, listingTitle(all))} />
      <JsonLd data={faqSchema(faqs)} />
      <main className="lp-main-content kt-page wt-page">
        <section className="lp-container kt-hero">
          <h1>Watches in Nairobi, Kenya</h1>
          <p>{LISTING_INTRO}</p>
        </section>

        <section className="lp-container kt-filters" aria-label="Filter watches">
          <form method="get" action="/watches">
            <input type="search" name="search" defaultValue={query.search} placeholder="Search a watch or brand" aria-label="Search watches" />
            <select name="brand" defaultValue={query.brand ?? ''} aria-label="Brand">
              <option value="">All brands</option>
              {brands.map((b) => <option key={b.slug} value={b.name}>{b.name}</option>)}
            </select>
            <select name="maxPrice" defaultValue={query.maxPrice ?? ''} aria-label="Price">
              <option value="">Any price</option>
              <option value="3000">Up to KSh 3,000</option>
              <option value="5000">Up to KSh 5,000</option>
              <option value="10000">Up to KSh 10,000</option>
              <option value="20000">Up to KSh 20,000</option>
            </select>
            <select name="sort" defaultValue={query.sort ?? ''} aria-label="Sort">
              <option value="">Newest</option>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
              <option value="name">Name</option>
            </select>
            <button type="submit" className="lp-button">Filter</button>
            {filtered ? <Link href="/watches" className="kt-clear">Clear</Link> : null}
          </form>
        </section>

        <section className="lp-container de-grid-wrap">
          {watches.length ? (
            <div className="de-grid">{watches.map((w) => <WatchCard key={w.id} watch={w} />)}</div>
          ) : (
            <p className="kt-empty">Nothing matches that. <Link href="/watches">See all watches</Link>.</p>
          )}
        </section>

        <BrandDirectory brands={brands} />
        <FaqList faqs={faqs} />
      </main>
    </EliteLayout>
  );
}
