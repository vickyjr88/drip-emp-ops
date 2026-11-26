/**
 * The arithmetic of the sales report, kept apart from the database so every figure on the screen can be tested.
 *
 * The words mean what they mean on the dashboard and in the daily report:
 *  - a SALE is an order the customer has paid for or that has moved past payment (PAID, PACKED, SHIPPED, DELIVERED); revenue is those orders' totals;
 *  - an UNPAID order (PENDING) is not a sale: it is shown on its own so it can be chased without inflating anything;
 *  - CANCELLED and REFUNDED orders are not sales either, and are listed so they can be looked into;
 *  - MONEY RECEIVED is a different question (what came in during the period, whenever the order was placed), so it is counted from payments.
 * Days are the shop's days (Nairobi).
 */
import { EAT_OFFSET_MINUTES, localDateKey, shiftDateKey, windowForDate } from '../daily-report/daily-report.window';
import { CONFIRMED_STATUSES, pctChange } from '../daily-report/daily-report.metrics';

export type PeriodKind = 'day' | 'week' | 'month' | 'range';
export type Grouping = 'hour' | 'day' | 'week' | 'month';
export const CLOSED_STATUSES = ['CANCELLED', 'REFUNDED'];
export const MAX_RANGE_DAYS = 800;

export type LineFact = { productId: string; productName: string; quantity: number; lineTotal: number; discount: number; unitCost: number | null };
export type OrderFact = {
  id: string; status: string; channel: string; priceTier: string; storeId: string; storeName: string; createdBy: string;
  /** Who bought, as far as it is known: the customer record, else the phone number. Null for an anonymous walk-in. */
  buyerKey: string | null; buyerName: string | null;
  subtotal: number; discount: number; shipping: number; tax: number; total: number; amountPaid: number;
  placedAt: Date; lines: LineFact[];
};
export type PaymentFact = { amount: number; method: string; receivedAt: Date; source: 'ORDER' | 'CONSIGNMENT'; orderStatus?: string };

const round2 = (n: number) => Math.round(n * 100) / 100;
export const isSale = (o: { status: string }) => CONFIRMED_STATUSES.includes(o.status);
const isUnpaid = (o: { status: string }) => o.status === 'PENDING';
const isClosed = (o: { status: string }) => CLOSED_STATUSES.includes(o.status);
const sum = <T>(rows: T[], of: (row: T) => number) => rows.reduce((n, row) => n + of(row), 0);
const unitsOf = (o: OrderFact) => sum(o.lines, (l) => l.quantity);

// --- dates ------------------------------------------------------------------------------------------------------------

export const daysInRange = (from: string, to: string) => Math.round((windowForDate(to).start.getTime() - windowForDate(from).start.getTime()) / 86_400_000) + 1;
const monthStart = (key: string) => `${key.slice(0, 7)}-01`;
const monthEnd = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
/** Monday of the week the day is in: the shop's trading week. */
export const weekStart = (key: string) => {
  const day = new Date(`${key}T00:00:00Z`).getUTCDay();
  return shiftDateKey(key, -((day + 6) % 7));
};

/**
 * What a period is compared with. Like for like, so a week or month still under way is set against the same stretch of the one before:
 * Monday to Wednesday against last Monday to Wednesday, the 1st to the 12th against last month's 1st to 12th.
 */
export function previousRange(period: PeriodKind, from: string, to: string): { from: string; to: string } {
  if (period === 'day') return { from: shiftDateKey(from, -1), to: shiftDateKey(to, -1) };
  if (period === 'week') return { from: shiftDateKey(from, -7), to: shiftDateKey(to, -7) };
  if (period === 'month') {
    const prevEnd = shiftDateKey(monthStart(from), -1);
    const prevStart = monthStart(prevEnd);
    if (to === monthEnd(from)) return { from: prevStart, to: prevEnd };
    const same = shiftDateKey(prevStart, daysInRange(monthStart(from), to) - 1);
    return { from: prevStart, to: same > prevEnd ? prevEnd : same };
  }
  const length = daysInRange(from, to);
  return { from: shiftDateKey(from, -length), to: shiftDateKey(from, -1) };
}

/** How finely to break a period down when the person has not said: hours for a day, then days, weeks, months as it grows. */
export function autoGrouping(from: string, to: string): Grouping {
  const days = daysInRange(from, to);
  if (days === 1) return 'hour';
  if (days <= 45) return 'day';
  if (days <= 190) return 'week';
  return 'month';
}

