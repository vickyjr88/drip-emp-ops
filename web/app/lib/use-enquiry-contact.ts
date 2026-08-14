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

const DEFAULT_WHATSAPP = '254113206481';
const DEFAULT_PHONE = '+254 113 206 481';

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

  return {
    whatsapp,
    phone,
    /** tel: links need the punctuation stripped; the displayed text keeps it. */
    phoneHref: `tel:${phone.replace(/[^\d+]/g, '')}`,
    /** Builds a wa.me link with the message pre-filled. */
    whatsappHref: (message: string) =>
      `https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`,
  };
}
