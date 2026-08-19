import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto, CreateVariantDto } from './dto/create-product.dto';
import { UpdateProductDto, UpdateVariantDto } from './dto/update-product.dto';
import { DuplicateProductDto } from './dto/duplicate-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { paginate } from '../common/pagination.util';

const INCLUDE = {
  category: { select: { id: true, name: true, slug: true } },
  variants: { orderBy: { name: 'asc' } },
} satisfies Prisma.ProductInclude;

/** Null clears the column; a number becomes a Decimal. */
function toNullableDecimal(value: number | null | undefined) {
  return value === null || value === undefined ? null : new Prisma.Decimal(value);
}

@Injectable()
export class ProductService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lower-case, hyphenated, no punctuation — safe in a URL. */
  private slugify(value: string) {
    return value
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * A slug has to be unique, and two colourways of the same shoe legitimately
   * share a name, so a suffix is added rather than rejecting the second one.
   */
  private async uniqueSlug(base: string, ignoreId?: string) {
    const root = this.slugify(base) || 'product';
    let candidate = root;
    for (let n = 2; ; n++) {
      const clash = await this.prisma.product.findFirst({
        where: { slug: candidate, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
        select: { id: true },
      });
      if (!clash) return candidate;
      candidate = `${root}-${n}`;
    }
  }

  private variantData(dto: CreateVariantDto) {
    return {
      sku: dto.sku,
      name: dto.name,
      attributes: (dto.attributes ?? undefined) as Prisma.InputJsonValue | undefined,
      priceKes: new Prisma.Decimal(dto.priceKes),
      ...(dto.resellerPriceKes !== undefined ? { resellerPriceKes: new Prisma.Decimal(dto.resellerPriceKes) } : {}),
      ...(dto.wholesalePriceKes !== undefined ? { wholesalePriceKes: new Prisma.Decimal(dto.wholesalePriceKes) } : {}),
      ...(dto.costKes !== undefined ? { costKes: new Prisma.Decimal(dto.costKes) } : {}),
      barcode: dto.barcode,
      isActive: dto.isActive ?? true,
      isDropShip: dto.isDropShip ?? false,
    };
  }

  async create(dto: CreateProductDto) {
    const { variants, slug, imageUrls, featuredImageUrl, ...rest } = dto;
    return this.prisma.product.create({
      data: {
        ...rest,
        slug: await this.uniqueSlug(slug || dto.name),
        imageUrls: (imageUrls ?? undefined) as Prisma.InputJsonValue | undefined,
        // Falls back to the first image, so a product is never left with a
        // gallery and nothing chosen to represent it.
        featuredImageUrl: featuredImageUrl || imageUrls?.[0],
        ...(variants?.length
          ? { variants: { create: variants.map((variant) => this.variantData(variant)) } }
          : {}),
      },
      include: INCLUDE,
    });
  }

  /**
   * Catalogue search.
   *
   * Matching runs across name, SKU and brand together, because someone looking
   * for a shoe types whichever of the three they happen to remember.
   */
  async findAll(query: ProductQueryDto) {
    const { skip, take, search, categoryId, brand, isActive } = query;
    const where: Prisma.ProductWhereInput = {
      ...(categoryId ? { categoryId } : {}),
      ...(brand ? { brand: { equals: brand, mode: 'insensitive' } } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { sku: { contains: search, mode: 'insensitive' } },
              { brand: { contains: search, mode: 'insensitive' } },
              { variants: { some: { sku: { contains: search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.ProductOrderByWithRelationInput[] = [{ name: 'asc' }, { id: 'asc' }];
    return paginate(
      (args) => this.prisma.product.findMany({ where, include: INCLUDE, orderBy, ...args }),
      () => this.prisma.product.count({ where }),
      skip,
      take,
    );
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id }, include: INCLUDE });
    if (!product) throw new NotFoundException(`Product ${id} not found`);
    return product;
  }

  async update(id: string, dto: UpdateProductDto) {
    const current = await this.findOne(id);
    const { slug, imageUrls, featuredImageUrl, ...rest } = dto;

    // The featured image has to be one the product actually has. Removing the
    // featured image would otherwise leave a pointer at a deleted file, and
    // the shop would render a broken card.
    const gallery = imageUrls ?? ((current.imageUrls as string[] | null) ?? []);
    const wanted = featuredImageUrl ?? current.featuredImageUrl ?? undefined;
    const resolvedFeatured =
      wanted && gallery.includes(wanted) ? wanted : gallery[0] ?? null;
    return this.prisma.product.update({
      where: { id },
      data: {
        ...rest,
        ...(slug ? { slug: await this.uniqueSlug(slug, id) } : {}),
        ...(imageUrls !== undefined
          ? { imageUrls: imageUrls as Prisma.InputJsonValue }
          : {}),
        ...(imageUrls !== undefined || featuredImageUrl !== undefined
          ? { featuredImageUrl: resolvedFeatured }
          : {}),
      },
      include: INCLUDE,
    });
  }

  /**
   * Products that have sold are deactivated, not deleted.
   *
   * An order line points at the variant it sold, so removing the product would
   * break the order history it belongs to.
   */
  async remove(id: string) {
    await this.findOne(id);
    const sold = await this.prisma.orderLine.count({ where: { variant: { productId: id } } });
    if (sold > 0) {
      throw new BadRequestException(
        `This product appears on ${sold} order line(s). Deactivate it instead so the order history stays intact.`,
      );
    }
    return this.prisma.product.delete({ where: { id } });
  }

  /**
   * Copy a product, its details and its whole size run.
   *
   * The shop sells the same shoe in several colourways, each with the same
   * sizes and the same three price tiers, so creating the second one by hand
   * means re-entering a dozen rows that differ only by SKU.
   *
   * The copy starts inactive and unstocked. Stock levels and movements are
   * deliberately not copied: the shoes have not been received yet, and a copy
   * that claimed stock it does not have would be sellable immediately.
   */
  async duplicate(id: string, dto: DuplicateProductDto) {
    const source = await this.findOne(id);

    const clash = await this.prisma.product.findFirst({
      where: { sku: dto.sku },
      select: { id: true },
    });
    if (clash) {
      throw new BadRequestException(`SKU ${dto.sku} is already used by another product.`);
    }

    // Variant SKUs are rebuilt from the new product SKU, keeping whatever
    // suffix distinguished them on the source ("AF1-WHT-EUR39" -> "AF1-BLK-EUR39").
    // A variant whose SKU did not follow that shape falls back to its name, so
    // hand-entered SKUs still produce something unique rather than colliding.
    const variants = source.variants.map((variant) => {
      const suffix = variant.sku.startsWith(`${source.sku}-`)
        ? variant.sku.slice(source.sku.length + 1)
        : variant.name.replace(/\s+/g, '');
      return {
        sku: `${dto.sku}-${suffix}`.toUpperCase(),
        name: variant.name,
        attributes: (variant.attributes ?? undefined) as Prisma.InputJsonValue | undefined,
        priceKes: variant.priceKes,
        resellerPriceKes: variant.resellerPriceKes,
        wholesalePriceKes: variant.wholesalePriceKes,
        costKes: variant.costKes,
        isActive: variant.isActive,
      };
    });

    // Every variant SKU is unique overall, not just within this product, so a
    // second copy of the same source would collide. Caught here to name the
    // offending SKU rather than surfacing a raw Prisma constraint error.
    const taken = await this.prisma.productVariant.findFirst({
      where: { sku: { in: variants.map((variant) => variant.sku) } },
      select: { sku: true },
    });
    if (taken) {
      throw new BadRequestException(
        `Variant SKU ${taken.sku} already exists. Choose a different product SKU for the copy.`,
      );
    }

    return this.prisma.product.create({
      data: {
        sku: dto.sku,
        name: dto.name,
        slug: await this.uniqueSlug(dto.name),
        description: source.description,
        brand: dto.brand ?? source.brand,
        categoryId: dto.categoryId ?? source.categoryId,
        imageUrls: (source.imageUrls ?? undefined) as Prisma.InputJsonValue | undefined,
        featuredImageUrl: source.featuredImageUrl,
        // Inactive so the copy cannot be sold before someone has checked the
        // details and received stock against it.
        isActive: false,
        ...(variants.length ? { variants: { create: variants } } : {}),
      },
      include: INCLUDE,
    });
  }

  // --- variants ------------------------------------------------------------

  async addVariant(productId: string, dto: CreateVariantDto) {
    await this.findOne(productId);
    return this.prisma.productVariant.create({
      data: { productId, ...this.variantData(dto) },
    });
  }

  async updateVariant(variantId: string, dto: UpdateVariantDto) {
    const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) throw new NotFoundException(`Variant ${variantId} not found`);

    return this.prisma.productVariant.update({
      where: { id: variantId },
      data: {
        ...(dto.sku !== undefined ? { sku: dto.sku } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.attributes !== undefined
          ? { attributes: dto.attributes as Prisma.InputJsonValue }
          : {}),
        ...(dto.priceKes !== undefined ? { priceKes: new Prisma.Decimal(dto.priceKes) } : {}),
        // The three optional money fields are nullable: clearing one means
        // "not recorded", which the margin reports flag, and is different from
        // zero. new Prisma.Decimal(null) throws, so null has to pass through.
        ...(dto.resellerPriceKes !== undefined
          ? { resellerPriceKes: toNullableDecimal(dto.resellerPriceKes) }
          : {}),
        ...(dto.wholesalePriceKes !== undefined
          ? { wholesalePriceKes: toNullableDecimal(dto.wholesalePriceKes) }
          : {}),
        ...(dto.costKes !== undefined ? { costKes: toNullableDecimal(dto.costKes) } : {}),
        ...(dto.barcode !== undefined ? { barcode: dto.barcode } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.isDropShip !== undefined ? { isDropShip: dto.isDropShip } : {}),
      },
    });
  }

  async removeVariant(variantId: string) {
    const sold = await this.prisma.orderLine.count({ where: { variantId } });
    if (sold > 0) {
      throw new BadRequestException(
        `This variant appears on ${sold} order line(s). Deactivate it instead.`,
      );
    }
    return this.prisma.productVariant.delete({ where: { id: variantId } });
  }
}
