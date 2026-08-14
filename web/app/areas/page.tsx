import type { Metadata } from 'next';
import { seoMetadata } from '../lib/page-metadata';
import Link from 'next/link';
import { EliteLayout } from '../components/elite-layout';
import { AREAS, AreaDefinition, areaAnchorFor, propertiesHrefFor } from '../lib/areas';
import { contentValue, fetchPageContent } from '../lib/page-content';
import { JsonLd, SITE_URL, absoluteUrl } from '../lib/site';

/**
 * Neighbourhood guide, structured like the services page: hero, jump nav, then
 * one alternating section per area. Reusing that layout is deliberate -- both
 * pages answer "what do you cover", and giving them a shared shape means a
 * visitor who has seen one already knows how to read the other.
 *
 * Server-rendered: the content is static, so this needs no client bundle and
 * the copy is in the HTML for crawlers.
 */

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata({
    key: 'areas',
    path: '/areas',
    title: "Nairobi's Best Neighbourhoods",
    description:
      'Westlands, Kilimani, Lavington, Parklands and Kileleshwa — what makes each Nairobi neighbourhood distinct, with indicative sale and rental ranges.',
    shareTitle: "Nairobi's Best Neighbourhoods | Dirrir Realtors",
    shareDescription:
      "What makes each of Nairobi's most sought-after residential areas distinct, with indicative prices.",
  });
}

// Rendered per request so CMS edits appear without a rebuild.
export const dynamic = 'force-dynamic';

export default async function AreasPage() {
  const content = await fetchPageContent('areas');

  const heroKicker = contentValue(content, 'hero.kicker', 'Areas We Cover');
  const heroHeading = contentValue(content, 'hero.heading', "Nairobi's Best Neighbourhoods");
  const heroIntro = contentValue(
    content,
    'hero.intro',
    "We specialise in Nairobi's most sought-after residential areas. Here is what makes each neighbourhood distinct, and roughly what it costs to buy or rent there.",
  );

  // The CMS seeds these, so an entry carries its own copy and nothing is
  // filled in from a neighbouring position. Falling back per index would mean
  // deleting one neighbourhood silently gave the next its image and prices,
  // which is only invisible until someone reorders the list.
  const editedAreas = contentValue<Array<Partial<AreaDefinition>>>(content, 'areas.items', []);
  const source = editedAreas.length ? editedAreas : AREAS;
  const areas = source
    .filter((item) => item.name?.trim())
    .map((item, index) => {
      const name = item.name!.trim();
      return {
        anchor: areaAnchorFor({ anchor: item.anchor, name }, index),
        name,
        navLabel: item.navLabel || name,
        kicker: item.kicker || '',
        description: item.description || '',
        highlights: item.highlights || [],
        saleRange: item.saleRange,
        rentRange: item.rentRange,
        image: item.image || '',
        filterValue: item.filterValue ?? '',
      };
    });

  const ctaHeading = contentValue(content, 'cta.heading', 'Not sure which neighbourhood fits?');
  const ctaBody = contentValue(
    content,
    'cta.body',
    'Tell us how you live — commute, schools, whether you want quiet or want to walk to dinner — and we will narrow it down.',
  );
  const ctaPrimary = contentValue(content, 'cta.primaryLabel', 'Talk to an Advisor');
  const ctaSecondary = contentValue(content, 'cta.secondaryLabel', 'Browse All Properties');

  return (
    <EliteLayout active="areas">
      {/* Each area is a place we serve; naming them as a list lets an assistant
          answer "where do you operate" without parsing the prose. */}
      <JsonLd
        data={{
          '@type': 'ItemList',
          '@id': `${SITE_URL}/areas#list`,
          name: 'Nairobi neighbourhoods served by Dirrir Realtors',
          itemListElement: areas.filter((area) => area.filterValue).map((area, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            item: {
              '@type': 'Place',
              name: area.name,
              description: area.description,
              url: absoluteUrl(`/areas#${area.anchor}`),
              address: {
                '@type': 'PostalAddress',
                addressLocality: area.name,
                addressRegion: 'Nairobi',
                addressCountry: 'KE',
              },
            },
          })),
        }}
      />

      <main className="lp-main-content lp-services-page">
        <section className="lp-services-hero">
          <div className="lp-container lp-services-hero-inner">
            <p>{heroKicker}</p>
            <h1>{heroHeading}</h1>
            <span className="lp-divider" aria-hidden="true" />
            {heroIntro ? <p className="lp-services-intro">{heroIntro}</p> : null}
          </div>
        </section>

        <nav className="lp-services-jump" aria-label="Jump to a neighbourhood">
          <div className="lp-container lp-services-jump-inner">
            {areas.map((area) => (
              <a key={area.anchor} href={`#${area.anchor}`}>
                {area.navLabel}
              </a>
            ))}
          </div>
        </nav>

        <div className="lp-service-sections">
          {areas.map((area, index) => (
            <section
              key={area.anchor}
              id={area.anchor}
              className={`lp-service-section${index % 2 === 1 ? ' is-reversed' : ''}`}
            >
              <div className="lp-container lp-service-section-inner">
                <div className="lp-service-section-media">
                  <img src={area.image} alt={area.name} loading="lazy" />
                </div>

                <div className="lp-service-section-body">
                  <p className="lp-service-section-index">{area.kicker}</p>
                  <h2>{area.name}</h2>
                  <span className="lp-divider" aria-hidden="true" />
                  <p className="lp-service-section-copy">{area.description}</p>

                  <ul className="lp-service-feature-list">
                    {area.highlights.map((highlight) => (
                      <li key={highlight}>{highlight}</li>
                    ))}
                  </ul>

                  {area.saleRange || area.rentRange ? (
                    <dl className="lp-area-prices">
                      {area.saleRange ? (
                        <div>
                          <dt>To buy</dt>
                          <dd>{area.saleRange}</dd>
                        </div>
                      ) : null}
                      {area.rentRange ? (
                        <div>
                          <dt>To rent</dt>
                          <dd>{area.rentRange} / month</dd>
                        </div>
                      ) : null}
                    </dl>
                  ) : null}

                  <Link className="lp-button lp-button-primary" href={propertiesHrefFor(area)}>
                    {area.filterValue ? `View ${area.name} Properties` : 'View All Properties'}
                  </Link>
                </div>
              </div>
            </section>
          ))}
        </div>

        <section className="lp-area-cta">
          <div className="lp-container">
            <h2>{ctaHeading}</h2>
            <p>{ctaBody}</p>
            <div className="lp-area-cta-actions">
              <Link className="lp-button lp-button-primary" href="/contact">
                {ctaPrimary}
              </Link>
              <Link className="lp-button lp-button-ghost" href="/properties">
                {ctaSecondary}
              </Link>
            </div>
          </div>
        </section>
      </main>
    </EliteLayout>
  );
}
