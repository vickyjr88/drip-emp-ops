"use client";

/**
 * Floating WhatsApp button, bottom-right on every page.
 *
 * Reads the number from the same CMS field the enquiry buttons on product
 * pages use, so there is still one place to change it. Renders nothing when
 * that field is cleared, which is how the button is turned off.
 */

import { useEnquiryContact } from '../lib/use-enquiry-contact';

export function WhatsAppFloat() {
  const { whatsapp, whatsappHref, onWhatsAppClick } = useEnquiryContact();

  if (!whatsapp.trim()) return null;

  return (
    <a
      className="lp-whatsapp-float"
      href={whatsappHref('Hello, I would like to enquire about a pair of shoes.')}
      onClick={() => onWhatsAppClick('float')}
      target="_blank"
      rel="noreferrer"
      aria-label="Chat with us on WhatsApp"
    >
      {/* Inline so the button does not depend on an icon font or a request
          that could fail after the page has settled. */}
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          fill="currentColor"
          d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.48-1.75-1.65-2.05-.17-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35z"
        />
        <path
          fill="currentColor"
          d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 18.13h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.17 8.17 0 0 1-1.25-4.36c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.69 8.23-8.23 8.23z"
        />
      </svg>
    </a>
  );
}
