/**
 * Where the customer's browser is, as opposed to where the API is.
 *
 * Anything the customer follows from an email or a payment redirect has to
 * point at the storefront, not at this service. Deriving it from the incoming
 * request looks convenient and is wrong: a request to the API arrives with the
 * API's own host, so a Paystack callback built that way sent people to
 * :3101/checkout/complete, which is a page that only exists on the storefront.
 *
 * The Origin header is trusted only as a last resort and never for links sent
 * by email -- an attacker controls it, and a reset link pointing at their host
 * would hand over the token.
 */
export function storefrontOrigin(fallbackOriginHeader?: string): string {
  const configured = process.env.STOREFRONT_ORIGIN || process.env.NEXT_PUBLIC_SITE_URL;
  if (configured?.trim()) return configured.trim().replace(/\/+$/, '');

  // Development convenience only. In production STOREFRONT_ORIGIN is set and
  // this is never reached.
  if (fallbackOriginHeader?.trim()) return fallbackOriginHeader.trim().replace(/\/+$/, '');

  return 'http://localhost:3003';
}
