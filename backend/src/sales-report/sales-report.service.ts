import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { localDateKey, windowForDate } from '../daily-report/daily-report.window';
import { CONFIRMED_STATUSES } from '../daily-report/daily-report.metrics';
import { containsAny } from '../common/pagination.util';
import { ORDER_INCLUDE, orderFollowUp } from '../order/order.service';
import {
  CLOSED_STATUSES, MAX_RANGE_DAYS, OrderFact, PaymentFact, PeriodKind,
  autoGrouping, breakdowns, changes, daysInRange, margin, previousRange, series, summarise,
} from './sales-report.metrics';
import type { SalesReportQueryDto } from './sales-report.dto';

/** The most orders one CSV download carries. */
export const EXPORT_LIMIT = 5000;

const FACT_SELECT = {
  id: true, status: true, channel: true, priceTier: true, storeId: true, createdBy: true, customerId: true, customerName: true, customerPhone: true,
  subtotal: true, discount: true, shipping: true, taxAmount: true, total: true, amountPaid: true, placedAt: true,
  store: { select: { name: true } },
  customer: { select: { firstName: true, lastName: true } },
  lines: { select: { quantity: true, lineTotal: true, discount: true, description: true, variant: { select: { costKes: true, product: { select: { id: true, name: true } } } } } },
} satisfies Prisma.OrderSelect;

type FactRow = Prisma.OrderGetPayload<{ select: typeof FACT_SELECT }>;

const num = (v: Prisma.Decimal | number | null | undefined) => Number(v ?? 0);
const phoneTail = (phone?: string | null) => {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length >= 9 ? digits.slice(-9) : null;
};

function toFact(o: FactRow): OrderFact {
  const name = o.customerName || (o.customer ? `${o.customer.firstName} ${o.customer.lastName}`.trim() : null);
  const tail = phoneTail(o.customerPhone);
  return {
    id: o.id, status: o.status, channel: o.channel, priceTier: o.priceTier, storeId: o.storeId, storeName: o.store.name, createdBy: o.createdBy,
    buyerKey: o.customerId ?? (tail ? `phone:${tail}` : null), buyerName: name,
    subtotal: num(o.subtotal), discount: num(o.discount), shipping: num(o.shipping), tax: num(o.taxAmount), total: num(o.total), amountPaid: num(o.amountPaid),
    placedAt: o.placedAt,
    lines: o.lines.map((l) => ({
      productId: l.variant?.product?.id ?? l.description, productName: l.variant?.product?.name ?? l.description,
      quantity: l.quantity, lineTotal: num(l.lineTotal), discount: num(l.discount),
      unitCost: l.variant?.costKes === null || l.variant?.costKes === undefined ? null : Number(l.variant.costKes),
    })),
  };
}

export type Range = { from: string; to: string; period: PeriodKind };

@Injectable()
export class SalesReportService {
  constructor(private readonly prisma: PrismaService) {}

  /** The days asked for: today when nothing is said, never back to front, and not so long that it reads the whole shop's history at once. */
  range(query: SalesReportQueryDto, now = new Date()): Range {
    const from = query.from ?? query.to ?? localDateKey(now);
    const to = query.to ?? from;
    for (const key of [from, to]) {
      if (new Date(`${key}T00:00:00Z`).toISOString().slice(0, 10) !== key) throw new BadRequestException(`${key} is not a real date.`);
    }
    if (to < from) throw new BadRequestException('The end date is before the start date.');
    if (daysInRange(from, to) > MAX_RANGE_DAYS) throw new BadRequestException(`Choose a period of at most ${MAX_RANGE_DAYS} days.`);
    return { from, to, period: query.period ?? (from === to ? 'day' : 'range') };
  }

  private between(from: string, to: string) {
    return { gte: windowForDate(from).start, lt: windowForDate(to).end };
  }

