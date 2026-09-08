/**
 * One-time launch-category seed, run by hand -- not part of seed.js's
 * demo-data path or bootstrap.js's every-boot config seeding.
 *
 * Restructures the category tree and adds the three not-yet-launched
 * business lines:
 *
 *  - Creates "Shoes" as a new top-level category and re-parents every
 *    existing footwear category (Sneakers, Casuals, Officials, Boots,
 *    Sandals) under it -- these were previously siblings at the top level
 *    with no shared parent at all.
 *  - Leaves "Cleaning Agents" where it is, at the top level: it is shoe-care
 *    stock, not a footwear type, so it does not belong under Shoes.
 *  - Creates "Watches" at the top level, active (it already has real
 *    products loaded).
 *  - Creates "Clothes", "Perfume" and "Electronics" at the top level,
 *    inactive -- the rows exist so staff can start loading stock ahead of
 *    launch, but isActive: false keeps every one of them (and anything
 *    filed under them) out of the storefront's category list, /shop's
 *    filters, the sitemap and the product feeds until switched on. See
 *    storefront.service.ts for where isActive is actually enforced.
 *
 * Idempotent throughout: every category is looked up by slug first and only
 * created if missing, and re-parenting only touches a category that is not
 * already under the right parent -- safe to re-run, including against a
 * database that already has some or all of this in place.
 *
 * Usage: node prisma/seed-categories.js
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/** Footwear categories that exist today as top-level rows and need to move
 *  under the new Shoes parent. Matched by slug, not name, since that is
 *  what is actually unique and stable in the schema. */
const SHOE_SUBCATEGORY_SLUGS = ['sneakers', 'casuals', 'officials', 'boots', 'sandals'];

/** New top-level categories this seed introduces, beyond the Shoes/Watches
 *  restructuring above. */
const NEW_TOP_LEVEL_CATEGORIES = [
  { name: 'Clothes', slug: 'clothes', isActive: false },
  { name: 'Perfume', slug: 'perfume', isActive: false },
  { name: 'Electronics', slug: 'electronics', isActive: false },
];

async function ensureCategory({ name, slug, description, isActive = true, parentId = null }) {
  const existing = await prisma.productCategory.findUnique({ where: { slug } });
  if (existing) {
    console.log(`Skipping "${name}" -- category "${slug}" already exists.`);
    return existing;
  }
  const created = await prisma.productCategory.create({
    data: { name, slug, description, isActive, parentId },
  });
  console.log(`Created category: ${name} (${slug})${isActive ? '' : ' [inactive]'}`);
  return created;
}

async function main() {
  // Shoes itself: active immediately, since every real shoe product already
  // sells today and should keep doing so under the new parent.
  const shoes = await ensureCategory({
    name: 'Shoes',
    slug: 'shoes',
    description: 'Sneakers, casuals, officials, boots and sandals.',
    isActive: true,
  });

  // Watches: active, since a few real products are already loaded per the
  // launch plan.
  await ensureCategory({
    name: 'Watches',
    slug: 'watches',
    isActive: true,
  });

  for (const category of NEW_TOP_LEVEL_CATEGORIES) {
    await ensureCategory(category);
  }

  // Re-parent the existing shoe sub-categories. Only touches a category
  // that is not already correctly parented, so re-running this after the
  // first successful pass is a no-op for every row here.
  for (const slug of SHOE_SUBCATEGORY_SLUGS) {
    const category = await prisma.productCategory.findUnique({ where: { slug } });
    if (!category) {
      console.log(`Skipping re-parent of "${slug}" -- no category with that slug exists.`);
      continue;
    }
    if (category.parentId === shoes.id) {
      console.log(`Skipping re-parent of "${category.name}" -- already under Shoes.`);
      continue;
    }
    await prisma.productCategory.update({
      where: { id: category.id },
      data: { parentId: shoes.id },
    });
    console.log(`Re-parented "${category.name}" under Shoes.`);
  }

  console.log('Done.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
