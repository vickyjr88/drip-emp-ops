"use client";

/**
 * Floating WhatsApp button, bottom-right on every page.
 *
 * Reads the number from the same CMS field the enquiry buttons on product
 * pages use, so there is still one place to change it. Renders nothing when
 * that field is cleared, which is how the button is turned off.
 */

import { useEnquiryContact } from '../lib/use-enquiry-contact';
import { WhatsAppIcon } from './contact-icons';

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
      <WhatsAppIcon />
    </a>
  );
}
