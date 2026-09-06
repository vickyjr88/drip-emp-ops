import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';

/**
 * X (Twitter) server-side Conversion API.
 *
 * Complements the browser pixel (web/app/lib/x-pixel.ts): that fires from
 * the shopper's own browser via window.twq, which an ad blocker or a
 * privacy-focused browser can silently drop. This calls X's API directly
 * from the backend once a real server-side event has actually happened, so
 * a purchase is reported even when the client-side pixel never fired.
 *
 * Fire-and-forget throughout, matching OwnerNotificationService's own
 * pattern for third-party calls that must never block or fail the request
 * that triggered them -- a shopper's payment completing must not depend on
 * X's API being reachable.
 */
@Injectable()
export class XConversionService {
  private readonly logger = new Logger(XConversionService.name);
  private readonly pixelId = process.env.X_PIXEL_ID || '';
  private readonly base = 'https://ads-api.x.com/12/measurement/conversions';

  private get token() {
    return process.env.X_PIXEL_TOKEN || '';
  }

  get configured() {
    return Boolean(this.pixelId && this.token);
  }

  /** Lowercased/trimmed before hashing -- X's own docs require this, since
   *  "Name@Example.com" and "name@example.com" must hash identically for
   *  matching to work. */
  private hash(value: string) {
    return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
  }

  /** E.164 without the leading "+" -- the digits-only form X's docs show
   *  for hashed_phone_number, hashed the same way as email above. */
  private hashPhone(value: string) {
    return this.hash(value.replace(/^\+/, ''));
  }

  private async send(params: {
    eventId: string;
    conversionId: string;
    eventSourceUrl?: string;
    email?: string | null;
    phone?: string | null;
  }) {
    if (!this.configured) return;

    const identifier: Record<string, string> = {};
    if (params.email) identifier.hashed_email = this.hash(params.email);
    if (params.phone) identifier.hashed_phone_number = this.hashPhone(params.phone);
    // Neither identifier present means nothing to match this event against
    // (no twclid captured server-side, no ip/user-agent available outside a
    // request context) -- sending it anyway would just be a wasted call.
    if (Object.keys(identifier).length === 0) return;

    try {
      const response = await fetch(`${this.base}/${this.pixelId}`, {
        method: 'POST',
        headers: {
          'X-Pixel-Token': this.token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversions: [
            {
              conversion_time: new Date().toISOString(),
              event_id: params.eventId,
              conversion_id: params.conversionId,
              ...(params.eventSourceUrl ? { event_source_url: params.eventSourceUrl } : {}),
              identifiers: [identifier],
            },
          ],
        }),
      });
      if (!response.ok) {
        this.logger.warn(`X conversion API returned ${response.status} for ${params.conversionId}: ${await response.text().catch(() => '')}`);
      }
    } catch (error) {
      this.logger.warn(`X conversion API request failed for ${params.conversionId}: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * An order is confirmed paid. conversionId is the order number -- stable
   * and unique, so a webhook replay or a duplicate settle() call reports the
   * same conversion_id rather than double-counting the sale in X's reporting
   * (X's own deduplication is keyed on this field, same purpose as the
   * dedupe guard the browser pixel already has in complete-client.tsx).
   */
  async trackPurchase(params: { orderNumber: string; email?: string | null; phone?: string | null }) {
    void this.send({
      eventId: `tw-${this.pixelId}-purchase`,
      conversionId: params.orderNumber,
      email: params.email,
      phone: params.phone,
    });
  }

  /**
   * A cart is left with contact details filled in -- the closest server-side
   * signal to an AddToCart/purchase-intent event this app actually has.
   * There is no dedicated backend endpoint for the moment an item is added
   * to a cart (the cart itself is client-side state until checkout starts),
   * and adding one solely to fire this would mean new write traffic for a
   * lower-value event; the periodic abandoned-cart sync already carries the
   * same customer identifiers and already happens once contact details are
   * known, so it is reused here rather than duplicated.
   */
  async trackCartEngagement(params: { cartLeadId: string; email?: string | null; phone?: string | null }) {
    void this.send({
      eventId: `tw-${this.pixelId}-cart_engagement`,
      conversionId: params.cartLeadId,
      email: params.email,
      phone: params.phone,
    });
  }
}
