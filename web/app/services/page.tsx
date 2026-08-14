import type { Metadata } from 'next';
import { seoMetadata } from '../lib/page-metadata';
import Link from 'next/link';
import { EliteLayout } from '../components/elite-layout';
import { ServiceIcon } from '../components/service-icons';
import { contentValue, fetchPageContent } from '../lib/page-content';
import { SERVICES, ServiceDefinition, anchorFor, iconForIndex } from '../lib/services';

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata({
    key: 'services',
    path: '/services',
    title: 'Services',
    description:
      'Property sales, lettings, portfolio management and construction oversight for owners and investors in Nairobi.',
    shareTitle: 'Services | Drip Emporium',
  });
}


// Rendered per request so CMS edits appear without a rebuild.
export const dynamic = 'force-dynamic';

export default async function ServicesPage() {
  const content = await fetchPageContent('services');

  const heroKicker = contentValue(content, 'hero.kicker', 'Drip Emporium');
  const heroHeading = contentValue(content, 'hero.heading', 'What We Do');
  const heroIntro = contentValue(
    content,
    'hero.intro',
    "Comprehensive real estate services tailored to your needs — whether you're buying, renting, selling, or investing.",
  );
  // CMS entries only carry the fields an editor controls, so everything else
  // (icon, and any field left blank) is filled from the built-in definition at
  // the same position.
  const serviceItems = contentValue<Array<Partial<ServiceDefinition>>>(content, 'services.items', SERVICES);
  const services = serviceItems.map((item, index) => {
    const base = SERVICES[index];
    return {
      anchor: anchorFor(item, index),
      title: item.title || base?.title || `Service ${index + 1}`,
      navLabel: item.navLabel || item.title || base?.navLabel || `Service ${index + 1}`,
      description: item.description || base?.description || '',
      features: item.features?.length ? item.features : base?.features || [],
      image: item.image || base?.image || '',
      icon: iconForIndex(index),
    };
  });
  const ctaHeading = contentValue(content, 'cta.heading', 'Need a tailored strategy for your next move?');
  const ctaBody = contentValue(
    content,
    'cta.body',
    'Whether you are selling, leasing, or acquiring, our team can structure the right approach around your property objectives.',
  );
  const ctaPrimary = contentValue(content, 'cta.primaryLabel', 'Contact Our Experts');
  const ctaSecondary = contentValue(content, 'cta.secondaryLabel', 'Explore Listings');

  return (
    <EliteLayout active="services">
      <main className="lp-main-content lp-services-page">
        <section className="lp-services-hero">
          <div className="lp-container lp-services-hero-inner">
            <p>{heroKicker}</p>
            <h1>{heroHeading}</h1>
            <span className="lp-divider" aria-hidden="true" />
            <p className="lp-services-intro">{heroIntro}</p>
          </div>
        </section>

        {/* Jump nav. The page is long enough that a visitor arriving for one
            service should not have to scroll past four others to reach it.
            Plain anchors, so they work without JS and are shareable as links. */}
        <nav className="lp-services-jump" aria-label="Jump to a service">
          <div className="lp-container lp-services-jump-inner">
            {services.map((service) => (
              <a key={service.anchor} href={`#${service.anchor}`}>
                <span className="lp-services-jump-icon" aria-hidden="true">
                  <ServiceIcon name={service.icon} />
                </span>
                {service.navLabel}
              </a>
            ))}
          </div>
        </nav>

        <div className="lp-service-sections">
          {services.map((service, index) => (
            <section
              key={service.anchor}
              id={service.anchor}
              // Alternating sides give the long page a rhythm and stop five
              // stacked sections reading as one undifferentiated block.
              className={`lp-service-section${index % 2 === 1 ? ' is-reversed' : ''}`}
            >
              <div className="lp-container lp-service-section-inner">
                <div className="lp-service-section-media">
                  {service.image ? (
                    <img src={service.image} alt={service.title} loading="lazy" />
                  ) : (
                    // Placeholder keeps the two-column rhythm when a service has
                    // no image yet, rather than collapsing the layout.
                    <div className="lp-service-section-placeholder" aria-hidden="true">
                      <ServiceIcon name={service.icon} />
                    </div>
                  )}
                </div>
                <div className="lp-service-section-body">
                  <p className="lp-service-section-index">
                    {String(index + 1).padStart(2, '0')}
                  </p>
                  <h2>{service.title}</h2>
                  <span className="lp-divider" aria-hidden="true" />
                  <p className="lp-service-section-copy">{service.description}</p>
                  {service.features.length > 0 ? (
                    <ul className="lp-service-feature-list">
                      {service.features.map((feature, featureIndex) => (
                        <li key={`${feature}-${featureIndex}`}>{feature}</li>
                      ))}
                    </ul>
                  ) : null}
                  <Link href="/contact" className="lp-button lp-button-primary">
                    Get Started
                  </Link>
                </div>
              </div>
            </section>
          ))}
        </div>

        <section className="lp-cta">
          <div className="lp-container lp-cta-inner">
            <div>
              <h2>{ctaHeading}</h2>
              <p>{ctaBody}</p>
            </div>
            <div className="lp-cta-actions">
              <Link className="lp-button lp-button-primary" href="/contact">
                {ctaPrimary}
              </Link>
              <Link className="lp-button lp-button-outline-light" href="/listings">
                {ctaSecondary}
              </Link>
            </div>
          </div>
        </section>
      </main>
    </EliteLayout>
  );
}