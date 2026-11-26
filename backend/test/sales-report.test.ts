import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { SalesReportService } from '../src/sales-report/sales-report.service';
import { OrderService } from '../src/order/order.service';

/** The sales report against a real scratch database (KITS_TEST_DATABASE_URL). Dates are far in the past so nothing else falls in them. */
const url = process.env.KITS_TEST_DATABASE_URL;
const db = url ? test : test.skip;
const TAG = 'SRTEST';

async function world() {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  await prisma.$connect();
  const cleanup = async () => {
    const stores = await prisma.store.findMany({ where: { code: { startsWith: TAG } }, select: { id: true } });
    const storeIds = stores.map((s) => s.id);
    await prisma.order.deleteMany({ where: { storeId: { in: storeIds } } });
    await prisma.consignment.deleteMany({ where: { storeId: { in: storeIds } } });
    await prisma.customer.deleteMany({ where: { email: { startsWith: TAG.toLowerCase() } } });
    await prisma.productVariant.deleteMany({ where: { sku: { startsWith: TAG } } });
    await prisma.product.deleteMany({ where: { sku: { startsWith: TAG } } });
    await prisma.store.deleteMany({ where: { id: { in: storeIds } } });
  };
  await cleanup();
  const store = await prisma.store.create({ data: { code: `${TAG}-A`, name: 'Report A' } });
  const product = await prisma.product.create({ data: { sku: `${TAG}-P`, slug: `${TAG.toLowerCase()}-p`, name: 'Report Shoe' } as any });
  const variant = await prisma.productVariant.create({ data: { productId: product.id, sku: `${TAG}-V`, name: 'EUR 42', priceKes: 4000, costKes: 2500 } as any });
  const wanjiku = await prisma.customer.create({ data: { firstName: 'Wanjiku', lastName: 'Kamau', email: `${TAG.toLowerCase()}-w@x.test`, phone: '+254712000111' } as any });
  let n = 0;
  const order = (placedAt: string, over: { status?: string; total?: number; paid?: number; channel?: string; customerId?: string | null; createdBy?: string; payAt?: string; name?: string; phone?: string } = {}) => {
    const total = over.total ?? 4000;
    const paid = over.paid ?? (over.status === 'PENDING' ? 0 : total);
    return prisma.order.create({
      data: {
        orderNumber: `${TAG}-${++n}`, storeId: store.id, status: (over.status ?? 'PAID') as any, channel: over.channel ?? 'IN_STORE', createdBy: over.createdBy ?? 'amina@x.test',
        customerId: over.customerId === undefined ? wanjiku.id : over.customerId, customerName: over.name, customerPhone: over.phone,
        subtotal: total, total, amountPaid: paid, placedAt: new Date(placedAt),
        lines: { create: [{ variantId: variant.id, description: 'Report Shoe - 42', quantity: 1, unitPrice: total, lineTotal: total }] },
        ...(paid ? { payments: { create: [{ amount: paid, method: 'MPESA', receivedAt: new Date(over.payAt ?? placedAt) }] } } : {}),
      },
    });
  };
  const service = new SalesReportService(prisma as any);
  return { prisma, service, store, variant, wanjiku, order, cleanup };
}
const done = async (w: Awaited<ReturnType<typeof world>>) => { await w.cleanup(); await w.prisma.$disconnect(); };

db('the report counts the period’s orders, compares with the one before, and tells new buyers from returning ones', async () => {
  const w = await world();
  try {
    await w.order('2019-03-04T08:00:00Z', { total: 3000 }); // the week before: Wanjiku's first
    await w.order('2019-03-11T08:00:00Z');
    await w.order('2019-03-12T08:00:00Z', { status: 'PENDING', channel: 'WEBSITE', createdBy: 'storefront' });
    await w.order('2019-03-12T09:00:00Z', { status: 'CANCELLED', paid: 500 });
    await w.order('2019-03-13T22:30:00Z', { customerId: null, phone: '0733000222', name: 'Brian' }); // 01:30 on the 14th in Nairobi
    await w.order('2019-03-13T10:00:00Z', { customerId: null }); // walk-in
    const r = await w.service.report({ from: '2019-03-11', to: '2019-03-17', period: 'week', storeId: w.store.id } as any, { withMargin: true });
    assert.deepEqual([r.summary.placed.count, r.summary.sales.count, r.summary.sales.revenue, r.summary.unpaid.count, r.summary.cancelled.count], [5, 3, 12000, 1, 1]);
    assert.deepEqual([r.comparison.from, r.comparison.to, r.comparison.summary.sales.revenue, r.comparison.changes.revenue], ['2019-03-04', '2019-03-10', 3000, 300]);
    assert.deepEqual(r.customers, { unique: 2, returning: 1, first: 1, anonymousSales: 1 });
    assert.deepEqual([r.margin!.cost, r.margin!.grossProfit], [7500, 4500]);
    assert.equal(r.grouping, 'day');
    assert.deepEqual(r.series.map((s) => s.sales), [1, 0, 1, 1, 0, 0, 0]);
    // Money received includes what was taken on the order that was later cancelled.
    assert.deepEqual([r.summary.received.total, r.summary.received.onClosedOrders, r.summary.moneyOnClosed.amount], [12500, 500, 500]);
    assert.equal((await w.service.report({ from: '2019-03-11', to: '2019-03-11', storeId: w.store.id } as any, { withMargin: false })).margin, null);
  } finally { await done(w); }
});

