import { normalizePhoneNumber } from './phone.util';

/**
 * A person with no email address.
 *
 * Customers are keyed by an email that must be unique, so someone who gives only a phone number (a walk-in rung up at the counter, a
 * shopper who skips the optional email at checkout) is stored under a stand-in address built from the number: `254722123456@customer.invalid`.
 * The `.invalid` ending is reserved (RFC 2606): it can never receive mail and never resolves, so a stand-in cannot be mistaken for a real
 * address by anything that sends, and it is unique per number, which makes "one customer per phone number" fall out of the key itself.
 * A trade account opened with no address uses the same idea (`<code>@trade.invalid`).
 *
 * Anything that sends mail, syncs a contact or reports an address must go through `realEmail` first: it is the one place that says
 * whether an address is a person's.
 */
export const PLACEHOLDER_EMAIL_DOMAIN = 'customer.invalid';

const clean = (email?: string | null) => (email ?? '').trim().toLowerCase();

/** The person's own address, or null when there is none (nothing typed, or one of the stand-ins above). */
export function realEmail(email?: string | null): string | null {
  const e = clean(email);
  return e.includes('@') && !e.endsWith('.invalid') ? e : null;
}

export const isPlaceholderEmail = (email?: string | null) => realEmail(email) === null;

/** The stand-in address for a phone number, in the same shape however the number was typed (0722..., +254722... and 254722... are one). */
export function placeholderEmailFor(phone: string): string {
  const digits = (normalizePhoneNumber(phone) ?? phone).replace(/\D/g, '');
  return `${digits}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

/** The last nine digits of a number: what stays the same between 0722123456, +254722123456 and 254 722 123 456. */
export function phoneTail(phone: string): string {
  return phone.replace(/\D/g, '').slice(-9);
}

/**
 * The address handed to the payment provider, which insists on one. A real address is used as it is. Without one, a deliverable-looking
 * address on a subdomain that has no mailbox is made from the phone number, so the provider's receipt goes nowhere and the same number
 * is the same payer every time. `host` is the storefront's own host; anything that is not a real domain falls back to the live one.
 */
export function payerEmail(params: { email?: string | null; phone: string; host?: string | null }): string {
  const real = realEmail(params.email);
  if (real) return real;
  let host = (params.host ?? '').trim().toLowerCase().replace(/^www\./, '');
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) || /^\d+(\.\d+)+$/.test(host)) host = 'dripemporium.store';
  const digits = (normalizePhoneNumber(params.phone) ?? params.phone).replace(/\D/g, '');
  return `${digits}@phone.${host}`;
}
