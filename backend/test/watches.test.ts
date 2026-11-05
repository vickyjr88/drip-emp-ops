import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { StorefrontService } from '../src/storefront/storefront.service';
import { WatchesService } from '../src/watches/watches.service';

/**
 * Database tests: need KITS_TEST_DATABASE_URL, a SCRATCH database with every migration applied (these tests delete the
 * products they create, prefixed WTEST, and nothing else).
 */
const url = process.env.KITS_TEST_DATABASE_URL;
const db = url ? test : test.skip;

async function setup() {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  await prisma.$connect();
  await prisma.product.deleteMany({ where: { sku: { startsWith: 'WTEST' } } });
  const storefront = new StorefrontService(prisma as any);
  const watches = new WatchesService(prisma as any, storefront);
  const cat = (slug: string, parentSlug?: string) =>
    prisma.productCategory.upsert({
      where: { slug },
      update: {},
      create: { name: slug, slug, ...(parentSlug ? { parent: { connect: { slug: parentSlug } } } : {}) },
    });
  const watchCat = await cat('watches');
  const shoeCat = await cat('wtest-sneakers');
  // Earlier runs (or a failed one) may have left attributes behind.
  await prisma.categoryAttribute.deleteMany({ where: { categoryId: { in: [watchCat.id, shoeCat.id] } } });
  return { prisma, storefront, watches, watchCat, shoeCat, cat };
}

const product = (prisma: PrismaClient, sku: string, categoryId: string | null, extra: any = {}) =>
  prisma.product.create({
    data: {
      sku, name: sku, slug: sku.toLowerCase(), categoryId, imageUrls: ['https://api.test/media/x.jpg'], brand: 'Bagolee',
      variants: { create: [{ sku: `${sku}-V`, name: 'Standard', priceKes: 4500 }] }, ...extra,
    },
  });

db('the database files a product by its category: watches are watches, everything else the shoe shop, kits untouched', async () => {
  const { prisma, watchCat, shoeCat, cat } = await setup();
  const w = await product(prisma, 'WTEST-W1', watchCat.id);
  const s = await product(prisma, 'WTEST-S1', shoeCat.id);
  const none = await product(prisma, 'WTEST-N1', null);
  assert.deepEqual([w.line, s.line, none.line], ['WATCH', 'SHOP', 'SHOP']);

  // Even an explicit wrong answer is corrected: there is no route that can put a watch in the shoe shop.
  assert.equal((await product(prisma, 'WTEST-W2', watchCat.id, { line: 'SHOP' })).line, 'WATCH');
  assert.equal((await product(prisma, 'WTEST-S2', shoeCat.id, { line: 'WATCH' })).line, 'SHOP');

  // A sub-category of Watches counts.
  const sub = await cat('wtest-smart-watches', 'watches');
  assert.equal((await product(prisma, 'WTEST-W3', sub.id)).line, 'WATCH');

  // Moving a product between categories moves it between lines.
  assert.equal((await prisma.product.update({ where: { id: w.id }, data: { categoryId: shoeCat.id } })).line, 'SHOP');
  assert.equal((await prisma.product.update({ where: { id: w.id }, data: { categoryId: watchCat.id } })).line, 'WATCH');
  // An unrelated edit does not change the line.
  assert.equal((await prisma.product.update({ where: { id: w.id }, data: { name: 'renamed' } })).line, 'WATCH');

  // Kits are never touched, wherever they are filed.
  const kit = await product(prisma, 'WTEST-K1', watchCat.id, { line: 'KIT' });
  assert.equal(kit.line, 'KIT');
  assert.equal((await prisma.product.update({ where: { id: kit.id }, data: { categoryId: shoeCat.id } })).line, 'KIT');
  await prisma.product.deleteMany({ where: { sku: { startsWith: 'WTEST' } } });
  await prisma.productCategory.deleteMany({ where: { slug: { in: ['wtest-smart-watches', 'wtest-sneakers'] } } });
  await prisma.$disconnect();
});

