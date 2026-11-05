import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EliteLayout } from '../../../components/elite-layout';
import { FanVersionNote, FaqList, KitCard } from '../../../components/kit-parts';
import { JsonLd, SITE_NAME, absoluteUrl } from '../../../lib/site';
import { sharePreviewUrl, brandPreviewImage } from '../../../lib/preview-image';
import { DESIGN_PATH, LEAGUES, clubPath, fetchClubs, fetchKitConfig, fetchKits, leagueBySlug, leaguePath } from '../../../lib/kits';
import {
  breadcrumbSchema, faqSchema, itemListSchema, leagueDescription, leagueFaqs, leagueIntro, leagueTitle,
} from '../../../lib/kit-seo';

export const dynamic = 'force-dynamic';

async function load(slug: string) {
  const league = leagueBySlug(slug);
  if (!league) return null;
  const [config, kits, clubs] = await Promise.all([fetchKitConfig(), fetchKits({ league: league.key }), fetchClubs(true)]);
  if (!config) return null;
  return { league, config, kits, clubs: clubs.filter((c) => c.league === league.key) };
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const data = await load(params.slug);
  if (!data) return { title: 'Not found', robots: { index: false, follow: true } };
  const title = leagueTitle(data.league, data.kits);
  const description = leagueDescription(data.league, data.clubs, data.kits);
  const image = data.kits.find((k) => k.imageUrls[0])?.imageUrls[0] ?? (await brandPreviewImage());
  return {
    title,
    description,
    alternates: { canonical: leaguePath(data.league.slug) },
    openGraph: { title: `${title} | ${SITE_NAME}`, description, ...(image ? { images: [{ url: sharePreviewUrl(image), width: 1200, height: 630, type: 'image/jpeg' }] } : {}) },
    twitter: { card: image ? 'summary_large_image' : 'summary', title: `${title} | ${SITE_NAME}`, description },
  };
}

export default async function LeaguePage({ params }: { params: { slug: string } }) {
  const data = await load(params.slug);
  if (!data) notFound();
  const { league, config, kits, clubs } = data;
  const faqs = leagueFaqs(league, config);

  return (
    <EliteLayout active="kits">
      <JsonLd data={breadcrumbSchema([
        { name: 'Home', url: absoluteUrl('/') },
        { name: 'Kits', url: absoluteUrl('/kits') },
        { name: league.name, url: absoluteUrl(leaguePath(league.slug)) },
      ])} />
      <JsonLd data={{ '@type': 'CollectionPage', name: leagueTitle(league, kits), url: absoluteUrl(leaguePath(league.slug)), description: leagueDescription(league, clubs, kits) }} />
      <JsonLd data={itemListSchema(kits, absoluteUrl, league.name)} />
      <JsonLd data={faqSchema(faqs)} />
      <main className="lp-main-content kt-page">
        <nav className="lp-container de-crumbs" aria-label="Breadcrumb">
          <Link href="/kits">Kits</Link><span aria-hidden="true">/</span><span>{league.name}</span>
        </nav>
        <section className="lp-container kt-hero">
          <h1>{league.name} Jerseys in Kenya</h1>
          <p>{leagueIntro(league, clubs)}</p>
          <div className="kt-hero-actions">
            <Link href={DESIGN_PATH} className="lp-button lp-button-primary">Design a {league.short} shirt</Link>
          </div>
          <FanVersionNote text={config.fanVersionNote} />
        </section>

        <section className="lp-container kt-directory" aria-label={`${league.name} clubs`}>
          <h2>{league.name} clubs</h2>
          <ul className="kt-chip-list">
            {clubs.map((club) => (
              <li key={club.slug}><Link href={clubPath(club.slug)}>{club.name}{club.kitCount ? ` (${club.kitCount})` : ''}</Link></li>
            ))}
          </ul>
        </section>

        <section className="lp-container de-grid-wrap">
          {kits.length ? (
            <div className="de-grid">{kits.map((kit) => <KitCard key={kit.id} product={kit} />)}</div>
          ) : (
            <p className="kt-empty">No {league.name} shirts are listed yet. <Link href={DESIGN_PATH}>Design one</Link> and we will make it for you.</p>
          )}
        </section>

        <section className="lp-container kt-directory">
          <h2>Other leagues and teams</h2>
          <ul className="kt-chip-list">
            {LEAGUES.filter((l) => l.key !== league.key).map((l) => <li key={l.key}><Link href={leaguePath(l.slug)}>{l.name}</Link></li>)}
          </ul>
        </section>
        <FaqList faqs={faqs} />
      </main>
    </EliteLayout>
  );
}
