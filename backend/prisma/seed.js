/**
 * Launch data for Drip Emporium.
 *
 * Everything here is real: the two Ronald Ngala Street shops, the categories
 * the storefront lists, and products at their published prices. It exists so a
 * fresh environment is usable immediately rather than needing a catalogue typed
 * in by hand before anything can be demonstrated or tested.
 *
 * Idempotent throughout, keyed on codes and SKUs, so running it twice changes
 * nothing. It seeds the catalogue and opening stock only -- no orders, because
 * invented sales would land in the ledger and in every report built on it.
 */
const { PrismaClient, Prisma } = require('@prisma/client');
const { createConfigSeeder } = require('./seed-config');

const prisma = new PrismaClient();

const STORES = [
  { code: 'DMM-F53', name: 'Dubai Merchants Mall', location: 'Shop F53, Ronald Ngala Street, Nairobi' },
  { code: 'PALMS-BF75', name: 'Palms Mall', location: 'Shop BF75, Ronald Ngala Street, Nairobi' },
];

const CATEGORIES = ['Sneakers', 'Boots', 'Casuals', 'Sandals', 'Officials', 'Cleaning Agents'];

/** Prices as published on dripemporium.store, in KES. */
/*
 * Every product carries all three trade prices and a buying cost.
 *
 * Cost is not decoration: cost of goods, gross margin and the value of stock
 * on the balance sheet are all derived from it. Seeded without one, the shop
 * shows a 100% margin on every sale and no inventory asset at all.
 */
const PRODUCTS = [
  { sku: 'AF1-WHT', name: 'Air Force 1 White', brand: 'Nike', category: 'Sneakers', price: 1999, cost: 1200, reseller: 1650, wholesale: 1500 },
  { sku: 'AM90-VGR', name: 'Air Max 90 Vintage Green', brand: 'Nike', category: 'Sneakers', price: 3499, cost: 2100, reseller: 2900, wholesale: 2650 },
  { sku: 'TN-BLK', name: 'Nike TN Black', brand: 'Nike', category: 'Sneakers', price: 3799, cost: 2300, reseller: 3150, wholesale: 2850 },
  { sku: 'JD3-RED', name: 'Jordan 3 Red', brand: 'Jordan', category: 'Sneakers', price: 3799, cost: 2300, reseller: 3150, wholesale: 2850 },
  { sku: 'SAMBA-WHT', name: 'Adidas Samba White', brand: 'Adidas', category: 'Sneakers', price: 3499, cost: 2100, reseller: 2900, wholesale: 2650 },
  { sku: 'CAMPUS-BW', name: 'Adidas Campus Black White', brand: 'Adidas', category: 'Sneakers', price: 3699, cost: 2250, reseller: 3050, wholesale: 2800 },
  { sku: 'PUMA-COF', name: 'Puma Casual Coffee', brand: 'Puma', category: 'Casuals', price: 3499, cost: 2050, reseller: 2900, wholesale: 2650 },
];

/** Shoes sell by size, so every product carries the same size run. */
const SIZES = ['EUR 39', 'EUR 41', 'EUR 42', 'EUR 43', 'EUR 44'];

const slugify = (value) =>
  value.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

async function main() {
  console.log('Seeding Drip Emporium');

  const { seedConfig } = createConfigSeeder(prisma);
  await seedConfig();

  const stores = {};
  for (const store of STORES) {
    stores[store.code] = await prisma.store.upsert({
      where: { code: store.code },
      update: { name: store.name, location: store.location },
      create: store,
    });
  }
  console.log(`  ${Object.keys(stores).length} stores`);

  const categories = {};
  for (const name of CATEGORIES) {
    categories[name] = await prisma.productCategory.upsert({
      where: { slug: slugify(name) },
      update: { name },
      create: { name, slug: slugify(name) },
    });
  }
  console.log(`  ${Object.keys(categories).length} categories`);

  let variantCount = 0;
  for (const item of PRODUCTS) {
    const product = await prisma.product.upsert({
      where: { sku: item.sku },
      update: { name: item.name, brand: item.brand, categoryId: categories[item.category].id },
      create: {
        sku: item.sku,
        name: item.name,
        slug: slugify(item.name),
        brand: item.brand,
        categoryId: categories[item.category].id,
      },
    });

    for (const size of SIZES) {
      const variantSku = `${item.sku}-${size.replace(/\s+/g, '')}`;
      const variant = await prisma.productVariant.upsert({
        where: { sku: variantSku },
        update: {
          priceKes: new Prisma.Decimal(item.price),
          costKes: new Prisma.Decimal(item.cost),
          resellerPriceKes: new Prisma.Decimal(item.reseller),
          wholesalePriceKes: new Prisma.Decimal(item.wholesale),
        },
        create: {
          productId: product.id,
          sku: variantSku,
          name: size,
          attributes: { size },
          priceKes: new Prisma.Decimal(item.price),
          costKes: new Prisma.Decimal(item.cost),
          resellerPriceKes: new Prisma.Decimal(item.reseller),
          wholesalePriceKes: new Prisma.Decimal(item.wholesale),
        },
      });
      variantCount++;

      // Opening stock at the flagship only, so the second store starts empty
      // and transfers between them can be exercised.
      const storeId = stores['DMM-F53'].id;
      const existing = await prisma.stockLevel.findUnique({
        where: { variantId_storeId: { variantId: variant.id, storeId } },
      });
      if (!existing) {
        await prisma.stockLevel.create({
          data: { variantId: variant.id, storeId, quantity: 6, reorderAt: 2 },
        });
        await prisma.stockMovement.create({
          data: {
            variantId: variant.id,
            storeId,
            type: 'PURCHASE',
            quantity: 6,
            reference: 'OPENING-STOCK',
            notes: 'Opening balance',
            createdBy: 'seed',
          },
        });
      }
    }
  }
  console.log(`  ${PRODUCTS.length} products, ${variantCount} variants, opening stock at DMM-F53`);

  await seedOpeningStockJournal(prisma);

  console.log('Seed complete.');
}

