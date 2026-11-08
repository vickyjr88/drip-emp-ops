import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../daily-report/whatsapp.service';
import { paginate } from '../common/pagination.util';
import {
  InboundMessage, DeliveryStatus, NOTICE_TEXT, RESUBSCRIBED_TEXT, STOPPED_TEXT, SEQUENCE,
  classifyKeyword, pickDelivery, sequenceDelaysHours,
} from './whatsapp-subscription';

const HOUR_MS = 3_600_000;

/** Switch for the whole automatic subscription. Off, nobody new is subscribed or messaged; STOP and START still work. */
export const autoSubscribeEnabled = () => (process.env.WHATSAPP_AUTO_SUBSCRIBE || 'true') !== 'false';

/**
 * People who message the shop's WhatsApp number (usually from an ad). The first time someone writes, they are told they will
 * receive updates and that STOP opts out, then put through the onboarding messages (WhatsappSequenceService). STOP removes
 * them at once and for good: nothing the shop sends reaches that number again until they reply START.
 *
 * Not subscribed, only recorded: resellers, wholesalers and suppliers, who write to the shop for other reasons.
 */
@Injectable()
export class WhatsappContactsService {
  private readonly logger = new Logger(WhatsappContactsService.name);

  constructor(private readonly prisma: PrismaService, private readonly whatsapp: WhatsAppService) {}

  /** A reseller, a wholesaler or a supplier: someone who writes to the shop for business, not a shopper to market to. */
  private async isTradeNumber(phone: string): Promise<boolean> {
    const last9 = phone.slice(-9);
    const [customer, supplier] = await Promise.all([
      this.prisma.customer.findFirst({ where: { phone: { contains: last9 }, priceTier: { not: 'RETAIL' } }, select: { id: true } }),
      this.prisma.supplier.findFirst({ where: { phone: { contains: last9 } }, select: { id: true } }),
    ]);
    return Boolean(customer || supplier);
  }

  /** Sends the notice once. The claim is atomic, so Meta delivering the same webhook twice (it does) cannot send it twice. */
  private async sendNotice(contactId: string, phone: string) {
    const claimed = await this.prisma.whatsappContact.updateMany({ where: { id: contactId, noticeSentAt: null }, data: { noticeSentAt: new Date() } });
    if (claimed.count !== 1) return;
    const sent = await this.whatsapp.sendText(phone, NOTICE_TEXT);
    if (!sent.delivered) {
      // Not told, so not subscribed in practice: the sequence waits for a notice, and the next message they send retries it.
      await this.prisma.whatsappContact.update({ where: { id: contactId }, data: { noticeSentAt: null } });
      this.logger.warn(`Could not send the subscription notice to ${phone}: ${sent.error}`);
    }
  }

  /** What to do with one message someone sent the shop. */
  async handleMessage(message: InboundMessage) {
    const phone = message.from;
    const keyword = classifyKeyword(message.text);
    const now = new Date();
    const existing = await this.prisma.whatsappContact.findUnique({ where: { phone } });
    const delays = sequenceDelaysHours();

    if (keyword === 'STOP') {
      await this.prisma.whatsappContact.upsert({
        where: { phone },
        create: { phone, name: message.name, subscribed: false, unsubscribedReason: 'STOP', unsubscribedAt: now, nextStepAt: null, lastMessageAt: now },
        update: { subscribed: false, unsubscribedReason: 'STOP', unsubscribedAt: now, nextStepAt: null, lastMessageAt: now },
      });
      await this.whatsapp.sendText(phone, STOPPED_TEXT);
      return 'STOPPED';
    }

    if (keyword === 'START') {
      if (existing?.unsubscribedReason === 'TRADE') return 'IGNORED';
      if (!autoSubscribeEnabled()) return 'IGNORED';
      const step = existing?.nextStep ?? 0;
      await this.prisma.whatsappContact.upsert({
        where: { phone },
        create: { phone, name: message.name, subscribed: true, nextStepAt: new Date(now.getTime() + delays[0] * HOUR_MS), lastMessageAt: now },
        update: { subscribed: true, unsubscribedReason: null, unsubscribedAt: null, failures: 0, lastMessageAt: now, nextStepAt: step < SEQUENCE.length ? new Date(now.getTime() + delays[Math.min(step, delays.length - 1)] * HOUR_MS) : null },
      });
      await this.whatsapp.sendText(phone, RESUBSCRIBED_TEXT);
      return 'RESUBSCRIBED';
    }

    if (!existing) {
      if (!autoSubscribeEnabled()) return 'IGNORED';
      const trade = await this.isTradeNumber(phone);
      const created = await this.prisma.whatsappContact.create({
        data: {
          phone, name: message.name,
          adSourceId: message.referral?.sourceId, adHeadline: message.referral?.headline, adClickId: message.referral?.clickId,
          subscribed: !trade, unsubscribedReason: trade ? 'TRADE' : null, unsubscribedAt: trade ? now : null,
          nextStepAt: trade ? null : new Date(now.getTime() + delays[0] * HOUR_MS),
          firstMessageAt: message.timestamp ?? now, lastMessageAt: now,
        },
      });
      if (!trade) await this.sendNotice(created.id, phone);
      return trade ? 'RECORDED_TRADE' : 'SUBSCRIBED';
    }

    await this.prisma.whatsappContact.update({
      where: { id: existing.id },
      data: {
        lastMessageAt: now,
        ...(existing.name ? {} : { name: message.name }),
        ...(!existing.adSourceId && message.referral ? { adSourceId: message.referral.sourceId, adHeadline: message.referral.headline, adClickId: message.referral.clickId } : {}),
      },
    });
    // A contact whose notice never went out (the send failed) is told on the next message, inside the window it opens.
    if (existing.subscribed && !existing.noticeSentAt && autoSubscribeEnabled()) await this.sendNotice(existing.id, phone);
    return 'SEEN';
  }

