"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EliteLayout } from './components/elite-layout';

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3100').replace(/\/$/, '');

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

const services = [
  {
    title: 'Property Sales',
    icon: 'real_estate_agent',
    description:
      'Strategic marketing and expert negotiation to ensure your premium asset achieves its maximum market potential.',
    href: '/contact',
  },
  {
    title: 'Lettings',
    icon: 'key',
    description:
      'Connecting high-value tenants with exceptional residences through rigorous screening and bespoke management.',
    href: '/contact',
  },
  {
    title: 'Consultancy',
    icon: 'clinical_notes',
    description:
      'Data-driven insights and advisory services for property investment, portfolio optimization, and market trends.',
    href: '/contact',
  },
];

export default function HomePage() {
  const [listings, setListings] = useState<PublicListing[]>([]);
  const [listingsLoading, setListingsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`${API_BASE_URL}/public/listings`, { cache: 'no-store' });
        if (!response.ok) throw new Error('Unable to load listings.');
        const data = (await response.json()) as PublicListing[];
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
          <div className="lp-hero-image" aria-hidden="true" />
          <div className="lp-hero-overlay" aria-hidden="true" />
          <div className="lp-container lp-hero-content">
            <h1>
              Find Your Dream Home With
              <br />
              Dirrir Realtor Limited
            </h1>
            <p>
              Experience the pinnacle of luxury property management and acquisition. Our curated portfolio represents the
              most exclusive residences in the world&apos;s most sought-after locations.
            </p>
            <form className="lp-searchbar" action="#" method="get">
              <label className="lp-search-field">
                <span>Location, City, or ZIP</span>
                <input type="text" name="location" aria-label="Location, City, or ZIP" />
              </label>
              <label className="lp-search-field">
                <span>Property Type</span>
                <select name="propertyType" aria-label="Property Type" defaultValue="">
                  <option value="" disabled>
                    Select type
                  </option>
                  <option value="penthouse">Penthouse</option>
                  <option value="villa">Villa</option>
                  <option value="estate">Estate</option>
                </select>
              </label>
              <button className="lp-button lp-button-black" type="submit">
                Search
              </button>
            </form>
          </div>
        </section>

        <section className="lp-services" id="services">
          <div className="lp-container">
            <div className="lp-heading-center">
              <h2>Elite Real Estate Services</h2>
              <span className="lp-divider" aria-hidden="true" />
              <p>
                Providing a comprehensive suite of professional solutions tailored to the world&apos;s most discerning
                clientele.
              </p>
            </div>
            <div className="lp-service-grid">
              {services.map((service) => (
                <article key={service.title} className="lp-service-card">
                  <div className="lp-service-icon" aria-hidden="true">
                    <span>{service.icon}</span>
                  </div>
                  <h3>{service.title}</h3>
                  <p>{service.description}</p>
                  <Link href={service.href} className="lp-more-link">
                    Learn More
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-featured" id="listings">
          <div className="lp-container">
            <div className="lp-featured-header">
              <div>
                <h2>Featured Residences</h2>
                <p>A curated selection of our most prestigious available properties.</p>
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
                  const price = formatUsd(listing.priceUsd) || formatUsd(listing.priceKes) || 'Price on request';
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
                        <p className="lp-address">{listing.project.location || ''}</p>
                        <div className="lp-property-meta">
                          <span>{listing.bedrooms} Beds</span>
                          <span>{listing.parkingSlots} Parking</span>
                          <span>{Number(listing.sizeSqm).toLocaleString()} SqM</span>
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

        <section className="lp-cta" id="profile">
          <div className="lp-container lp-cta-inner">
            <div>
              <h2>Ready to Find Your Elite Residence?</h2>
              <p>
                Our dedicated professionals are standing by to guide you through every step of your real estate journey.
              </p>
            </div>
            <div className="lp-cta-actions">
              <Link className="lp-button lp-button-primary" href="/contact">
                Contact Our Experts
              </Link>
              <a className="lp-button lp-button-outline-light" href="#">
                Book a Consultation
              </a>
            </div>
          </div>
        </section>
      </main>
    </EliteLayout>
  );
}