db('money counts on the day it came in, even for an order placed earlier, and pickup payments are added unless a channel is chosen', async () => {
  const w = await world();
  try {
    await w.order('2019-04-01T08:00:00Z', { payAt: '2019-04-20T08:00:00Z' });
    const reseller = await w.prisma.customer.create({ data: { firstName: 'Trade', lastName: 'Er', email: `${TAG.toLowerCase()}-t@x.test`, phone: '+254712000999', priceTier: 'RESELLER' } as any });
    const pickup = await w.prisma.consignment.create({ data: { reference: `${TAG}-CON`, customerId: reseller.id, storeId: w.store.id } });
    await w.prisma.consignmentPayment.create({ data: { consignmentId: pickup.id, amount: 1500, method: 'CASH', receivedAt: new Date('2019-04-20T09:00:00Z') } });
    const day = await w.service.report({ from: '2019-04-20', to: '2019-04-20', storeId: w.store.id } as any, { withMargin: false });
    assert.deepEqual([day.summary.sales.count, day.summary.received.total, day.summary.received.fromOrders, day.summary.received.fromPickups], [0, 5500, 4000, 1500]);
    const filtered = await w.service.report({ from: '2019-04-20', to: '2019-04-20', storeId: w.store.id, channel: 'IN_STORE' } as any, { withMargin: false });
    assert.deepEqual([filtered.summary.received.total, filtered.pickupMoneyIncluded], [4000, false]);
  } finally { await done(w); }
});

db('the order list shows every status, narrows by tab, search and staff, pages, and offers a message only where an order is unpaid', async () => {
  const w = await world();
  try {
    await w.order('2019-05-02T08:00:00Z', { total: 1000 });
    await w.order('2019-05-02T09:00:00Z', { status: 'PENDING', total: 2000, phone: '0712000111' });
    await w.order('2019-05-02T10:00:00Z', { status: 'CANCELLED', total: 3000, createdBy: 'brian@x.test' });
    await w.order('2019-05-02T11:00:00Z', { status: 'REFUNDED', total: 4000, paid: 0 });
    const base = { from: '2019-05-02', to: '2019-05-02', storeId: w.store.id };
    const all = await w.service.list({ ...base, take: 2 } as any);
    assert.deepEqual([all.total, all.items.length, all.sums.total], [4, 2, 10000]);
    assert.deepEqual(all.items.map((i) => i.status), ['REFUNDED', 'CANCELLED']);
    assert.deepEqual((await w.service.list({ ...base, show: 'cancelled' } as any)).items.map((i) => i.status).sort(), ['CANCELLED', 'REFUNDED']);
    const unpaid = (await w.service.list({ ...base, show: 'unpaid' } as any)).items[0];
    assert.deepEqual([unpaid.balance, unpaid.units, unpaid.items], [2000, 1, '1 x Report Shoe']);
    assert.match(unpaid.followUp!.url, /^https:\/\/wa\.me\/254712000111/);
    assert.equal((await w.service.list({ ...base, show: 'cancelled' } as any)).items[0].balance, 0, 'nothing is owed on an order that ended');
    assert.equal((await w.service.list({ ...base, staff: 'brian@x.test' } as any)).total, 1);
    assert.equal((await w.service.list({ ...base, search: `${TAG}-2` } as any)).total, 1);
    assert.deepEqual((await w.service.list({ ...base, sort: 'smallest' } as any)).items.map((i) => i.total), [1000, 2000, 3000, 4000]);
    const csv = await w.service.exportRows({ ...base, show: 'all' } as any);
    assert.deepEqual([csv.items.length, csv.total, csv.truncated, 'followUp' in csv.items[0]], [4, 4, false, false]);
  } finally { await done(w); }
});

db('cancelling an order keeps the reason, and it shows in the report', async () => {
  const w = await world();
  try {
    const made = await w.order('2019-06-03T08:00:00Z', { status: 'PENDING' });
    const quiet: any = { reverseForOrder: async () => undefined };
    const inventory: any = { record: async () => undefined };
    const orders = new OrderService(w.prisma as any, inventory, quiet, quiet, quiet, quiet, quiet);
    await orders.setStatus(made.id, 'CANCELLED' as any, undefined, '  Never paid: no reply on WhatsApp  ');
    const row = (await w.service.list({ from: '2019-06-03', to: '2019-06-03', storeId: w.store.id, show: 'cancelled' } as any)).items[0];
    assert.equal(row.closeReason, 'Never paid: no reply on WhatsApp');
    assert.ok(row.cancelledAt);
  } finally { await done(w); }
});

db('a period that cannot be right is refused', async () => {
  const w = await world();
  try {
    assert.throws(() => w.service.range({ from: '2026-11-10', to: '2026-11-01' } as any), /before the start/);
    assert.throws(() => w.service.range({ from: '2026-02-31' } as any), /not a real date/);
    assert.throws(() => w.service.range({ from: '2020-01-01', to: '2026-01-01' } as any), /at most/);
    assert.deepEqual(w.service.range({} as any, new Date('2026-11-10T22:00:00Z')), { from: '2026-11-11', to: '2026-11-11', period: 'day' });
  } finally { await done(w); }
});
