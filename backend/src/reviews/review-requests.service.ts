import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../daily-report/whatsapp.service';
import { EmailLogService } from '../email-log/email-log.service';
import { WhatsAppOutreachService } from '../whatsapp-outreach/whatsapp-outreach.service';
import { greetingName } from '../whatsapp-outreach/whatsapp-outreach.kinds';
import { inSendWindow, startOfNairobiDay } from '../whatsapp-outreach/whatsapp-subscription';
import { realEmail } from '../common/contact-email';
import { storefrontOrigin } from '../common/storefront-origin';
import { ReviewsService } from './reviews.service';
import { reviewToken } from './reviews.rules';
import {
  COOLDOWN_DAYS, MAX_ATTEMPTS, nextAttemptAt, requestTiming, reviewRequestEmail, reviewRequestTemplate, reviewRequestsEnabled,
} from './review-requests.rules';

const TICK_MS = 10 * 60_000;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const BATCH = 20;
/** A retry that was taken but did not finish (a crash) is looked at again after this long. */
const LEASE_MS = 30 * 60_000;

type Channel = 'email' | 'whatsapp';
type Outcome = { status: 'SENT' | 'FAILED' | 'SKIPPED'; detail?: string };

/**
 * After an order is delivered, asks the customer to review what they bought, by email and by WhatsApp, each with the order's own review link
 * (so what they write is a verified purchase). It checks every ten minutes; both backend slots run it, and the request for an order is claimed
 * in the database before anything is sent, so it goes out once.
 *
 * Guards, in the same spirit as the WhatsApp onboarding messages:
 *  - OFF unless REVIEW_REQUESTS_ENABLED=true.
 *  - Only retail orders (never a reseller or wholesale buyer), only orders delivered between REVIEW_REQUEST_DELAY_HOURS (default 24) and
 *    REVIEW_REQUEST_MAX_AGE_DAYS (default 7) ago: switching it on does not message everyone who ever bought.
 *  - Between 08:00 and 20:00 Nairobi; WhatsApp shares the daily cap of template messages (WHATSAPP_DAILY_SEND_CAP).
 *  - Nobody who replied STOP on WhatsApp; nobody with no address for that channel; nobody asked within the last 14 days for another order;
 *    nothing if they have already reviewed every pair in the order.
 */
