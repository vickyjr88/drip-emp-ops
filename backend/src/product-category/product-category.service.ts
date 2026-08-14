import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { UpdateProductCategoryDto } from './dto/update-product-category.dto';

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
      include: { _count: { select: { products: true, children: true } } },
    });
  }

  async findOne(id: string) {
    const category = await this.prisma.productCategory.findUnique({
      where: { id },
      include: { children: true, _count: { select: { products: true } } },
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
}