  /** Records what Meta says happened to a message we sent, and keeps the freshest state on the row it belongs to. */
  async recordStatus(status: DeliveryStatus) {
    await this.prisma.whatsappMessageStatus
      .upsert({
        where: { messageId_status: { messageId: status.id, status: status.status } },
        create: { messageId: status.id, recipient: status.recipient, status: status.status, errorCode: status.errorCode, errorTitle: status.errorTitle, occurredAt: status.timestamp ?? new Date() },
        update: {},
      })
      .catch((error) => this.logger.warn(`Could not record status ${status.status} for ${status.id}: ${error.message}`));

    for (const model of ['dailyReportRun', 'whatsappOutreach'] as const) {
      const delegate: any = (this.prisma as any)[model];
      const row = await delegate.findFirst({ where: { messageId: status.id }, select: { id: true, delivery: true } });
      if (!row) continue;
      const next = pickDelivery(row.delivery, status.status);
      await delegate.update({
        where: { id: row.id },
        data: { delivery: next, deliveryError: next === 'failed' ? [status.errorCode, status.errorTitle].filter(Boolean).join(': ').slice(0, 500) || null : null },
      });
    }
  }

  async stats() {
    const [subscribed, stopped, trade, waiting, finished] = await Promise.all([
      this.prisma.whatsappContact.count({ where: { subscribed: true } }),
      this.prisma.whatsappContact.count({ where: { unsubscribedReason: 'STOP' } }),
      this.prisma.whatsappContact.count({ where: { unsubscribedReason: 'TRADE' } }),
      this.prisma.whatsappContact.count({ where: { subscribed: true, nextStep: { lt: SEQUENCE.length } } }),
      this.prisma.whatsappContact.count({ where: { subscribed: true, nextStep: { gte: SEQUENCE.length } } }),
    ]);
    return { subscribed, stopped, trade, inSequence: waiting, finished, autoSubscribe: autoSubscribeEnabled() };
  }

  list(query: { skip?: number; take?: number; search?: string }) {
    const where: Prisma.WhatsappContactWhereInput = query.search?.trim()
      ? { OR: [{ phone: { contains: query.search.replace(/\D/g, '') || query.search } }, { name: { contains: query.search.trim(), mode: 'insensitive' } }] }
      : {};
    return paginate(
      (args) => this.prisma.whatsappContact.findMany({ where, orderBy: { lastMessageAt: 'desc' }, ...args }),
      () => this.prisma.whatsappContact.count({ where }),
      query.skip,
      query.take,
    );
  }

  /** Staff unsubscribing someone who asked another way (a call, a visit). Same effect as the STOP reply, without a message to them. */
  async unsubscribe(id: string) {
    return this.prisma.whatsappContact.update({
      where: { id },
      data: { subscribed: false, unsubscribedReason: 'STOP', unsubscribedAt: new Date(), nextStepAt: null },
    });
  }
}
