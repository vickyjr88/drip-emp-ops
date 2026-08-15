import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto, CreateVariantDto } from './dto/create-product.dto';
import { UpdateProductDto, UpdateVariantDto } from './dto/update-product.dto';

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
  async findAll(query: {
    search?: string;
    categoryId?: string;
    brand?: string;
    isActive?: string;
    skip?: number;
    take?: number;
  }) {
    const where: Prisma.ProductWhereInput = {
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.brand ? { brand: { equals: query.brand, mode: 'insensitive' } } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive !== 'false' } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { sku: { contains: query.search, mode: 'insensitive' } },
              { brand: { contains: query.search, mode: 'insensitive' } },
              { variants: { some: { sku: { contains: query.search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };

    const take = query.take ? Math.min(Number(query.take), 200) : undefined;
    const skip = query.skip ? Number(query.skip) : undefined;

    if (take === undefined && skip === undefined) {
      return this.prisma.product.findMany({ where, include: INCLUDE, orderBy: { name: 'asc' } });
    }

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({ where, include: INCLUDE, orderBy: { name: 'asc' }, skip, take }),
      this.prisma.product.count({ where }),
    ]);
    return { items, total, skip: skip ?? 0, take: take ?? items.length };
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
