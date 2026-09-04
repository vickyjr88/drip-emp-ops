"use client";

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { customerApi } from './customer-auth';

const COOKIE_NAME = 'de_attr';
const COOKIE_TTL_DAYS = 30;

export type CapturedAttribution = { type: 'reseller' | 'campaign'; code: string };

/**
 * Captures ?ref=<code> (a reseller's link) or ?camp=<code> (an admin-created
 * paid-marketing link) from the URL into a single first-party cookie, and
 * records the landing as a click on the relevant analytics.
 *
 * There is exactly one attribution slot, tagged by type, not two independent
 * cookies -- "last click wins overall" means whichever kind of link was
 * clicked most recently before checkout gets the credit, so a shopper who
 * arrives via a reseller's link and later clicks a Facebook ad (or the
 * reverse) has only the second one counted. Every landing with a ?ref= or
 * ?camp= present overwrites whatever was captured before, of either type. A
 * visit with neither param leaves any existing attribution untouched --
 * browsing further into the site after arriving via a link must not silently
 * erase who sent the shopper here.
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
    const camp = params.get('camp');
    // ?ref= takes precedence only in the pathological case both params are
    // present on the same URL at once (never true for a real shared link) --
    // an ordinary landing only ever carries one or the other.
    const attribution: CapturedAttribution | null = ref
      ? { type: 'reseller', code: ref }
      : camp
        ? { type: 'campaign', code: camp }
        : null;
    if (!attribution) return;

    const expires = new Date(Date.now() + COOKIE_TTL_DAYS * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(attribution))}; expires=${expires}; path=/; SameSite=Lax`;

    const endpoint = attribution.type === 'reseller' ? '/customer-portal/referral-click' : `/campaigns/${encodeURIComponent(attribution.code)}/click`;
    void customerApi(endpoint, {
      method: 'POST',
      body: attribution.type === 'reseller' ? JSON.stringify({ code: attribution.code }) : undefined,
    }).catch(() => {});
  }, [params]);
}

/** Reads back the captured attribution, if any. Used by checkout at submit time. */
export function readCapturedAttribution(): CapturedAttribution | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)de_attr=([^;]+)/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(match[1]));
    if (parsed?.type === 'reseller' || parsed?.type === 'campaign') return parsed;
    return null;
  } catch {
    return null;
  }
}
