import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { UpdateProductCategoryDto } from './dto/update-product-category.dto';
import { CreateCategoryAttributeDto, UpdateCategoryAttributeDto } from './dto/category-attribute.dto';

@Injectable()
export class ProductCategoryService {
  constructor(private readonly prisma: PrismaService) {}

  private slugify(value: string) {
    return value.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  async create(dto: CreateProductCategoryDto) {
    return this.prisma.productCategory.create({
      data: { ...dto, slug: dto.slug ? this.slugify(dto.slug) : this.slugify(dto.name) },
    });
  }

  findAll() {
    return this.prisma.productCategory.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { products: true, children: true } },
        // So the catalogue form knows, for every category in the picker,
        // whether it has a size (or other) attribute at all -- without this
        // it would need a second request per category just to find out.
        attributes: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
      },
    });
  }

  async findOne(id: string) {
    const category = await this.prisma.productCategory.findUnique({
      where: { id },
      include: {
        children: true,
        _count: { select: { products: true } },
        attributes: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
      },
    });
    if (!category) throw new NotFoundException(`Category ${id} not found`);
    return category;
  }

  async update(id: string, dto: UpdateProductCategoryDto) {
    await this.findOne(id);
    // A category cannot be its own parent, which would make the tree unwalkable.
    if (dto.parentId === id) {
      throw new BadRequestException('A category cannot be its own parent.');
    }
    return this.prisma.productCategory.update({
      where: { id },
      data: { ...dto, ...(dto.slug ? { slug: this.slugify(dto.slug) } : {}) },
    });
  }

  async remove(id: string) {
    const category = await this.findOne(id);
    if (category._count.products > 0 || category.children.length > 0) {
      throw new BadRequestException(
        `This category holds ${category._count.products} product(s) and ${category.children.length} sub-category(ies). Move or remove them first.`,
      );
    }
    return this.prisma.productCategory.delete({ where: { id } });
  }

  /** What distinguishes a variant in this category -- e.g. "size" with EUR
   *  options for Shoes. Empty for a category with none (Watches, Perfumes),
   *  which the catalogue form reads as "no size picker for this category". */
  async listAttributes(categoryId: string) {
    await this.findOne(categoryId);
    return this.prisma.categoryAttribute.findMany({
      where: { categoryId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createAttribute(categoryId: string, dto: CreateCategoryAttributeDto) {
    await this.findOne(categoryId);
    const key = dto.key.trim().toLowerCase().replace(/\s+/g, '_');
    const existing = await this.prisma.categoryAttribute.findUnique({
      where: { categoryId_key: { categoryId, key } },
    });
    if (existing) {
      throw new ConflictException(`This category already has an attribute keyed "${key}".`);
    }
    return this.prisma.categoryAttribute.create({
      data: {
        categoryId,
        key,
        label: dto.label.trim(),
        options: dto.options.map((option) => option.trim()).filter(Boolean),
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateAttribute(categoryId: string, attributeId: string, dto: UpdateCategoryAttributeDto) {
    const attribute = await this.prisma.categoryAttribute.findFirst({ where: { id: attributeId, categoryId } });
    if (!attribute) throw new NotFoundException(`Attribute ${attributeId} not found on this category`);
    return this.prisma.categoryAttribute.update({
      where: { id: attributeId },
      data: {
        ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
        ...(dto.options !== undefined ? { options: dto.options.map((option) => option.trim()).filter(Boolean) } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
  }

  async removeAttribute(categoryId: string, attributeId: string) {
    const attribute = await this.prisma.categoryAttribute.findFirst({ where: { id: attributeId, categoryId } });
    if (!attribute) throw new NotFoundException(`Attribute ${attributeId} not found on this category`);
    // No product-level guard needed the way remove() above guards a category
    // with products: a variant's attributes JSON is written once at creation
    // and never re-validated against the category's current attribute list,
    // so removing an attribute here does not orphan or corrupt anything
    // already saved -- it only stops the option from being offered to staff
    // creating a *new* variant going forward.
    return this.prisma.categoryAttribute.delete({ where: { id: attributeId } });
  }
}
