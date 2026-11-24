import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { ProductService } from '../src/product/product.service';

/** The till's item box, against a real scratch database (KITS_TEST_DATABASE_URL). */
const url = process.env.KITS_TEST_DATABASE_URL;
const db = url ? test : test.skip;
const TAG = 'VLTEST';

async function world() {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  await prisma.$connect();
  const cleanup = async () => {
    await prisma.stockLevel.deleteMany({ where: { variant: { sku: { startsWith: TAG } } } });
    await prisma.productVariant.deleteMany({ where: { sku: { startsWith: TAG } } });
    await prisma.product.deleteMany({ where: { sku: { startsWith: TAG } } });
    await prisma.store.deleteMany({ where: { code: { startsWith: TAG } } });
  };
  await cleanup();
  const service = new ProductService(prisma as any, { notify: async () => undefined, schedule: async () => undefined } as any);
  const store = await prisma.store.create({ data: { code: `${TAG}-A`, name: 'Lookup A' } });
  const other = await prisma.store.create({ data: { code: `${TAG}-B`, name: 'Lookup B' } });
  const product = (n: number, name: string, brand: string | null, over: Record<string, unknown> = {}) =>
    prisma.product.create({ data: { sku: `${TAG}-P${n}`, slug: `${TAG.toLowerCase()}-p${n}`, name, brand, imageUrls: [`https://img.test/${n}.jpg`], ...over } as any });
  const variant = (productId: string, n: number, name: string, over: Record<string, unknown> = {}) =>
    prisma.productVariant.create({ data: { productId, sku: `${TAG}-V${n}`, name, priceKes: 3800, ...over } as any });
  const stock = (variantId: string, storeId: string, quantity: number, reserved = 0) => prisma.stockLevel.create({ data: { variantId, storeId, quantity, reserved } });
  return { prisma, service, store, other, product, variant, stock, cleanup };
}

db('the item box finds a variant by any of its words, a size or a SKU, with each price list and what is sellable at the chosen store', async () => {
  const w = await world();
  try {
    const airmax = await w.product(1, 'Air Max 90 Black', 'Nike');
    const v42 = await w.variant(airmax.id, 1, 'Air Max 90 Black - EUR 42', { resellerPriceKes: 3200, wholesalePriceKes: 2900 });
    const v43 = await w.variant(airmax.id, 2, 'Air Max 90 Black - EUR 43');
    await w.stock(v42.id, w.store.id, 5, 2);
    await w.stock(v43.id, w.other.id, 9); // on the shelf, but at the other shop

    const find = (q: string, storeId = w.store.id) => w.service.variantLookup(q, storeId);
    assert.deepEqual((await find('air max 42')).map((r) => r.variantId), [v42.id]);
    assert.deepEqual((await find('nike black')).map((r) => r.variantId).sort(), [v42.id, v43.id].sort());
    assert.deepEqual((await find(`${TAG}-v2`)).map((r) => r.variantId), [v43.id]);
    assert.deepEqual((await find('90 eur 43 NIKE')).map((r) => r.variantId), [v43.id], 'any order, any case');

    const r = (await find('air max 42'))[0];
    assert.deepEqual([r.priceKes, r.resellerPriceKes, r.wholesalePriceKes], [3800, 3200, 2900]);
    assert.deepEqual([r.sellable, r.mustOrder, r.brand, r.imageUrl], [3, false, 'Nike', 'https://img.test/1.jpg']);
    // Another shop's shelf does not count: the pair is here only if it is here.
    const elsewhere = (await find('air max 43'))[0];
    assert.deepEqual([elsewhere.sellable, elsewhere.mustOrder], [0, true]);
    assert.equal((await find('air max 43', w.other.id))[0].sellable, 9);
  } finally { await w.cleanup(); await w.prisma.$disconnect(); }
});

db('things on the shelf come first; sold-out, drop-ship and inactive are handled; one letter or a percent sign matches nothing odd', async () => {
  const w = await world();
  try {
    const p = await w.product(2, 'Court Classic', 'Adidas');
    const out = await w.variant(p.id, 3, 'Court Classic - EUR 40');
    const inStock = await w.variant(p.id, 4, 'Court Classic - EUR 41');
    const drop = await w.variant(p.id, 5, 'Court Classic - EUR 44', { isDropShip: true });
    const off = await w.variant(p.id, 6, 'Court Classic - EUR 45', { isActive: false });
    await w.stock(inStock.id, w.store.id, 2);
    await w.stock(drop.id, w.store.id, 7); // a drop-ship variant is never really on the shelf, whatever a stray row says

    const rows = await w.service.variantLookup('court classic', w.store.id);
    assert.equal(rows[0].variantId, inStock.id, 'in stock first');
    assert.ok(!rows.some((r) => r.variantId === off.id), 'an inactive variant cannot be sold');
    assert.deepEqual(rows.find((r) => r.variantId === out.id)?.mustOrder, true);
    assert.deepEqual(rows.find((r) => r.variantId === drop.id)?.mustOrder, true);

    assert.deepEqual(await w.service.variantLookup('c', w.store.id), []);
    assert.deepEqual(await w.service.variantLookup('', w.store.id), []);
    assert.deepEqual(await w.service.variantLookup('%%', w.store.id), []);
    // With no store named, nothing is claimed to be on a shelf.
    assert.ok((await w.service.variantLookup('court classic')).every((r) => r.sellable === 0));
  } finally { await w.cleanup(); await w.prisma.$disconnect(); }
});
