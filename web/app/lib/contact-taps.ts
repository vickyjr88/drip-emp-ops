"use client";

/**
 * Someone tapping a phone number. Most of this shop's sales start in a chat or a call, so a call tap is a conversion in its own right:
 * recorded in the shop's own visit record (Insights shows it beside WhatsApp taps) and passed to the ad pixels as a Contact, so ad
 * campaigns can be judged and optimised on it. WhatsApp taps already take the same two routes (see use-enquiry-contact.ts).
 *
 * Wired once for every tel: link on the site by StorefrontAnalytics, not button by button, so a link added next month is counted too.
 * A link can say where it sits with data-source="product-bar"; otherwise it is "site".
 */

import { recordEvent, productSlugOfPath } from './first-party';
import { trackContact as trackMetaContact } from './meta-pixel';
import { trackContact as trackTikTokContact } from './tiktok-pixel';

/** The tel: link a click landed on, if it did. Pure, so it can be reasoned about without a browser. */
export function telLinkOf(target: EventTarget | null): { source: string } | null {
  const element = target instanceof Element ? target : null;
  const link = element?.closest?.('a[href^="tel:" i]');
  if (!link) return null;
  return { source: link.getAttribute('data-source')?.trim().slice(0, 40) || 'site' };
}

export function recordCallTap(source: string) {
  recordEvent('CALL_CLICK', { detail: source, productSlug: productSlugOfPath(window.location.pathname) ?? undefined });
  trackMetaContact({ channel: 'call', source });
  trackTikTokContact({ channel: 'call', source });
}
