import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailSenderService } from '../email-log/email-sender.service';
import { OWNER_EMAIL } from '../email-log/owner-notification.service';
import { WhatsAppService } from './whatsapp.service';
import { classifyStock, compare, OrderFact, soldVariants, summariseDay, topSellers } from './daily-report.metrics';
import { renderEmail, whatsappParams } from './daily-report.render';
import { shiftDateKey, windowForDate, yesterdayKey } from './daily-report.window';
import type { ActionOrder, DailyReport } from './daily-report.types';

const SHOP_NAME = process.env.DAILY_REPORT_SHOP_NAME || 'Drip Emporium';
/** Where the report goes on WhatsApp until recipients are saved in settings, as OWNER_EMAIL does for the email. */
export const OWNER_WHATSAPP = process.env.OWNER_WHATSAPP || '254771114712';
const MAX_ORDER_ROWS = 15;
const HOUR_MS = 3_600_000;
/** A send that has been "pending" this long was abandoned by a crashed process and may be claimed again. */
const STALE_CLAIM_MS = 10 * 60_000;

export type ReportSettings = { enabled: boolean; emailRecipients: string[]; whatsappRecipients: string[] };

export type DeliveryResult = {
  dateKey: string;
  skipped?: string;
  email: { recipient: string; status: string; error?: string }[];
  whatsapp: { recipient: string; status: string; error?: string }[];
};

const num = (value: Prisma.Decimal | number | null | undefined) => Number(value ?? 0);