@Injectable()
export class ReviewRequestsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ReviewRequestsService.name);
  private timer?: NodeJS.Timeout;
  private first?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly reviews: ReviewsService,
    private readonly whatsapp: WhatsAppService,
    private readonly email: EmailLogService,
    private readonly outreach: WhatsAppOutreachService,
  ) {}

  onApplicationBootstrap() {
    if (!reviewRequestsEnabled()) return;
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
      this.logger.error(`Review request check failed: ${(error as Error).message}`);
    }
  }

  /** What staff see above the Ask tab: whether it is on, and what it waits for. */
  status() {
    const timing = requestTiming();
    return {
      enabled: reviewRequestsEnabled(),
      ...timing,
      template: reviewRequestTemplate(),
      whatsappConfigured: this.whatsapp.isConfigured,
    };
  }

  async tick(now: Date = new Date()): Promise<{ asked: number; retried: number; emailSent: number; whatsappSent: number; failed: number }> {
    const result = { asked: 0, retried: 0, emailSent: 0, whatsappSent: 0, failed: 0 };
    if (!reviewRequestsEnabled() || !inSendWindow(now)) return result;
    const { delayHours, maxAgeDays } = requestTiming();
    const include = { customer: { select: { email: true, phone: true, firstName: true } } };

    const due = await this.prisma.order.findMany({
      where: {
        status: 'DELIVERED',
        priceTier: 'RETAIL',
        reviewRequest: null,
        fulfilledAt: { gte: new Date(now.getTime() - maxAgeDays * DAY_MS), lte: new Date(now.getTime() - delayHours * HOUR_MS) },
      },
      orderBy: { fulfilledAt: 'asc' },
      take: BATCH,
      include,
    });
    for (const order of due) {
      // The unique order id is the claim: a second slot, or a second tick, cannot create it again.
      const claimed = await this.prisma.reviewRequest.create({ data: { orderId: order.id } }).catch(() => null);
      if (!claimed) continue;
      const out = await this.run(order, claimed.id, 1, ['email', 'whatsapp'], now);
      result.asked += 1;
      result.emailSent += out.email?.status === 'SENT' ? 1 : 0;
      result.whatsappSent += out.whatsapp?.status === 'SENT' ? 1 : 0;
      result.failed += [out.email, out.whatsapp].filter((o) => o?.status === 'FAILED').length;
    }

    const retries = await this.prisma.reviewRequest.findMany({
      where: {
        nextAttemptAt: { lte: now },
        attempts: { lt: MAX_ATTEMPTS },
        order: { status: 'DELIVERED', fulfilledAt: { gte: new Date(now.getTime() - maxAgeDays * DAY_MS) } },
      },
      orderBy: { nextAttemptAt: 'asc' },
      take: BATCH,
      include: { order: { include } },
    });
    for (const request of retries) {
      const taken = await this.prisma.reviewRequest.updateMany({
        where: { id: request.id, nextAttemptAt: request.nextAttemptAt },
        data: { nextAttemptAt: new Date(now.getTime() + LEASE_MS), attempts: { increment: 1 } },
      });
      if (taken.count !== 1) continue;
      const channels = (['email', 'whatsapp'] as Channel[]).filter((c) => (c === 'email' ? request.emailStatus : request.whatsappStatus) === 'FAILED');
      const out = await this.run(request.order, request.id, request.attempts + 1, channels, now);
      result.retried += 1;
      result.emailSent += out.email?.status === 'SENT' ? 1 : 0;
      result.whatsappSent += out.whatsapp?.status === 'SENT' ? 1 : 0;
      result.failed += [out.email, out.whatsapp].filter((o) => o?.status === 'FAILED').length;
    }

    if (result.asked || result.retried) this.logger.log(`Review requests: ${result.asked} new, ${result.retried} retried; ${result.emailSent} emails and ${result.whatsappSent} WhatsApp messages sent, ${result.failed} failed.`);
    return result;
  }

  /** Works out who to ask and what to say for one order, sends on each channel asked for, and records what happened. */
  private async run(
    order: { id: string; orderNumber: string; customerId: string | null; customerName: string | null; customerPhone: string | null; customerEmail: string | null; customer: { email: string; phone: string; firstName: string } | null },
    requestId: string,
    attempts: number,
    channels: Channel[],
    now: Date,
  ): Promise<Partial<Record<Channel, Outcome>>> {
    const token = reviewToken(order.orderNumber);
    const out: Partial<Record<Channel, Outcome>> = {};
    const save = (data: Record<string, unknown>) => this.prisma.reviewRequest.update({ where: { id: requestId }, data }).catch((error) => this.logger.warn(`Could not record review request ${order.orderNumber}: ${(error as Error).message}`));

    // What there is to review: the order's pairs, minus any the customer has already reviewed.
    let pairs: Array<{ name: string; reviewed: boolean }> = [];
    let unreviewable: string | null = null;
    try {
      pairs = (await this.reviews.orderForToken(token)).items;
    } catch (error) {
      unreviewable = (error as Error).message;
    }
    const left = pairs.filter((p) => !p.reviewed);
    const skipAll = unreviewable ?? (left.length === 0 ? (pairs.length === 0 ? 'Nothing in the order can be reviewed' : 'Already reviewed') : null);

    const email = realEmail(order.customerEmail) ?? realEmail(order.customer?.email);
    const phone = this.whatsapp.normalisePhone(order.customerPhone ?? order.customer?.phone ?? '');
    const firstName = greetingName((order.customerName ?? order.customer?.firstName ?? '').trim().split(/\s+/)[0]);
    const link = `${storefrontOrigin()}/review/${token}`;
    await save({ phone, email: email?.toLowerCase() ?? null });

    if (channels.includes('email')) {
      out.email = skipAll ? { status: 'SKIPPED', detail: skipAll } : await this.sendEmail({ requestId, orderId: order.id, email, firstName, products: left.map((p) => p.name), link, now, save });
      await save({ emailStatus: out.email.status, emailDetail: out.email.detail?.slice(0, 300) ?? null, emailAt: out.email.status === 'SENT' ? now : undefined });
    }
    if (channels.includes('whatsapp')) {
      out.whatsapp = skipAll ? { status: 'SKIPPED', detail: skipAll } : await this.sendWhatsapp({ orderId: order.id, customerId: order.customerId, phone, firstName, link, now, save });
      await save({ whatsappStatus: out.whatsapp.status, whatsappDetail: out.whatsapp.detail?.slice(0, 300) ?? null, whatsappAt: out.whatsapp.status === 'SENT' ? now : undefined });
    }

    const failed = Object.values(out).some((o) => o?.status === 'FAILED');
    await save({ attempts, nextAttemptAt: nextAttemptAt(failed, attempts, now) });
    return out;
  }

  private async sendEmail(p: { requestId: string; orderId: string; email: string | null; firstName: string; products: string[]; link: string; now: Date; save: (d: Record<string, unknown>) => Promise<unknown> }): Promise<Outcome> {
    if (!p.email) return { status: 'SKIPPED', detail: 'No email address (the customer gave a phone number only)' };
    const recent = await this.prisma.reviewRequest.findFirst({
      where: { email: p.email.toLowerCase(), emailStatus: 'SENT', orderId: { not: p.orderId }, emailAt: { gte: new Date(p.now.getTime() - COOLDOWN_DAYS * DAY_MS) } },
      select: { order: { select: { orderNumber: true } } },
    });
    if (recent) return { status: 'SKIPPED', detail: `Asked recently, for order ${recent.order.orderNumber}` };

    // Marked before sending: if the process dies mid-send this stays SENDING and is never retried, which is the safe way round.
    await p.save({ emailStatus: 'SENDING' });
    const { subject, html } = reviewRequestEmail({ firstName: p.firstName, products: p.products, link: p.link });
    const log = await this.email.send({ recipient: p.email, subject, html });
    return log.status === 'SENT' ? { status: 'SENT' } : { status: 'FAILED', detail: log.errorMessage ?? 'The email was not delivered' };
  }

  private async sendWhatsapp(p: { orderId: string; customerId: string | null; phone: string | null; firstName: string; link: string; now: Date; save: (d: Record<string, unknown>) => Promise<unknown> }): Promise<Outcome> {
    if (!p.phone) return { status: 'SKIPPED', detail: 'No usable phone number' };
    if (await this.outreach.repliedStop(p.phone)) return { status: 'SKIPPED', detail: 'Replied STOP' };
    const recent = await this.prisma.reviewRequest.findFirst({
      where: { phone: p.phone, whatsappStatus: 'SENT', orderId: { not: p.orderId }, whatsappAt: { gte: new Date(p.now.getTime() - COOLDOWN_DAYS * DAY_MS) } },
      select: { order: { select: { orderNumber: true } } },
    });
    if (recent) return { status: 'SKIPPED', detail: `Asked recently, for order ${recent.order.orderNumber}` };
    if (!this.whatsapp.isConfigured) return { status: 'FAILED', detail: 'WhatsApp is not configured on this server' };

    const cap = Number(process.env.WHATSAPP_DAILY_SEND_CAP || 200);
    const sentToday = await this.prisma.whatsappOutreach.count({ where: { status: 'SENT', createdAt: { gte: startOfNairobiDay(p.now) } } });
    if (sentToday >= cap) return { status: 'FAILED', detail: `The daily limit of ${cap} WhatsApp messages was reached; it will be tried again` };

    await p.save({ whatsappStatus: 'SENDING' });
    const template = reviewRequestTemplate();
    const sent = await this.whatsapp.sendTemplate(p.phone, [p.firstName, p.link], template);
    // The same log as the other WhatsApp messages: it counts towards the daily cap, and Meta's delivery reports attach to it by message id.
    await this.prisma.whatsappOutreach
      .create({ data: { customerId: p.customerId, phone: p.phone, kind: 'REVIEW_REQUEST', template, status: sent.delivered ? 'SENT' : 'FAILED', messageId: sent.messageId, error: sent.error?.slice(0, 500), triggeredBy: 'review-request' } })
      .catch((error) => this.logger.warn(`Could not log the review request to ${p.phone}: ${(error as Error).message}`));
    if (sent.messageId) await p.save({ whatsappMessageId: sent.messageId });
    return sent.delivered ? { status: 'SENT' } : { status: 'FAILED', detail: sent.error };
  }
}
