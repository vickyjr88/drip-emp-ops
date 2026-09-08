import { Injectable, NotFoundException } from '@nestjs/common';
import { PriceTier, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { storefrontOrigin } from '../common/storefront-origin';
import { csvField } from '../common/csv.util';
import { priceForTier } from '../common/price-for-tier';

/**
 * Meta's product-feed taxonomy, by this shop's category slug. Was hardcoded
 * to "Apparel & Accessories > Shoes" for every product -- fine while shoes
 * were the only thing sold, wrong for a watch or a bottle of perfume, both
 * of which Meta would then classify (and route to shoppers) as footwear.
 * Falls back to the old default for a category with no mapping yet, rather
 * than leaving the field empty (which risks the row being rejected).
 */
function googleProductCategory(categorySlug?: string | null): string {
  const byCategory: Record<string, string> = {
    sneakers: 'Apparel & Accessories > Shoes',
    boots: 'Apparel & Accessories > Shoes',
    casuals: 'Apparel & Accessories > Shoes',
    sandals: 'Apparel & Accessories > Shoes',
    officials: 'Apparel & Accessories > Shoes',
    watches: 'Apparel & Accessories > Jewelry > Watches',
    clothes: 'Apparel & Accessories > Clothing',
    perfumes: 'Health & Beauty > Personal Care > Cosmetics > Perfume & Cologne',
  };
  return (categorySlug && byCategory[categorySlug]) || 'Apparel & Accessories > Shoes';
}

/**
 * The public catalogue.
 *
 * Deliberately narrow: it returns retail prices and whether a size is in
 * stock, and nothing else by default. Reseller and wholesale pricing, cost,
 * margin and per-store quantities never leave this service to anyone else --
 * the one exception is a logged-in reseller/wholesale customer, verified
 * server-side by OptionalCustomerAuthGuard, who sees their own tier's price
 * alongside retail. The shops buying at those tiers are competitors, and an
 * open endpoint reachable by anyone is still an open price list; this only
 * ever reveals a tier price to the customer it actually belongs to.
 *
 * Stock is reported as available or not rather than as a count. "3 left" is a
 * number a competitor can watch; "in stock" is all a customer needs.
 */
@Injectable()
export class StorefrontService {
  constructor(private readonly prisma: PrismaService) {}

  /** RETAIL for a guest or a retail customer; a signed-in reseller/wholesale
   *  customer's own tier otherwise. Mirrors the same rule checkout uses: the
   *  tier follows the verified session, never anything the caller can name. */
  private tierOf(user?: { priceTier?: PriceTier }): PriceTier {
    return user?.priceTier ?? 'RETAIL';
  }

  /**
   * Which of this product's category's attributes is "the" size-like one --
   * the value a shopper picks before adding to cart, shown as chips on a
   * card and the product page. The first attribute the category defines,
   * by sortOrder: a category can have more than one attribute (e.g. size
   * and colour), but only one drives the size picker and sizesInStock.
   * A category with none (Watches, Perfumes) has nothing to pick from --
   * every active variant is just orderable on its own.
   */
  private sizeAttributeKey(product: any): string | null {
    const attributes = product.category?.attributes;
    return Array.isArray(attributes) && attributes.length ? attributes[0].key : null;
  }

  /** Only what a shopper may see. Note the absence of cost and other tiers,
   *  except the viewer's own when tier is not RETAIL. */
  private shape(
    product: any,
    stockByVariant: Map<string, number>,
    offerByVariant: Map<string, { price: number; was: number; label: string | null }> = new Map(),
    tier: PriceTier = 'RETAIL',
  ) {
    const sizeKey = this.sizeAttributeKey(product);
    const variants = product.variants
      .filter((variant: any) => variant.isActive)
      .map((variant: any) => {
        const offer = offerByVariant.get(variant.id);
        const retail = Number(variant.priceKes);
        const inStock = (stockByVariant.get(variant.id) ?? 0) > 0;
        // Offers are retail-only by design, same rule checkout enforces: a
        // reseller's tier price is never further discounted, or bypassed, by
        // a markdown meant for retail shoppers.
        const tierPrice = tier === 'RETAIL' ? null : priceForTier(variant, tier);
        // The category's size-like attribute value when it has one (e.g.
        // "EUR 42" for Shoes, "M" for Clothes); null for a category with no
        // such attribute (Watches, Perfumes) rather than falling back to
        // variant.name, which is a free-text label, not a size.
        const size = sizeKey ? (variant.attributes as Record<string, unknown> | null)?.[sizeKey] ?? null : null;
        return {
          id: variant.id,
          sku: variant.sku,
          name: variant.name,
          size: typeof size === 'string' ? size : null,
          // The price this viewer pays: their tier price outright when they
          // are a reseller/wholesaler, otherwise the offer price when there
          // is one, otherwise retail.
          priceKes: tier === 'RETAIL' ? (offer ? offer.price : retail) : tierPrice!,
          // What it was, so the storefront can strike it through. Null when
          // nothing is discounted, rather than repeating the same number.
          wasPriceKes: tier === 'RETAIL' && offer ? offer.was : null,
          offerLabel: tier === 'RETAIL' ? offer?.label ?? null : null,
          // Present only for a logged-in reseller/wholesale viewer: retail,
          // for comparison against the tier price now in priceKes. Null
          // (not omitted) for everyone else, so callers get a consistent
          // number | null rather than having to also check for undefined.
          retailPriceKes: tier === 'RETAIL' ? null : retail,
          // Availability, not quantity.
          inStock,
          // Every active listing can be ordered, in stock or not -- an
          // out-of-shelf line is simply sourced from the supplier instead of
          // the shelf, the same rule the checkout and the till use to route
          // it rather than blocking the sale.
          canOrder: true,
        };
      });

    const inStock = variants.filter((variant: any) => variant.inStock);
    const prices = variants.map((variant: any) => variant.priceKes);
    const retailPrices = variants
      .map((variant: any) => variant.retailPriceKes)
      .filter((value: number | null): value is number => value !== null);

    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      brand: product.brand,
      description: product.description,
      // Featured first, so the chosen image leads the gallery and the share
      // card without duplicating it further down.
      imageUrls: (() => {
        const all: string[] = Array.isArray(product.imageUrls) ? product.imageUrls : [];
        const featured = product.featuredImageUrl;
        return featured && all.includes(featured)
          ? [featured, ...all.filter((url: string) => url !== featured)]
          : all;
      })(),
      category: product.category ? { name: product.category.name, slug: product.category.slug } : null,
      isFeatured: Boolean(product.isFeatured),
      variants,
      priceFrom: prices.length ? Math.min(...prices) : 0,
      priceTo: prices.length ? Math.max(...prices) : 0,
      // Product-level retail comparison price, mirroring priceFrom -- lets a
      // card show "you keep KES X" without assuming a variant ordering.
      retailPriceFrom: retailPrices.length ? Math.min(...retailPrices) : null,
      // Empty for a sizeless category (Watches, Perfumes) -- every variant's
      // size is null there, so nothing to show as a size chip.
      sizesInStock: inStock
        .map((variant: any) => variant.size)
        .filter((size: string | null): size is string => size !== null),
      anyInStock: inStock.length > 0,
      // Drives the badge on a card without the caller inspecting every size.
      onOffer: variants.some((variant: any) => variant.wasPriceKes !== null),
      offerLabel:
        variants.find((variant: any) => variant.offerLabel)?.offerLabel ?? null,
    };
  }

  /**
   * Stock across every store, summed.
   *
   * A shopper wants to know the shop has it, not which branch -- and consigned
   * stock is excluded because it is sitting in somebody else's shop.
   */
  /**
   * Live offer prices, by variant.
   *
   * Only offers that are published and inside their window count, so a draft
   * or a scheduled markdown never leaks a price onto the shop. Where a variant
   * somehow sits on two, the cheapest wins -- that is the price the shopper
   * would expect to be honoured.
   */
  private async offerMap(variantIds: string[]) {
    if (!variantIds.length) return new Map<string, { price: number; was: number; label: string | null }>();
    const now = new Date();
    const lines = await this.prisma.offerLine.findMany({
      where: {
        variantId: { in: variantIds },
        offer: {
          status: 'ACTIVE',
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          ],
        },
      },
      include: { offer: { select: { label: true } } },
    });

    const map = new Map<string, { price: number; was: number; label: string | null }>();
    for (const line of lines) {
      const price = Number(line.offerPriceKes);
      const existing = map.get(line.variantId);
      if (!existing || price < existing.price) {
        map.set(line.variantId, {
          price,
          was: Number(line.wasPriceKes),
          label: line.offer.label ?? null,
        });
      }
    }
    return map;
  }

  private async stockMap(variantIds?: string[]) {
    const rows = await this.prisma.stockLevel.groupBy({
      by: ['variantId'],
      where: variantIds ? { variantId: { in: variantIds } } : undefined,
      _sum: { quantity: true },
    });
    return new Map(rows.map((row) => [row.variantId, row._sum.quantity ?? 0]));
  }

  async categories() {
    const rows = await this.prisma.productCategory.findMany({
      // isActive gates a category's own storefront visibility -- staff can
      // load products under Clothes ahead of launch without it appearing
      // here. products: some(isActive) still applies on top, so a launched
      // category with everything deactivated or sold out still drops off
      // the list rather than showing an empty "0 styles" entry.
      where: { isActive: true, products: { some: { isActive: true } } },
      include: { _count: { select: { products: { where: { isActive: true } } } } },
      orderBy: { name: 'asc' },
    });
    return rows.map((row) => ({
      name: row.name,
      slug: row.slug,
      productCount: row._count.products,
    }));
  }

  /** Distinct brands and sizes actually present, so filters offer only real options. */
  async filters() {
    const [brands, sizes] = await Promise.all([
      this.prisma.product.findMany({
        // A not-yet-launched category's brand (a watch brand, before
        // Watches went live) must not appear in the filter either --
        // categoryId: null still passes, same "opt out, not opt in" rule
        // as the size query and catalogCsv() above.
        where: {
          isActive: true,
          brand: { not: null },
          OR: [{ categoryId: null }, { category: { isActive: true } }],
        },
        distinct: ['brand'],
        select: { brand: true },
        orderBy: { brand: 'asc' },
      }),
      // Distinct values across every category's attributes JSON, not
      // variant.name -- that was a shoe-only assumption (it happened to
      // work because every variant's name used to be its size). A watch or
      // perfume variant's attributes has nothing size-like at all, so it
      // simply contributes no rows here rather than polluting the list with
      // its free-text name. LEFT JOIN'd to category so an uncategorised
      // product's variant still counts (coalesce true when there is no
      // category row to check).
      this.prisma.$queryRaw<{ value: string }[]>`
        SELECT DISTINCT attr.value
        FROM "ProductVariant" v
        CROSS JOIN LATERAL jsonb_each_text(coalesce(v.attributes, '{}'::jsonb)) AS attr(key, value)
        JOIN "Product" p ON p.id = v."productId"
        LEFT JOIN "ProductCategory" c ON c.id = p."categoryId"
        WHERE v."isActive" = true AND p."isActive" = true AND coalesce(c."isActive", true) = true
      `,
    ]);

    return {
      brands: brands.map((row) => row.brand).filter(Boolean),
      // "EUR 39" sorts before "EUR 7" as text, so order by the leading
      // number when there is one; values with no number (S/M/L/XL) sort
      // after, alphabetically among themselves.
      sizes: sizes
        .map((row) => row.value)
        .sort((a, b) => {
          const numA = parseInt(a.replace(/\D/g, ''), 10);
          const numB = parseInt(b.replace(/\D/g, ''), 10);
          if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB;
          if (!Number.isNaN(numA)) return -1;
          if (!Number.isNaN(numB)) return 1;
          return a.localeCompare(b);
        }),
    };
  }

  /**
   * Products whose name or brand is a near-miss for a search word.
   *
   * Prisma has no trigram operator, so this is raw SQL returning ids the caller
   * folds into its where clause. Each word is scored against each *word* of the
   * name rather than the whole string: "smaba" against "Adidas Samba White"
   * scores 0.09 as a whole and 0.8 against the word "samba", so comparing
   * whole strings would reject almost every real typo.
   *
   * A transposition in a short word ("nkie") still scores too low to match --
   * trigrams have little to work with in four letters. That is a known limit,
   * not something a lower threshold fixes: dropping it far enough to catch
   * those starts matching unrelated products.
   */
  private async fuzzyProductIds(words: string[]): Promise<string[]> {
    if (words.length === 0) return [];
    // LEFT JOIN'd to category, not filtered by ?category= here -- this runs
    // for an unscoped search too, where the caller's own `where` has no
    // category clause of its own to catch a not-yet-launched category's
    // product otherwise. coalesce(..., true) lets an uncategorised product
    // through, matching every other query's "opt out, not opt in" rule.
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT p.id
      FROM "Product" p
      LEFT JOIN "ProductCategory" c ON c.id = p."categoryId"
      CROSS JOIN LATERAL unnest(${words}::text[]) AS q(word)
      CROSS JOIN LATERAL unnest(
        string_to_array(lower(p.name) || ' ' || lower(coalesce(p.brand, '')), ' ')
      ) AS t(part)
      WHERE p."isActive" = true AND coalesce(c."isActive", true) = true AND similarity(t.part, q.word) > 0.3
    `;
    return rows.map((row) => row.id);
  }

  /**
   * Products with at least one active variant whose attributes JSON has
   * this value under any key -- a shoe's "size" and a top's "size" are both
   * just entries in that free-form object, and there is no ambiguity in
   * practice since filters() below only ever offers values that genuinely
   * appear somewhere in the catalogue. jsonb_each_text unpacks the object
   * into key/value rows so a plain value comparison can be used, which
   * Prisma's typed JSON filters cannot express for an object shape (only
   * for a specific known key, or array membership).
   */
  private async sizeFilterProductIds(size: string): Promise<string[]> {
    // Same reasoning as fuzzyProductIds above: this runs standalone, not
    // combined with a ?category= clause when none is given, so it needs its
    // own category-status check rather than relying on the caller's where.
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT v."productId" AS id
      FROM "ProductVariant" v
      JOIN "Product" p ON p.id = v."productId"
      LEFT JOIN "ProductCategory" c ON c.id = p."categoryId"
      CROSS JOIN LATERAL jsonb_each_text(coalesce(v.attributes, '{}'::jsonb)) AS attr(key, value)
      WHERE v."isActive" = true AND coalesce(c."isActive", true) = true AND attr.value = ${size}
    `;
    return rows.map((row) => row.id);
  }

  async list(query: {
    category?: string; brand?: string; size?: string; search?: string;
    minPrice?: string; maxPrice?: string; inStockOnly?: string; sort?: string;
  }, authedUser?: { priceTier?: PriceTier }) {
    const tier = this.tierOf(authedUser);
    // Split on whitespace and require every word to match something, in any
    // order. A single contains on the whole phrase meant "white air force"
    // found nothing -- the product is called "Air Force 1 White", which does
    // not contain that string -- and a shopper describing a shoe the way they
    // would say it out loud got an empty page.
    const words = (query.search || '').trim().split(/\s+/).filter(Boolean);

    // Exact-ish matching first; the trigram pass only has to rescue what this
    // misses, which keeps the raw query off the common path.
    const wordClauses: Prisma.ProductWhereInput[] = words.map((word) => ({
      OR: [
        { name: { contains: word, mode: 'insensitive' } },
        { brand: { contains: word, mode: 'insensitive' } },
        // Searching the description and the category is what makes a query
        // like "sneakers" work at all: it is a category, named on no product.
        { description: { contains: word, mode: 'insensitive' } },
        { category: { name: { contains: word, mode: 'insensitive' } } },
        // The SKU is what a shopper reads off a tag or a receipt.
        { variants: { some: { sku: { contains: word, mode: 'insensitive' }, isActive: true } } },
      ],
    }));

    // The fuzzy pass is a fallback, not an extra OR branch. Run alongside the
    // literal clauses it widens every query: "white air force" matched Adidas
    // Samba, because "white" is close enough to something in that name. It is
    // therefore consulted only when the literal pass finds nothing at all --
    // which is also the only time a shopper needs it.
    const literalCount = words.length
      ? await this.prisma.product.count({
          where: {
            isActive: true,
            // isActive: true here too -- a direct or guessed ?category= link to a
      // not-yet-launched category (Clothes, ahead of launch) must not
      // surface its products just because someone knows the slug.
      ...(query.category ? { category: { slug: query.category, isActive: true } } : {}),
            ...(query.brand ? { brand: { equals: query.brand, mode: 'insensitive' } } : {}),
            AND: wordClauses,
          },
        })
      : 0;
    const fuzzyIds = words.length && literalCount === 0
      ? await this.fuzzyProductIds(words)
      : [];

    const where: Prisma.ProductWhereInput = {
      isActive: true,
      // isActive: true here too -- a direct or guessed ?category= link to a
      // not-yet-launched category (Clothes, ahead of launch) must not
      // surface its products just because someone knows the slug.
      ...(query.category ? { category: { slug: query.category, isActive: true } } : {}),
      ...(query.brand ? { brand: { equals: query.brand, mode: 'insensitive' } } : {}),
      // Either the literal match, or -- only when that found nothing -- the
      // typo rescue. Never both, so a query that works is never widened.
      ...(words.length
        ? fuzzyIds.length
          ? { id: { in: fuzzyIds } }
          : { AND: wordClauses }
        : {}),
      // A size filter is really a question about variants, not products.
      // Resolved via sizeFilterProductIds() below, since matching "any value
      // in this JSON object equals X" isn't expressible through Prisma's
      // typed JSON filters (those cover object-key lookups or array
      // membership, not "does any value in this object equal this string").
      ...(query.size ? { id: { in: await this.sizeFilterProductIds(query.size) } } : {}),
    };

    const products = await this.prisma.product.findMany({
      where,
      include: {
        category: { select: { name: true, slug: true, attributes: { select: { key: true, label: true } } } },
        variants: { orderBy: { name: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const variantIds = products.flatMap((p) => p.variants.map((v) => v.id));
    const [stock, offers] = await Promise.all([
      this.stockMap(variantIds),
      this.offerMap(variantIds),
    ]);
    let shaped = products.map((product) => this.shape(product, stock, offers, tier));

    // Price filters run after shaping because the price shown is the cheapest
    // variant, which is not a column on the product.
    if (query.minPrice) shaped = shaped.filter((p) => p.priceTo >= Number(query.minPrice));
    if (query.maxPrice) shaped = shaped.filter((p) => p.priceFrom <= Number(query.maxPrice));
    if (query.inStockOnly === 'true') shaped = shaped.filter((p) => p.anyInStock);

    // Whatever the sort, sold-out products sink: showing something a shopper
    // cannot buy at the top of the page wastes the best position on the page.
    const bySort: Record<string, (a: any, b: any) => number> = {
      'price-asc': (a, b) => a.priceFrom - b.priceFrom,
      'price-desc': (a, b) => b.priceFrom - a.priceFrom,
      name: (a, b) => a.name.localeCompare(b.name),
    };
    const comparator = bySort[query.sort || ''] || (() => 0);
    shaped.sort((a, b) => Number(b.anyInStock) - Number(a.anyInStock) || comparator(a, b));

    return shaped;
  }

  /**
   * The home page's and shop's "Featured" rail.
   *
   * Merchant-picked products lead, in the order they were marked featured
   * (oldest pick first, so a long-running favourite does not keep jumping
   * around the rail every time something new is added). If that is not
   * enough to fill the rail, or nobody has picked anything yet, random
   * in-stock products top it up -- picked fresh each call rather than by
   * recency, so the fallback does not just become a second "newest" rail.
   * Curated picks are never displaced by the filler, and a sold-out product
   * is never used as filler since showing something nobody can buy in the
   * shop's best position defeats the point of featuring it.
   */
  async featured(limit = 10, authedUser?: { priceTier?: PriceTier }) {
    const tier = this.tierOf(authedUser);
    const featuredProducts = await this.prisma.product.findMany({
      where: { isActive: true, isFeatured: true },
      include: {
        category: { select: { name: true, slug: true, attributes: { select: { key: true, label: true } } } },
        variants: { orderBy: { name: 'asc' } },
      },
      orderBy: { updatedAt: 'asc' },
      take: limit,
    });

    const remaining = limit - featuredProducts.length;
    let fillerProducts: (typeof featuredProducts)[number][] = [];
    if (remaining > 0) {
      const candidates = await this.prisma.product.findMany({
        where: { isActive: true, isFeatured: false },
        include: {
          category: { select: { name: true, slug: true, attributes: { select: { key: true, label: true } } } },
          variants: { orderBy: { name: 'asc' } },
        },
      });
      // Shuffled so the filler looks freshly picked on every visit rather than
      // always being the same handful of products in id/creation order.
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }
      fillerProducts = candidates;
    }

    const all = [...featuredProducts, ...fillerProducts];
    const variantIds = all.flatMap((product) => product.variants.map((variant) => variant.id));
    const [stock, offers] = await Promise.all([this.stockMap(variantIds), this.offerMap(variantIds)]);

    const shapedFeatured = featuredProducts.map((product) => this.shape(product, stock, offers, tier));
    const shapedFiller = fillerProducts
      .map((product) => this.shape(product, stock, offers, tier))
      // Sold-out filler is worse than showing fewer products in this slot.
      .filter((product) => product.anyInStock);

    return [...shapedFeatured, ...shapedFiller].slice(0, limit);
  }

  /**
   * The catalogue as Meta's Commerce Manager expects to fetch it: one CSV
   * row per size, not per product, since a shopper buys a specific size and
   * that is what Facebook/Instagram Shops needs to check out.
   *
   * Field choices, and why:
   *  - `id` is the variant SKU, not the variant's UUID -- Meta's catalog ID
   *    also has to line up with whatever content ID a Pixel/Conversions API
   *    integration fires, and the SKU is the identifier this shop already
   *    prints on receipts and uses everywhere else a human reads it.
   *  - `item_group_id` is the product ID, shared by every size of one shoe,
   *    so Shops groups them into a single listing with a size picker instead
   *    of showing eleven near-identical cards for one style.
   *  - `availability` is only ever "in stock" or "out of stock". Meta's own
   *    docs disagree with several third-party feed tools about whether
   *    "preorder" is also accepted, so rather than risk the whole feed being
   *    rejected on an unrecognised value, every orderable size (including a
   *    drop-ship or backordered one -- this shop already sells those, see
   *    canOrder in shape() above) is reported in stock, matching what a
   *    shopper is actually allowed to buy on the storefront itself.
   *  - `condition` is fixed to "new": every listing here is new retail stock,
   *    never a used or refurbished resale.
   *  - `gender`/`age_group` have no source data to draw from (this shop does
   *    not model either), so both are fixed to the least restrictive value
   *    Meta accepts ("unisex", "adult") rather than guessing per product.
   */
  async catalogCsv(): Promise<string> {
    const products = await this.prisma.product.findMany({
      // A product in a not-yet-launched category (Clothes, ahead of
      // launch) must not reach Meta/X's catalog just because staff have
      // started loading stock -- category.isActive: undefined lets an
      // uncategorised product through (no category to be inactive), the
      // same "opt out, not opt in" default as list()'s search branches.
      where: { isActive: true, OR: [{ categoryId: null }, { category: { isActive: true } }] },
      include: {
        category: { select: { name: true, slug: true, attributes: { select: { key: true, label: true } } } },
        variants: { orderBy: { name: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const variantIds = products.flatMap((product) => product.variants.map((variant) => variant.id));
    const [stock, offers] = await Promise.all([this.stockMap(variantIds), this.offerMap(variantIds)]);
    const shaped = products.map((product) => this.shape(product, stock, offers));

    const origin = storefrontOrigin();
    const columns = [
      'id',
      'item_group_id',
      'title',
      'description',
      'availability',
      'condition',
      'price',
      'sale_price',
      'link',
      'image_link',
      'additional_image_link',
      'brand',
      'google_product_category',
      'size',
      'gender',
      'age_group',
    ];

    const rows: string[][] = [columns];
    for (const product of shaped) {
      const link = `${origin}/shop/${product.slug}`;
      const [imageLink, ...additional] = product.imageUrls;
      // image_link is required -- Meta rejects a row without one, and a
      // listing with no photo would not be worth showing in Shops anyway.
      if (!imageLink) continue;
      for (const variant of product.variants) {
        // shape() already flips these: priceKes is what the shopper pays
        // (the offer price, when one is active) and wasPriceKes is the
        // original. Meta wants it the other way round -- `price` is always
        // the list price and `sale_price` is the discount, so a markdown
        // is not lost on the way into the feed.
        const listPrice = variant.wasPriceKes ?? variant.priceKes;
        rows.push([
          variant.sku,
          product.id,
          // No " - null" for a sizeless product (Watches, Perfumes): the
          // size suffix only makes sense when there is one.
          variant.size ? `${product.name} - ${variant.size}` : product.name,
          product.description || product.name,
          // Every listing here is orderable (canOrder is always true, see
          // shape()); a size only drops out of the feed row set entirely if
          // it is inactive, which shape() already filters out above.
          'in stock',
          'new',
          `${listPrice.toFixed(2)} KES`,
          variant.wasPriceKes ? `${variant.priceKes.toFixed(2)} KES` : '',
          link,
          imageLink || '',
          additional.join(','),
          product.brand || '',
          googleProductCategory(product.category?.slug),
          variant.size || '',
          'unisex',
          'adult',
        ]);
      }
    }

    return rows.map((row) => row.map(csvField).join(',')).join('\r\n') + '\r\n';
  }

  async bySlug(slug: string, authedUser?: { priceTier?: PriceTier }) {
    const tier = this.tierOf(authedUser);
    const product = await this.prisma.product.findFirst({
      where: { slug, isActive: true },
      include: {
        category: { select: { name: true, slug: true, attributes: { select: { key: true, label: true } } } },
        variants: { orderBy: { name: 'asc' } },
      },
    });
    if (!product) throw new NotFoundException(`No product at "${slug}"`);

    const [stock, offers] = await Promise.all([
      this.stockMap(product.variants.map((variant) => variant.id)),
      this.offerMap(product.variants.map((variant) => variant.id)),
    ]);
    const shaped = this.shape(product, stock, offers, tier);

    // A few alternatives from the same category, so a sold-out size is not a
    // dead end.
    const related = await this.prisma.product.findMany({
      where: { isActive: true, id: { not: product.id }, categoryId: product.categoryId },
      include: { category: { select: { name: true, slug: true, attributes: { select: { key: true, label: true } } } }, variants: true },
      take: 5,
    });
    const relatedStock = await this.stockMap(related.flatMap((p) => p.variants.map((v) => v.id)));

    const relatedOffers = await this.offerMap(
      related.flatMap((item) => item.variants.map((variant) => variant.id)),
    );
    return {
      ...shaped,
      related: related.map((item) => this.shape(item, relatedStock, relatedOffers, tier)),
    };
  }

  /** Shops a customer can walk into. */
  async stores() {
    const rows = await this.prisma.store.findMany({
      where: { isActive: true },
      select: { code: true, name: true, location: true },
      orderBy: { name: 'asc' },
    });
    return rows;
  }
}
