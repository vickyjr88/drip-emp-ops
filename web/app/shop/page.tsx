import type { Metadata } from 'next';
import { Suspense } from 'react';
import { seoMetadata } from '../lib/page-metadata';
import { ShopClient } from './shop-client';

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata({
    key: 'properties',
    path: '/shop',
    title: 'Shop Sneakers & Streetwear',
    description:
      'Nike, Adidas, Jordan and Puma in EUR 39–44. Filter by size, brand and price. Two shops on Ronald Ngala Street, Nairobi.',
    shareTitle: 'Shop Sneakers in Nairobi | Drip Emporium',
  });
}

export default function ShopPage() {
  // useSearchParams needs a Suspense boundary or the route fails to prerender.
  return (
    <Suspense fallback={null}>
      <ShopClient />
    </Suspense>
  );
}
