/**
 * Lets a page tell an ad pixel about something before the pixel's script has run.
 *
 * The pixels' base scripts are added by StorefrontAnalytics after the page has hydrated, so a page that reports an event as soon as it appears (a product
 * page's ViewContent) used to find no pixel yet and the event was silently skipped. Every shopper who arrives straight on a product page from an ad or a
 * shared link is in that position, which is most of the shop's visits. Now an event that finds no pixel waits for it, in order, for a few seconds. If the
 * pixel never comes (it is not configured, or an ad blocker removed it) the event is dropped quietly: a shopper's page must never break because an ad
 * platform could not be told about it.
 *
 * The queue itself is plain and has no browser dependencies, so it can be tested on its own (backend/test/pixel-ready.test.ts).
 */

export type PendingPixelEvent = {
  /** True once the pixel's global exists and can take the event. */
  isReady: () => boolean;
  /** Reports the event to the pixel. */
  send: () => void;
  /** When to give up, in the same clock as `flush`. */
  deadline: number;
};

export class PixelQueue {
  private items: PendingPixelEvent[] = [];

  get size() {
    return this.items.length;
  }

  push(item: PendingPixelEvent) {
    this.items.push(item);
  }

  /**
   * Sends what can be sent now, in the order it was asked for, and forgets what has waited past its deadline.
   * Returns whether anything is still waiting. A send that throws is dropped: the pixel is the one thing that must not be able to break the page.
   */
  flush(now: number): boolean {
    this.items = this.items.filter((item) => {
      if (item.isReady()) {
        try { item.send(); } catch { /* a pixel failing must not reach the shopper */ }
        return false;
      }
      return now < item.deadline;
    });
    return this.items.length > 0;
  }
}

/** How long an event waits for its pixel, and how often it looks. Long enough for a slow phone's scripts, short enough that nothing lingers. */
export const PIXEL_WAIT_MS = 10_000;
export const PIXEL_POLL_MS = 50;

const queue = new PixelQueue();
let timer: ReturnType<typeof setInterval> | undefined;

/**
 * Reports an event to a pixel now if it exists, otherwise as soon as it does. `configured` is whether the shop has set this pixel up at all (its
 * NEXT_PUBLIC_*_PIXEL_ID): with none, nothing will ever define it, so there is nothing to wait for.
 */
export function whenPixelReady(pixel: { configured: boolean; isReady: () => boolean; send: () => void }) {
  if (typeof window === 'undefined') return;
  // Anything already waiting goes first, so events reach the pixel in the order the page reported them.
  if (queue.size > 0) queue.flush(Date.now());
  if (pixel.isReady()) {
    try { pixel.send(); } catch { /* see PixelQueue.flush */ }
    return;
  }
  if (!pixel.configured) return;
  queue.push({ isReady: pixel.isReady, send: pixel.send, deadline: Date.now() + PIXEL_WAIT_MS });
  if (timer === undefined) {
    timer = setInterval(() => {
      if (!queue.flush(Date.now()) && timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    }, PIXEL_POLL_MS);
  }
}
