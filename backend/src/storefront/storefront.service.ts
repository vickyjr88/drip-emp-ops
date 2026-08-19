import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The public catalogue.
 *
 * Deliberately narrow: it returns retail prices and whether a size is in
 * stock, and nothing else. Reseller and wholesale pricing, cost, margin and
 * per-store quantities never leave this service -- the shops buying at those
 * tiers are competitors, and an open endpoint is an open price list.
 *
 * Stock is reported as available or not rather than as a count. "3 left" is a
 * number a competitor can watch; "in stock" is all a customer needs.
 */
@Injectable()
export class StorefrontService {
  constructor(private readonly prisma: PrismaService) {}

  /** Only what a shopper may see. Note the absence of cost and other tiers. */
  private shape(
    product: any,
    stockByVariant: Map<string, number>,
    offerByVariant: Map<string, { price: number; was: number; label: string | null }> = new Map(),
  ) {
    const variants = product.variants
      .filter((variant: any) => variant.isActive)
      .map((variant: any) => {
        const offer = offerByVariant.get(variant.id);
        const retail = Number(variant.priceKes);
        return {
          id: variant.id,
          sku: variant.sku,
          size: variant.name,
          // The price a shopper pays: the offer when there is one.
          priceKes: offer ? offer.price : retail,
          // What it was, so the storefront can strike it through. Null when
          // nothing is discounted, rather than repeating the same number.
          wasPriceKes: offer ? offer.was : null,
          offerLabel: offer ? offer.label : null,
          // Availability, not quantity.
          inStock: (stockByVariant.get(variant.id) ?? 0) > 0,
        };
      });

    const inStock = variants.filter((variant: any) => variant.inStock);
    const prices = variants.map((variant: any) => variant.priceKes);

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
      variants,
      priceFrom: prices.length ? Math.min(...prices) : 0,
      priceTo: prices.length ? Math.max(...prices) : 0,
      sizesInStock: inStock.map((variant: any) => variant.size),
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
      where: { products: { some: { isActive: true } } },
      include: { _count: { select: { products: true } } },
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
        where: { isActive: true, brand: { not: null } },
        distinct: ['brand'],
        select: { brand: true },
        orderBy: { brand: 'asc' },
      }),
      this.prisma.productVariant.findMany({
        where: { isActive: true, product: { isActive: true } },
        distinct: ['name'],
        select: { name: true },
      }),
    ]);

    return {
      brands: brands.map((row) => row.brand).filter(Boolean),
      // "EUR 39" sorts before "EUR 7" as text, so order by the number in it.
      sizes: sizes
        .map((row) => row.name)
        .sort((a, b) => (parseInt(a.replace(/\D/g, ''), 10) || 0) - (parseInt(b.replace(/\D/g, ''), 10) || 0)),
    };
  }

  async list(query: {
    category?: string; brand?: string; size?: string; search?: string;
    minPrice?: string; maxPrice?: string; inStockOnly?: string; sort?: string;
  }) {
    const where: Prisma.ProductWhereInput = {
      isActive: true,
      ...(query.category ? { category: { slug: query.category } } : {}),
      ...(query.brand ? { brand: { equals: query.brand, mode: 'insensitive' } } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { brand: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      // A size filter is really a question about variants, not products.
      ...(query.size ? { variants: { some: { name: query.size, isActive: true } } } : {}),
    };

    const products = await this.prisma.product.findMany({
      where,
      include: {
        category: { select: { name: true, slug: true } },
        variants: { orderBy: { name: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const variantIds = products.flatMap((p) => p.variants.map((v) => v.id));
    const [stock, offers] = await Promise.all([
      this.stockMap(variantIds),
      this.offerMap(variantIds),
    ]);
    let shaped = products.map((product) => this.shape(product, stock, offers));

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

  async bySlug(slug: string) {
    const product = await this.prisma.product.findFirst({
      where: { slug, isActive: true },
      include: {
        category: { select: { name: true, slug: true } },
        variants: { orderBy: { name: 'asc' } },
      },
    });
    if (!product) throw new NotFoundException(`No product at "${slug}"`);

    const [stock, offers] = await Promise.all([
      this.stockMap(product.variants.map((variant) => variant.id)),
      this.offerMap(product.variants.map((variant) => variant.id)),
    ]);
    const shaped = this.shape(product, stock, offers);

    // A few alternatives from the same category, so a sold-out size is not a
    // dead end.
    const related = await this.prisma.product.findMany({
      where: { isActive: true, id: { not: product.id }, categoryId: product.categoryId },
      include: { category: { select: { name: true, slug: true } }, variants: true },
      take: 5,
    });
    const relatedStock = await this.stockMap(related.flatMap((p) => p.variants.map((v) => v.id)));

    const relatedOffers = await this.offerMap(
      related.flatMap((item) => item.variants.map((variant) => variant.id)),
    );
    return {
      ...shaped,
      related: related.map((item) => this.shape(item, relatedStock, relatedOffers)),
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
