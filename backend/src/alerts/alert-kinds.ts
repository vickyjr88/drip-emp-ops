/**
 * Every kind of alert the shop sends its own people. A kind is on for email and for WhatsApp until someone switches it off on the
 * Notifications page, so a new kind added here reaches everyone at once and can be silenced without a deploy.
 */
export type AlertKind =
  | 'order.paid'
  | 'order.placed'
  | 'cart.abandoned'
  | 'lead.whatsapp'
  | 'whatsapp.message'
  | 'inquiry.contact'
  | 'customer.signup'
  | 'reseller.application'
  | 'review.submitted'
  | 'facebook.comment'
  | 'stock.low';

export type AlertKindInfo = {
  kind: AlertKind;
  group: 'Sales' | 'People' | 'Stock';
  label: string;
  /** What triggers it, in the owner's words. */
  when: string;
  /** Whether it is worth a reply: shown so the page can say which alerts are the "act now" ones. */
  actNow: boolean;
};

export const ALERT_KINDS: AlertKindInfo[] = [
  { kind: 'order.paid', group: 'Sales', label: 'An order is paid', when: 'Money for an order arrives (online, or recorded by staff).', actNow: false },
  { kind: 'order.placed', group: 'Sales', label: 'A new order on the website', when: 'A shopper checks out on the website, before they pay.', actNow: true },
  { kind: 'cart.abandoned', group: 'Sales', label: 'A cart is left behind', when: 'A shopper leaves items in the cart after giving a phone or email.', actNow: true },
  { kind: 'lead.whatsapp', group: 'Sales', label: 'A shopper chooses WhatsApp to order', when: 'Someone sends their cart to you on WhatsApp.', actNow: true },
  { kind: 'whatsapp.message', group: 'People', label: 'A customer messages you on WhatsApp', when: 'Someone writes to the shop number (one alert per person per 10 minutes).', actNow: true },
  { kind: 'inquiry.contact', group: 'People', label: 'A contact form question', when: 'Someone sends the contact form on the website.', actNow: true },
  { kind: 'facebook.comment', group: 'People', label: 'A comment on your Facebook posts or ads', when: 'Someone comments on the Page (they also get the automatic private reply).', actNow: true },
  { kind: 'customer.signup', group: 'People', label: 'A new customer account', when: 'Someone creates an account or checks out as a new customer.', actNow: false },
  { kind: 'reseller.application', group: 'People', label: 'A reseller application', when: 'A customer applies to become a reseller.', actNow: true },
  { kind: 'review.submitted', group: 'People', label: 'A product review', when: 'A customer leaves a review.', actNow: false },
  { kind: 'stock.low', group: 'Stock', label: 'A size runs low', when: 'A sale takes a size to or below its reorder level (once a day per size).', actNow: false },
];

export const ALERT_KIND_KEYS = ALERT_KINDS.map((k) => k.kind) as AlertKind[];
