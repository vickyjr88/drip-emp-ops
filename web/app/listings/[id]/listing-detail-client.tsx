"use client";

import Link from 'next/link';
import { useEnquiryContact } from '../../lib/use-enquiry-contact';
import { formatArea, formatSqft } from '../../lib/area';
import { notFound, useParams } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';

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
  floorPlanUrl: string | null;
  bathrooms?: number;
  propertyType?: string | null;
  listingType?: string | null;
  referenceCode?: string | null;
  availableFrom?: string | null;
  furnishing?: string | null;
  lotSizeSqm?: string | number | null;
  extraDetails?: string | null;
  portfolio?: string | null;
  floorPlan?: {
    id: string;
    name: string;
    bedrooms: number;
    bathrooms: number;
    sizeSqm: string | number;
    description?: string | null;
    imageUrls: string[];
  } | null;
  amenities: { id: string; name: string; description?: string | null; icon?: string | null; category?: string | null }[];
  project: {
    id: string;
    code: string;
    name: string;
    location: string | null;
    description: string | null;
    yearBuilt?: number | null;
    structureType?: string | null;
    exteriorMaterials?: string | null;
    addressLine?: string | null;
    city?: string | null;
    country?: string | null;
    floorPlans?: Array<{
      id: string;
      name: string;
      bedrooms: number;
      bathrooms: number;
      sizeSqm: string | number;
      priceKes?: string | number | null;
      description?: string | null;
      imageUrls: string[];
    }>;
  };
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


/**
 * Spec rows for the details grid, in the reference page's order.
 *
 * Rows with no value are dropped rather than printed with a dash: a spec table
 * that is half em-dashes reads as broken data rather than as a property that
 * simply has not been fully described yet.
 */
function buildSpecRows(
  listing: PublicListing,
): Array<{ label: string; value: string; wide?: boolean }> {
  const area = Number(listing.sizeSqm);
  const lot = listing.lotSizeSqm ? Number(listing.lotSizeSqm) : 0;

  // Unlike the earlier version, every row is shown. The reference page prints
  // "N/A" and "Immediate" rather than dropping rows, which keeps the two-column
  // grid even and tells the reader the question was asked and answered.
  return [
    { label: 'Type', value: listing.propertyType || 'N/A' },
    {
      label: 'Bedrooms',
      value: listing.bedrooms === 0 ? 'Studio' : String(listing.bedrooms),
    },
    { label: 'Bathrooms', value: String(listing.bathrooms ?? 0) },
    { label: 'Area', value: area > 0 ? formatArea(area) : 'N/A' },
    {
      label: 'Available From',
      // A missing date means available now, not unknown.
      value: listing.availableFrom
        ? new Date(listing.availableFrom).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : 'Immediate',
    },
    { label: 'Structure Type', value: listing.project.structureType || 'N/A' },
    { label: 'Exterior Material', value: listing.project.exteriorMaterials || 'N/A' },
    { label: 'Lot Size', value: lot > 0 ? formatArea(lot) : 'N/A' },
    // Free text: reads better across both columns than squeezed into one.
    { label: 'Extra Details', value: listing.extraDetails || 'N/A', wide: true },
    { label: 'Furnishing', value: listing.furnishing || 'N/A', wide: true },
    { label: 'Price', value: formatKes(listing.priceKes) || 'On request' },
    { label: 'Portfolio', value: listing.portfolio || 'N/A' },
  ];
}

/** Amenities split the way the reference page groups them. */
function groupAmenities(listing: PublicListing) {
  const outdoorHints = /(pool|garden|parking|rooftop|outdoor|terrace|play|gym|security|balcony)/i;
  const interior: typeof listing.amenities = [];
  const outdoor: typeof listing.amenities = [];
  for (const amenity of listing.amenities) {
    const category = (amenity.category || '').toLowerCase();
    if (category.includes('outdoor') || category.includes('exterior')) outdoor.push(amenity);
    else if (category.includes('interior') || category.includes('indoor')) interior.push(amenity);
    else if (outdoorHints.test(amenity.name)) outdoor.push(amenity);
    else interior.push(amenity);
  }
  return { interior, outdoor };
}

