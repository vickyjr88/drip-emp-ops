/**
 * Meta Pixel event helpers.
 *
 * The base pixel script (loaded once, in StorefrontAnalytics) defines
 * `window.fbq`; everything here is just a typed, safe way to call it from a
 * page. Every call is a no-op when the pixel isn't loaded -- no
 * NEXT_PUBLIC_META_PIXEL_ID configured, script still loading, an ad blocker
 * stripped it -- so a shopper's page never breaks because Meta didn't get
 * told about it.
 */

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

function fire(event: string, params?: Record<string, unknown>) {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return;
  window.fbq('track', event, params);
}

/** A shopper lands on a product page. */
export function trackViewContent(params: {
  contentId: string;
  contentName: string;
  value: number;
  currency?: string;
}) {
  fire('ViewContent', {
    content_ids: [params.contentId],
    content_type: 'product',
    content_name: params.contentName,
    value: params.value,
    currency: params.currency || 'KES',
  });
}

/** A shopper adds a size to their cart. */
export function trackAddToCart(params: {
  contentId: string;
  contentName: string;
  value: number;
  quantity?: number;
  currency?: string;
}) {
  fire('AddToCart', {
    content_ids: [params.contentId],
    content_type: 'product',
    content_name: params.contentName,
    value: params.value,
    contents: [{ id: params.contentId, quantity: params.quantity ?? 1 }],
    currency: params.currency || 'KES',
  });
}

/** An order is confirmed paid. Fire once per order -- see the guard in
 *  complete-client.tsx, since this page can be revisited/refreshed after
 *  the purchase already completed. */
export function trackPurchase(params: {
  contentIds: string[];
  value: number;
  currency?: string;
  orderNumber: string;
}) {
  fire('Purchase', {
    content_ids: params.contentIds,
    content_type: 'product',
    value: params.value,
    currency: params.currency || 'KES',
    order_id: params.orderNumber,
  });
}
