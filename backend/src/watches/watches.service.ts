import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PriceTier, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorefrontService } from '../storefront/storefront.service';
import { CreateWatchDto, UpdateWatchDto } from './dto/watches.dto';

export const WATCHES_CATEGORY_SLUG = 'watches';

const slugify = (value: string) =>
  value.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const INCLUDE = {
  category: { select: { name: true, slug: true, attributes: { select: { key: true, label: true } }, parent: { select: { name: true, slug: true } } } },
  variants: { orderBy: { name: 'asc' } },
} satisfies Prisma.ProductInclude;

/**
 * The Watches line: its own pages, feed and staff screen, kept out of the shoe shop. Which products belong here is decided
 * by the database (a product in the Watches category is a watch; see migration 20261108090100), so a watch added by any
 * route lands here and the shop's queries, which only read the SHOP line, never see it.
 *
 * A watch has no size. Whatever the category once carried, nothing here reads or shows one: a watch is one thing, or it
 * comes in a few named choices (a strap or dial colour), and those are plain options.
 */
@Injectable()
export class WatchesService {
  constructor(private readonly prisma: PrismaService, private readonly storefront: StorefrontService) {}

  private async shape(rows: any[], user?: { priceTier?: PriceTier }) {
    const shaped = await this.storefront.shapeProducts(rows, user);
    return shaped.map((product) => ({
      ...product,
      variants: product.variants.map((variant: any) => ({ ...variant, size: null })),
      sizesInStock: [] as string[],
      // Named choices only when there is more than one; a single watch has nothing to pick.
      options: product.variants.length > 1 ? product.variants.map((v: any) => ({ id: v.id, name: v.name })) : [],
    }));
  }

  async status() {
    return { count: await this.prisma.product.count({ where: { line: 'WATCH', isActive: true } }) };
  }

