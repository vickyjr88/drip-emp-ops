import AccountClient from './account-client';

export const metadata = {
  title: 'My Account | Dirrir Realtors',
  description: 'View your unit, monthly charges, and payment history.',
  // robots.txt disallows crawling this path, but that does not stop the URL
  // being indexed if something links to it. noindex is what actually keeps a
  // signed-in area out of results.
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return <AccountClient />;
}
