/**
 * TikTok Pixel event helpers.
 *
 * The base pixel script (loaded once, in StorefrontAnalytics) defines
 * `window.ttq`; everything here is just a typed, safe way to call it from a
 * page. Every call is a no-op when the pixel isn't loaded -- no
 * NEXT_PUBLIC_TIKTOK_PIXEL_ID configured, script still loading, an ad
 * blocker stripped it -- so a shopper's page never breaks because TikTok
 * didn't get told about it. Mirrors meta-pixel.ts's shape so both fire from
 * the same call sites without one being an afterthought.
 *
 * TikTok's standard events use its own names (ContentView, AddToCart,
 * CompletePayment) rather than Meta/X's (ViewContent, AddToCart, Purchase),
 * per TikTok Events API's documented standard event set.
 */

declare global {
  interface Window {
    ttq?: {
      (...args: unknown[]): void;
      track?: (...args: unknown[]) => void;
      page?: (...args: unknown[]) => void;
    };
  }
}

function fire(event: string, params?: Record<string, unknown>) {
  if (typeof window === 'undefined' || typeof window.ttq?.track !== 'function') return;
  window.ttq.track(event, params);
}

/** A shopper lands on a product page. */
export function trackViewContent(params: {
  contentId: string;
  contentName: string;
  value: number;
  currency?: string;
}) {
  fire('ViewContent', {
    contents: [{ content_id: params.contentId, content_name: params.contentName }],
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
    contents: [{ content_id: params.contentId, content_name: params.contentName, quantity: params.quantity ?? 1 }],
    content_type: 'product',
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
  fire('CompletePayment', {
    contents: params.contentIds.map((id) => ({ content_id: id })),
    content_type: 'product',
    value: params.value,
    currency: params.currency || 'KES',
    order_id: params.orderNumber,
  });
}
