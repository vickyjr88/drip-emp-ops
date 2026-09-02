"use client";

/**
 * Analytics, storefront only.
 *
 * GA, PostHog, and the Meta Pixel all measure marketing/customer behaviour --
 * traffic sources, product views, checkout funnel. Staff signing in to ring
 * up a sale or edit a listing is not that, and letting it through would
 * inflate sessions and muddy conversion rate with internal usage. Excluded by
 * path rather than moved into a route group, so this stays a one-line guard
 * instead of restructuring where every existing page file lives.
 */

import Script from 'next/script';
import { Suspense, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { GoogleAnalytics } from '@next/third-parties/google';
import posthog from 'posthog-js';

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

// Module-scoped rather than a ref on the component: StorefrontAnalytics
// itself unmounts and remounts as a shopper crosses in and out of /portal,
// and init() must run exactly once per page load regardless of how many
// times the component underneath it does.
let posthogInitialized = false;

/**
 * Route changes in the App Router are client-side navigations, not full page
 * loads, so PostHog's own autocapture -- which listens for a browser
 * navigation event -- never fires again after the first page. Each pathname
 * change is captured as its own pageview explicitly instead.
 */
function PostHogPageview() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!posthogInitialized) {
      posthog.init('phc_mTTWZ55V0kJD3NO7ZeeS1qSyV65VnPEFSC2hF9x0vKI', {
        api_host: 'https://us.i.posthog.com',
        defaults: '2026-05-30',
        // init() itself would otherwise fire a pageview for the URL current
        // at load time, which is redundant with the explicit capture below
        // that runs for every pathname, including the first.
        capture_pageview: false,
      });
      posthogInitialized = true;
    }

    const search = searchParams.toString();
    posthog.capture('$pageview', { $current_url: search ? `${pathname}?${search}` : pathname });
  }, [pathname, searchParams]);

  return null;
}

/**
 * Route changes are client-side navigations here too, same reason as
 * PostHogPageview above. The base script's `fbq('init', ...)` call
 * deliberately does not also call `fbq('track', 'PageView')` -- this fires
 * the first PageView (for the URL current at load) as well as every one
 * after, so there is exactly one path that ever sends it.
 */
function MetaPixelPageview() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window.fbq !== 'function') return;
    window.fbq('track', 'PageView');
  }, [pathname]);

  return null;
}

export function StorefrontAnalytics() {
  const pathname = usePathname();
  if (pathname?.startsWith('/portal')) return null;

  return (
    <>
      {GA_MEASUREMENT_ID ? <GoogleAnalytics gaId={GA_MEASUREMENT_ID} /> : null}
      {META_PIXEL_ID ? (
        <>
          <Script id="meta-pixel-base" strategy="afterInteractive">
            {`
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${META_PIXEL_ID}');
            `}
          </Script>
          <noscript>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              height="1"
              width="1"
              alt=""
              style={{ display: 'none' }}
              src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
            />
          </noscript>
          <Suspense fallback={null}>
            <MetaPixelPageview />
          </Suspense>
        </>
      ) : null}
      {/* useSearchParams() opts a component out of static rendering unless
          it sits under its own Suspense boundary -- scoped here rather than
          in the root layout, so it does not force every page in the app
          into client-side rendering just to track its own pageviews. */}
      <Suspense fallback={null}>
        <PostHogPageview />
      </Suspense>
    </>
  );
}
