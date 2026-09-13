import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';

/**
 * TikTok server-side Events API.
 *
 * Complements the browser pixel (web/app/lib/tiktok-pixel.ts): that fires
 * from the shopper's own browser via window.ttq, which an ad blocker or a
 * privacy-focused browser can silently drop. This calls TikTok's Events API
 * directly from the backend once a real server-side event has actually
 * happened, so a purchase is reported even when the client-side pixel never
 * fired. Mirrors x-conversion.service.ts's shape -- same fire-and-forget
 * pattern, same call sites, same hashing rules for customer identifiers.
 *
 * Fire-and-forget throughout, matching OwnerNotificationService's own
 * pattern for third-party calls that must never block or fail the request
 * that triggered them -- a shopper's payment completing must not depend on
 * TikTok's API being reachable.
 */
@Injectable()
export class TikTokConversionService {
  private readonly logger = new Logger(TikTokConversionService.name);
  private readonly pixelCode = process.env.TIKTOK_PIXEL_ID || process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID || '';
  private readonly base = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';

  private get token() {
    return process.env.TIKTOK_ACCESS_TOKEN || '';
  }

  get configured() {
    return Boolean(this.pixelCode && this.token);
  }

  /** Lowercased/trimmed before hashing -- TikTok's own docs require this,
   *  since "Name@Example.com" and "name@example.com" must hash identically
   *  for matching to work. */
  private hash(value: string) {
    return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
  }

  /** E.164 digits, hashed the same way as email above -- the form TikTok's
   *  docs show for the phone identifier. */
  private hashPhone(value: string) {
    return this.hash(value.replace(/^\+/, ''));
  }

  private async send(params: {
    event: string;
    eventId: string;
    eventTime?: Date;
    eventSourceUrl?: string;
    email?: string | null;
    phone?: string | null;
    value?: number;
    currency?: string;
    contentIds?: string[];
    contentName?: string;
    contentType?: string;
  }) {
    if (!this.configured) return;

    const user: Record<string, string> = {};
    if (params.email) user.email = this.hash(params.email);
    if (params.phone) user.phone = this.hashPhone(params.phone);
    // Neither identifier present means nothing to match this event against
    // (no ttclid captured server-side, no ip/user-agent available outside a
    // request context) -- sending it anyway would just be a wasted call.
    if (Object.keys(user).length === 0) return;

    try {
      const response = await fetch(this.base, {
        method: 'POST',
        headers: {
          'Access-Token': this.token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event_source: 'web',
          event_source_id: this.pixelCode,
          data: [
            {
              event: params.event,
              event_time: Math.floor((params.eventTime ?? new Date()).getTime() / 1000),
              event_id: params.eventId,
              user,
              ...(params.eventSourceUrl ? { page: { url: params.eventSourceUrl } } : {}),
              properties: {
                ...(params.value !== undefined ? { value: params.value } : {}),
                ...(params.currency ? { currency: params.currency } : {}),
                ...(params.contentIds ? { contents: params.contentIds.map((id) => ({ content_id: id })) } : {}),
                ...(params.contentName ? { content_name: params.contentName } : {}),
                content_type: params.contentType ?? 'product',
              },
            },
          ],
        }),
      });
      if (!response.ok) {
        this.logger.warn(`TikTok Events API returned ${response.status} for ${params.eventId}: ${await response.text().catch(() => '')}`);
      }
    } catch (error) {
      this.logger.warn(`TikTok Events API request failed for ${params.eventId}: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * An order is confirmed paid. eventId is the order number -- stable and
   * unique, so a webhook replay or a duplicate settle() call reports the
   * same event_id rather than double-counting the sale in TikTok's
   * reporting (TikTok's own deduplication is keyed on this field, matching
   * the browser pixel's own dedupe guard in complete-client.tsx and
   * XConversionService's identical use of the order number).
   */
  async trackPurchase(params: {
    orderNumber: string;
    email?: string | null;
    phone?: string | null;
    value?: number;
    currency?: string;
    contentIds?: string[];
  }) {
    void this.send({
      event: 'CompletePayment',
      eventId: `order-${params.orderNumber}`,
      email: params.email,
      phone: params.phone,
      value: params.value,
      currency: params.currency ?? 'KES',
      contentIds: params.contentIds,
    });
  }

  /**
   * A cart is left with contact details filled in -- the closest server-side
   * signal to an AddToCart/purchase-intent event this app actually has,
   * same reasoning as XConversionService.trackCartEngagement.
   */
  async trackCartEngagement(params: { cartLeadId: string; email?: string | null; phone?: string | null; value?: number }) {
    void this.send({
      event: 'AddToCart',
      eventId: `cart-${params.cartLeadId}`,
      email: params.email,
      phone: params.phone,
      value: params.value,
      currency: 'KES',
    });
  }
}
