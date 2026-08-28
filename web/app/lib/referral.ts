import { CustomerProfile } from './customer-auth';

/**
 * A product URL with the viewer's own referral code appended, when they have
 * one -- silently omitted for a guest, a retail customer, or a reseller
 * whose code hasn't loaded yet. This is the only place a referral code is
 * ever attached to a shared link; ShareButton itself stays unaware of
 * referrals entirely.
 */
export function withReferral(url: string, customer: CustomerProfile | null): string {
  if (!customer?.referralCode) return url;
  return `${url}${url.includes('?') ? '&' : '?'}ref=${encodeURIComponent(customer.referralCode)}`;
}