db('a watch never appears anywhere on the shoe side, and a shoe never in the watches line (the leak test)', async () => {
  const { prisma, storefront, watches, watchCat, shoeCat } = await setup();
  const watch = await product(prisma, 'WTEST-LEAK-W', watchCat.id, { isFeatured: true, name: 'WTEST Chrono' });
  await product(prisma, 'WTEST-LEAK-S', shoeCat.id, { isFeatured: true, name: 'WTEST Runner' });
  await prisma.productVariant.updateMany({ where: { productId: watch.id }, data: { attributes: { size: 'EUR 40' } } });

  assert.equal((await storefront.list({})).some((p) => p.slug === watch.slug), false, '/shop/products');
  assert.equal((await storefront.list({ search: 'chrono' })).some((p) => p.slug === watch.slug), false, 'search');
  assert.equal((await storefront.list({ brand: 'Bagolee' })).some((p) => p.slug === watch.slug), false, 'brand filter');
  assert.equal((await storefront.list({ size: 'EUR 40' })).some((p) => p.slug === watch.slug), false, 'size filter');
  assert.equal((await storefront.featured(300)).some((p) => p.slug === watch.slug), false, 'featured rail');
  await assert.rejects(() => storefront.bySlug(watch.slug), /No product/);
  assert.equal((await storefront.categories()).some((c) => c.slug === 'watches'), false, 'the Watches category is not a shop category');
  assert.equal((await storefront.catalogCsv()).includes('WTEST-LEAK-W'), false, 'the Meta catalogue feed');
  assert.ok((await storefront.catalogCsv()).includes('WTEST-LEAK-S'));

  assert.ok((await watches.list({})).some((p) => p.slug === watch.slug));
  assert.equal((await watches.list({})).some((p) => p.slug === 'wtest-leak-s'), false);
  await assert.rejects(() => watches.bySlug('wtest-leak-s'), /No watch/);
  await prisma.product.deleteMany({ where: { sku: { startsWith: 'WTEST' } } });
  await prisma.$disconnect();
});

db('a watch has no size: none is asked for, stored or shown, even where the data still carries one', async () => {
  const { prisma, watches } = await setup();
  const single = await watches.adminCreate({ name: 'WTEST Solo', brand: 'Bagolee', priceKes: 5000, skuPrefix: 'WTEST-SOLO' } as any);
  assert.deepEqual(single!.variants.map((v) => v.name), ['Standard'], 'one watch, one variant, nothing to choose');
  const stored = await prisma.productVariant.findFirst({ where: { sku: 'WTEST-SOLO' } });
  assert.equal(stored!.attributes, null, 'no size attribute is stored');

  const choices = await watches.adminCreate({ name: 'WTEST Duo', priceKes: 6000, options: ['Black strap', 'Brown strap'], skuPrefix: 'WTEST-DUO' } as any);
  assert.deepEqual(choices!.variants.map((v) => v.sku).sort(), ['WTEST-DUO-BLACKSTRAP', 'WTEST-DUO-BROWNSTRAP']);

  // Legacy data: a watch whose variant still says "EUR 40". It is never shown as a size.
  await prisma.productVariant.update({ where: { sku: 'WTEST-SOLO' }, data: { attributes: { size: 'EUR 40' } } });
  const shown = (await watches.list({})).find((p) => p.slug === 'wtest-solo')!;
  assert.deepEqual(shown.variants.map((v: any) => v.size), [null]);
  assert.deepEqual(shown.sizesInStock, []);
  assert.deepEqual(shown.options, [], 'a single watch offers no choice');
  const duo = await watches.bySlug('wtest-duo');
  assert.deepEqual(duo.options.map((o: any) => o.name).sort(), ['Black strap', 'Brown strap']);
  assert.equal(duo.priceFrom, 6000);

  // The Watches category is created without a size attribute.
  const attrs = await prisma.categoryAttribute.count({ where: { category: { slug: 'watches' } } });
  assert.equal(attrs, 0);
  await prisma.product.deleteMany({ where: { sku: { startsWith: 'WTEST' } } });
  await prisma.$disconnect();
});