const localParts = (at: Date) => new Date(at.getTime() + EAT_OFFSET_MINUTES * 60_000);
const short = (key: string, opts: Intl.DateTimeFormatOptions) => new Date(`${key}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', ...opts });

export type Bucket = { key: string; label: string; from: string; to: string };

/** Every bucket in the period, empty ones included, so a quiet day shows as nothing rather than disappearing. */
export function buckets(from: string, to: string, grouping: Grouping): Bucket[] {
  if (grouping === 'hour') {
    return Array.from({ length: 24 }, (_, h) => ({ key: `${from} ${String(h).padStart(2, '0')}`, label: `${String(h).padStart(2, '0')}:00`, from, to: from }));
  }
  const out: Bucket[] = [];
  let cursor = from;
  while (cursor <= to) {
    const start = grouping === 'week' ? weekStart(cursor) : grouping === 'month' ? monthStart(cursor) : cursor;
    const end = grouping === 'week' ? shiftDateKey(start, 6) : grouping === 'month' ? monthEnd(start) : start;
    const clippedFrom = start < from ? from : start;
    const clippedTo = end > to ? to : end;
    const label =
      grouping === 'day' ? short(start, { weekday: 'short', day: 'numeric', month: 'short' })
      : grouping === 'week' ? `${short(clippedFrom, { day: 'numeric', month: 'short' })} – ${short(clippedTo, { day: 'numeric', month: 'short' })}`
      : short(start, { month: 'short', year: 'numeric' });
    out.push({ key: start, label, from: clippedFrom, to: clippedTo });
    cursor = shiftDateKey(end, 1);
  }
  return out;
}

export function bucketKey(at: Date, grouping: Grouping): string {
  const day = localDateKey(at);
  if (grouping === 'hour') return `${day} ${String(localParts(at).getUTCHours()).padStart(2, '0')}`;
  if (grouping === 'week') return weekStart(day);
  if (grouping === 'month') return monthStart(day);
  return day;
}

export function series(orders: OrderFact[], payments: PaymentFact[], from: string, to: string, grouping: Grouping) {
  const rows = buckets(from, to, grouping).map((b) => ({ ...b, placed: 0, sales: 0, revenue: 0, units: 0, unpaid: 0, closed: 0, received: 0 }));
  const byKey = new Map(rows.map((r) => [r.key, r]));
  for (const o of orders) {
    const row = byKey.get(bucketKey(o.placedAt, grouping));
    if (!row) continue;
    row.placed += 1;
    if (isSale(o)) { row.sales += 1; row.revenue = round2(row.revenue + o.total); row.units += unitsOf(o); }
    else if (isUnpaid(o)) row.unpaid += 1;
    else if (isClosed(o)) row.closed += 1;
  }
  for (const p of payments) {
    const row = byKey.get(bucketKey(p.receivedAt, grouping));
    if (row) row.received = round2(row.received + p.amount);
  }
  return rows;
}

// --- the headline figures ----------------------------------------------------------------------------------------------

export function summarise(orders: OrderFact[], payments: PaymentFact[]) {
  const sales = orders.filter(isSale);
  const unpaid = orders.filter(isUnpaid);
  const cancelled = orders.filter((o) => o.status === 'CANCELLED');
  const refunded = orders.filter((o) => o.status === 'REFUNDED');
  const closed = orders.filter(isClosed);
  const revenue = round2(sum(sales, (o) => o.total));
  const website = orders.filter((o) => o.channel === 'WEBSITE' && !isClosed(o));
  const websitePaid = website.filter(isSale).length;

  return {
    placed: { count: orders.length, value: round2(sum(orders, (o) => o.total)) },
    sales: {
      count: sales.length,
      revenue,
      averageOrder: sales.length ? round2(revenue / sales.length) : 0,
      units: sum(sales, unitsOf),
      unitsPerSale: sales.length ? round2(sum(sales, unitsOf) / sales.length) : 0,
      /** Money recorded against these sales, whenever it came in. */
      paid: round2(sum(sales, (o) => Math.min(o.amountPaid, o.total))),
      /** What is still owed on them: delivered or part-paid orders with money not recorded. */
      owed: round2(sum(sales, (o) => Math.max(0, o.total - o.amountPaid))),
      owedCount: sales.filter((o) => o.total - o.amountPaid > 0.001).length,
    },
    unpaid: { count: unpaid.length, value: round2(sum(unpaid, (o) => o.total)), partPaid: round2(sum(unpaid, (o) => o.amountPaid)) },
    cancelled: { count: cancelled.length, value: round2(sum(cancelled, (o) => o.total)) },
    refunded: { count: refunded.length, value: round2(sum(refunded, (o) => o.total)) },
    /** Share of all orders in the period that ended cancelled or refunded. */
    cancellationRate: orders.length ? round2((closed.length / orders.length) * 100) : null,
    /** Money recorded on orders that were then cancelled or refunded: worth checking it went back. */
    moneyOnClosed: { amount: round2(sum(closed, (o) => o.amountPaid)), count: closed.filter((o) => o.amountPaid > 0).length },
    goods: {
      itemsValue: round2(sum(sales, (o) => o.subtotal)),
      discounts: round2(sum(sales, (o) => o.discount + sum(o.lines, (l) => l.discount))),
      shipping: round2(sum(sales, (o) => o.shipping)),
      tax: round2(sum(sales, (o) => o.tax)),
    },
    /** Of the website orders not cancelled, how many were paid for. */
    website: { placed: website.length, paid: websitePaid, paidRate: website.length ? round2((websitePaid / website.length) * 100) : null },
    received: received(payments),
  };
}

export function received(payments: PaymentFact[]) {
  const byMethod = new Map<string, { method: string; count: number; amount: number }>();
  for (const p of payments) {
    const row = byMethod.get(p.method) ?? { method: p.method, count: 0, amount: 0 };
    row.count += 1;
    row.amount = round2(row.amount + p.amount);
    byMethod.set(p.method, row);
  }
  return {
    total: round2(sum(payments, (p) => p.amount)),
    fromOrders: round2(sum(payments.filter((p) => p.source === 'ORDER'), (p) => p.amount)),
    fromPickups: round2(sum(payments.filter((p) => p.source === 'CONSIGNMENT'), (p) => p.amount)),
    onClosedOrders: round2(sum(payments.filter((p) => p.orderStatus && CLOSED_STATUSES.includes(p.orderStatus)), (p) => p.amount)),
    byMethod: [...byMethod.values()].sort((a, b) => b.amount - a.amount),
  };
}

/**
 * Gross profit on the period's sales, from the buying price on each product. What the shopper paid for goods (the total less delivery and
 * tax) less what the goods cost. A line with no buying price recorded counts as no cost, so the report says how many there are: the
 * profit reads high until they are filled in.
 */
export function margin(orders: OrderFact[]) {
  const sales = orders.filter(isSale);
  const goodsRevenue = round2(sum(sales, (o) => o.total - o.shipping - o.tax));
  const lines = sales.flatMap((o) => o.lines);
  const cost = round2(sum(lines, (l) => (l.unitCost ?? 0) * l.quantity));
  const unitsWithoutCost = sum(lines.filter((l) => l.unitCost === null), (l) => l.quantity);
  return {
    goodsRevenue, cost, grossProfit: round2(goodsRevenue - cost),
    marginPercent: goodsRevenue > 0 ? round2(((goodsRevenue - cost) / goodsRevenue) * 100) : null,
    unitsWithoutCost,
  };
}

// --- breakdowns ----------------------------------------------------------------------------------------------------------

function splitBy(orders: OrderFact[], keyOf: (o: OrderFact) => string, nameOf: (o: OrderFact) => string = keyOf) {
  const rows = new Map<string, { key: string; name: string; placed: number; sales: number; revenue: number; unpaid: number; closed: number }>();
  for (const o of orders) {
    const key = keyOf(o);
    const row = rows.get(key) ?? { key, name: nameOf(o), placed: 0, sales: 0, revenue: 0, unpaid: 0, closed: 0 };
    row.placed += 1;
    if (isSale(o)) { row.sales += 1; row.revenue = round2(row.revenue + o.total); }
    else if (isUnpaid(o)) row.unpaid += 1;
    else if (isClosed(o)) row.closed += 1;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => b.revenue - a.revenue || b.placed - a.placed);
}

export function breakdowns(orders: OrderFact[], limit = 10) {
  const byStatus = new Map<string, { status: string; count: number; value: number }>();
  for (const o of orders) {
    const row = byStatus.get(o.status) ?? { status: o.status, count: 0, value: 0 };
    row.count += 1;
    row.value = round2(row.value + o.total);
    byStatus.set(o.status, row);
  }
  const products = new Map<string, { productId: string; name: string; units: number; revenue: number }>();
  const buyers = new Map<string, { name: string; orders: number; revenue: number }>();
  for (const o of orders.filter(isSale)) {
    for (const l of o.lines) {
      const row = products.get(l.productId) ?? { productId: l.productId, name: l.productName, units: 0, revenue: 0 };
      row.units += l.quantity;
      row.revenue = round2(row.revenue + l.lineTotal);
      products.set(l.productId, row);
    }
    if (o.buyerKey) {
      const row = buyers.get(o.buyerKey) ?? { name: o.buyerName || 'Customer', orders: 0, revenue: 0 };
      row.orders += 1;
      row.revenue = round2(row.revenue + o.total);
      buyers.set(o.buyerKey, row);
    }
  }
  return {
    byStatus: [...byStatus.values()],
    byChannel: splitBy(orders, (o) => o.channel),
    byPriceList: splitBy(orders, (o) => o.priceTier),
    byStore: splitBy(orders, (o) => o.storeId, (o) => o.storeName),
    byStaff: splitBy(orders, (o) => o.createdBy),
    topProducts: [...products.values()].sort((a, b) => b.revenue - a.revenue || b.units - a.units).slice(0, limit),
    topCustomers: [...buyers.values()].sort((a, b) => b.revenue - a.revenue || b.orders - a.orders).slice(0, limit),
  };
}

/** The change in each headline figure against the comparison period; null where there was nothing to compare with. */
export function changes(now: ReturnType<typeof summarise>, before: ReturnType<typeof summarise>) {
  return {
    revenue: pctChange(now.sales.revenue, before.sales.revenue),
    sales: pctChange(now.sales.count, before.sales.count),
    averageOrder: pctChange(now.sales.averageOrder, before.sales.averageOrder),
    units: pctChange(now.sales.units, before.sales.units),
    received: pctChange(now.received.total, before.received.total),
    placed: pctChange(now.placed.count, before.placed.count),
    closed: pctChange(now.cancelled.count + now.refunded.count, before.cancelled.count + before.refunded.count),
  };
}
