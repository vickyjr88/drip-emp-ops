import type { Metadata } from 'next';
import './globals.css';
import { PortalDialogProvider } from './portal/components/portal-dialog';
import { NotificationsProvider } from './portal/components/notifications';
import { CartProvider } from './lib/cart';
import { CustomerAuthProvider } from './lib/customer-auth';
import { JsonLd, SITE_DESCRIPTION, SITE_NAME, SITE_URL, organizationSchema } from './lib/site';
import { StorefrontAnalytics } from './components/storefront-analytics';
import { contentValue, fetchPageContent } from './lib/page-content';

export const metadata: Metadata = {
  // Makes every relative canonical/OG URL below resolve against the real
  // origin. Without it Next emits relative URLs that crawlers cannot follow.
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} | Quality Affordable Sneakers & Streetwear in Nairobi`,
    // Page titles read "Listings | Drip Emporium" rather than each page
    // repeating the brand by hand.
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'en_KE',
    url: SITE_URL,
    title: `${SITE_NAME} | Quality Affordable Sneakers & Streetwear in Nairobi`,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      // Let Google show full-size image and video previews and untruncated
      // snippets; the defaults are conservative and cost listing impressions.
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  formatDetection: { telephone: true, address: true, email: true },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Footer content already carries the site's social links (portal-edited,
  // shown as "Follow Us"); reused here rather than duplicating them as a
  // second field to keep in sync. A failed fetch (fetchPageContent returns
  // null) just means no sameAs this render, not a broken layout.
  const footerContent = await fetchPageContent('footer');
  const socialUrls = ['facebook', 'instagram', 'tiktok', 'x', 'linkedin', 'youtube']
    .map((key) => contentValue(footerContent, `social.${key}`, ''))
    .filter(Boolean);

  return (
    <html lang="en">
      <body>
        {/* Site-wide entity. Repeated @id across pages lets crawlers merge
            these into one organisation rather than many. */}
        <JsonLd
          data={{
            '@graph': [
              organizationSchema(socialUrls),
              {
                '@type': 'WebSite',
                '@id': `${SITE_URL}/#website`,
                url: SITE_URL,
                name: SITE_NAME,
                description: SITE_DESCRIPTION,
                publisher: { '@id': `${SITE_URL}/#organization` },
              },
            ],
          }}
        />
        <CustomerAuthProvider>
        <CartProvider>
          <NotificationsProvider>
          <PortalDialogProvider>{children}</PortalDialogProvider>
        </NotificationsProvider>
        </CartProvider>
        </CustomerAuthProvider>
        <StorefrontAnalytics />
      </body>
    </html>
  );
}
