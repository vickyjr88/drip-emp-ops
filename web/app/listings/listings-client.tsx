"use client";

import Link from 'next/link';
import { sqftToSqm, sqmToSqft } from '../lib/area';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { EliteLayout } from '../components/elite-layout';

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3100').replace(/\/$/, '');

type PublicListing = {
  id: string;
  unitNumber: string;
  floorNumber: number;
  sizeSqm: string | number;
  priceKes: string | number;
  priceUsd: string | number;
  status: string;
  bedrooms: number;
  parkingSlots: number;
  hasBalcony: boolean;
  hasStore: boolean;
  featuredImageUrl: string | null;
  galleryImages: string[] | null;
  amenities: { id: string; name: string }[];
  project: { id: string; code: string; name: string; location: string | null; description: string | null };
  block: { id: string; blockName: string };
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

export default function ListingsClient() {
  return (
    <Suspense fallback={null}>
      <ListingsPageContent />
    </Suspense>
  );
}

function ListingsPageContent() {
  const searchParams = useSearchParams();
  const [listings, setListings] = useState<PublicListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const [locationFilter, setLocationFilter] = useState('');
  const [minBedrooms, setMinBedrooms] = useState(0);
  const [minArea, setMinArea] = useState('');
  const [selectedAmenities, setSelectedAmenities] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const location = searchParams.get('location');
    const minBedroomsParam = searchParams.get('minBedrooms');
    if (location) setLocationFilter(location);
    if (minBedroomsParam) setMinBedrooms(Number(minBedroomsParam) || 0);
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErrorMessage(null);
      try {
        const response = await fetch(`${API_BASE_URL}/public/listings`, { cache: 'no-store' });
        if (!response.ok) throw new Error('Unable to load listings.');
        const data = (await response.json()) as PublicListing[];
        if (!cancelled) setListings(data);
      } catch (error) {
        if (!cancelled) setErrorMessage(error instanceof Error ? error.message : 'Unable to load listings.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleFavorite(id: string) {
    setFavorites((current) => ({ ...current, [id]: !current[id] }));
  }

  function toggleAmenity(name: string) {
    setSelectedAmenities((current) => ({ ...current, [name]: !current[name] }));
  }

  const locations = useMemo(
    () => Array.from(new Set(listings.map((listing) => listing.project.location).filter(Boolean))) as string[],
    [listings],
  );

  const amenityOptions = useMemo(
    () => Array.from(new Set(listings.flatMap((listing) => listing.amenities.map((amenity) => amenity.name)))).sort(),
    [listings],
  );

  const activeAmenities = useMemo(
    () => Object.entries(selectedAmenities).filter(([, active]) => active).map(([name]) => name),
    [selectedAmenities],
  );

  const filteredListings = useMemo(() => {
    const minAreaValue = Number(minArea);
    const locationQuery = locationFilter.trim().toLowerCase();
    return listings.filter((listing) => {
      if (locationQuery && !(listing.project.location || '').toLowerCase().includes(locationQuery)) return false;
      if (minBedrooms && listing.bedrooms < minBedrooms) return false;
      // The field takes square feet while sizeSqm is metric: compare in metric
      // rather than letting a sq ft threshold silently filter out everything.
      if (
        minArea &&
        Number.isFinite(minAreaValue) &&
        minAreaValue > 0 &&
        Number(listing.sizeSqm) < sqftToSqm(minAreaValue)
      ) {
        return false;
      }
      if (activeAmenities.length > 0) {
        const listingAmenityNames = new Set(listing.amenities.map((amenity) => amenity.name));
        if (!activeAmenities.every((name) => listingAmenityNames.has(name))) return false;
      }
      return true;
    });
  }, [listings, locationFilter, minBedrooms, minArea, activeAmenities]);

  return (
    <EliteLayout active="listings">
      <main className="lp-main-content lp-listings-main">
        <section className="lp-listings-mobile-summary">
          <div className="lp-container lp-listings-mobile-summary-inner">
            <div>
              <p>Currently Viewing</p>
              <h2>All Available Properties</h2>
            </div>
            <button type="button">Filters</button>
          </div>
        </section>

        <section className="lp-listings-search lp-container">
          <h1>Properties</h1>
          <div className="lp-listings-fields">
            <label>
              <span>Location</span>
              <select
                aria-label="Location"
                value={locationFilter}
                onChange={(event) => setLocationFilter(event.target.value)}
              >
                <option value="">All locations</option>
                {locations.map((location) => (
                  <option key={location} value={location}>
                    {location}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Min. Bedrooms</span>
              <select
                aria-label="Minimum bedrooms"
                value={minBedrooms}
                onChange={(event) => setMinBedrooms(Number(event.target.value))}
              >
                <option value={0}>Any</option>
                <option value={1}>1+</option>
                <option value={2}>2+</option>
                <option value={3}>3+</option>
                <option value={4}>4+</option>
              </select>
            </label>
          </div>
        </section>

        <section className="lp-container lp-listings-layout">
          <aside className="lp-listings-sidebar">
            <h3>Amenities</h3>
            <div className="lp-listings-checks">
              {amenityOptions.length === 0 ? (
                <p className="lp-listings-sidebar-empty">No amenities tagged yet.</p>
              ) : (
                amenityOptions.map((name) => (
                  <label key={name}>
                    <input
                      type="checkbox"
                      checked={Boolean(selectedAmenities[name])}
                      onChange={() => toggleAmenity(name)}
                    />
                    {name}
                  </label>
                ))
              )}
            </div>

            <h3>Min. Area</h3>
            <div className="lp-listings-area">
              <input
                type="text"
                placeholder="e.g. 850"
                aria-label="Minimum area"
                value={minArea}
                onChange={(event) => setMinArea(event.target.value.replace(/[^0-9]/g, ''))}
              />
              <input type="text" placeholder="SQ FT" aria-label="Area unit" disabled />
            </div>
          </aside>

          <div className="lp-listings-grid-wrap">
            <div className="lp-results-bar">
              <p>
                <strong>{filteredListings.length}</strong> properties found
              </p>
            </div>

            {loading ? (
              <p>Loading properties...</p>
            ) : errorMessage ? (
              <p>{errorMessage}</p>
            ) : filteredListings.length === 0 ? (
              <p>No properties match your search right now. Check back soon.</p>
            ) : (
              <div className="lp-listings-grid">
                {filteredListings.map((listing) => {
                  const href = `/listings/${listing.id}`;
                  const usdPrice = formatUsd(listing.priceUsd);
                  const title = `${listing.project.name} — Unit ${listing.unitNumber}`;
                  return (
                    <article key={listing.id} className="lp-property-card">
                      <div className="lp-property-media">
                        <Link href={href} className="lp-listing-media-link" aria-label={title}>
                          {listing.featuredImageUrl ? (
                            <img src={listing.featuredImageUrl} alt={title} />
                          ) : (
                            <div className="lp-property-media-placeholder" aria-hidden="true" />
                          )}
                        </Link>
                        {listing.status === 'RESERVED' ? (
                          <span className="lp-badge lp-badge-dark">Reserved</span>
                        ) : null}
                        <button
                          type="button"
                          className={`lp-favorite-button ${favorites[listing.id] ? 'is-active' : ''}`}
                          aria-label={`Save ${title}`}
                          onClick={() => toggleFavorite(listing.id)}
                        >
                          ♥
                        </button>
                      </div>
                      <div className="lp-property-body">
                        <p className="lp-property-price lp-property-price-red">
                          {usdPrice || formatKes(listing.priceKes) || 'Price on request'}
                        </p>
                        {usdPrice && formatKes(listing.priceKes) ? (
                          <p className="lp-property-price-secondary">{formatKes(listing.priceKes)}</p>
                        ) : null}
                        <h3>
                          <Link href={href}>{title}</Link>
                        </h3>
                        <p className="lp-address">{listing.project.location || listing.block.blockName}</p>
                        <div className="lp-listing-stats">
                          <div>
                            <strong>{String(listing.bedrooms).padStart(2, '0')}</strong>
                            <span>Beds</span>
                          </div>
                          <div>
                            <strong>{listing.parkingSlots}</strong>
                            <span>Parking</span>
                          </div>
                          <div>
                            <strong>{Math.round(sqmToSqft(listing.sizeSqm)).toLocaleString()}</strong>
                            <span>SQ FT</span>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </main>
    </EliteLayout>
  );
}