  async list(
    query: { brand?: string; search?: string; minPrice?: string; maxPrice?: string; inStockOnly?: string; sort?: string },
    user?: { priceTier?: PriceTier },
  ) {
    const words = (query.search ?? '').trim().split(/\s+/).filter(Boolean);
    const rows = await this.prisma.product.findMany({
      where: {
        line: 'WATCH',
        isActive: true,
        ...(query.brand ? { brand: { equals: query.brand, mode: 'insensitive' as const } } : {}),
        ...(words.length
          ? {
              AND: words.map((word) => ({
                OR: [
                  { name: { contains: word, mode: 'insensitive' as const } },
                  { brand: { contains: word, mode: 'insensitive' as const } },
                  { description: { contains: word, mode: 'insensitive' as const } },
                  { variants: { some: { isActive: true, sku: { contains: word, mode: 'insensitive' as const } } } },
                ],
              })),
            }
          : {}),
      },
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    let shaped = await this.shape(rows, user);
    if (query.minPrice) shaped = shaped.filter((p) => p.priceTo >= Number(query.minPrice));
    if (query.maxPrice) shaped = shaped.filter((p) => p.priceFrom <= Number(query.maxPrice));
    if (query.inStockOnly === 'true') shaped = shaped.filter((p) => p.anyInStock);
    const bySort: Record<string, (a: any, b: any) => number> = {
      'price-asc': (a, b) => a.priceFrom - b.priceFrom,
      'price-desc': (a, b) => b.priceFrom - a.priceFrom,
      name: (a, b) => a.name.localeCompare(b.name),
    };
    const comparator = bySort[query.sort || ''] || (() => 0);
    // A sold-out watch sinks, whatever the sort: the best place on the page is for something that can be bought.
    shaped.sort((a, b) => Number(b.anyInStock) - Number(a.anyInStock) || comparator(a, b));
    return shaped;
  }

  async bySlug(slug: string, user?: { priceTier?: PriceTier }) {
    const row = await this.prisma.product.findFirst({ where: { slug, line: 'WATCH', isActive: true }, include: INCLUDE });
    if (!row) throw new NotFoundException(`No watch at "${slug}"`);
    const [shaped] = await this.shape([row], user);
    // More from the same brand first, then the rest of the range.
    const sameBrand = row.brand
      ? await this.prisma.product.findMany({ where: { line: 'WATCH', isActive: true, id: { not: row.id }, brand: { equals: row.brand, mode: 'insensitive' } }, include: INCLUDE, take: 6, orderBy: { createdAt: 'desc' } })
      : [];
    const others = sameBrand.length >= 4 ? [] : await this.prisma.product.findMany({ where: { line: 'WATCH', isActive: true, id: { notIn: [row.id, ...sameBrand.map((r) => r.id)] } }, include: INCLUDE, take: 6 - sameBrand.length, orderBy: { createdAt: 'desc' } });
    return { ...shaped, related: await this.shape([...sameBrand, ...others], user) };
  }

  /** Brands with at least one watch on sale, with a count: the brand directory and the filter. */
  async brands() {
    const rows = await this.prisma.product.groupBy({ by: ['brand'], where: { line: 'WATCH', isActive: true, brand: { not: null } }, _count: { _all: true } });
    return rows
      .filter((r) => r.brand && r.brand.trim())
      .map((r) => ({ name: r.brand as string, slug: slugify(r.brand as string), count: r._count._all }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  // -------------------------------------------------------------------------
  // Staff
  // -------------------------------------------------------------------------

  /** The Watches category, created if the shop has none. It carries no size attribute, by design. */
  private async category() {
    return this.prisma.productCategory.upsert({
      where: { slug: WATCHES_CATEGORY_SLUG },
      update: {},
      create: { name: 'Watches', slug: WATCHES_CATEGORY_SLUG, description: 'Watches', isActive: true },
    });
  }

  private async uniqueSlug(base: string) {
    const root = slugify(base) || 'watch';
    let candidate = root;
    for (let n = 2; ; n++) {
      if (!(await this.prisma.product.findFirst({ where: { slug: candidate }, select: { id: true } }))) return candidate;
      candidate = `${root}-${n}`;
    }
  }

  async adminList() {
    const rows = await this.prisma.product.findMany({ where: { line: 'WATCH' }, include: INCLUDE, orderBy: { createdAt: 'desc' } });
    return rows.map((row) => ({
      id: row.id, slug: row.slug, name: row.name, brand: row.brand, sku: row.sku, isActive: row.isActive, isFeatured: row.isFeatured,
      imageUrls: row.imageUrls,
      variants: row.variants.map((v) => ({ id: v.id, sku: v.sku, name: v.name, priceKes: Number(v.priceKes), isActive: v.isActive, isDropShip: v.isDropShip })),
    }));
  }

  async adminCreate(dto: CreateWatchDto) {
    const category = await this.category();
    const prefix = (dto.skuPrefix || slugify(dto.name)).toUpperCase().replace(/-+/g, '-').slice(0, 40);
    const images = dto.imageUrls?.filter(Boolean) ?? [];
    const options = (dto.options ?? []).map((o) => o.trim()).filter(Boolean);
    const variants = options.length
      ? options.map((name) => ({ sku: `${prefix}-${name.toUpperCase().replace(/[^A-Z0-9]+/g, '')}`, name }))
      : [{ sku: prefix, name: 'Standard' }];
    try {
      await this.prisma.product.create({
        data: {
          sku: prefix,
          name: dto.name,
          slug: await this.uniqueSlug(dto.slug || dto.name),
          description: dto.description,
          brand: dto.brand?.trim() || null,
          categoryId: category.id,
          imageUrls: images as unknown as Prisma.InputJsonValue,
          featuredImageUrl: images[0],
          isActive: dto.isActive ?? true,
          variants: {
            create: variants.map((v) => ({
              sku: v.sku,
              name: v.name,
              // No attributes at all: a watch has no size, and nothing about it should look like one.
              priceKes: new Prisma.Decimal(dto.priceKes),
              ...(dto.costKes !== undefined ? { costKes: new Prisma.Decimal(dto.costKes) } : {}),
              isDropShip: dto.isDropShip ?? false,
            })),
          },
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('A product with that SKU already exists. Use a different SKU prefix.');
      }
      throw error;
    }
    return (await this.adminList()).find((w) => w.sku === prefix);
  }

  async adminUpdate(id: string, dto: UpdateWatchDto) {
    const row = await this.prisma.product.findFirst({ where: { id, line: 'WATCH' } });
    if (!row) throw new NotFoundException('Watch not found');
    const images = dto.imageUrls?.filter(Boolean);
    await this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.brand !== undefined ? { brand: dto.brand?.trim() || null } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(images ? { imageUrls: images as unknown as Prisma.InputJsonValue, featuredImageUrl: images[0] ?? null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.isFeatured !== undefined ? { isFeatured: dto.isFeatured } : {}),
      },
    });
    return (await this.adminList()).find((w) => w.id === id);
  }
}
