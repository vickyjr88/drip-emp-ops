"use client";

import Link from 'next/link';
import { formatSqft } from './lib/area';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { EliteLayout } from './components/elite-layout';
import { PageContentDocument, contentValue, fetchPageContent } from './lib/page-content';
import { CardCarousel } from './components/card-carousel';
import { ServiceIcon } from './components/service-icons';
import { HOME_SERVICES, iconForIndex } from './lib/services';

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3100').replace(/\/$/, '');

type FeaturedProject = {
  id: string;
  code: string;
  name: string;
  location: string | null;
  description: string | null;
  featuredImageUrl: string | null;
  unitCount: number;
  availableCount: number;
};

type PublicListing = {
  id: string;
  unitNumber: string;
  sizeSqm: string | number;
  priceKes: string | number;
  priceUsd: string | number;
  bedrooms: number;
  parkingSlots: number;
  featuredImageUrl: string | null;
  project: { name: string; location: string | null };
};

function formatUsd(value: string | number) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return `$${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function formatKes(value: string | number) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return `KSh ${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}


export default function HomeClient() {
  const router = useRouter();
  const [listings, setListings] = useState<PublicListing[]>([]);
  const [featuredProjects, setFeaturedProjects] = useState<FeaturedProject[]>([]);
  const [featuredUnits, setFeaturedUnits] = useState<PublicListing[]>([]);
  const [listingsLoading, setListingsLoading] = useState(true);
  const [content, setContent] = useState<PageContentDocument | null>(null);
  const [searchLocation, setSearchLocation] = useState('');
  const [searchMinBedrooms, setSearchMinBedrooms] = useState('');

  const heroHeading = contentValue(content, 'hero.heading', 'Find Your Dream Home With\nDrip Emporium');
  const heroSubheading = contentValue(
    content,
    'hero.subheading',
    "Experience the pinnacle of luxury property management and acquisition. Our curated portfolio represents the most exclusive residences in the world's most sought-after locations.",
  );
  const heroBackground = contentValue(content, 'hero.backgroundImage', '');
  const servicesHeading = contentValue(content, 'services.heading', 'Elite Real Estate Services');
  const servicesSubheading = contentValue(
    content,
    'services.subheading',
    "Providing a comprehensive suite of professional solutions tailored to the world's most discerning clientele.",
  );
  const serviceItems = contentValue<Array<{ title: string; description: string }>>(
    content,
    'services.items',
    HOME_SERVICES,
  );
  const featuredHeading = contentValue(content, 'featured.heading', 'Featured Residences');
  const featuredSubheading = contentValue(
    content,
    'featured.subheading',
    'A curated selection of our most prestigious available properties.',
  );
  const ctaHeading = contentValue(content, 'cta.heading', 'Ready to Find Your Elite Residence?');
  const ctaBody = contentValue(
    content,
    'cta.body',
    'Our dedicated professionals are standing by to guide you through every step of your real estate journey.',
  );
  const ctaPrimary = contentValue(content, 'cta.primaryLabel', 'Contact Our Experts');
  const ctaSecondary = contentValue(content, 'cta.secondaryLabel', 'Book a Consultation');
  const ctaSecondaryHref = contentValue(content, 'cta.secondaryHref', '/contact');

  const heroFeatureEnabled = contentValue<boolean>(content, 'heroFeature.enabled', true) !== false;
  const heroFeatureEyebrow = contentValue(content, 'heroFeature.eyebrow', 'Featured residence');
  const heroFeatureCta = contentValue(content, 'heroFeature.ctaLabel', 'View this home');
  const heroBrowseLabel = contentValue(content, 'heroFeature.browseLabel', 'Browse Properties');
  const heroTalkLabel = contentValue(content, 'heroFeature.talkLabel', 'Talk to an Agent');

  const aboutHeading = contentValue(
    content,
    'about.heading',
    "Real Estate Done Right, in Nairobi's Most Sought-After Neighbourhoods",
  );
  const aboutBody = contentValue(content, 'about.body', '');
  const aboutImage = contentValue(content, 'about.image', '');
  const aboutLinkLabel = contentValue(content, 'about.linkLabel', 'More About Us');
  const aboutLinkHref = contentValue(content, 'about.linkHref', '/about');

  const statsEnabled = contentValue<boolean>(content, 'stats.enabled', false) === true;
  const statItems = contentValue<Array<{ value: string; label: string }>>(content, 'stats.items', []);
  // A figure with no value is a placeholder, and the old site publishing
  // "0+ Happy Clients" is exactly what this guards against.
  const visibleStats = statItems.filter((item) => item.value?.trim());

  const portfolioEnabled = contentValue<boolean>(content, 'portfolio.enabled', false) === true;
  const portfolioEyebrow = contentValue(content, 'portfolio.eyebrow', 'Delivered portfolio');
  const portfolioHeading = contentValue(content, 'portfolio.heading', '');
  const portfolioSubheading = contentValue(content, 'portfolio.subheading', '');
  const portfolioItems = contentValue<
    Array<{ name: string; location?: string; summary?: string; image?: string }>
  >(content, 'portfolio.items', []).filter((item) => item.name?.trim());

  const reportEnabled = contentValue<boolean>(content, 'report.enabled', false) === true;
  const reportEyebrow = contentValue(content, 'report.eyebrow', 'Market intelligence');
  const reportHeading = contentValue(content, 'report.heading', '');
  const reportBody = contentValue(content, 'report.body', '');
  const reportReleaseLabel = contentValue(content, 'report.releaseLabel', 'Latest release');
  const reportReleaseTitle = contentValue(content, 'report.releaseTitle', '');
  const reportFileUrl = contentValue(content, 'report.fileUrl', '');
  const reportCtaLabel = contentValue(content, 'report.ctaLabel', 'Download Report');

  // The hero property is the first featured unit, so it is chosen the same way
  // the carousel below orders itself rather than through a separate setting.
  const heroFeature = heroFeatureEnabled ? featuredUnits[0] || null : null;

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (searchLocation.trim()) params.set('location', searchLocation.trim());
    if (searchMinBedrooms) params.set('minBedrooms', searchMinBedrooms);
    router.push(params.toString() ? `/listings?${params.toString()}` : '/listings');
  }

  useEffect(() => {
    let cancelled = false;
    void fetchPageContent('home').then((document) => {
      if (!cancelled) setContent(document);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`${API_BASE_URL}/public/listings`, { cache: 'no-store' });
        if (!response.ok) throw new Error('Unable to load listings.');
        const data = (await response.json()) as PublicListing[];

        // Featured rows are separate requests so a failure in either leaves the
        // main listings grid intact rather than blanking the page.
        void fetch(`${API_BASE_URL}/public/listings/featured-projects`, { cache: 'no-store' })
          .then((res) => (res.ok ? res.json() : []))
          .then((rows: FeaturedProject[]) => setFeaturedProjects(rows))
          .catch(() => setFeaturedProjects([]));

        void fetch(`${API_BASE_URL}/public/listings/featured-units`, { cache: 'no-store' })
          .then((res) => (res.ok ? res.json() : []))
          .then((rows: PublicListing[]) => setFeaturedUnits(rows))
          .catch(() => setFeaturedUnits([]));
        if (!cancelled) setListings(data.slice(0, 2));
      } catch {
        if (!cancelled) setListings([]);
      } finally {
        if (!cancelled) setListingsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <EliteLayout active="search">
      <main className="lp-main-content">
        <section className="lp-hero" id="search">
          <div
            className="lp-hero-image"
            aria-hidden="true"
            // Only overrides the stylesheet background when a hero image is set.
            style={heroBackground ? { backgroundImage: `url(${heroBackground})` } : undefined}
          />
          <div className="lp-hero-overlay" aria-hidden="true" />
          <div className="lp-container lp-hero-content">
            <h1>
              {/* Editors write the heading with line breaks; preserve them. */}
              {heroHeading.split('\n').map((line: string, index: number) => (
                <span key={index}>
                  {index > 0 ? <br /> : null}
                  {line}
                </span>
              ))}
            </h1>
            <p>{heroSubheading}</p>
            <form className="lp-searchbar" onSubmit={handleSearch}>
              <label className="lp-search-field">
                <span>Location</span>
                <input
                  type="text"
                  name="location"
                  aria-label="Location"
                  placeholder="e.g. Kileleshwa"
                  value={searchLocation}
                  onChange={(event) => setSearchLocation(event.target.value)}
                />
              </label>
              <label className="lp-search-field">
                <span>Min. Bedrooms</span>
                <select
                  name="minBedrooms"
                  aria-label="Minimum bedrooms"
                  value={searchMinBedrooms}
                  onChange={(event) => setSearchMinBedrooms(event.target.value)}
                >
                  <option value="">Any</option>
                  <option value="1">1+</option>
                  <option value="2">2+</option>
                  <option value="3">3+</option>
                  <option value="4">4+</option>
                </select>
              </label>
              <button className="lp-button lp-button-black" type="submit">
                Search
              </button>
            </form>

            {/* The old site leads with a real property rather than an empty
                form. The search bar stays above it for visitors who already
                know what they want; this answers the ones who do not. */}
            {heroFeature ? (
              <div className="lp-hero-feature">
                <Link href={`/listings/${heroFeature.id}`} className="lp-hero-feature-media">
                  {heroFeature.featuredImageUrl ? (
                    <img src={heroFeature.featuredImageUrl} alt={heroFeature.project.name} />
                  ) : null}
                </Link>
                <div className="lp-hero-feature-body">
                  <p className="lp-hero-feature-eyebrow">{heroFeatureEyebrow}</p>
                  <h2>{heroFeature.project.name}</h2>
                  {heroFeature.project.location ? (
                    <p className="lp-hero-feature-location">{heroFeature.project.location}</p>
                  ) : null}
                  <p className="lp-hero-feature-price">
                    {formatKes(heroFeature.priceKes) || 'Price on request'}
                  </p>
                  <p className="lp-hero-feature-meta">
                    {heroFeature.bedrooms === 0 ? 'Studio' : `${heroFeature.bedrooms} bed`}
                    {Number(heroFeature.sizeSqm) > 0 ? ` · ${formatSqft(heroFeature.sizeSqm)}` : ''}
                  </p>
                  <div className="lp-hero-feature-actions">
                    <Link
                      className="lp-button lp-button-primary"
                      href={`/listings/${heroFeature.id}`}
                    >
                      {heroFeatureCta}
                    </Link>
                    <Link className="lp-button lp-button-ghost" href="/properties">
                      {heroBrowseLabel}
                    </Link>
                    <Link className="lp-button lp-button-ghost" href="/contact">
                      {heroTalkLabel}
                    </Link>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="lp-services" id="services">
          <div className="lp-container">
            <div className="lp-heading-center">
              <h2>{servicesHeading}</h2>
              <span className="lp-divider" aria-hidden="true" />
              <p>{servicesSubheading}</p>
            </div>
            {/* Three at a time; the CMS can hold more than that, and the rest
                slide in rather than wrapping to a second row. */}
            <CardCarousel label="Services" perView={3} className="lp-services-carousel">
              {serviceItems.map((service, index) => (
                <article key={`${service.title}-${index}`} className="lp-service-card">
                  <div className="lp-service-icon" aria-hidden="true">
                    <ServiceIcon name={iconForIndex(index)} />
                  </div>
                  <h3>{service.title}</h3>
                  <p>{service.description}</p>
                  {/* Points at the services page rather than straight to
                      contact, so "Learn More" actually leads to more detail. */}
                  <Link href="/services" className="lp-more-link">
                    Learn More
                  </Link>
                </article>
              ))}
            </CardCarousel>
            {/* The home page shows a teaser; the full list lives on /services. */}
            <div className="lp-services-more">
              <Link className="lp-button lp-button-ghost" href="/services">
                View All Services
              </Link>
            </div>
          </div>
        </section>

        {featuredProjects.length > 0 ? (
          <section className="lp-showcase" id="projects">
            <div className="lp-container">
              <div className="lp-showcase-header">
                <div>
                  <p className="lp-showcase-eyebrow">
                    <span className="lp-live-dot" aria-hidden />
                    Live now
                  </p>
                  <h2>Fresh Nairobi stock &mdash; selling today.</h2>
                  <p className="lp-showcase-sub">
                    Launches, near-handover homes, and limited drops in one scroll.
                  </p>
                </div>
                <Link className="lp-button lp-button-ghost" href="/properties">
                  View All Developments
                </Link>
              </div>

              <CardCarousel label="Ongoing projects" perView={4} className="lp-project-carousel">
                {featuredProjects.map((project) => (
                  <Link key={project.id} href={`/listings?project=${project.id}`} className="lp-project-card">
                    <div
                      className="lp-project-card-media"
                      style={
                        project.featuredImageUrl
                          ? { backgroundImage: `url(${project.featuredImageUrl})` }
                          : undefined
                      }
                    >
                      <span className="lp-project-badge">
                        <span className="lp-live-dot" aria-hidden />
                        Active now
                      </span>
                      <div className="lp-project-card-body">
                        {project.location ? (
                          <p className="lp-project-location">{project.location}</p>
                        ) : null}
                        <h3>{project.name}</h3>
                        <p className="lp-project-meta">
                          {project.availableCount} of {project.unitCount} available
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </CardCarousel>
            </div>
          </section>
        ) : null}

        {featuredUnits.length > 0 ? (
          <section className="lp-showcase lp-showcase-alt" id="homes">
            <div className="lp-container">
              <div className="lp-showcase-header">
                <div>
                  <p className="lp-showcase-eyebrow">Selected homes</p>
                  <h2>Handpicked units &mdash; ready to view.</h2>
                  <p className="lp-showcase-sub">
                    A shortlist from across our developments. Tap any home for the full detail.
                  </p>
                </div>
                <Link className="lp-button lp-button-ghost" href="/listings">
                  View All Listings
                </Link>
              </div>

              <CardCarousel label="Featured homes" perView={4} className="lp-unit-carousel">
                {featuredUnits.map((unit) => (
                  <Link key={unit.id} href={`/listings/${unit.id}`} className="lp-unit-card">
                    <div
                      className="lp-unit-card-media"
                      style={
                        unit.featuredImageUrl
                          ? { backgroundImage: `url(${unit.featuredImageUrl})` }
                          : undefined
                      }
                    />
                    <div className="lp-unit-card-body">
                      {unit.project.location ? (
                        <p className="lp-unit-location">{unit.project.location}</p>
                      ) : null}
                      <h3>{unit.project.name}</h3>
                      <p className="lp-unit-meta">
                        {unit.bedrooms === 0 ? 'Studio' : `${unit.bedrooms} bed`} &middot;{' '}
                        {formatSqft(unit.sizeSqm)}
                      </p>
                      <p className="lp-unit-price">{formatKes(unit.priceKes)}</p>
                    </div>
                  </Link>
                ))}
              </CardCarousel>
            </div>
          </section>
        ) : null}

        {portfolioEnabled && portfolioItems.length > 0 ? (
          <section className="lp-showcase lp-showcase-alt" id="portfolio">
            <div className="lp-container">
              <div className="lp-showcase-header">
                <div>
                  <p className="lp-showcase-eyebrow">{portfolioEyebrow}</p>
                  <h2>{portfolioHeading}</h2>
                  {portfolioSubheading ? (
                    <p className="lp-showcase-sub">{portfolioSubheading}</p>
                  ) : null}
                </div>
              </div>

              <CardCarousel label="Delivered projects" perView={3} className="lp-portfolio-carousel">
                {portfolioItems.map((item, index) => (
                  <article key={`${item.name}-${index}`} className="lp-portfolio-card">
                    <div
                      className="lp-portfolio-card-media"
                      style={item.image ? { backgroundImage: `url(${item.image})` } : undefined}
                    >
                      <span className="lp-portfolio-badge">Delivered</span>
                    </div>
                    <div className="lp-portfolio-card-body">
                      <h3>{item.name}</h3>
                      {item.location ? (
                        <p className="lp-portfolio-location">{item.location}</p>
                      ) : null}
                      {item.summary ? <p>{item.summary}</p> : null}
                    </div>
                  </article>
                ))}
              </CardCarousel>
            </div>
          </section>
        ) : null}

        {aboutBody ? (
          <section className="lp-home-about" id="about">
            <div className="lp-container lp-home-about-inner">
              <div className="lp-home-about-copy">
                <h2>{aboutHeading}</h2>
                <span className="lp-divider" aria-hidden="true" />
                <p>{aboutBody}</p>
                {aboutLinkLabel ? (
                  <Link className="lp-button lp-button-ghost" href={aboutLinkHref}>
                    {aboutLinkLabel}
                  </Link>
                ) : null}
              </div>
              {aboutImage ? (
                <div className="lp-home-about-media">
                  <img src={aboutImage} alt="" />
                </div>
              ) : null}
            </div>

            {statsEnabled && visibleStats.length > 0 ? (
              <div className="lp-container">
                <dl className="lp-home-stats">
                  {visibleStats.map((stat, index) => (
                    <div key={`${stat.label}-${index}`}>
                      <dt>{stat.value}</dt>
                      <dd>{stat.label}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="lp-featured" id="listings">
          <div className="lp-container">
            <div className="lp-featured-header">
              <div>
                <h2>{featuredHeading}</h2>
                <p>{featuredSubheading}</p>
              </div>
              <Link className="lp-button lp-button-ghost" href="/listings">
                View All Listings
              </Link>
            </div>

            {listingsLoading ? (
              <p>Loading featured residences...</p>
            ) : listings.length === 0 ? (
              <p>New listings are coming soon. Check back shortly.</p>
            ) : (
              <div className="lp-property-grid">
                {listings.map((listing, index) => {
                  const title = `${listing.project.name} — Unit ${listing.unitNumber}`;
                  const usdPrice = formatUsd(listing.priceUsd);
                  const kesPrice = formatKes(listing.priceKes);
                  const price = usdPrice || kesPrice || 'Price on request';
                  return (
                    <article key={listing.id} className="lp-property-card">
                      <div className="lp-property-media">
                        {listing.featuredImageUrl ? (
                          <img src={listing.featuredImageUrl} alt={title} />
                        ) : (
                          <div className="lp-property-media-placeholder" aria-hidden="true" />
                        )}
                        <span className={`lp-badge ${index === 0 ? 'lp-badge-dark' : 'lp-badge-red'}`}>
                          {index === 0 ? 'New Listing' : 'Featured'}
                        </span>
                        <p className="lp-property-price">{price}</p>
                      </div>
                      <div className="lp-property-body">
                        <h3>{title}</h3>
                        {usdPrice && kesPrice ? <p className="lp-property-price-secondary">{kesPrice}</p> : null}
                        <p className="lp-address">{listing.project.location || ''}</p>
                        <div className="lp-property-meta">
                          <span>{listing.bedrooms} Beds</span>
                          <span>{listing.parkingSlots} Parking</span>
                          <span>{formatSqft(listing.sizeSqm)}</span>
                        </div>
                        <div className="lp-property-links">
                          <Link href={`/listings/${listing.id}`}>View details</Link>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {reportEnabled && reportFileUrl ? (
          <section className="lp-home-report" id="report">
            <div className="lp-container lp-home-report-inner">
              <div>
                <p className="lp-showcase-eyebrow">{reportEyebrow}</p>
                <h2>{reportHeading}</h2>
                {reportBody ? <p>{reportBody}</p> : null}
              </div>
              <div className="lp-home-report-card">
                <p className="lp-home-report-label">{reportReleaseLabel}</p>
                {reportReleaseTitle ? <h3>{reportReleaseTitle}</h3> : null}
                <a
                  className="lp-button lp-button-primary"
                  href={reportFileUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {reportCtaLabel}
                </a>
              </div>
            </div>
          </section>
        ) : null}

        <section className="lp-cta" id="profile">
          <div className="lp-container lp-cta-inner">
            <div>
              <h2>{ctaHeading}</h2>
              <p>{ctaBody}</p>
            </div>
            <div className="lp-cta-actions">
              <Link className="lp-button lp-button-primary" href="/contact">
                {ctaPrimary}
              </Link>
              <Link className="lp-button lp-button-outline-light" href={ctaSecondaryHref}>
                {ctaSecondary}
              </Link>
            </div>
          </div>
        </section>
      </main>
    </EliteLayout>
  );
}
