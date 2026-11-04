import type { Comparison, DaySummary, Seller, StockItem } from './daily-report.types';

/** Statuses that mean the customer has paid. Revenue counts these and nothing else. */
export const CONFIRMED_STATUSES = ['PAID', 'PACKED', 'SHIPPED', 'DELIVERED'];

export type OrderFact = {
  orderNumber: string;
  status: string;
  total: number;
  lines: { variantId: string; sku: string; productName: string; quantity: number; lineTotal: number }[];
};

export function summariseDay(orders: OrderFact[], collected: number): DaySummary {
  const confirmed = orders.filter((o) => CONFIRMED_STATUSES.includes(o.status));
  const revenue = confirmed.reduce((sum, o) => sum + o.total, 0);
  const items = confirmed.reduce((sum, o) => sum + o.lines.reduce((n, l) => n + l.quantity, 0), 0);
  return {
    orders: orders.length,
    cancelled: orders.filter((o) => o.status === 'CANCELLED').length,
    unpaid: orders.filter((o) => o.status === 'PENDING').length,
    confirmed: confirmed.length,
    revenue,
    items,
    averageOrder: confirmed.length ? revenue / confirmed.length : 0,
    collected,
  };
}

/** Percent change, or null when there is nothing earlier to compare with (0 to 5 is not "infinite percent"). */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

export function compare(label: string, today: DaySummary, earlier: DaySummary): Comparison {
  return {
    label,
    revenue: earlier.revenue,
    orders: earlier.confirmed,
    revenueChange: pctChange(today.revenue, earlier.revenue),
    ordersChange: pctChange(today.confirmed, earlier.confirmed),
  };
}

export function topSellers(orders: OrderFact[], limit: number): Seller[] {
  const byProduct = new Map<string, Seller>();
  for (const order of orders) {
    if (!CONFIRMED_STATUSES.includes(order.status)) continue;
    for (const line of order.lines) {
      const seller = byProduct.get(line.productName) ?? { name: line.productName, units: 0, revenue: 0 };
      seller.units += line.quantity;
      seller.revenue += line.lineTotal;
      byProduct.set(line.productName, seller);
    }
  }
  return [...byProduct.values()].sort((a, b) => b.units - a.units || b.revenue - a.revenue).slice(0, limit);
}

/** Distinct sizes that sold in confirmed orders, which are the only ones worth a stock warning. */
export function soldVariants(orders: OrderFact[]): { variantId: string; sku: string; name: string }[] {
  const seen = new Map<string, { variantId: string; sku: string; name: string }>();
  for (const order of orders) {
    if (!CONFIRMED_STATUSES.includes(order.status)) continue;
    for (const line of order.lines) {
      if (!seen.has(line.variantId)) seen.set(line.variantId, { variantId: line.variantId, sku: line.sku, name: line.productName });
    }
  }
  return [...seen.values()];
}

/**
 * Only sizes that sold are checked. A shop-wide "out of stock" list is mostly noise (sizes that were never stocked);
 * a size that sold yesterday and is now gone is a restocking decision.
 */
export function classifyStock(
  sold: { variantId: string; sku: string; name: string }[],
  onHand: Map<string, number>,
  lowAt = 3,
): { soldOut: StockItem[]; low: StockItem[] } {
  const soldOut: StockItem[] = [];
  const low: StockItem[] = [];
  for (const v of sold) {
    const qty = onHand.get(v.variantId) ?? 0;
    const item = { name: v.name, sku: v.sku, onHand: qty };
    if (qty <= 0) soldOut.push(item);
    else if (qty <= lowAt) low.push(item);
  }
  return { soldOut, low };
}

export function formatMoney(amount: number, currency = 'KES') {
  return `${currency} ${Math.round(amount).toLocaleString('en-KE')}`;
}

export function formatChange(change: number | null): string {
  if (change === null) return 'new';
  const rounded = Math.round(change);
  if (rounded === 0) return 'no change';
  return `${rounded > 0 ? '+' : '-'}${Math.abs(rounded)}%`;
}
