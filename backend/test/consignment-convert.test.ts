import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { ConsignmentService } from '../src/consignment/consignment.service';
import { LedgerService } from '../src/ledger/ledger.service';
import { SalesPostingService } from '../src/sales-posting/sales-posting.service';

/**
 * Turning a pickup into an order, against a real scratch database (KITS_TEST_DATABASE_URL, with the default chart of accounts in it).
 * The point is that nothing is counted twice: stock, cost of goods and money owed each move once.
 */
const url = process.env.KITS_TEST_DATABASE_URL;
const db = url ? test : test.skip;
const TAG = 'CVTEST';

async function world() {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  await prisma.$connect();
  const cleanup = async () => {
    const orders = await prisma.order.findMany({ where: { customer: { email: { startsWith: TAG.toLowerCase() } } }, select: { id: true } });
    const ids = orders.map((o) => o.id);
    await prisma.journalEntry.deleteMany({ where: { OR: [{ sourceId: { in: ids } }, { sourceId: { startsWith: 'CON-' }, memo: { contains: TAG } }] } });
    await prisma.orderLine.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
    await prisma.consignment.deleteMany({ where: { customer: { email: { startsWith: TAG.toLowerCase() } } } });
    await prisma.stockMovement.deleteMany({ where: { variant: { sku: { startsWith: TAG } } } });
    await prisma.stockLevel.deleteMany({ where: { variant: { sku: { startsWith: TAG } } } });
    await prisma.productVariant.deleteMany({ where: { sku: { startsWith: TAG } } });
    await prisma.product.deleteMany({ where: { sku: { startsWith: TAG } } });
    await prisma.customer.deleteMany({ where: { email: { startsWith: TAG.toLowerCase() } } });
    await prisma.store.deleteMany({ where: { code: { startsWith: TAG } } });
  };
  await cleanup();
  const service = new ConsignmentService(prisma as any, new SalesPostingService(prisma as any, new LedgerService(prisma as any)));
  const store = await prisma.store.create({ data: { code: `${TAG}-A`, name: 'Convert A' } });
  const product = await prisma.product.create({ data: { sku: `${TAG}-P`, slug: `${TAG.toLowerCase()}-p`, name: 'Convert Shoe' } as any });
  const variant = await prisma.productVariant.create({ data: { productId: product.id, sku: `${TAG}-V`, name: 'Convert Shoe - 42', priceKes: 4000, resellerPriceKes: 3500, costKes: 2000 } as any });
  await prisma.stockLevel.create({ data: { variantId: variant.id, storeId: store.id, quantity: 10 } });
  const reseller = await prisma.customer.create({ data: { firstName: 'Trade', lastName: 'Er', email: `${TAG.toLowerCase()}@x.test`, phone: '0712000111', priceTier: 'RESELLER', businessName: 'Trade Er Shoes' } as any });
  const pickup = await service.create({ customerId: reseller.id, storeId: store.id, lines: [{ variantId: variant.id, quantity: 4 }] } as any, 'tester');
  return { prisma, service, store, variant, reseller, pickup, cleanup };
}

db('what is still out becomes an order at the agreed prices, with stock and cost booked once and the debt on the order alone', async () => {
  const w = await world();
  try {
    // Two were reported sold and one came back; one is still out.
    const line = w.pickup.lines[0];
    await w.service.settle(w.pickup.id, { lines: [{ lineId: line.id, sold: 2, returned: 1 }] } as any, 'tester');
    const soldValueBefore = Number((await w.prisma.consignment.findUniqueOrThrow({ where: { id: w.pickup.id } })).soldValue);

    const result = await w.service.convertToOrder(w.pickup.id, 'tester');
    assert.equal(result.pairs, 1);
    assert.equal(result.total, 3500);

    const order = await w.prisma.order.findUniqueOrThrow({ where: { id: result.orderId }, include: { lines: true } });
    assert.deepEqual([order.channel, order.status, order.priceTier, Number(order.total), order.customerId], ['CONSIGNMENT', 'PENDING', 'RESELLER', 3500, w.reseller.id]);
    assert.equal(order.lines.length, 1);
    assert.deepEqual([order.lines[0].quantity, Number(order.lines[0].unitPrice)], [1, 3500]);

    // Stock: nothing left out; the order took nothing off the floor (10 - 4 out + 1 returned = 7).
    const level = await w.prisma.stockLevel.findUniqueOrThrow({ where: { variantId_storeId: { variantId: w.variant.id, storeId: w.store.id } } });
    assert.deepEqual([level.quantity, level.onConsignment], [7, 0]);
    const sale = await w.prisma.stockMovement.count({ where: { variantId: w.variant.id, type: 'SALE' } });
    assert.equal(sale, 0, 'no SALE movement: the pair was never on the floor');

    // Cost of goods: the 2 reported sold (on the pickup) plus the 1 kept (on the order), each once.
    const orderCost = await w.prisma.journalEntry.findMany({ where: { source: 'SALES', sourceId: order.id, memo: { contains: 'cost of goods' } } });
    assert.equal(orderCost.length, 1);

    // The pickup is closed, and does not also claim the money.
    const pickup = await w.prisma.consignment.findUniqueOrThrow({ where: { id: w.pickup.id } });
    assert.equal(pickup.status, 'SETTLED');
    assert.equal(Number(pickup.soldValue), soldValueBefore);
    assert.match(pickup.notes ?? '', new RegExp(order.orderNumber));

    // Delivering the order later must not book the cost a second time.
    const posting = new SalesPostingService(w.prisma as any, new LedgerService(w.prisma as any));
    assert.equal(await posting.postOrderCost(order.id), null);

    // And it cannot be converted twice.
    await assert.rejects(() => w.service.convertToOrder(w.pickup.id, 'tester'), /already settled/);
  } finally {
    await w.cleanup();
    await w.prisma.$disconnect();
  }
});

db('a pickup that is already closed cannot be converted', async () => {
  const w = await world();
  try {
    const line = w.pickup.lines[0];
    await w.service.settle(w.pickup.id, { lines: [{ lineId: line.id, returned: 4 }] } as any, 'tester');
    await assert.rejects(() => w.service.convertToOrder(w.pickup.id, 'tester'), /already settled/);
  } finally {
    await w.cleanup();
    await w.prisma.$disconnect();
  }
});
