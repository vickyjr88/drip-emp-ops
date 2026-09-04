"use client";

/**
 * The WhatsApp and phone numbers the enquiry buttons use.
 *
 * These were written out in each page that offered a "Talk on WhatsApp"
 * button, so changing the number meant finding every copy. They live in the
 * CMS header document now -- alongside the other site-wide contact details --
 * and this hook is what the pages read them through.
 *
 * The defaults are the numbers that were previously hardcoded, so the buttons
 * keep working before anyone edits the CMS and if the API is unreachable.
 */

import { useEffect, useState } from 'react';
import { PageContentDocument, contentValue, fetchPageContent } from './page-content';
import { customerApi } from './customer-auth';
import { readCapturedAttribution } from './use-capture-referral';

const DEFAULT_WHATSAPP = '254113206481';
const DEFAULT_PHONE = '+254 113 206 481';
/**
 * Advertising copy, not a calculation.
 *
 * Delivery is arranged and billed after the order, so nothing derives a charge
 * from this -- it is only what the shop tells shoppers, and it lives in the CMS
 * so it can be changed without a rebuild.
 */
const DEFAULT_DELIVERY_NOTE = 'Delivery arranged after you order — we will call to confirm';

export function useEnquiryContact() {
  const [content, setContent] = useState<PageContentDocument | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchPageContent('header').then((document) => {
      if (!cancelled) setContent(document);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const whatsapp = contentValue(content, 'enquiries.whatsapp', DEFAULT_WHATSAPP);
  const phone = contentValue(content, 'enquiries.phone', DEFAULT_PHONE);
  const deliveryNote = contentValue(content, 'delivery.note', DEFAULT_DELIVERY_NOTE);

  return {
    whatsapp,
    phone,
    deliveryNote,
    /** tel: links need the punctuation stripped; the displayed text keeps it. */
    phoneHref: `tel:${phone.replace(/[^\d+]/g, '')}`,
    /** Builds a wa.me link with the message pre-filled. Pure -- building the
     *  href runs on every render, so recording a click here would count a
     *  render, not a tap. See onWhatsAppClick below for that. */
    whatsappHref: (message: string) =>
      `https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`,
    /**
     * Records a tap against whichever campaign/reseller link is currently
     * attributed -- most of this shop's real sales close in this chat, not
     * at online checkout, so this is what makes a link's WhatsApp reach
     * visible at all. Attach as the WhatsApp link/button's own onClick, not
     * called during render. `source` names the button for the campaign
     * dashboard (e.g. "product-page", "cart", "float") -- required so every
     * call site states which button it is, rather than an easy-to-forget
     * optional default that would leave every tap looking the same.
     */
    onWhatsAppClick: (source: string) => recordWhatsAppClick(source),
  };
}

/**
 * Fire-and-forget, same tolerance as useCaptureReferral's own beacon: a
 * failed or blocked request must never affect the WhatsApp link itself,
 * which is the thing the visitor actually came for.
 */
function recordWhatsAppClick(source: string) {
  const attribution = readCapturedAttribution();
  void customerApi('/cart-leads/whatsapp-click', {
    method: 'POST',
    body: JSON.stringify({
      source,
      referralCode: attribution?.type === 'reseller' ? attribution.code : undefined,
      campaignCode: attribution?.type === 'campaign' ? attribution.code : undefined,
    }),
  }).catch(() => {});
}
