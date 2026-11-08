import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MauticService } from '../mautic/mautic.service';
import { mauticMobile, mauticPlan } from './whatsapp-subscription';

const TICK_MS = 10 * 60_000;
/** A contact that could not be synced is not retried for this long, so one bad row cannot starve the rest. */
const RETRY_MS = 15 * 60_000;
const BATCH = 25;

export const mauticWhatsappSyncEnabled = () => (process.env.MAUTIC_WHATSAPP_SYNC || 'true') !== 'false';

/**
 * Keeps Mautic's copy of the people who messaged the shop on WhatsApp up to date: the number, the name WhatsApp gave, and tags
 * for subscribed / unsubscribed / came from an ad. Every ten minutes it finds the contacts that changed since they were last
 * pushed (a new one, a STOP, a START, an unsubscribe from the portal) and pushes them. A row is up to date when
 * mauticSyncedAt equals updatedAt, so nothing needs a hook in the places that change a contact, and an outage of Mautic only
 * delays the push. Both backend slots run it; a contact is claimed in the database before it is sent.
 *
 * It never enrols anyone in a Mautic campaign (the app sends the onboarding messages itself).
 */
@Injectable()
export class WhatsappMauticSyncService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(WhatsappMauticSyncService.name);
  private timer?: NodeJS.Timeout;
  private first?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService, private readonly mautic: MauticService) {}

  onApplicationBootstrap() {
    if (!mauticWhatsappSyncEnabled() || !this.mautic.configured) return;
    this.first = setTimeout(() => void this.safeTick(), 150_000);
    this.timer = setInterval(() => void this.safeTick(), TICK_MS);
  }

  onApplicationShutdown() {
    if (this.first) clearTimeout(this.first);
    if (this.timer) clearInterval(this.timer);
  }

  private async safeTick() {
    try {
      await this.tick();
    } catch (error) {
      this.logger.error(`WhatsApp to Mautic sync failed: ${(error as Error).message}`);
    }
  }

  /** A customer with this number (Mautic already knows them by email), matched on the last nine digits like the rest of the app. */
  private async customerEmail(phone: string): Promise<string | null> {
    const customer = await this.prisma.customer.findFirst({ where: { phone: { contains: phone.slice(-9) }, email: { not: '' } }, orderBy: { createdAt: 'asc' }, select: { email: true } });
    return customer?.email ?? null;
  }

  async tick(now: Date = new Date()): Promise<{ synced: number; failed: number; unchanged: number; skipped: number }> {
    const result = { synced: 0, failed: 0, unchanged: 0, skipped: 0 };
    if (!mauticWhatsappSyncEnabled() || !this.mautic.configured) return result;

    const retryBefore = new Date(now.getTime() - RETRY_MS);
    const candidates = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "WhatsappContact"
      WHERE ("mauticSyncedAt" IS NULL OR "updatedAt" > "mauticSyncedAt")
        AND ("mauticTriedAt" IS NULL OR "mauticTriedAt" < ${retryBefore})
      ORDER BY "updatedAt" ASC
      LIMIT ${BATCH}`;

    for (const { id } of candidates) {
      // Take it before working on it, so the other slot does not make a second Mautic contact.
      const claimed = await this.prisma.whatsappContact.updateMany({
        where: { id, OR: [{ mauticTriedAt: null }, { mauticTriedAt: { lt: retryBefore } }] },
        data: { mauticTriedAt: now },
      });
      if (claimed.count !== 1) continue;
      const contact = await this.prisma.whatsappContact.findUnique({ where: { id } });
      if (!contact) continue;

      // Mautic is up to date only for the state this read saw; if the row changed meanwhile the next tick pushes it again.
      const finish = (data: { mauticContactId?: number | null; mauticTags: string | null; mauticError: string | null }) => {
        const at = new Date();
        return this.prisma.whatsappContact.updateMany({ where: { id, updatedAt: contact.updatedAt }, data: { ...data, mauticSyncedAt: at, updatedAt: at } });
      };

      const plan = mauticPlan(contact);
      if (!plan) {
        await finish({ mauticTags: 'not-synced', mauticError: null });
        result.skipped += 1;
        continue;
      }
      if (contact.mauticContactId && contact.mauticTags === plan.signature) {
        await finish({ mauticTags: plan.signature, mauticError: null });
        result.unchanged += 1;
        continue;
      }

      const pushed = await this.mautic.syncWhatsappContact({
        contactId: contact.mauticContactId,
        email: await this.customerEmail(contact.phone),
        mobile: mauticMobile(contact.phone),
        name: contact.name,
        addTags: plan.add,
        removeTags: plan.remove,
      });
      if (pushed.ok) {
        await finish({ mauticContactId: pushed.id, mauticTags: plan.signature, mauticError: null });
        result.synced += 1;
      } else {
        // Left dirty (its updatedAt is newer than its mauticSyncedAt), so it is retried after RETRY_MS.
        await this.prisma.whatsappContact.update({ where: { id }, data: { mauticError: pushed.error.slice(0, 300) } });
        result.failed += 1;
        this.logger.warn(`Could not sync ${contact.phone} to Mautic: ${pushed.error}`);
      }
    }
    if (result.synced || result.failed) this.logger.log(`WhatsApp contacts to Mautic: ${result.synced} synced, ${result.failed} failed, ${result.unchanged} unchanged, ${result.skipped} not synced.`);
    return result;
  }
}
