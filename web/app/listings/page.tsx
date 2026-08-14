import type { Metadata } from 'next';
import { seoMetadata } from '../lib/page-metadata';
import ListingsClient from './listings-client';

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata({
    key: 'listings',
    path: '/listings',
    title: 'Property Listings in Nairobi',
    description:
      'Apartments, townhouses and plots currently available through Dirrir Realtors. Filter by bedrooms, price and project, with photos, floor plans and prices in KES.',
    shareTitle: 'Property Listings in Nairobi | Dirrir Realtors',
  });
}

export default function ListingsPage() {
  return <ListingsClient />;
}
