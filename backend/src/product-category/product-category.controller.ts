import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';
import { ProductCategoryService } from './product-category.service';
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { UpdateProductCategoryDto } from './dto/update-product-category.dto';
import { CreateCategoryAttributeDto, UpdateCategoryAttributeDto } from './dto/category-attribute.dto';

@ApiBearerAuth()
@ApiTags('product-categories')
@Controller('product-categories')
export class ProductCategoryController {
  constructor(private readonly service: ProductCategoryService) {}

  @Post()
  @Permissions(buildPermissionKey('ProductCategory', 'create'))
  create(@Body() dto: CreateProductCategoryDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions(buildPermissionKey('ProductCategory', 'read'))
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @Permissions(buildPermissionKey('ProductCategory', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Permissions(buildPermissionKey('ProductCategory', 'update'))
  update(@Param('id') id: string, @Body() dto: UpdateProductCategoryDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions(buildPermissionKey('ProductCategory', 'delete'))
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Get(':id/attributes')
  @Permissions(buildPermissionKey('ProductCategory', 'read'))
  listAttributes(@Param('id') id: string) {
    return this.service.listAttributes(id);
  }

  @Post(':id/attributes')
  @Permissions(buildPermissionKey('ProductCategory', 'update'))
  createAttribute(@Param('id') id: string, @Body() dto: CreateCategoryAttributeDto) {
    return this.service.createAttribute(id, dto);
  }

  @Patch(':id/attributes/:attributeId')
  @Permissions(buildPermissionKey('ProductCategory', 'update'))
  updateAttribute(
    @Param('id') id: string,
    @Param('attributeId') attributeId: string,
    @Body() dto: UpdateCategoryAttributeDto,
  ) {
    return this.service.updateAttribute(id, attributeId, dto);
  }

  @Delete(':id/attributes/:attributeId')
  @Permissions(buildPermissionKey('ProductCategory', 'update'))
  removeAttribute(@Param('id') id: string, @Param('attributeId') attributeId: string) {
    return this.service.removeAttribute(id, attributeId);
  }
}
