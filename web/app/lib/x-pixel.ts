/**
 * X (Twitter) Pixel event helpers.
 *
 * The base pixel script (loaded once, in StorefrontAnalytics) defines
 * `window.twq`; everything here is just a typed, safe way to call it from a
 * page. Every call is a no-op when the pixel isn't loaded -- no
 * NEXT_PUBLIC_X_PIXEL_ID configured, script still loading, an ad blocker
 * stripped it -- so a shopper's page never breaks because X didn't get told
 * about it. Mirrors meta-pixel.ts's shape so both fire from the same call
 * sites without one being an afterthought.
 */

declare global {
  interface Window {
    twq?: (...args: unknown[]) => void;
  }
}

/**
 * X's Website Events API tracks standard events by name directly
 * (ViewContent/AddToCart/Purchase), the same way Meta's does -- unlike a
 * conversion-specific "tw-<pixel_id>-<event_id>" id, which only applies to a
 * *custom* event created in Ads Manager. Only the base pixel snippet and
 * Pixel ID were provided, no custom event ids, so standard events are the
 * correct and only thing to fire here; a custom event id can be added later
 * per event if X Ads Manager is set up with them.
 */
function fire(event: string, params?: Record<string, unknown>) {
  if (typeof window === 'undefined' || typeof window.twq !== 'function') return;
  window.twq('event', event, params);
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
    content_name: params.contentName,
    content_type: 'product',
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
    content_name: params.contentName,
    content_type: 'product',
    num_items: params.quantity ?? 1,
    value: params.value,
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
