import type { Metadata } from 'next';
import { ResellerDashboardClient } from './reseller-client';

export const metadata: Metadata = {
  title: 'Your Referrals',
  description: 'Orders referred through your link and the commission they earned.',
  robots: { index: false, follow: false },
};

export default function ResellerDashboardPage() {
  return <ResellerDashboardClient />;
}
