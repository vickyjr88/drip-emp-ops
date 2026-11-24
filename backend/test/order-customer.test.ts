import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { OrderService } from '../src/order/order.service';
import { InventoryService } from '../src/inventory/inventory.service';

/**
 * An order for a customer on file, against a real scratch database (KITS_TEST_DATABASE_URL): the order carries the customer's name, number and
 * email even when the caller sends only the id, a stand-in email is not copied, and the receipt is addressed to that customer.
 */
const url = process.env.KITS_TEST_DATABASE_URL;
const db = url ? test : test.skip;
const TAG = 'ordercust-test';

const quiet: any = new Proxy({}, { get: () => async () => undefined });

async function world() {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  await prisma.$connect();
  const cleanup = async () => {
    await prisma.order.deleteMany({ where: { store: { code: 'ORDERCUST-TEST' } } });
    await prisma.stockMovement.deleteMany({ where: { store: { code: 'ORDERCUST-TEST' } } });
    await prisma.stockLevel.deleteMany({ where: { store: { code: 'ORDERCUST-TEST' } } });
    await prisma.productVariant.deleteMany({ where: { sku: { startsWith: 'ORDERCUST' } } });
    await prisma.product.deleteMany({ where: { sku: { startsWith: 'ORDERCUST' } } });
    await prisma.customer.deleteMany({ where: { OR: [{ email: { startsWith: `${TAG}-` } }, { email: { endsWith: '@customer.invalid' }, phone: { startsWith: '+2547991' } }] } });
    await prisma.store.deleteMany({ where: { code: 'ORDERCUST-TEST' } });
  };
  await cleanup();
  const store = await prisma.store.create({ data: { code: 'ORDERCUST-TEST', name: 'Test Store' } });
  const product = await prisma.product.create({
    data: { sku: 'ORDERCUST-P', name: 'Test Runner', slug: 'ordercust-test-runner', variants: { create: [{ sku: 'ORDERCUST-P-42', name: 'EUR 42', priceKes: 3000, attributes: {} }] } } as any,
    include: { variants: true },
  });
  const variant = (product as any).variants[0];
  const inventory = new InventoryService(prisma as any, quiet);
  await inventory.record({ variantId: variant.id, storeId: store.id, type: 'PURCHASE', quantity: 10 } as any, 'test');
  const service = new OrderService(prisma as any, inventory, quiet, quiet, quiet, quiet, quiet);
  return { prisma, service, store, variant, cleanup };
}

db('an order sent with only a customer id carries that customer\'s name, number and real email', async () => {
  const w = await world();
  try {
    const customer = await w.prisma.customer.create({ data: { firstName: 'Wanjiku', lastName: 'Kamau', email: `${TAG}-1@example.test`, phone: '+254799100001' } });
    const order = await w.service.create({ storeId: w.store.id, customerId: customer.id, lines: [{ variantId: w.variant.id, quantity: 1 }] } as any, 'staff@example.test');
    assert.equal(order.customerName, 'Wanjiku Kamau');
    assert.equal(order.customerPhone, '+254799100001');
    assert.equal(order.customerEmail, `${TAG}-1@example.test`);

    const full = await w.service.findOne(order.id);
    assert.ok(full.receipt, 'a customer with a number gets a receipt');
    assert.equal(full.receipt!.phone, '254799100001');
    assert.match(full.receipt!.message, /^Hi Wanjiku,/);
    // The product name and size, not the stored "EUR 42 (SKU)" description.
    assert.match(full.receipt!.message, /1\. Test Runner, size EUR 42 \(x1\): KES 3,000/);
    assert.match(full.receipt!.message, /Paid: nothing yet/);
  } finally {
    await w.cleanup();
    await w.prisma.$disconnect();
  }
});

db('a customer with only a phone number is not given their stand-in email on the order', async () => {
  const w = await world();
  try {
    const customer = await w.prisma.customer.create({ data: { firstName: 'Phone', lastName: 'Only', email: '254799100002@customer.invalid', phone: '+254799100002' } });
    const order = await w.service.create({ storeId: w.store.id, customerId: customer.id, lines: [{ variantId: w.variant.id, quantity: 1 }] } as any, 'staff@example.test');
    assert.equal(order.customerEmail, null);
    assert.equal(order.customerPhone, '+254799100002');
  } finally {
    await w.cleanup();
    await w.prisma.$disconnect();
  }
});

db('what the caller sends wins over the customer record, and a walk-in has no receipt', async () => {
  const w = await world();
  try {
    const customer = await w.prisma.customer.create({ data: { firstName: 'Real', lastName: 'Name', email: `${TAG}-3@example.test`, phone: '+254799100003' } });
    const named = await w.service.create({ storeId: w.store.id, customerId: customer.id, customerName: 'Gift For Sister', customerPhone: '+254799100004', lines: [{ variantId: w.variant.id, quantity: 1 }] } as any, 'staff@example.test');
    assert.equal(named.customerName, 'Gift For Sister');
    assert.equal(named.customerPhone, '+254799100004');

    const walkIn = await w.service.create({ storeId: w.store.id, lines: [{ variantId: w.variant.id, quantity: 1 }] } as any, 'staff@example.test');
    assert.equal(walkIn.customerName, null);
    assert.equal((await w.service.findOne(walkIn.id)).receipt, null);
  } finally {
    await w.cleanup();
    await w.prisma.$disconnect();
  }
});
