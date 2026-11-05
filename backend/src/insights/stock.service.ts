import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 24 * 3600_000;
const num = (v: unknown) => Number(v ?? 0);
const LIVE_LINES = ['SHOP', 'WATCH'] as const;

/**
 * Where the stock is tied up and where demand is going unserved, in lists staff can act on:
 *  - dead stock: on the shelf, not sold for a long time (money sitting there)
 *  - running low: selling steadily and nearly gone (reorder before it sells out)
 *  - off the shelf but wanted: nothing in stock, yet people still look at it or ask on WhatsApp
 *
 * Shoes and watches only. Kits are printed to order and are never on a shelf, so "no stock" says nothing about them.
 */
@Injectable()
export class StockService {
  constructor(private prisma: PrismaService) {}

  async stock(from: Date, to: Date, deadDays = 60) {
    const now = new Date();
    const windowDays = Math.max(1, (to.getTime() - from.getTime()) / DAY_MS);
    const counted = { status: { notIn: ['CANCELLED', 'REFUNDED'] as any } };

    const [products, lines, lastSold, events] = await Promise.all([
      this.prisma.product.findMany({
        where: { isActive: true, line: { in: [...LIVE_LINES] } },
        select: {
          id: true, name: true, slug: true, line: true, createdAt: true,
          variants: { where: { isActive: true }, select: { priceKes: true, costKes: true, stock: { select: { quantity: true } } } },
        },
      }),
      this.prisma.orderLine.findMany({
        where: { order: { ...counted, placedAt: { gte: from, lte: to } } },
        select: { quantity: true, variant: { select: { productId: true } } },
      }),
      this.prisma.$queryRaw<Array<{ productId: string; lastSold: Date }>>(Prisma.sql`
        SELECT v."productId" AS "productId", max(o."placedAt") AS "lastSold"
        FROM "OrderLine" l JOIN "Order" o ON o.id = l."orderId" JOIN "ProductVariant" v ON v.id = l."variantId"
        WHERE o.status NOT IN ('CANCELLED', 'REFUNDED')
        GROUP BY v."productId"
      `),
      this.prisma.$queryRaw<Array<{ slug: string; views: number; carts: number; whatsapp: number }>>(Prisma.sql`
        SELECT "productSlug" AS slug,
          count(DISTINCT "sessionId") FILTER (WHERE type = 'VIEW_PRODUCT')::int AS views,
          count(DISTINCT "sessionId") FILTER (WHERE type = 'ADD_TO_CART')::int AS carts,
          count(DISTINCT "sessionId") FILTER (WHERE type = 'WHATSAPP_CLICK')::int AS whatsapp
        FROM "StorefrontEvent"
        WHERE "productSlug" IS NOT NULL
          AND "createdAt" BETWEEN (${from}::timestamptz AT TIME ZONE 'UTC') AND (${to}::timestamptz AT TIME ZONE 'UTC')
        GROUP BY "productSlug"
      `),
    ]);

    const lastSoldBy = new Map(lastSold.map((r) => [r.productId, r.lastSold]));
    const eventsBy = new Map(events.map((e) => [e.slug, e]));
    const soldBy = new Map<string, number>();
    for (const l of lines) soldBy.set(l.variant.productId, (soldBy.get(l.variant.productId) ?? 0) + l.quantity);

    // Per product: units on the shelf, what they would sell for, and what they cost where that is known.
    const rows = products.map((p) => {
      let units = 0, retail = 0, cost = 0, costed = 0, stocked = 0, tied = 0;
      for (const v of p.variants) {
        const q = v.stock.reduce((s, x) => s + x.quantity, 0);
        if (q <= 0) continue;
        stocked += 1;
        units += q;
        retail += q * num(v.priceKes);
        if (v.costKes !== null) { cost += q * num(v.costKes); costed += 1; tied += q * num(v.costKes); } else tied += q * num(v.priceKes);
      }
      const basis: 'cost' | 'price' | 'mixed' = stocked === 0 || costed === stocked ? 'cost' : costed === 0 ? 'price' : 'mixed';
      return { p, units, retail, cost, tied, basis, withoutCost: stocked - costed };
    });

    const onHand = {
      units: rows.reduce((s, r) => s + r.units, 0),
      retailValueKes: rows.reduce((s, r) => s + r.retail, 0),
      costValueKes: rows.reduce((s, r) => s + r.cost, 0),
      productsWithoutCost: rows.filter((r) => r.units > 0 && r.withoutCost > 0).length,
    };

    const dead = rows
      .filter((r) => r.units > 0 && now.getTime() - (lastSoldBy.get(r.p.id) ?? r.p.createdAt).getTime() > deadDays * DAY_MS)
      .map((r) => {
        const last = lastSoldBy.get(r.p.id);
        return {
          slug: r.p.slug, name: r.p.name, line: r.p.line, units: r.units, valueKes: r.tied, basis: r.basis,
          daysSinceSale: last ? Math.floor((now.getTime() - last.getTime()) / DAY_MS) : null,
          onShelfDays: Math.floor((now.getTime() - r.p.createdAt.getTime()) / DAY_MS),
        };
      })
      .sort((a, b) => b.valueKes - a.valueKes);

    const low = rows
      .map((r) => {
        const sold = soldBy.get(r.p.id) ?? 0;
        const perDay = sold / windowDays;
        return { slug: r.p.slug, name: r.p.name, line: r.p.line, units: r.units, soldInPeriod: sold, coverDays: perDay > 0 ? Math.round(r.units / perDay) : null };
      })
      .filter((r) => r.soldInPeriod >= 3 && r.units > 0 && r.coverDays !== null && r.coverDays <= 14)
      .sort((a, b) => (a.coverDays ?? 0) - (b.coverDays ?? 0));

    const missed = rows
      .filter((r) => r.units <= 0)
      .map((r) => {
        const e = eventsBy.get(r.p.slug);
        return { slug: r.p.slug, name: r.p.name, line: r.p.line, views: e?.views ?? 0, carts: e?.carts ?? 0, whatsapp: e?.whatsapp ?? 0 };
      })
      .filter((r) => r.views + r.carts + r.whatsapp > 0)
      .sort((a, b) => b.whatsapp + b.carts - (a.whatsapp + a.carts) || b.views - a.views);

    return {
      deadDays, onHand,
      deadStock: { count: dead.length, tiedUpKes: dead.reduce((s, d) => s + d.valueKes, 0), items: dead.slice(0, 15) },
      runningLow: low.slice(0, 10),
      missedDemand: missed.slice(0, 10),
    };
  }
}
