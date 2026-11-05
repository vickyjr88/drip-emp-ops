import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 24 * 3600_000;

/** A phone number written any way (0712 345 678, +254 712 345 678) as one key; null when it is too short to be a number. */
export function phoneKey(phone?: string | null): string | null {
  let digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 7) return null;
  if (digits.length === 10 && digits.startsWith('0')) digits = `254${digits.slice(1)}`;
  else if (digits.length === 9 && /^[17]/.test(digits)) digits = `254${digits}`;
  return digits;
}

export type BuyerOrder = { id: string; customerId: string | null; phone: string | null; email: string | null; name: string | null; total: unknown; placedAt: Date };

/**
 * Who a buyer is. The phone number comes first, because most of this shop's sales close in WhatsApp and arrive as a phone
 * number before they are ever a customer account; then the email, then the account. An order with none of them (a walk-in
 * at the counter who left no number) cannot be recognised again and counts as a one-off.
 */
export function buyerKey(order: Pick<BuyerOrder, 'id' | 'customerId' | 'phone' | 'email'>): string {
  const phone = phoneKey(order.phone);
  if (phone) return `p:${phone}`;
  const email = (order.email ?? '').trim().toLowerCase();
  if (email) return `e:${email}`;
  if (order.customerId) return `c:${order.customerId}`;
  return `o:${order.id}`;
}

type Buyer = { key: string; name: string; phone: string | null; orders: number; spendKes: number; first: Date; last: Date; recognisable: boolean };

export function groupBuyers(orders: BuyerOrder[]): Buyer[] {
  const byKey = new Map<string, Buyer>();
  for (const o of [...orders].sort((a, b) => a.placedAt.getTime() - b.placedAt.getTime())) {
    const key = buyerKey(o);
    const name = (o.name ?? '').trim();
    const b = byKey.get(key) ?? { key, name, phone: null, orders: 0, spendKes: 0, first: o.placedAt, last: o.placedAt, recognisable: !key.startsWith('o:') };
    b.orders += 1;
    b.spendKes += Number(o.total);
    b.last = o.placedAt;
    if (name) b.name = name;
    const p = phoneKey(o.phone);
    if (p) b.phone = p;
    byKey.set(key, b);
  }
  return Array.from(byKey.values());
}

export function summariseBuyers(orders: BuyerOrder[], from: Date, to: Date, now: Date, lapseDays: number) {
  const buyers = groupBuyers(orders);
  const windowOrders = orders.filter((o) => o.placedAt >= from && o.placedAt <= to);
  const windowSpend = new Map<string, number>();
  for (const o of windowOrders) windowSpend.set(buyerKey(o), (windowSpend.get(buyerKey(o)) ?? 0) + Number(o.total));
  const inWindow = buyers.filter((b) => windowSpend.has(b.key));
  const firstTimers = inWindow.filter((b) => b.first >= from && b.first <= to);
  const returning = inWindow.filter((b) => b.first < from);

  const returningKeys = new Set(returning.map((b) => b.key));
  const windowRevenue = windowOrders.reduce((s, o) => s + Number(o.total), 0);
  const returningRevenue = windowOrders.filter((o) => returningKeys.has(buyerKey(o))).reduce((s, o) => s + Number(o.total), 0);

  const everBought = buyers.filter((b) => b.recognisable);
  const quiet = everBought.filter((b) => now.getTime() - b.last.getTime() > lapseDays * DAY_MS);
  const lapsed = [...quiet]
    // The ones worth a message first: bought more than once, then those who spent the most.
    .sort((a, b) => Number(b.orders > 1) - Number(a.orders > 1) || b.spendKes - a.spendKes)
    .slice(0, 20)
    .map((b) => ({ name: b.name || 'No name', phone: b.phone, orders: b.orders, spendKes: b.spendKes, lastOrder: b.last.toISOString().slice(0, 10), daysAgo: Math.floor((now.getTime() - b.last.getTime()) / DAY_MS) }));

  return {
    lapseDays,
    buyers: inWindow.length,
    newBuyers: firstTimers.length,
    returningBuyers: returning.length,
    /** Of the people who bought in the period, the share who had bought before it. */
    repeatRate: inWindow.length ? returning.length / inWindow.length : 0,
    /** Of the money taken in the period, the share from people who had bought before it. */
    repeatRevenueShare: windowRevenue > 0 ? returningRevenue / windowRevenue : 0,
    averageOrderKes: windowOrders.length ? windowRevenue / windowOrders.length : 0,
    /** All-time, over buyers who can be recognised again. */
    averageLifetimeKes: everBought.length ? everBought.reduce((s, b) => s + b.spendKes, 0) / everBought.length : 0,
    averageOrdersPerBuyer: everBought.length ? everBought.reduce((s, b) => s + b.orders, 0) / everBought.length : 0,
    unrecognisedOrders: windowOrders.filter((o) => buyerKey(o).startsWith('o:')).length,
    lapsed,
    lapsedCount: quiet.length,
    top: inWindow
      .map((b) => ({ b, spent: windowSpend.get(b.key) ?? 0 }))
      .sort((x, y) => y.spent - x.spent)
      .slice(0, 8)
      .map(({ b, spent }) => ({ name: b.name || 'No name', phone: b.phone, orders: b.orders, spentInPeriodKes: spent, lifetimeKes: b.spendKes })),
  };
}

@Injectable()
export class BuyersService {
  constructor(private prisma: PrismaService) {}

  /** Retail buyers only: a reseller or wholesaler buying stock outright has a different rhythm and would blur every average. */
  async buyers(from: Date, to: Date, lapseDays = 60) {
    const rows = await this.prisma.order.findMany({
      where: { status: { notIn: ['CANCELLED', 'REFUNDED'] }, priceTier: 'RETAIL' },
      select: { id: true, customerId: true, customerPhone: true, customerEmail: true, customerName: true, total: true, placedAt: true },
    });
    const orders: BuyerOrder[] = rows.map((r) => ({ id: r.id, customerId: r.customerId, phone: r.customerPhone, email: r.customerEmail, name: r.customerName, total: r.total, placedAt: r.placedAt }));
    return summariseBuyers(orders, from, to, new Date(), lapseDays);
  }
}