db('watches: brands, search, price filters, sorting and staff edits', async () => {
  const { prisma, watches } = await setup();
  await watches.adminCreate({ name: 'WTEST Alpha Chrono', brand: 'Alpha', priceKes: 3000, skuPrefix: 'WTEST-A' } as any);
  await watches.adminCreate({ name: 'WTEST Alpha Dress', brand: 'alpha', priceKes: 9000, skuPrefix: 'WTEST-B' } as any);
  await watches.adminCreate({ name: 'WTEST Beta Diver', brand: 'Beta', priceKes: 6000, skuPrefix: 'WTEST-C' } as any);

  const brands = (await watches.brands()).filter((b) => ['Alpha', 'alpha', 'Beta'].includes(b.name));
  assert.deepEqual(brands.map((b) => [b.slug, b.count]).sort(), [['alpha', 1], ['alpha', 1], ['beta', 1]].sort());
  assert.deepEqual((await watches.list({ brand: 'ALPHA' })).map((p) => p.name).sort(), ['WTEST Alpha Chrono', 'WTEST Alpha Dress']);
  assert.deepEqual((await watches.list({ search: 'beta diver' })).map((p) => p.name), ['WTEST Beta Diver']);
  assert.deepEqual((await watches.list({ brand: 'alpha', minPrice: '5000' })).map((p) => p.name), ['WTEST Alpha Dress']);
  assert.deepEqual((await watches.list({ search: 'wtest', sort: 'price-asc' })).map((p) => p.priceFrom), [3000, 6000, 9000]);
  assert.deepEqual((await watches.list({ search: 'wtest', sort: 'price-desc' })).map((p) => p.priceFrom), [9000, 6000, 3000]);

  const dress = (await watches.list({ search: 'dress' }))[0];
  const related = (await watches.bySlug(dress.slug)).related.map((r: any) => r.name);
  assert.ok(related.includes('WTEST Alpha Chrono') && !related.includes('WTEST Alpha Dress'), 'the same brand first, never itself');

  const edited = await watches.adminUpdate(dress.id, { isActive: false, brand: 'Gamma' });
  assert.equal(edited!.isActive, false);
  assert.equal((await watches.list({ search: 'dress' })).length, 0, 'a switched-off watch is not listed');
  await assert.rejects(() => watches.bySlug(dress.slug), /No watch/);
  await assert.rejects(() => watches.adminUpdate('nope', { name: 'x' }), /not found/i);
  await assert.rejects(() => watches.adminCreate({ name: 'dup', priceKes: 1, skuPrefix: 'WTEST-A' } as any), /already exists/);
  await prisma.product.deleteMany({ where: { sku: { startsWith: 'WTEST' } } });
  await prisma.$disconnect();
});

db('the migration moves watches already in the shop out of it, and removes their size attribute', async () => {
  const { prisma, watchCat, shoeCat } = await setup();
  const sql = readFileSync(join(__dirname, '../prisma/migrations/20261108090100_watches_line_data/migration.sql'), 'utf8');
  // Only the two data statements: the trigger is already in place on this database.
  const data = sql.slice(0, sql.indexOf('-- 3.'));

  // A legacy watch in the shoe shop, as the production data is today: the trigger is paused to recreate it.
  await prisma.$executeRawUnsafe('ALTER TABLE "Product" DISABLE TRIGGER "Product_line_by_category"');
  try {
    await product(prisma, 'WTEST-OLD-W', watchCat.id, { line: 'SHOP' });
    await product(prisma, 'WTEST-OLD-S', shoeCat.id, { line: 'SHOP' });
  } finally {
    await prisma.$executeRawUnsafe('ALTER TABLE "Product" ENABLE TRIGGER "Product_line_by_category"');
  }
  await prisma.categoryAttribute.deleteMany({ where: { categoryId: { in: [watchCat.id, shoeCat.id] } } });
  await prisma.categoryAttribute.create({ data: { categoryId: watchCat.id, key: 'size', label: 'Size', options: ['S'] } });
  const shoeAttr = await prisma.categoryAttribute.create({ data: { categoryId: shoeCat.id, key: 'size', label: 'Size', options: ['EUR 40'] } });
  assert.equal((await prisma.product.findUnique({ where: { slug: 'wtest-old-w' } }))!.line, 'SHOP', 'the legacy watch starts in the shop');

  for (const statement of data.replace(/--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean)) await prisma.$executeRawUnsafe(statement);

  assert.equal((await prisma.product.findUnique({ where: { slug: 'wtest-old-w' } }))!.line, 'WATCH');
  assert.equal((await prisma.product.findUnique({ where: { slug: 'wtest-old-s' } }))!.line, 'SHOP', 'shoes stay put');
  assert.equal(await prisma.categoryAttribute.count({ where: { categoryId: watchCat.id } }), 0, 'the watches size attribute is gone');
  assert.ok(await prisma.categoryAttribute.findUnique({ where: { id: shoeAttr.id } }), 'the shoes size attribute is not');
  await prisma.categoryAttribute.deleteMany({ where: { categoryId: shoeCat.id } });
  await prisma.product.deleteMany({ where: { sku: { startsWith: 'WTEST' } } });
  await prisma.$disconnect();
});
