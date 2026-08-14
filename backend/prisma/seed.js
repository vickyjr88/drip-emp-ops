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
const PRODUCTS = [
  { sku: 'AF1-WHT', name: 'Air Force 1 White', brand: 'Nike', category: 'Sneakers', price: 1999 },
  { sku: 'AM90-VGR', name: 'Air Max 90 Vintage Green', brand: 'Nike', category: 'Sneakers', price: 3499 },
  { sku: 'TN-BLK', name: 'Nike TN Black', brand: 'Nike', category: 'Sneakers', price: 3799 },
  { sku: 'JD3-RED', name: 'Jordan 3 Red', brand: 'Jordan', category: 'Sneakers', price: 3799 },
  { sku: 'SAMBA-WHT', name: 'Adidas Samba White', brand: 'Adidas', category: 'Sneakers', price: 3499 },
  { sku: 'CAMPUS-BW', name: 'Adidas Campus Black White', brand: 'Adidas', category: 'Sneakers', price: 3699 },
  { sku: 'PUMA-COF', name: 'Puma Casual Coffee', brand: 'Puma', category: 'Casuals', price: 3499 },
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
        update: { priceKes: new Prisma.Decimal(item.price) },
        create: {
          productId: product.id,
          sku: variantSku,
          name: size,
          attributes: { size },
          priceKes: new Prisma.Decimal(item.price),
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
  console.log('Seed complete.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
