import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EliteLayout } from '../../../components/elite-layout';
import { FanVersionNote, FaqList, KitCard } from '../../../components/kit-parts';
import { KitShirt } from '../../../components/kit-shirt';
import { JsonLd, SITE_NAME, absoluteUrl } from '../../../lib/site';
import { sharePreviewUrl, brandPreviewImage } from '../../../lib/preview-image';
import { clubPath, designLink, fetchKitClub, fetchKitConfig, leagueByKey, leaguePath } from '../../../lib/kits';
import {
  breadcrumbSchema, clubDescription, clubFaqs, clubHeading, clubIntro, clubTitle, faqSchema, itemListSchema,
} from '../../../lib/kit-seo';

export const dynamic = 'force-dynamic';

async function load(slug: string) {
  const [config, data] = await Promise.all([fetchKitConfig(), fetchKitClub(slug)]);
  return config && data ? { config, ...data } : null;
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const data = await load(params.slug);
  if (!data) return { title: 'Not found', robots: { index: false, follow: true } };
  const title = clubTitle(data.club, data.products);
  const description = clubDescription(data.club, data.products);
  const image = data.products.find((k) => k.imageUrls[0])?.imageUrls[0] ?? (await brandPreviewImage());
  return {
    title,
    description,
    alternates: { canonical: clubPath(data.club.slug) },
    // A club with nothing on sale is still a useful page (the design center link), but too thin to index.
    ...(data.products.length === 0 ? { robots: { index: false, follow: true } } : {}),
    openGraph: { title: `${title} | ${SITE_NAME}`, description, ...(image ? { images: [{ url: sharePreviewUrl(image), width: 1200, height: 630, type: 'image/jpeg' }] } : {}) },
    twitter: { card: image ? 'summary_large_image' : 'summary', title: `${title} | ${SITE_NAME}`, description },
  };
}

export default async function ClubPage({ params }: { params: { slug: string } }) {
  const data = await load(params.slug);
  if (!data) notFound();
  const { config, club, products, relatedClubs } = data;
  const league = leagueByKey(club.league);
  const faqs = clubFaqs(club, products, config);

  return (
    <EliteLayout active="kits">
      <JsonLd data={breadcrumbSchema([
        { name: 'Home', url: absoluteUrl('/') },
        { name: 'Kits', url: absoluteUrl('/kits') },
        ...(league ? [{ name: league.name, url: absoluteUrl(leaguePath(league.slug)) }] : []),
        { name: club.name, url: absoluteUrl(clubPath(club.slug)) },
      ])} />
      <JsonLd data={{ '@type': 'CollectionPage', name: clubTitle(club, products), url: absoluteUrl(clubPath(club.slug)), description: clubDescription(club, products), about: { '@type': 'SportsTeam', name: club.name, sport: 'Football' } }} />
      <JsonLd data={itemListSchema(products, absoluteUrl, clubHeading(club))} />
      <JsonLd data={faqSchema(faqs)} />
      <main className="lp-main-content kt-page">
        <nav className="lp-container de-crumbs" aria-label="Breadcrumb">
          <Link href="/kits">Kits</Link>
          {league ? <><span aria-hidden="true">/</span><Link href={leaguePath(league.slug)}>{league.name}</Link></> : null}
          <span aria-hidden="true">/</span><span>{club.name}</span>
        </nav>
        <section className="lp-container kt-hero kt-hero-club">
          <div className="kt-hero-art" aria-hidden="true">
            <KitShirt templateKey="jersey-short" colors={club.home} side="front" title={`${club.name} home colours`} />
          </div>
          <div>
            <h1>{clubHeading(club)}</h1>
            <p>{clubIntro(club, products, league)}</p>
            <div className="kt-hero-actions">
              <Link href={designLink(undefined, club.slug, 'home')} className="lp-button lp-button-primary">Design a {club.name} shirt</Link>
            </div>
            <FanVersionNote text={config.fanVersionNote} />
          </div>
        </section>

        <section className="lp-container de-grid-wrap">
          {products.length ? (
            <div className="de-grid">{products.map((kit) => <KitCard key={kit.id} product={kit} />)}</div>
          ) : (
            <p className="kt-empty">We have no ready-made {club.name} shirts listed right now. <Link href={designLink(undefined, club.slug, 'home')}>Design one</Link> and we will make it for you.</p>
          )}
        </section>

        {relatedClubs.length ? (
          <section className="lp-container kt-directory">
            <h2>More {league?.name ?? ''} clubs</h2>
            <ul className="kt-chip-list">
              {relatedClubs.map((c) => <li key={c.slug}><Link href={clubPath(c.slug)}>{c.name}</Link></li>)}
            </ul>
          </section>
        ) : null}
        <FaqList faqs={faqs} />
      </main>
    </EliteLayout>
  );
}
