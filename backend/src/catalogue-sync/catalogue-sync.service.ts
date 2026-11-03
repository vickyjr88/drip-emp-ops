import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createHmac } from 'crypto';

/**
 * Tells the shops-platform storefronts that follow this catalogue (Nairobi Gents) that something in it changed, so a
 * new product appears there within seconds instead of whenever someone next copies products across.
 *
 * The call carries no product data. It only means "look again": the platform reads this site's public catalogue
 * itself and adds whatever it lacks. What authenticates the call is an HMAC signature made with a secret both servers
 * hold (CATALOGUE_SYNC_SECRET here, DRIP_SYNC_SECRET there).
 *
 * Fire-and-forget, like the other third-party calls (X, TikTok): saving a product must never wait on, or fail because
 * of, another server. A burst of edits (a product created, then eight sizes added) becomes one call a few seconds
 * after the last of them, by which point the product is complete. A call that is lost is made up for by the next
 * change, and by the platform's own catch-up command.
 *
 * Off until both CATALOGUE_SYNC_URL and CATALOGUE_SYNC_SECRET are set.
 */
@Injectable()
export class CatalogueSyncService implements OnModuleDestroy {
  private readonly logger = new Logger(CatalogueSyncService.name);
  private timer: NodeJS.Timeout | null = null;
  private firstPendingAt = 0;

  /** Quiet period after the last change before notifying. */
  private static readonly DEBOUNCE_MS = 4_000;
  /** A steady stream of edits still notifies at least this often. */
  private static readonly MAX_WAIT_MS = 20_000;
  private static readonly RETRY_DELAYS_MS = [2_000, 10_000];

  private get url() {
    return process.env.CATALOGUE_SYNC_URL || '';
  }

  private get secret() {
    return process.env.CATALOGUE_SYNC_SECRET || '';
  }

  get configured() {
    return Boolean(this.url && this.secret);
  }

  /** Call after anything that can add a product or a size to the public catalogue. Never throws, never blocks. */
  notify() {
    if (!this.configured) return;
    const now = Date.now();
    if (!this.firstPendingAt) this.firstPendingAt = now;
    if (this.timer) clearTimeout(this.timer);
    const wait = Math.min(CatalogueSyncService.DEBOUNCE_MS, Math.max(0, this.firstPendingAt + CatalogueSyncService.MAX_WAIT_MS - now));
    this.timer = setTimeout(() => void this.flush(), wait);
  }

  /** A pending notification is sent now rather than lost when the process is replaced by a deploy. */
  async onModuleDestroy() {
    if (this.timer) {
      clearTimeout(this.timer);
      await this.flush();
    }
  }

  private async flush() {
    this.timer = null;
    this.firstPendingAt = 0;

    const body = JSON.stringify({ event: 'catalogue.changed', at: new Date().toISOString() });
    for (let attempt = 0; ; attempt++) {
      try {
        const timestamp = Math.floor(Date.now() / 1000);
        const digest = createHmac('sha256', this.secret).update(`${timestamp}.${body}`).digest('hex');
        const response = await fetch(this.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Drip-Signature': `t=${timestamp},v1=${digest}` },
          body,
          signal: AbortSignal.timeout(10_000),
        });
        if (response.ok) return;
        // A 4xx will not get better by asking again (wrong secret, route off); say so once and stop.
        if (response.status < 500) return void this.logger.warn(`Catalogue sync notice refused: HTTP ${response.status}`);
        throw new Error(`HTTP ${response.status}`);
      } catch (error) {
        const delay = CatalogueSyncService.RETRY_DELAYS_MS[attempt];
        if (delay === undefined) return void this.logger.warn(`Catalogue sync notice failed: ${(error as Error).message}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
}
