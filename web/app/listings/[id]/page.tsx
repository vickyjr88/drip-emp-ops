import type { Metadata } from 'next';
import { formatSqft } from '../../lib/area';
import { JsonLd, SITE_NAME, SITE_URL, absoluteUrl } from '../../lib/site';
import { previewFor } from '../../lib/preview-image';
import ListingDetailClient from './listing-detail-client';

/**
 * Server wrapper for a listing.
 *
 * The page itself stays a client component -- it has an inquiry form and
 * gallery state -- but the metadata and structured data have to be rendered
 * server-side or crawlers see an empty shell. These are the most valuable
 * pages on the site for search, so they get a real title, description,
 * canonical URL, Open Graph image and a schema.org listing.
 */

const API_BASE_URL = (
  process.env.INTERNAL_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:3100'
).replace(/\/$/, '');

type Listing = {
  id: string;
  unitNumber: string;
  bedrooms: number;
  sizeSqm: string | number;
  priceKes: string | number;
  status: string;
  parkingSlots: number;
  featuredImageUrl: string | null;
  galleryImages: string[] | null;
  amenities: Array<{ name: string }>;
  project: { name: string; location: string | null; description: string | null };
};

async function getListing(id: string): Promise<Listing | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/public/listings/${id}`, {
      next: { revalidate: 300 },
    });
    if (!response.ok) return null;
    return (await response.json()) as Listing;
  } catch {
    // The client component fetches independently and renders its own error, so
    // a failure here costs metadata, not the page.
    return null;
  }
}

function describe(listing: Listing) {
  const beds = Number(listing.bedrooms) === 0 ? 'Studio' : `${listing.bedrooms}-bedroom`;
  const where = listing.project.location ? ` in ${listing.project.location}` : '';
  const size = Number(listing.sizeSqm) > 0 ? `${formatSqft(listing.sizeSqm)}. ` : '';
  return `${beds} unit at ${listing.project.name}${where}. ${size}${
    listing.parkingSlots > 0 ? `${listing.parkingSlots} parking. ` : ''
  }Enquire with ${SITE_NAME}.`.trim();
}

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const listing = await getListing(params.id);
  if (!listing) {
    return { title: 'Listing', robots: { index: false, follow: true } };
  }

  const beds = Number(listing.bedrooms) === 0 ? 'Studio' : `${listing.bedrooms} Bedroom`;
  const title = `${beds} — ${listing.project.name}${
    listing.project.location ? `, ${listing.project.location}` : ''
  }`;
  const description = describe(listing);
  // Its own image if it has one; otherwise borrow from the portfolio so the
  // card is never blank.
  const preview = await previewFor(
    `/listings/${listing.id}`,
    listing.featuredImageUrl || listing.galleryImages?.[0],
  );
  const image = preview.images?.[0]?.url;

  return {
    title,
    description,
    alternates: { canonical: `/listings/${listing.id}` },
    openGraph: {
      type: 'article',
      title,
      description,
      url: preview.url,
      images: preview.images,
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function ListingDetailPage({ params }: { params: { id: string } }) {
  const listing = await getListing(params.id);

  return (
    <>
      {listing ? (
        <JsonLd
          data={{
            '@type': 'Residence',
            '@id': absoluteUrl(`/listings/${listing.id}#residence`),
            name: `${
              Number(listing.bedrooms) === 0 ? 'Studio' : `${listing.bedrooms} bedroom`
            } — ${listing.project.name}`,
            description: describe(listing),
            url: absoluteUrl(`/listings/${listing.id}`),
            ...(listing.featuredImageUrl ? { image: listing.featuredImageUrl } : {}),
            numberOfRooms: listing.bedrooms,
            ...(Number(listing.sizeSqm) > 0
              ? {
                  floorSize: {
                    '@type': 'QuantitativeValue',
                    value: Number(listing.sizeSqm),
                    unitCode: 'MTK', // square metre
                  },
                }
              : {}),
            address: {
              '@type': 'PostalAddress',
              addressLocality: listing.project.location || 'Nairobi',
              addressCountry: 'KE',
            },
            ...(listing.amenities?.length
              ? {
                  amenityFeature: listing.amenities.map((amenity) => ({
                    '@type': 'LocationFeatureSpecification',
                    name: amenity.name,
                    value: true,
                  })),
                }
              : {}),
            // Only offer a price when there is one and the unit can actually be
            // bought -- advertising a price on a reserved unit invites a
            // complaint, and structured data is held to the same standard as
            // visible copy.
            ...(Number(listing.priceKes) > 0
              ? {
                  offers: {
                    '@type': 'Offer',
                    price: Number(listing.priceKes),
                    priceCurrency: 'KES',
                    availability:
                      listing.status === 'AVAILABLE'
                        ? 'https://schema.org/InStock'
                        : 'https://schema.org/LimitedAvailability',
                    url: absoluteUrl(`/listings/${listing.id}`),
                    seller: { '@id': `${SITE_URL}/#organization` },
                  },
                }
              : {}),
          }}
        />
      ) : null}
      <ListingDetailClient />
    </>
  );
}
