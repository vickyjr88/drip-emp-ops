import type { Metadata } from 'next';
import { seoMetadata } from '../lib/page-metadata';
import { Suspense } from 'react';
import { PropertiesClient } from './properties-client';

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata({
    key: 'properties',
    path: '/properties',
    title: 'Properties for Sale and Rent in Nairobi',
    description:
      'Apartments, townhouses and land across Westlands, Kilimani, Lavington and the wider Nairobi metro. Filter by location, type, bedrooms and budget.',
    shareTitle: 'Properties in Nairobi | Dirrir Realtors',
    shareDescription:
      'Filter available homes and investments by location, type, bedrooms and budget.',
  });
}

export default function PropertiesPage() {
  // useSearchParams needs a Suspense boundary, or the whole route opts out of
  // static rendering and the metadata above stops being prerendered.
  return (
    <Suspense fallback={null}>
      <PropertiesClient />
    </Suspense>
  );
}
