"use client";

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { customerApi } from './customer-auth';

const COOKIE_NAME = 'de_ref';
const COOKIE_TTL_DAYS = 30;

/**
 * Captures ?ref=<code> from the URL into a first-party cookie, last-click-wins,
 * and records the landing as a click on the reseller's analytics.
 *
 * Every landing with a ?ref= overwrites whatever was captured before -- that
 * is what "last click wins" means for attribution, not just for the final
 * purchase decision. A visit with no ?ref= present leaves any existing
 * attribution untouched: browsing further into the site after arriving via a
 * link must not silently erase who sent the shopper here.
 *
 * The click beacon fires once per landing, the same moment the cookie is
 * (re)written -- not on every subsequent page view while that cookie stays
 * active, which would inflate the count every time the same shopper clicked
 * to a second product. It's fire-and-forget: a failed beacon (offline, ad
 * blocker) must never affect the page the visitor actually came for.
 *
 * A plain document.cookie write, not a library: this is the app's first and
 * only cookie use, and one line does not earn a dependency.
 */
export function useCaptureReferral() {
  const params = useSearchParams();

  useEffect(() => {
    const ref = params.get('ref');
    if (!ref) return;
    const expires = new Date(Date.now() + COOKIE_TTL_DAYS * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(ref)}; expires=${expires}; path=/; SameSite=Lax`;
    void customerApi('/customer-portal/referral-click', {
      method: 'POST',
      body: JSON.stringify({ code: ref }),
    }).catch(() => {});
  }, [params]);
}

/** Reads back the captured code, if any. Used by checkout at submit time. */
export function readCapturedReferral(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)de_ref=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}