@Injectable()
export class DailyReportService {
  private readonly logger = new Logger(DailyReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailSenderService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  // --- settings ---------------------------------------------------------------

  async getSettings(): Promise<ReportSettings & { isCustomised: boolean; whatsappConfigured: boolean; whatsappTemplate: string }> {
    const row = await this.prisma.dailyReportSetting.findUnique({ where: { id: 'singleton' } });
    return {
      enabled: row?.enabled ?? true,
      emailRecipients: row ? row.emailRecipients : [OWNER_EMAIL],
      whatsappRecipients: row ? row.whatsappRecipients : [OWNER_WHATSAPP],
      isCustomised: Boolean(row),
      whatsappConfigured: this.whatsapp.isConfigured,
      whatsappTemplate: this.whatsapp.templateName,
    };
  }

  async updateSettings(patch: Partial<ReportSettings>, updatedBy: string) {
    const current = await this.getSettings();
    const next = {
      enabled: patch.enabled ?? current.enabled,
      emailRecipients: patch.emailRecipients ?? current.emailRecipients,
      whatsappRecipients: patch.whatsappRecipients ?? current.whatsappRecipients,
      updatedBy,
    };
    await this.prisma.dailyReportSetting.upsert({ where: { id: 'singleton' }, create: { id: 'singleton', ...next }, update: next });
    return this.getSettings();
  }

  // --- building the report ----------------------------------------------------

  private async ordersIn(start: Date, end: Date) {
    const rows = await this.prisma.order.findMany({
      where: { placedAt: { gte: start, lt: end } },
      orderBy: { placedAt: 'asc' },
      select: {
        orderNumber: true,
        status: true,
        total: true,
        channel: true,
        customerName: true,
        referredByCustomerId: true,
        attributedCampaign: { select: { name: true } },
        lines: {
          select: {
            quantity: true,
            lineTotal: true,
            variantId: true,
            variant: { select: { sku: true, product: { select: { name: true } } } },
          },
        },
      },
    });
    const facts: OrderFact[] = rows.map((o) => ({
      orderNumber: o.orderNumber,
      status: o.status,
      total: num(o.total),
      lines: o.lines.map((l) => ({
        variantId: l.variantId,
        sku: l.variant.sku,
        productName: l.variant.product.name,
        quantity: l.quantity,
        lineTotal: num(l.lineTotal),
      })),
    }));
    return { rows, facts };
  }

  private async collected(start: Date, end: Date) {
    const sum = await this.prisma.orderPayment.aggregate({ _sum: { amount: true }, where: { receivedAt: { gte: start, lt: end } } });
    return num(sum._sum.amount);
  }

  private async daySummary(dateKey: string) {
    const w = windowForDate(dateKey);
    const { rows, facts } = await this.ordersIn(w.start, w.end);
    return { rows, facts, summary: summariseDay(facts, await this.collected(w.start, w.end)) };
  }

  private async actionOrders(where: Prisma.OrderWhereInput, now: Date): Promise<{ count: number; value: number; oldest: ActionOrder[] }> {
    const [count, sum, oldest] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.aggregate({ _sum: { total: true }, where }),
      this.prisma.order.findMany({
        where,
        orderBy: { placedAt: 'asc' },
        take: 3,
        select: { orderNumber: true, customerName: true, total: true, placedAt: true },
      }),
    ]);
    return {
      count,
      value: num(sum._sum.total),
      oldest: oldest.map((o) => ({
        orderNumber: o.orderNumber,
        customer: o.customerName || 'Customer',
        total: num(o.total),
        ageHours: (now.getTime() - o.placedAt.getTime()) / HOUR_MS,
      })),
    };
  }

  async build(dateKey: string, now = new Date()): Promise<DailyReport> {
    const w = windowForDate(dateKey);
    const [day, previous, lastWeek] = await Promise.all([
      this.daySummary(dateKey),
      this.daySummary(shiftDateKey(dateKey, -1)),
      this.daySummary(shiftDateKey(dateKey, -7)),
    ]);

    const statusCounts: Record<string, number> = {};
    for (const o of day.rows) statusCounts[o.status] = (statusCounts[o.status] ?? 0) + 1;

    // Needs action is "as of the moment the report is made", so it is not tied to the day's window.
    const unpaidCutoff = new Date(now.getTime() - 24 * HOUR_MS);
    const unpaidFloor = new Date(now.getTime() - 14 * 24 * HOUR_MS);
    const [paid, unpaid, pendingRefunds, newInquiries] = await Promise.all([
      this.actionOrders({ status: 'PAID' }, now),
      this.actionOrders({ status: 'PENDING', placedAt: { lt: unpaidCutoff, gte: unpaidFloor } }, now),
      this.prisma.refund.count({ where: { status: 'PENDING' } }),
      this.prisma.inquiry.count({ where: { status: 'NEW' } }),
    ]);

    // Stock for the sizes that sold, summed across stores.
    const sold = soldVariants(day.facts);
    const stockRows = sold.length
      ? await this.prisma.stockLevel.groupBy({ by: ['variantId'], where: { variantId: { in: sold.map((s) => s.variantId) } }, _sum: { quantity: true } })
      : [];
    const onHand = new Map(stockRows.map((r) => [r.variantId, num(r._sum.quantity)]));

    const [carts, whatsappClicks, campaignClicks, referralClicks] = await Promise.all([
      this.prisma.cartLead.findMany({ where: { createdAt: { gte: w.start, lt: w.end }, status: { not: 'CONVERTED' } }, select: { total: true } }),
      this.prisma.whatsAppClick.count({ where: { clickedAt: { gte: w.start, lt: w.end } } }),
      this.prisma.campaignClick.count({ where: { clickedAt: { gte: w.start, lt: w.end } } }),
      this.prisma.referralClick.count({ where: { clickedAt: { gte: w.start, lt: w.end } } }),
    ]);

    // Attribution counts paid orders only, like revenue.
    const confirmedRows = day.rows.filter((o) => ['PAID', 'PACKED', 'SHIPPED', 'DELIVERED'].includes(o.status));
    const campaigns = new Map<string, { name: string; orders: number; revenue: number }>();
    let referralOrders = 0;
    let referralRevenue = 0;
    for (const o of confirmedRows) {
      if (o.attributedCampaign) {
        const c = campaigns.get(o.attributedCampaign.name) ?? { name: o.attributedCampaign.name, orders: 0, revenue: 0 };
        c.orders++;
        c.revenue += num(o.total);
        campaigns.set(c.name, c);
      } else if (o.referredByCustomerId) {
        referralOrders++;
        referralRevenue += num(o.total);
      }
    }

    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      select: { imageUrls: true, featuredImageUrl: true, _count: { select: { variants: { where: { isActive: true } } } } },
    });
    const hasPhoto = (p: (typeof products)[number]) => Boolean(p.featuredImageUrl) || (Array.isArray(p.imageUrls) && p.imageUrls.length > 0);

    return {
      shopName: SHOP_NAME,
      currency: 'KES',
      dateKey,
      label: w.label,
      generatedAt: now.toISOString(),
      today: day.summary,
      vsPreviousDay: compare('day before', day.summary, previous.summary),
      vsLastWeek: compare('same day last week', day.summary, lastWeek.summary),
      statusCounts,
      orders: day.rows.slice(0, MAX_ORDER_ROWS).map((o) => ({
        orderNumber: o.orderNumber,
        customer: o.customerName || 'Customer',
        status: o.status,
        channel: o.channel,
        total: num(o.total),
      })),
      ordersOmitted: Math.max(0, day.rows.length - MAX_ORDER_ROWS),
      needsAction: {
        paidAwaitingPacking: { count: paid.count, oldest: paid.oldest },
        unpaidOver24h: { count: unpaid.count, value: unpaid.value, oldest: unpaid.oldest },
        pendingRefunds,
        newInquiries,
      },
      topSellers: topSellers(day.facts, 5),
      stock: classifyStock(sold, onHand),
      demand: {
        abandonedCarts: carts.length,
        abandonedValue: carts.reduce((s, c) => s + num(c.total), 0),
        whatsappClicks,
        campaignClicks,
        referralClicks,
      },
      attribution: { campaigns: [...campaigns.values()].sort((a, b) => b.revenue - a.revenue), referralOrders, referralRevenue },
      catalogue: {
        activeProducts: products.length,
        missingPhoto: products.filter((p) => !hasPhoto(p)).length,
        feedItems: products.filter(hasPhoto).reduce((s, p) => s + p._count.variants, 0),
      },
    };
  }

  async preview(dateKey?: string) {
    const key = dateKey ?? yesterdayKey(new Date());
    const report = await this.build(key);
    return { report, email: renderEmail(report), whatsappParameters: whatsappParams(report) };
  }

  // --- delivery -----------------------------------------------------------------

  /**
   * Takes the right to send one message. False means it was already sent (or another worker is sending it right
   * now), so the caller must not. `force` is for a person pressing "send again".
   */
  private async claim(reportDate: string, channel: string, recipient: string, force: boolean): Promise<boolean> {
    const key = { reportDate, channel, recipient };
    try {
      await this.prisma.dailyReportRun.create({ data: { ...key, status: 'PENDING' } });
      return true;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    }
    const staleBefore = new Date(Date.now() - STALE_CLAIM_MS);
    const reclaimable: Prisma.DailyReportRunWhereInput[] = [{ status: { in: ['FAILED', 'SKIPPED'] } }, { status: 'PENDING', updatedAt: { lt: staleBefore } }];
    if (force) reclaimable.push({ status: 'SENT' });
    const taken = await this.prisma.dailyReportRun.updateMany({ where: { ...key, OR: reclaimable }, data: { status: 'PENDING', error: null } });
    return taken.count === 1;
  }

  private finish(reportDate: string, channel: string, recipient: string, status: 'SENT' | 'FAILED' | 'SKIPPED', error?: string) {
    return this.prisma.dailyReportRun.update({
      where: { reportDate_channel_recipient: { reportDate, channel, recipient } },
      data: { status, error: error ?? null },
    });
  }

  /** Builds yesterday's (or `dateKey`'s) report and sends it to everyone in the settings. Safe to call twice. */
  /**
   * `throwOnFailure` (the default) is for the scheduled job, which must fail so the queue retries. A person pressing "send" in
   * the portal passes false, so they get the result for each recipient instead of a bare server error.
   */
  async deliver(dateKey: string = yesterdayKey(new Date()), opts: { force?: boolean; throwOnFailure?: boolean } = {}): Promise<DeliveryResult> {
    const result: DeliveryResult = { dateKey, email: [], whatsapp: [] };
    const settings = await this.getSettings();
    if (!settings.enabled && !opts.force) {
      result.skipped = 'The daily report is switched off in settings.';
      return result;
    }

    const report = await this.build(dateKey);
    const message = renderEmail(report);

    for (const recipient of settings.emailRecipients) {
      if (!(await this.claim(dateKey, 'EMAIL', recipient, Boolean(opts.force)))) {
        result.email.push({ recipient, status: 'ALREADY_SENT' });
        continue;
      }
      const sent = await this.email.send({ to: recipient, subject: message.subject, html: message.html });
      await this.finish(dateKey, 'EMAIL', recipient, sent.delivered ? 'SENT' : 'FAILED', sent.error);
      result.email.push({ recipient, status: sent.delivered ? 'SENT' : 'FAILED', error: sent.error });
      if (!sent.delivered) this.logger.warn(`Daily report to ${recipient} failed: ${sent.error}`);
    }

    const parameters = whatsappParams(report);
    for (const recipient of settings.whatsappRecipients) {
      if (!(await this.claim(dateKey, 'WHATSAPP', recipient, Boolean(opts.force)))) {
        result.whatsapp.push({ recipient, status: 'ALREADY_SENT' });
        continue;
      }
      if (!this.whatsapp.isConfigured) {
        const why = 'WhatsApp is not set up on the server (WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN).';
        await this.finish(dateKey, 'WHATSAPP', recipient, 'SKIPPED', why);
        result.whatsapp.push({ recipient, status: 'SKIPPED', error: why });
        continue;
      }
      const sent = await this.whatsapp.sendTemplate(recipient, parameters);
      await this.finish(dateKey, 'WHATSAPP', recipient, sent.delivered ? 'SENT' : 'FAILED', sent.error);
      result.whatsapp.push({ recipient, status: sent.delivered ? 'SENT' : 'FAILED', error: sent.error });
    }

    // A failed send is thrown after everything was attempted, so the queue retries it and the claim keeps the
    // recipients that already got it from receiving a second copy.
    const failed = [...result.email, ...result.whatsapp].filter((r) => r.status === 'FAILED');
    if (failed.length && !opts.force && opts.throwOnFailure !== false) throw new Error(`Daily report ${dateKey}: ${failed.length} send(s) failed (${failed.map((f) => f.recipient).join(', ')})`);
    return result;
  }

  async hasRunFor(dateKey: string) {
    return (await this.prisma.dailyReportRun.count({ where: { reportDate: dateKey } })) > 0;
  }

  recentRuns(limit = 30) {
    return this.prisma.dailyReportRun.findMany({ orderBy: { updatedAt: 'desc' }, take: limit });
  }
}
