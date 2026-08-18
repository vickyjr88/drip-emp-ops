import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';
import { ProductService } from './product.service';
import { CreateProductDto, CreateVariantDto } from './dto/create-product.dto';
import { UpdateProductDto, UpdateVariantDto } from './dto/update-product.dto';
import { DuplicateProductDto } from './dto/duplicate-product.dto';

@ApiBearerAuth()
@ApiTags('products')
@Controller('products')
export class ProductController {
  constructor(private readonly service: ProductService) {}

  @Post()
  @Permissions(buildPermissionKey('Product', 'create'))
  create(@Body() dto: CreateProductDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions(buildPermissionKey('Product', 'read'))
  findAll(
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('brand') brand?: string,
    @Query('isActive') isActive?: string,
    @Query('skip') skip?: number,
    @Query('take') take?: number,
  ) {
    return this.service.findAll({ search, categoryId, brand, isActive, skip, take });
  }

  // Declared before ':id' so Nest does not read "variants" as a product id.
  @Patch('variants/:variantId')
  @Permissions(buildPermissionKey('Product', 'update'))
  updateVariant(@Param('variantId') variantId: string, @Body() dto: UpdateVariantDto) {
    return this.service.updateVariant(variantId, dto);
  }

  @Delete('variants/:variantId')
  @Permissions(buildPermissionKey('Product', 'delete'))
  removeVariant(@Param('variantId') variantId: string) {
    return this.service.removeVariant(variantId);
  }

  @Get(':id')
  @Permissions(buildPermissionKey('Product', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Permissions(buildPermissionKey('Product', 'update'))
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions(buildPermissionKey('Product', 'delete'))
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  // Creating a new product from an existing one, so 'create' rather than
  // 'update': the caller ends up with a product they did not have before.
  @Post(':id/duplicate')
  @Permissions(buildPermissionKey('Product', 'create'))
  duplicate(@Param('id') id: string, @Body() dto: DuplicateProductDto) {
    return this.service.duplicate(id, dto);
  }

  @Post(':id/variants')
  @Permissions(buildPermissionKey('Product', 'update'))
  addVariant(@Param('id') id: string, @Body() dto: CreateVariantDto) {
    return this.service.addVariant(id, dto);
  }
}
