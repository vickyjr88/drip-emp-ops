"use client";

/**
 * Properties index, following dirirrealtors.com/properties: four filters, a
 * live count, and a card grid.
 *
 * Filters live in the URL rather than in state alone, so /properties?location=
 * Westlands works as a link from the areas page, survives a refresh, and can be
 * shared. Changing a filter rewrites the query string, which is what makes the
 * back button behave sensibly.
 */

import Link from 'next/link';
import { formatSqft } from '../lib/area';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EliteLayout } from '../components/elite-layout';
import { useEnquiryContact } from '../lib/use-enquiry-contact';

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3100').replace(/\/$/, '');

type Listing = {
  id: string;
  unitNumber: string;
  bedrooms: number;
  sizeSqm: string | number;
  priceKes: string | number;
  status: string;
  propertyType?: string | null;
  listingType?: string | null;
  featuredImageUrl: string | null;
  galleryImages?: string[] | null;
  project: { id: string; name: string; location: string | null };
};

function formatKes(value: string | number) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return 'Price on request';
  return `KSh ${amount.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
}

/** Status as the reference badges it, rather than the raw enum. */
function badgeFor(listing: Listing) {
  if (listing.status === 'RESERVED') return 'Completion Soon';
  if (listing.status === 'RENTED') return 'Let';
  if (listing.status === 'SOLD') return 'Sold';
  return 'Now Selling';
}

const PRICE_CAPS = [
  { label: 'Any Price', value: '' },
  { label: 'Up to KES 10M', value: '10000000' },
  { label: 'Up to KES 25M', value: '25000000' },
  { label: 'Up to KES 50M', value: '50000000' },
  { label: 'Up to KES 100M', value: '100000000' },
];

export function PropertiesClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const enquiryContact = useEnquiryContact();

  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Seeded from the URL so a link like ?location=Westlands lands filtered.
  const location = searchParams.get('location') || '';
  const propertyType = searchParams.get('type') || '';
  const bedrooms = searchParams.get('beds') || '';
  const maxPrice = searchParams.get('maxPrice') || '';

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/public/listings`, { cache: 'no-store' });
        if (!response.ok) throw new Error('Unable to load properties.');
        const data = (await response.json()) as Listing[];
        if (!cancelled) setListings(data);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load properties.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Writes one filter into the query string, dropping it when cleared. */
  const setFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      router.replace(params.toString() ? `/properties?${params.toString()}` : '/properties', {
        scroll: false,
      });
    },
    [router, searchParams],
  );

  const locationOptions = useMemo(
    () =>
      Array.from(
        new Set(listings.map((listing) => listing.project.location).filter(Boolean) as string[]),
      ).sort(),
    [listings],
  );

  /**
   * The option matching the current filter.
   *
   * A link from the areas page passes a bare neighbourhood while the data
   * stores "Westlands, Nairobi", so an exact match fails and the select falls
   * back to "All Locations" -- filtered results with a control claiming
   * otherwise. Resolve to the option the value actually selects.
   */
  const selectedLocation = useMemo(() => {
    if (!location) return '';
    const query = location.trim().toLowerCase();
    const exact = locationOptions.find((item) => item.toLowerCase() === query);
    if (exact) return exact;
    return locationOptions.find((item) => item.toLowerCase().includes(query)) || '';
  }, [location, locationOptions]);

  const locations = locationOptions;

  const propertyTypes = useMemo(
    () =>
      Array.from(
        new Set(listings.map((listing) => listing.propertyType).filter(Boolean) as string[]),
      ).sort(),
    [listings],
  );

  const visible = useMemo(() => {
    const locationQuery = location.trim().toLowerCase();
    const minBeds = bedrooms ? Number(bedrooms) : 0;
    const cap = maxPrice ? Number(maxPrice) : 0;

    return listings.filter((listing) => {
      // Substring rather than equality: a project stores "Westlands, Nairobi"
      // while the areas page links with just "Westlands".
      if (locationQuery && !(listing.project.location || '').toLowerCase().includes(locationQuery)) {
        return false;
      }
      if (propertyType && listing.propertyType !== propertyType) return false;
      if (minBeds && listing.bedrooms < minBeds) return false;
      if (cap && Number(listing.priceKes) > cap) return false;
      return true;
    });
  }, [listings, location, propertyType, bedrooms, maxPrice]);

  const hasFilters = Boolean(location || propertyType || bedrooms || maxPrice);

  return (
    <EliteLayout active="listings">
      <main className="lp-main-content pr-main">
        <section className="lp-container pr-head">
          <p className="lp-about-eyebrow">Properties</p>
          <h1>Homes and investments across Nairobi</h1>
          <p className="pr-head-sub">
            Every listing is inspected and vetted by our team before it appears here.
          </p>
        </section>

        <section className="lp-container pr-filters" aria-label="Filter properties">
          <label>
            <span>Location</span>
            <select
              value={selectedLocation}
              onChange={(event) => setFilter('location', event.target.value)}
            >
              <option value="">All Locations</option>
              {locations.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Property Type</span>
            <select value={propertyType} onChange={(event) => setFilter('type', event.target.value)}>
              <option value="">All Types</option>
              {propertyTypes.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Bedrooms</span>
            <select value={bedrooms} onChange={(event) => setFilter('beds', event.target.value)}>
              <option value="">Any Beds</option>
              <option value="1">1+</option>
              <option value="2">2+</option>
              <option value="3">3+</option>
              <option value="4">4+</option>
            </select>
          </label>

          <label>
            <span>Max Price</span>
            <select value={maxPrice} onChange={(event) => setFilter('maxPrice', event.target.value)}>
              {PRICE_CAPS.map((cap) => (
                <option key={cap.label} value={cap.value}>
                  {cap.label}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="lp-container pr-count">
          <p>
            <strong>
              {loading ? 'Loading' : `${visible.length} listing${visible.length === 1 ? '' : 's'}`}
            </strong>
            <span> · Updated daily · Nairobi &amp; wider Kenya</span>
          </p>
          {hasFilters ? (
            <Link href="/properties" className="pr-clear">
              Clear filters
            </Link>
          ) : null}
        </section>

        <section className="lp-container pr-grid-wrap">
          {errorMessage ? <p className="pr-empty">{errorMessage}</p> : null}

          {!loading && !errorMessage && visible.length === 0 ? (
            <div className="pr-empty">
              <p>
                {hasFilters
                  ? 'No properties match those filters.'
                  : 'New listings are on the way. Check back shortly.'}
              </p>
              {hasFilters ? (
                <Link href="/properties" className="lp-button lp-button-ghost">
                  Clear filters
                </Link>
              ) : null}
            </div>
          ) : null}

          <div className="pr-grid">
            {visible.map((listing) => {
              const image = listing.featuredImageUrl || listing.galleryImages?.[0] || null;
              const enquiry = `Hello, I am interested in ${listing.project.name} — Unit ${listing.unitNumber}.`;
              return (
                <article key={listing.id} className="pr-card">
                  <Link href={`/listings/${listing.id}`} className="pr-card-media">
                    {image ? <img src={image} alt={listing.project.name} loading="lazy" /> : null}
                    <span className="pr-card-badge">{badgeFor(listing)}</span>
                  </Link>

                  <div className="pr-card-body">
                    <h2>
                      <Link href={`/listings/${listing.id}`}>{listing.project.name}</Link>
                    </h2>
                    {listing.project.location ? (
                      <p className="pr-card-location">{listing.project.location}</p>
                    ) : null}
                    <p className="pr-card-meta">
                      {listing.bedrooms === 0 ? 'Studio' : `${listing.bedrooms} bed`}
                      {Number(listing.sizeSqm) > 0
                        ? ` · ${formatSqft(listing.sizeSqm)}`
                        : ''}
                    </p>
                    <p className="pr-card-price">
                      {formatKes(listing.priceKes)}
                      {listing.listingType === 'RENT' ? <span> / month</span> : null}
                    </p>

                    <div className="pr-card-actions">
                      <a
                        className="lp-button lp-button-primary"
                        href={enquiryContact.whatsappHref(enquiry)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Enquire
                      </a>
                      <Link href={`/listings/${listing.id}`} className="pr-card-more">
                        Learn More
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="lp-area-cta">
          <div className="lp-container">
            <h2>Need help choosing the right listing?</h2>
            <p>Send us what matters most and we will shortlist for you.</p>
            <div className="lp-area-cta-actions">
              <a
                className="lp-button lp-button-primary"
                href={enquiryContact.whatsappHref('Hello, I would like help shortlisting a property.')}
                target="_blank"
                rel="noreferrer"
              >
                Shortlist via WhatsApp
              </a>
              <Link className="lp-button lp-button-ghost" href="/contact">
                Book a Consultation
              </Link>
            </div>
          </div>
        </section>
      </main>
    </EliteLayout>
  );
}