/**
 * Puts the opening stock on the balance sheet.
 *
 * Creating StockLevel rows alone leaves the shop holding goods that the
 * accounts know nothing about: Inventory sits at zero, so a sale has no cost
 * to relieve and cost of goods reports as zero however much is sold. The
 * stock has to be worth something before it can cost anything.
 *
 * Posted as one entry rather than one per variant -- it is a single opening
 * balance, and 35 near-identical entries would only make the ledger harder to
 * read. Credited to Opening Balance Equity because this stock was not bought
 * on credit from a supplier; it is what the business started with.
 */
async function seedOpeningStockJournal(prisma) {
  const existing = await prisma.journalEntry.findFirst({
    where: { sourceId: 'OPENING-STOCK' },
  });
  if (existing) {
    console.log('  opening stock already on the ledger, skipped');
    return;
  }

  /*
   * Valued from the stock actually on hand rather than from what this run
   * created. An earlier seed made StockLevel rows without any journal, so the
   * shop was holding goods the accounts knew nothing about; keying off "did I
   * just create it" would never have corrected that.
   */
  const levels = await prisma.stockLevel.findMany({
    include: { variant: { select: { costKes: true } } },
  });

  const byStore = new Map();
  let units = 0;
  for (const level of levels) {
    const cost = level.variant?.costKes;
    if (!cost || level.quantity <= 0) continue;
    const value = Number(cost) * level.quantity;
    byStore.set(level.storeId, (byStore.get(level.storeId) || 0) + value);
    units += level.quantity;
  }

  const total = [...byStore.values()].reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    console.log('  no valued stock on hand, opening stock journal skipped');
    return;
  }

  const [inventory, equity] = await Promise.all([
    prisma.chartOfAccount.findFirst({ where: { code: '1200' } }),
    prisma.chartOfAccount.findFirst({ where: { code: '3000' } }),
  ]);
  if (!inventory || !equity) {
    console.log('  opening stock journal skipped: Inventory (1200) or Equity (3000) missing');
    return;
  }

  const last = await prisma.journalEntry.findFirst({
    orderBy: { entryNumber: 'desc' },
    select: { entryNumber: true },
  });
  const nextNumber = Number((last?.entryNumber || '').split('-').pop() || 0) + 1;
  const entryNumber = `JE-${new Date().getFullYear()}-${String(nextNumber).padStart(5, '0')}`;

  await prisma.journalEntry.create({
    data: {
      entryNumber,
      memo: `OPENING-STOCK — ${units} pairs at cost`,
      source: 'INVENTORY',
      sourceId: 'OPENING-STOCK',
      postedBy: 'seed',
      lines: {
        create: [
          // One debit per store so per-store reports see their own stock.
          ...[...byStore.entries()].map(([storeId, value]) => ({
            accountId: inventory.id,
            debit: new Prisma.Decimal(value),
            credit: new Prisma.Decimal(0),
            baseDebit: new Prisma.Decimal(value),
            baseCredit: new Prisma.Decimal(0),
            storeId,
            memo: 'Opening stock at cost',
          })),
          // Credited to equity: this is stock the business started with, not
          // something bought on credit from a supplier.
          {
            accountId: equity.id,
            debit: new Prisma.Decimal(0),
            credit: new Prisma.Decimal(total),
            baseDebit: new Prisma.Decimal(0),
            baseCredit: new Prisma.Decimal(total),
            memo: 'Opening stock at cost',
          },
        ],
      },
    },
  });
  console.log(`  opening stock posted: ${units} pairs, ${total.toLocaleString()} at cost`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
