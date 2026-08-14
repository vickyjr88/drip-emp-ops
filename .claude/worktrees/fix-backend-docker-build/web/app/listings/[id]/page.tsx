"use client";

import Link from 'next/link';
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
  amenities: { id: string; name: string; description?: string | null; icon?: string | null }[];
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

export default function ListingDetailPage() {
  const params = useParams<{ id: string }>();
  const [listing, setListing] = useState<PublicListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFoundState, setNotFoundState] = useState(false);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [submitState, setSubmitState] = useState<'idle' | 'sending' | 'sent'>('idle');

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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitState === 'sending') return;
    setSubmitState('sending');
    setTimeout(() => {
      setSubmitState('sent');
      setTimeout(() => {
        setSubmitState('idle');
        event.currentTarget.reset();
      }, 1800);
    }, 1200);
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
  const gallery = [listing.featuredImageUrl, ...(listing.galleryImages || [])].filter(
    (url, index, all): url is string => Boolean(url) && all.indexOf(url) === index,
  );
  const usdPrice = formatUsd(listing.priceUsd);
  const kesPrice = formatKes(listing.priceKes);

  return (
    <EliteLayout active="listings">
      <main className="lp-main-content lp-detail-main">
        <section className="lp-detail-hero lp-container">
          <article className="lp-detail-primary">
            {activeImage ? (
              <img src={activeImage} alt={title} />
            ) : (
              <div className="lp-property-media-placeholder" aria-hidden="true" />
            )}
            <div>
              <span className="lp-badge lp-badge-red">
                {listing.status === 'RESERVED' ? 'Reserved' : 'Available'}
              </span>
              <h1>{title}</h1>
              <p>
                {listing.project.location ? `${listing.project.location} · ` : ''}
                Block {listing.block.blockName}, Floor {listing.floorNumber}
              </p>
            </div>
          </article>
          {gallery.length > 1 ? (
            <div className="lp-detail-side">
              {gallery.slice(1, 3).map((url, index) => {
                const isLast = index === gallery.slice(1, 3).length - 1;
                const image = (
                  <img
                    src={url}
                    alt={`${title} photo ${index + 2}`}
                    onClick={() => setActiveImage(url)}
                    style={{ cursor: 'pointer' }}
                  />
                );
                if (isLast && gallery.length > 3) {
                  return (
                    <div key={url} className="lp-detail-side-bottom">
                      {image}
                      <button type="button" onClick={() => setGalleryOpen(true)}>
                        View All {gallery.length} Photos
                      </button>
                    </div>
                  );
                }
                return (
                  <div key={url}>
                    {image}
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>

        <section className="lp-container lp-detail-pricebar">
          <div>
            <p>Current Listing Price</p>
            <h2>{usdPrice || kesPrice || 'Price on request'}</h2>
          </div>
          <div>
            <span>{listing.bedrooms} Beds</span>
            <span>{listing.parkingSlots} Parking</span>
            <span>{Number(listing.sizeSqm).toLocaleString()} SQM</span>
          </div>
          <div>
            <button type="button" onClick={() => setSaved((current) => !current)}>
              {saved ? 'Saved' : 'Save'}
            </button>
            <Link href="/contact">Inquire</Link>
          </div>
        </section>

        {galleryOpen ? (
          <div className="lp-lightbox" role="dialog" aria-modal="true" aria-label={`${title} photo gallery`}>
            <button type="button" className="lp-lightbox-close" onClick={() => setGalleryOpen(false)} aria-label="Close gallery">
              Close ✕
            </button>
            <div className="lp-lightbox-grid">
              {gallery.map((url, index) => (
                <img key={url} src={url} alt={`${title} photo ${index + 1}`} />
              ))}
            </div>
          </div>
        ) : null}

        <section className="lp-container lp-detail-body">
          <article>
            <div className="lp-detail-kicker">
              <span />
              <p>Property Overview</p>
            </div>
            <h3>{listing.project.name}</h3>
            <p>
              {listing.project.description ||
                `Unit ${listing.unitNumber} is located on floor ${listing.floorNumber} of Block ${listing.block.blockName}, offering ${listing.bedrooms} bedroom${listing.bedrooms === 1 ? '' : 's'} across ${Number(listing.sizeSqm).toLocaleString()} sqm.`}
            </p>
            <p>
              {listing.hasBalcony ? 'Includes a private balcony. ' : ''}
              {listing.hasStore ? 'Includes a dedicated store room. ' : ''}
              {listing.parkingSlots > 0 ? `${listing.parkingSlots} parking slot${listing.parkingSlots === 1 ? '' : 's'} included.` : ''}
            </p>
            {listing.amenities.length > 0 ? (
              <div className="lp-detail-amenities">
                {listing.amenities.map((amenity) => (
                  <div key={amenity.id}>
                    <h4>
                      {amenity.icon ? `${amenity.icon} ` : ''}
                      {amenity.name}
                    </h4>
                    {amenity.description ? <p>{amenity.description}</p> : null}
                  </div>
                ))}
              </div>
            ) : null}
          </article>

          <aside>
            <div className="lp-detail-agent">
              <div>
                <h5>Dirrir Realtors</h5>
                <p>Sales Team</p>
              </div>
            </div>
            <h4>Inquire About This Property</h4>
            <form onSubmit={handleSubmit}>
              <label>
                Full Name
                <input type="text" placeholder="John Doe" required />
              </label>
              <label>
                Email Address
                <input type="email" placeholder="john@example.com" required />
              </label>
              <label>
                Message
                <textarea rows={3} placeholder={`I am interested in ${title}...`} />
              </label>
              <button type="submit" className={submitState === 'sent' ? 'is-sent' : ''} disabled={submitState === 'sending'}>
                {submitLabel}
              </button>
            </form>
            <div className="lp-detail-contact-links">
              <a href="tel:+12345678900">+1 (234) 567-8900</a>
              <a href="mailto:direct@dirrir.com">DIRECT@DIRRIR.COM</a>
            </div>
          </aside>
        </section>

        {listing.project.location ? (
          <section className="lp-detail-map">
            <div>
              <p>{listing.project.location}</p>
            </div>
          </section>
        ) : null}

        <div className="lp-detail-mobile-cta lp-container">
          <button type="button">Book Viewing</button>
          <a href="tel:+12345678900">Call</a>
        </div>
      </main>
    </EliteLayout>
  );
}
