import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CompleteClient } from './complete-client';

export const metadata: Metadata = {
  title: 'Order Confirmation',
  // A receipt is nobody else's business.
  robots: { index: false, follow: false },
};

export default function CheckoutCompletePage() {
  // useSearchParams needs a Suspense boundary or the route fails to prerender.
  return (
    <Suspense fallback={null}>
      <CompleteClient />
    </Suspense>
  );
}