  /** The filters that pick out orders, apart from the dates. */
  private orderFilters(query: SalesReportQueryDto): Prisma.OrderWhereInput {
    return {
      ...(query.storeId ? { storeId: query.storeId } : {}),
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.priceTier ? { priceTier: query.priceTier } : {}),
      ...(query.staff ? { createdBy: query.staff } : {}),
    };
  }

  private async orders(query: SalesReportQueryDto, from: string, to: string): Promise<OrderFact[]> {
    const rows = await this.prisma.order.findMany({ where: { ...this.orderFilters(query), placedAt: this.between(from, to) }, select: FACT_SELECT });
    return rows.map(toFact);
  }

  /**
   * Money that came in during the period: payments on orders (whenever they were placed) and payments resellers made on pickups. A pickup
   * has no channel and nobody "keys it in" as an order, so with either of those filters on, pickup money is left out and the report says so.
   */
  private async payments(query: SalesReportQueryDto, from: string, to: string): Promise<PaymentFact[]> {
    const receivedAt = this.between(from, to);
    const includePickups = !query.channel && !query.staff;
    const [orderPayments, pickupPayments] = await Promise.all([
      this.prisma.orderPayment.findMany({
        where: { receivedAt, order: this.orderFilters(query) },
        select: { amount: true, method: true, receivedAt: true, order: { select: { status: true } } },
      }),
      includePickups
        ? this.prisma.consignmentPayment.findMany({
            where: { receivedAt, consignment: { ...(query.storeId ? { storeId: query.storeId } : {}), ...(query.priceTier ? { priceTier: query.priceTier } : {}) } },
            select: { amount: true, method: true, receivedAt: true },
          })
        : Promise.resolve([]),
    ]);
    return [
      ...orderPayments.map((p) => ({ amount: num(p.amount), method: p.method, receivedAt: p.receivedAt, source: 'ORDER' as const, orderStatus: p.order.status })),
      ...pickupPayments.map((p) => ({ amount: num(p.amount), method: p.method, receivedAt: p.receivedAt, source: 'CONSIGNMENT' as const })),
    ];
  }

  /** How many of the period's buyers had bought before it started. Anonymous walk-ins cannot be told apart, so they are counted separately. */
  private async customers(sales: OrderFact[], from: string) {
    const keys = new Set(sales.map((o) => o.buyerKey).filter((k): k is string => Boolean(k)));
    const ids = [...keys].filter((k) => !k.startsWith('phone:'));
    const tails = [...keys].filter((k) => k.startsWith('phone:')).map((k) => k.slice(6));
    const before = { status: { in: CONFIRMED_STATUSES as any }, placedAt: { lt: windowForDate(from).start } };
    const [byId, byPhone] = await Promise.all([
      ids.length ? this.prisma.order.findMany({ where: { ...before, customerId: { in: ids } }, select: { customerId: true }, distinct: ['customerId'] }) : Promise.resolve([]),
      tails.length ? this.prisma.order.findMany({ where: { ...before, OR: tails.map((t) => ({ customerPhone: { endsWith: t } })) }, select: { customerPhone: true } }) : Promise.resolve([]),
    ]);
    const returning = new Set<string>([
      ...byId.map((r) => r.customerId as string),
      ...byPhone.map((r) => `phone:${phoneTail(r.customerPhone)}`),
    ]);
    const returningCount = [...keys].filter((k) => returning.has(k)).length;
    return { unique: keys.size, returning: returningCount, first: keys.size - returningCount, anonymousSales: sales.filter((o) => !o.buyerKey).length };
  }

  async report(query: SalesReportQueryDto, options: { withMargin: boolean }) {
    const range = this.range(query);
    const earlier = previousRange(range.period, range.from, range.to);
    const grouping = query.groupBy && !(query.groupBy === 'hour' && range.from !== range.to) ? query.groupBy : autoGrouping(range.from, range.to);

    const [orders, payments, earlierOrders, earlierPayments] = await Promise.all([
      this.orders(query, range.from, range.to), this.payments(query, range.from, range.to),
      this.orders(query, earlier.from, earlier.to), this.payments(query, earlier.from, earlier.to),
    ]);
    const summary = summarise(orders, payments);
    const before = summarise(earlierOrders, earlierPayments);
    return {
      range,
      comparison: { ...earlier, summary: { sales: before.sales, placed: before.placed, received: { total: before.received.total } }, changes: changes(summary, before) },
      summary,
      customers: await this.customers(orders.filter((o) => CONFIRMED_STATUSES.includes(o.status)), range.from),
      margin: options.withMargin ? margin(orders) : null,
      grouping,
      series: series(orders, payments, range.from, range.to, grouping),
      breakdowns: breakdowns(orders),
      pickupMoneyIncluded: !query.channel && !query.staff,
      generatedAt: new Date().toISOString(),
    };
  }

  // --- the order list --------------------------------------------------------------------------------------------------

  private listWhere(query: SalesReportQueryDto, range: Range): Prisma.OrderWhereInput {
    const show = query.show ?? 'all';
    const status: Prisma.OrderWhereInput =
      show === 'all' ? {}
      : show === 'sales' ? { status: { in: CONFIRMED_STATUSES as any } }
      : show === 'unpaid' ? { status: 'PENDING' }
      : show === 'cancelled' ? { status: { in: CLOSED_STATUSES as any } }
      : { status: show as any };
    const term = query.search?.trim();
    return {
      ...this.orderFilters(query),
      ...status,
      placedAt: this.between(range.from, range.to),
      ...(term ? { OR: containsAny(['orderNumber', 'customerName', 'customerPhone', 'customer.firstName', 'customer.lastName'], term) as Prisma.OrderWhereInput[] } : {}),
    };
  }

  private orderBy(sort?: string): Prisma.OrderOrderByWithRelationInput[] {
    if (sort === 'oldest') return [{ placedAt: 'asc' }, { id: 'asc' }];
    if (sort === 'largest') return [{ total: 'desc' }, { placedAt: 'desc' }];
    if (sort === 'smallest') return [{ total: 'asc' }, { placedAt: 'desc' }];
    return [{ placedAt: 'desc' }, { id: 'asc' }];
  }

  private row(order: Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>) {
    const total = num(order.total);
    const paid = num(order.amountPaid);
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      placedAt: order.placedAt,
      status: order.status,
      channel: order.channel,
      priceTier: order.priceTier,
      storeName: order.store.name,
      customerName: order.customerName || (order.customer ? `${order.customer.firstName} ${order.customer.lastName}`.trim() : null),
      customerPhone: order.customerPhone || order.customer?.phone || null,
      items: order.lines.map((l) => `${l.quantity} x ${l.variant?.product?.name ?? l.description}`).join(', '),
      units: order.lines.reduce((n, l) => n + l.quantity, 0),
      subtotal: num(order.subtotal),
      discount: num(order.discount) + order.lines.reduce((n, l) => n + num(l.discount), 0),
      shipping: num(order.shipping),
      total,
      amountPaid: paid,
      balance: CLOSED_STATUSES.includes(order.status) ? 0 : Math.max(0, total - paid),
      paymentMethods: [...new Set(order.payments.map((p) => p.method))].join(', '),
      createdBy: order.createdBy,
      cancelledAt: order.cancelledAt,
      closeReason: order.closeReason,
      // Something to say to the customer where there is something to chase: an unpaid order.
      followUp: order.status === 'PENDING' ? orderFollowUp(order) : null,
    };
  }

  async list(query: SalesReportQueryDto) {
    const range = this.range(query);
    const where = this.listWhere(query, range);
    const skip = query.skip ?? 0;
    const take = query.take ?? 25;
    const [rows, total, sums] = await Promise.all([
      this.prisma.order.findMany({ where, include: ORDER_INCLUDE, orderBy: this.orderBy(query.sort), skip, take }),
      this.prisma.order.count({ where }),
      this.prisma.order.aggregate({ where, _sum: { total: true, amountPaid: true } }),
    ]);
    return { items: rows.map((r) => this.row(r)), total, skip, take, sums: { total: num(sums._sum.total), amountPaid: num(sums._sum.amountPaid) } };
  }

  /** Every order matching the list's filters, for a spreadsheet. */
  async exportRows(query: SalesReportQueryDto) {
    const range = this.range(query);
    const where = this.listWhere(query, range);
    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({ where, include: ORDER_INCLUDE, orderBy: this.orderBy(query.sort), take: EXPORT_LIMIT }),
      this.prisma.order.count({ where }),
    ]);
    return { items: rows.map((r) => { const { followUp, ...rest } = this.row(r); return rest; }), total, truncated: total > rows.length };
  }

  /** What the filter boxes offer. */
  async options() {
    const [stores, channels, staff, first] = await Promise.all([
      this.prisma.store.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.order.findMany({ distinct: ['channel'], select: { channel: true } }),
      this.prisma.order.findMany({ distinct: ['createdBy'], select: { createdBy: true } }),
      this.prisma.order.aggregate({ _min: { placedAt: true } }),
    ]);
    return {
      stores,
      channels: channels.map((c) => c.channel).sort(),
      staff: staff.map((s) => s.createdBy).sort(),
      firstOrderDay: first._min.placedAt ? localDateKey(first._min.placedAt) : null,
      today: localDateKey(new Date()),
    };
  }
}
