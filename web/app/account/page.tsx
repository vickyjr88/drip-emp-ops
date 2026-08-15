import type { Metadata } from 'next';
import { AccountClient } from './account-client';

export const metadata: Metadata = {
  title: 'Your Account',
  description: 'Your Drip Emporium orders and details.',
  // Someone's order history is nobody else's business.
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return <AccountClient />;
}
