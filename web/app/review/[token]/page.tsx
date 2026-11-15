import type { Metadata } from 'next';
import { ReviewOrderClient } from './review-client';

// Reached from a link the shop sends a customer. Not a page for search engines, and never the same twice for two orders.
export const metadata: Metadata = {
  title: 'Review your pair | Drip Emporium',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function ReviewOrderPage({ params }: { params: { token: string } }) {
  return <ReviewOrderClient token={decodeURIComponent(params.token)} />;
}
