"use client";

/**
 * Google Analytics, storefront only.
 *
 * GA measures marketing/customer behaviour -- traffic sources, product views,
 * checkout funnel. Staff signing in to ring up a sale or edit a listing is
 * not that, and letting it through would inflate sessions and muddy
 * conversion rate with internal usage. Excluded by path rather than moved
 * into a route group, so this stays a one-line guard instead of restructuring
 * where every existing page file lives.
 */

import { usePathname } from 'next/navigation';
import { GoogleAnalytics } from '@next/third-parties/google';

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export function StorefrontAnalytics() {
  const pathname = usePathname();
  if (!GA_MEASUREMENT_ID || pathname?.startsWith('/portal')) return null;
  return <GoogleAnalytics gaId={GA_MEASUREMENT_ID} />;
}
