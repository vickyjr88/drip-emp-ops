import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const num = (v: unknown) => Number(v ?? 0);
const utc = (d: Date) => Prisma.sql`(${d}::timestamptz AT TIME ZONE 'UTC')`;
const MAX_FAILURES = 5;

/**
 * How the WhatsApp side is doing, from what the app itself recorded: who messaged the shop and from which ad, how many told
 * to expect updates, how many replied STOP, where each person is in the onboarding messages, what was sent and whether it
 * arrived (Meta's delivery reports), why messages failed, and which chats turned into orders.
 *
 * "Became an order" matches the chat's phone number against orders placed after that first message (last nine digits, so
 * 0712..., +254712... and 254712... are one number). Orders agreed in person under a different number are not counted.
 */
@Injectable()
export class WhatsappReportService {
  constructor(private prisma: PrismaService) {}

  async report(from: Date, to: Date) {
    const where = { createdAt: { gte: from, lte: to } };
    const [total, subscribed, stopped, trade, notTold, newInPeriod, fromAds, steps, gaveUp, daily] = await Promise.all([
      this.prisma.whatsappContact.count(),
      this.prisma.whatsappContact.count({ where: { subscribed: true } }),
      this.prisma.whatsappContact.count({ where: { unsubscribedReason: 'STOP' } }),
      this.prisma.whatsappContact.count({ where: { unsubscribedReason: 'TRADE' } }),
      this.prisma.whatsappContact.count({ where: { subscribed: true, noticeSentAt: null } }),
      this.prisma.whatsappContact.count({ where }),
      this.prisma.whatsappContact.count({ where: { ...where, adSourceId: { not: null } } }),
      this.prisma.whatsappContact.groupBy({ by: ['nextStep'], where: { subscribed: true }, _count: { _all: true } }),
      this.prisma.whatsappContact.count({ where: { subscribed: true, failures: { gte: MAX_FAILURES } } }),
      this.prisma.$queryRaw<Array<{ day: Date; chats: number; fromAds: number }>>(Prisma.sql`
        SELECT date_trunc('day', "createdAt") AS day, count(*)::int AS chats, count(*) FILTER (WHERE "adSourceId" IS NOT NULL)::int AS "fromAds"
        FROM "WhatsappContact" WHERE "createdAt" BETWEEN ${utc(from)} AND ${utc(to)} GROUP BY 1 ORDER BY 1
      `),
    ]);
    const atStep = (n: number) => steps.find((s) => s.nextStep === n)?._count._all ?? 0;

    // What was sent in the period and what became of it.
    const [outreach, reports, failures] = await Promise.all([
      this.prisma.whatsappOutreach.groupBy({ by: ['kind', 'status', 'delivery'], where, _count: { _all: true } }),
      this.prisma.dailyReportRun.groupBy({ by: ['status', 'delivery'], where: { channel: 'WHATSAPP', createdAt: { gte: from, lte: to } }, _count: { _all: true } }),
      this.prisma.whatsappMessageStatus.groupBy({ by: ['errorTitle'], where: { status: 'failed', createdAt: { gte: from, lte: to } }, _count: { _all: true }, orderBy: { _count: { errorTitle: 'desc' } }, take: 8 }),
    ]);

    const byKind = new Map<string, { kind: string; sent: number; failedToSend: number; delivered: number; read: number; notDelivered: number; awaiting: number }>();
    for (const row of outreach) {
      const k = byKind.get(row.kind) ?? { kind: row.kind, sent: 0, failedToSend: 0, delivered: 0, read: 0, notDelivered: 0, awaiting: 0 };
      const n = row._count._all;
      if (row.status !== 'SENT') k.failedToSend += n;
      else {
        k.sent += n;
        if (row.delivery === 'read') k.read += n;
        else if (row.delivery === 'delivered') k.delivered += n;
        else if (row.delivery === 'failed') k.notDelivered += n;
        else k.awaiting += n;
      }
      byKind.set(row.kind, k);
    }
    const templates = Array.from(byKind.values()).sort((a, b) => b.sent - a.sent);

    const dailyReports = { sent: 0, delivered: 0, read: 0, notDelivered: 0, awaiting: 0, failedToSend: 0 };
    for (const row of reports) {
      const n = row._count._all;
      if (row.status !== 'SENT') { dailyReports.failedToSend += n; continue; }
      dailyReports.sent += n;
      if (row.delivery === 'read') dailyReports.read += n;
      else if (row.delivery === 'delivered') dailyReports.delivered += n;
      else if (row.delivery === 'failed') dailyReports.notDelivered += n;
      else dailyReports.awaiting += n;
    }

    // Which ads brought chats, and which of those people went on to order.
    const ads = await this.prisma.$queryRaw<Array<{ adSourceId: string | null; headline: string | null; chats: number; stopped: number; orders: number; revenue: number }>>(Prisma.sql`
      WITH c AS (
        SELECT id, phone, "adSourceId", "adHeadline", "unsubscribedReason", "firstMessageAt"
        FROM "WhatsappContact" WHERE "createdAt" BETWEEN ${utc(from)} AND ${utc(to)}
      ), o AS (
        SELECT c.id AS contact_id, count(DISTINCT ord.id) AS orders, sum(ord.total) AS revenue
        FROM c JOIN "Order" ord
          ON right(regexp_replace(coalesce(ord."customerPhone", ''), '\\D', '', 'g'), 9) = right(c.phone, 9)
         AND ord."placedAt" >= c."firstMessageAt" AND ord.status NOT IN ('CANCELLED', 'REFUNDED')
        GROUP BY c.id
      )
      SELECT c."adSourceId", max(c."adHeadline") AS headline, count(*)::int AS chats,
        count(*) FILTER (WHERE c."unsubscribedReason" = 'STOP')::int AS stopped,
        COALESCE(sum(o.orders), 0)::int AS orders, COALESCE(sum(o.revenue), 0)::float AS revenue
      FROM c LEFT JOIN o ON o.contact_id = c.id
      GROUP BY c."adSourceId" ORDER BY chats DESC LIMIT 15
    `);
    const adRows = ads.map((a) => ({ adSourceId: a.adSourceId, headline: a.headline, chats: a.chats, stopped: a.stopped, orders: a.orders, revenueKes: a.revenue }));
    const ordered = adRows.reduce((s, a) => ({ orders: s.orders + a.orders, revenueKes: s.revenueKes + a.revenueKes }), { orders: 0, revenueKes: 0 });
    const buyers = await this.prisma.$queryRaw<Array<{ n: number }>>(Prisma.sql`
      SELECT count(DISTINCT c.id)::int AS n FROM "WhatsappContact" c JOIN "Order" ord
        ON right(regexp_replace(coalesce(ord."customerPhone", ''), '\\D', '', 'g'), 9) = right(c.phone, 9)
       AND ord."placedAt" >= c."firstMessageAt" AND ord.status NOT IN ('CANCELLED', 'REFUNDED')
      WHERE c."createdAt" BETWEEN ${utc(from)} AND ${utc(to)}
    `);

    const checked = templates.reduce((s, t) => s + t.delivered + t.read + t.notDelivered, 0) + dailyReports.delivered + dailyReports.read + dailyReports.notDelivered;
    const arrived = templates.reduce((s, t) => s + t.delivered + t.read, 0) + dailyReports.delivered + dailyReports.read;

    return {
      contacts: {
        total, newInPeriod, fromAds, subscribed, stopped, trade, notTold,
        // Of the people who could have stayed (not trade contacts), the share who replied STOP.
        stopRate: subscribed + stopped > 0 ? stopped / (subscribed + stopped) : 0,
        daily: daily.map((d) => ({ date: d.day.toISOString().slice(0, 10), chats: d.chats, fromAds: d.fromAds })),
      },
      onboarding: { waitingForApp: atStep(0), waitingForGroup: atStep(1), waitingForRating: atStep(2), finished: atStep(3), gaveUp },
      messages: {
        templates,
        dailyReports,
        arrivedRate: checked > 0 ? arrived / checked : null,
        checked,
        topFailures: failures.map((f) => ({ reason: f.errorTitle ?? 'No reason given', count: f._count._all })),
      },
      ads: adRows,
      chatsToOrders: { chats: newInPeriod, buyers: num(buyers[0]?.n), orders: ordered.orders, revenueKes: ordered.revenueKes },
    };
  }
}