export default function ListingDetailClient() {
  const params = useParams<{ id: string }>();
  const enquiryContact = useEnquiryContact();
  const [listing, setListing] = useState<PublicListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFoundState, setNotFoundState] = useState(false);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [submitState, setSubmitState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [inquiryForm, setInquiryForm] = useState({ name: '', email: '', phone: '', message: '' });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setNotFoundState(false);
      try {
        const response = await fetch(`${API_BASE_URL}/public/listings/${params.id}`, { cache: 'no-store' });
        if (response.status === 404) {
          if (!cancelled) setNotFoundState(true);
          return;
        }
        if (!response.ok) throw new Error('Unable to load listing.');
        const data = (await response.json()) as PublicListing;
        if (!cancelled) {
          setListing(data);
          setActiveImage(data.featuredImageUrl || (data.galleryImages && data.galleryImages[0]) || null);
        }
      } catch {
        if (!cancelled) setNotFoundState(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (params.id) void load();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const submitLabel = submitState === 'sending' ? 'Sending...' : submitState === 'sent' ? 'Message Sent' : 'Send Inquiry';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitState === 'sending') return;

    const form = event.currentTarget;
    setSubmitState('sending');
    setSubmitError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/public/inquiries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: inquiryForm.name,
          email: inquiryForm.email,
          phone: inquiryForm.phone || undefined,
          message: inquiryForm.message,
          unitId: params.id,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      setSubmitState('sent');
      setInquiryForm({ name: '', email: '', phone: '', message: '' });
      form.reset();
      setTimeout(() => setSubmitState('idle'), 2500);
    } catch {
      setSubmitError('We could not send your inquiry. Please try again or call us directly.');
      setSubmitState('idle');
    }
  }

  if (notFoundState) {
    notFound();
  }

  if (loading || !listing) {
    return (
      <EliteLayout active="listings">
        <main className="lp-main-content lp-detail-main">
          <section className="lp-container" style={{ padding: '80px 0' }}>
            <p>Loading property...</p>
          </section>
        </main>
      </EliteLayout>
    );
  }

  const title = `${listing.project.name} — Unit ${listing.unitNumber}`;
  const specRows = listing ? buildSpecRows(listing) : [];
  const amenityGroups = listing ? groupAmenities(listing) : { interior: [], outdoor: [] };
  const projectPlans = listing?.project.floorPlans || [];

  const gallery = [listing.featuredImageUrl, ...(listing.galleryImages || [])].filter(
    (url, index, all): url is string => Boolean(url) && all.indexOf(url) === index,
  );
  const usdPrice = formatUsd(listing.priceUsd);
  const kesPrice = formatKes(listing.priceKes);
  const heroImage = activeImage || gallery[0] || null;
  const heroIndex = heroImage ? Math.max(gallery.indexOf(heroImage), 0) : 0;
  const statusLabel = listing.listingType === 'RENT' ? 'For Rent' : 'For Sale';

  // Anchors for the sticky tab bar. A tab is only offered when its section
  // exists, so the bar never scrolls to an empty part of the page.
  const tabs = [
    { id: 'overview', label: 'Overview', show: true },
    { id: 'gallery', label: 'Gallery', show: gallery.length > 1 },
    { id: 'details', label: 'Details', show: specRows.length > 0 },
    { id: 'features', label: 'Features', show: listing.amenities.length > 0 },
    { id: 'floor-plans', label: 'Floor Plans', show: projectPlans.length > 0 },
    { id: 'enquire', label: 'Enquire', show: true },
  ].filter((tab) => tab.show);

  return (
    <EliteLayout active="listings">
      <main className="lp-main-content pd-main">
        {/* Hero ------------------------------------------------------- */}
        <section
          className="pd-hero"
          style={heroImage ? { backgroundImage: `url(${heroImage})` } : undefined}
        >
          <div className="lp-container pd-hero-inner">
            <p className="pd-hero-eyebrow">
              <span className="pd-status">{statusLabel}</span>
              {listing.project.location ? <span>{listing.project.location}</span> : null}
            </p>
            <h1>{listing.project.name}</h1>
            <p className="pd-hero-sub">
              Unit {listing.unitNumber} · Block {listing.block.blockName} · Floor {listing.floorNumber}
            </p>
            <p className="pd-hero-price">
              {kesPrice}
              {usdPrice ? <span className="pd-hero-price-alt">{usdPrice}</span> : null}
            </p>
          </div>
        </section>

        {/* Sticky tab bar --------------------------------------------- */}
        <nav className="pd-tabs" aria-label="Sections on this page">
          <div className="lp-container pd-tabs-inner">
            {tabs.map((tab) => (
              <a key={tab.id} href={`#${tab.id}`}>
                {tab.label}
              </a>
            ))}
          </div>
        </nav>

        {/* Overview + key metadata ------------------------------------ */}
        <section className="lp-container pd-section" id="overview">
          <div className="pd-overview">
            <div>
              <p className="pd-kicker">Overview</p>
              <h2>{title}</h2>
              <p className="pd-lede">
                {listing.project.description ||
                  `Unit ${listing.unitNumber} on floor ${listing.floorNumber}, offering ${listing.bedrooms} bedroom${listing.bedrooms === 1 ? '' : 's'} across ${formatSqft(listing.sizeSqm)}.`}
              </p>
              <div className="pd-cta-row">
                <a className="lp-button lp-button-primary" href="#enquire">
                  Talk to an Advisor
                </a>
                {listing.floorPlanUrl ? (
                  <a
                    className="lp-button lp-button-ghost"
                    href={listing.floorPlanUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Download Floor Plan
                  </a>
                ) : null}
              </div>
            </div>

            {/* The four-across metadata strip from the reference page. */}
            <dl className="pd-meta">
              <div>
                <dt>Status</dt>
                <dd>{listing.status}</dd>
              </div>
              {listing.referenceCode ? (
                <div>
                  <dt>Property ID</dt>
                  <dd>{listing.referenceCode}</dd>
                </div>
              ) : null}
              <div>
                <dt>Floor</dt>
                <dd>{listing.floorNumber}</dd>
              </div>
              {listing.project.yearBuilt ? (
                <div>
                  <dt>Year Built</dt>
                  <dd>{listing.project.yearBuilt}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </section>

        {/* Gallery: hero + thumbnail strip with a counter -------------- */}
        {gallery.length > 0 ? (
          <section className="lp-container pd-section" id="gallery">
            <p className="pd-kicker">Gallery</p>
            <div className="pd-gallery">
              <div className="pd-gallery-hero">
                {heroImage ? (
                  <img src={heroImage} alt={`${title} photo ${heroIndex + 1}`} />
                ) : null}
                <span className="pd-gallery-count">
                  {String(heroIndex + 1).padStart(2, '0')} / {String(gallery.length).padStart(2, '0')}
                </span>
              </div>

              {gallery.length > 1 ? (
                <div className="pd-thumbs" role="group" aria-label="Gallery thumbnails">
                  {gallery.map((url, index) => (
                    <button
                      key={`${url}-${index}`}
                      type="button"
                      className={`pd-thumb${url === heroImage ? ' is-active' : ''}`}
                      onClick={() => setActiveImage(url)}
                      aria-label={`Show photo ${index + 1}`}
                    >
                      <img src={url} alt="" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {/* Details: address card beside a property-details card ------- */}
        <section className="lp-container pd-section" id="details">
          <div className="pd-cards">
            <article className="pd-card">
              <p className="pd-card-kicker">Address &amp; Location</p>
              <h2 className="pd-card-title">{listing.project.name}</h2>

              <dl className="pd-stack">
                <div>
                  <dt>Address</dt>
                  <dd>{listing.project.addressLine || listing.project.location || 'N/A'}</dd>
                </div>
                <div>
                  <dt>Location</dt>
                  <dd>{listing.project.location || 'N/A'}</dd>
                </div>
                <div>
                  <dt>City</dt>
                  <dd>{listing.project.city || 'N/A'}</dd>
                </div>
                <div>
                  <dt>Country</dt>
                  <dd>{listing.project.country || 'Kenya'}</dd>
                </div>
              </dl>

              {/* A search URL rather than an embed: it needs no API key and no
                  coordinates, which we do not store. */}
              <a
                className="pd-map-link"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  [listing.project.addressLine, listing.project.location, listing.project.city, listing.project.country]
                    .filter(Boolean)
                    .join(', ') || listing.project.name,
                )}`}
                target="_blank"
                rel="noreferrer"
              >
                Open in Google Maps
              </a>
            </article>

            <article className="pd-card" id="features">
              <p className="pd-card-kicker">Property Details</p>
              <dl className="pd-pairs">
                {specRows.map((row) => (
                  <div key={row.label} className={row.wide ? 'is-wide' : undefined}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            </article>
          </div>

          {listing.amenities.length > 0 ? (
            <div className="pd-cards" style={{ marginTop: 20 }}>
              {([
                ['Interior Details', amenityGroups.interior],
                ['Outdoor Details', amenityGroups.outdoor],
              ] as const)
                .filter(([, items]) => items.length > 0)
                .map(([groupName, items]) => (
                  <article key={groupName} className="pd-card">
                    <p className="pd-card-kicker">{groupName}</p>
                    <ul className="pd-feature-list">
                      {items.map((amenity) => (
                        <li key={amenity.id}>
                          {amenity.icon ? <span aria-hidden>{amenity.icon} </span> : null}
                          {amenity.name}
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
            </div>
          ) : null}
        </section>

        {/* Floor plans ------------------------------------------------- */}
        {projectPlans.length > 0 ? (
          <section className="lp-container pd-section" id="floor-plans">
            <p className="pd-kicker">Floor Plans</p>
            <h2 className="pd-section-title">Layouts at {listing.project.name}</h2>
            <div className="pd-plan-grid">
              {projectPlans.map((plan) => {
                const isThisUnit = listing.floorPlan?.id === plan.id;
                return (
                  <article key={plan.id} className={`pd-plan${isThisUnit ? ' is-current' : ''}`}>
                    <div className="pd-plan-media">
                      {plan.imageUrls?.[0] ? (
                        <img src={plan.imageUrls[0]} alt={`${plan.name} floor plan`} />
                      ) : (
                        <span className="pd-plan-placeholder">Drawing to follow</span>
                      )}
                      {isThisUnit ? <span className="pd-plan-tag">This home</span> : null}
                    </div>
                    <div className="pd-plan-body">
                      <h3>{plan.name}</h3>
                      <dl className="pd-plan-specs">
                        <div>
                          <dt>Rooms</dt>
                          <dd>{plan.bedrooms === 0 ? 'Studio' : plan.bedrooms}</dd>
                        </div>
                        <div>
                          <dt>Baths</dt>
                          <dd>{plan.bathrooms || '—'}</dd>
                        </div>
                        <div>
                          <dt>Size</dt>
                          <dd>{formatArea(plan.sizeSqm)}</dd>
                        </div>
                      </dl>
                      {plan.priceKes ? (
                        <p className="pd-plan-price">{formatKes(plan.priceKes)}</p>
                      ) : null}
                      {plan.description ? <p className="pd-plan-desc">{plan.description}</p> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* Enquiry ----------------------------------------------------- */}
        <section className="lp-container pd-section pd-enquire" id="enquire">
          <div className="pd-enquire-inner">
            <div>
              <p className="pd-kicker">Enquire</p>
              <h2 className="pd-section-title">Arrange a viewing</h2>
              <p className="pd-lede">
                Tell us when suits and we will confirm. Or reach the team directly on{' '}
                <a href={enquiryContact.phoneHref}>{enquiryContact.phone}</a>.
              </p>
              <div className="pd-cta-row">
                <a
                  className="lp-button lp-button-ghost"
                  href={enquiryContact.whatsappHref(`Hello, I am interested in ${title}.`)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Talk on WhatsApp
                </a>
              </div>
            </div>

            <form className="pd-form" onSubmit={handleSubmit}>
              <label>
                <span>Full name</span>
                <input
                  value={inquiryForm.name}
                  onChange={(event) => setInquiryForm((prev) => ({ ...prev, name: event.target.value }))}
                  required
                />
              </label>
              <label>
                <span>Email</span>
                <input
                  type="email"
                  value={inquiryForm.email}
                  onChange={(event) => setInquiryForm((prev) => ({ ...prev, email: event.target.value }))}
                  required
                />
              </label>
              <label>
                <span>Phone</span>
                <input
                  value={inquiryForm.phone}
                  onChange={(event) => setInquiryForm((prev) => ({ ...prev, phone: event.target.value }))}
                />
              </label>
              <label>
                <span>Message</span>
                <textarea
                  rows={4}
                  value={inquiryForm.message}
                  placeholder={`I am interested in ${title}...`}
                  onChange={(event) => setInquiryForm((prev) => ({ ...prev, message: event.target.value }))}
                />
              </label>
              {submitError ? <p className="pd-form-error">{submitError}</p> : null}
              <button
                type="submit"
                className="lp-button lp-button-primary"
                disabled={submitState === 'sending'}
              >
                {submitLabel}
              </button>
            </form>
          </div>
        </section>
      </main>
    </EliteLayout>
  );
}
