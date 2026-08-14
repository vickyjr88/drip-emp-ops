import Link from 'next/link';
import { EliteLayout } from '../components/elite-layout';

const services = [
  {
    title: 'Property Sales',
    icon: 'real_estate_agent',
    description:
      'Strategic marketing, pricing advisory, and expert negotiation designed to position premium residences for maximum market performance.',
  },
  {
    title: 'Elite Lettings',
    icon: 'key',
    description:
      'A discreet leasing experience connecting qualified, high-value tenants with exceptional homes through bespoke management.',
  },
  {
    title: 'Investment Advisory',
    icon: 'clinical_notes',
    description:
      'Portfolio-led guidance, valuation intelligence, and acquisition strategy built for clients navigating complex real estate decisions.',
  },
];

export default function ServicesPage() {
  return (
    <EliteLayout active="services">
      <main className="lp-main-content lp-services-page">
        <section className="lp-services-hero">
          <div className="lp-container lp-services-hero-inner">
            <p>Elite Real Estate Services</p>
            <h1>Advisory, acquisitions, and management with editorial precision.</h1>
            <span className="lp-divider" aria-hidden="true" />
            <p className="lp-services-intro">
              Dirrir Realtor Limited provides a tightly curated suite of services for clients seeking discretion,
              clarity, and exceptional outcomes across luxury real estate transactions.
            </p>
          </div>
        </section>

        <section className="lp-services lp-services-page-grid">
          <div className="lp-container">
            <div className="lp-service-grid">
              {services.map((service) => (
                <article key={service.title} className="lp-service-card">
                  <div className="lp-service-icon" aria-hidden="true">
                    <span>{service.icon}</span>
                  </div>
                  <h3>{service.title}</h3>
                  <p>{service.description}</p>
                  <Link href="/contact" className="lp-more-link">
                    Speak With an Advisor
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-cta">
          <div className="lp-container lp-cta-inner">
            <div>
              <h2>Need a tailored strategy for your next move?</h2>
              <p>
                Whether you are selling, leasing, or acquiring, our team can structure the right approach around your
                property objectives.
              </p>
            </div>
            <div className="lp-cta-actions">
              <Link className="lp-button lp-button-primary" href="/contact">
                Contact Our Experts
              </Link>
              <Link className="lp-button lp-button-outline-light" href="/listings">
                Explore Listings
              </Link>
            </div>
          </div>
        </section>
      </main>
    </EliteLayout>
  );
}