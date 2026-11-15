/**
 * A customer with no email is stored under a stand-in address built from their phone number (`254722123456@customer.invalid`); `.invalid`
 * can never receive mail. Anything that shows an address to a person must go through this first, so a stand-in is never mistaken for one.
 * The same rule as the backend's common/contact-email.ts.
 */
export function realEmail(email?: string | null): string | null {
  const e = (email ?? '').trim().toLowerCase();
  return e.includes('@') && !e.endsWith('.invalid') ? e : null;
}
