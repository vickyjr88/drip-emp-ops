import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../daily-report/whatsapp.service';
import { WhatsAppOutreachService } from './whatsapp-outreach.service';
import { autoSubscribeEnabled } from './whatsapp-contacts.service';
import { SEQUENCE, inSendWindow, sequenceDelaysHours, startOfNairobiDay } from './whatsapp-subscription';

const TICK_MS = 10 * 60_000;
const HOUR_MS = 3_600_000;
/** A message claimed but not finished (a crash) is tried again after this long. */
const LEASE_MS = 30 * 60_000;
const MAX_FAILURES = 5;
const BATCH = 25;

/**
 * Sends the onboarding messages (app, group, rating) to people who messaged the shop and have not replied STOP, each at its
 * due time. It checks every ten minutes, so a restart or a deploy loses nothing. Both backend slots run it; that is safe
 * because a message is claimed in the database before it is sent, so only one slot sends it.
 *
 * Guards: only between 08:00 and 20:00 Nairobi, never more than WHATSAPP_DAILY_SEND_CAP template messages a day (Meta limits
 * a business that is not yet verified to 250 conversations a day), only to someone who was told they would receive updates,
 * and never to anyone who replied STOP. WHATSAPP_AUTO_SUBSCRIBE=false turns it off.
 */
@Injectable()
export class WhatsappSequenceService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(WhatsappSequenceService.name);
  private timer?: NodeJS.Timeout;
  private first?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService,
    private readonly outreach: WhatsAppOutreachService,
  ) {}

  onApplicationBootstrap() {
    if (!autoSubscribeEnabled()) return;
    this.first = setTimeout(() => void this.safeTick(), 120_000);
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
      this.logger.error(`WhatsApp sequence check failed: ${(error as Error).message}`);
    }
  }

  async tick(now: Date = new Date()): Promise<{ sent: number; failed: number; skipped: number }> {
    const result = { sent: 0, failed: 0, skipped: 0 };
    if (!autoSubscribeEnabled() || !this.whatsapp.isConfigured || !inSendWindow(now)) return result;

    const cap = Number(process.env.WHATSAPP_DAILY_SEND_CAP || 200);
    let sentToday = await this.prisma.whatsappOutreach.count({ where: { status: 'SENT', createdAt: { gte: startOfNairobiDay(now) } } });
    const delays = sequenceDelaysHours();

    const due = await this.prisma.whatsappContact.findMany({
      where: { subscribed: true, noticeSentAt: { not: null }, nextStep: { lt: SEQUENCE.length }, nextStepAt: { lte: now }, failures: { lt: MAX_FAILURES } },
      orderBy: { nextStepAt: 'asc' },
      take: BATCH,
    });

    for (const contact of due) {
      if (sentToday >= cap) {
        this.logger.warn(`WhatsApp daily cap of ${cap} reached; the rest wait until tomorrow.`);
        break;
      }
      // Take the message before sending it: only one slot gets count 1.
      const claimed = await this.prisma.whatsappContact.updateMany({
        where: { id: contact.id, nextStep: contact.nextStep, nextStepAt: contact.nextStepAt },
        data: { nextStepAt: new Date(now.getTime() + LEASE_MS) },
      });
      if (claimed.count !== 1) continue;

      const kind = SEQUENCE[contact.nextStep];
      const outcome = await this.outreach.sendToPhone({ kind, phone: contact.phone, name: contact.name?.split(/\s+/)[0], contactId: contact.id, triggeredBy: 'whatsapp-subscription' });

      if (outcome.outcome === 'SENT' || outcome.detail === 'Already sent') {
        const next = contact.nextStep + 1;
        await this.prisma.whatsappContact.update({
          where: { id: contact.id },
          data: { nextStep: next, failures: 0, nextStepAt: next < SEQUENCE.length ? new Date(now.getTime() + delays[next] * HOUR_MS) : null },
        });
        if (outcome.outcome === 'SENT') { result.sent += 1; sentToday += 1; } else result.skipped += 1;
      } else if (outcome.outcome === 'FAILED') {
        const failures = contact.failures + 1;
        // Left to retry after the lease; given up on after MAX_FAILURES so one bad number is not retried for ever.
        await this.prisma.whatsappContact.update({ where: { id: contact.id }, data: { failures, ...(failures >= MAX_FAILURES ? { nextStepAt: null } : {}) } });
        result.failed += 1;
        this.logger.warn(`Onboarding message ${kind} to ${contact.phone} failed (${failures}/${MAX_FAILURES}): ${outcome.detail}`);
      } else {
        // Skipped for good: they replied STOP, or the number is unusable.
        await this.prisma.whatsappContact.update({ where: { id: contact.id }, data: { nextStepAt: null } });
        result.skipped += 1;
      }
    }
    if (result.sent || result.failed) this.logger.log(`WhatsApp onboarding: ${result.sent} sent, ${result.failed} failed, ${result.skipped} skipped.`);
    return result;
  }
}
