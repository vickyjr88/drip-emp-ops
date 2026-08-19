import { Controller, Get, Post, Body, Param, Patch, Delete, Query } from '@nestjs/common';
import { SupplierService } from './supplier.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SupplierQueryDto } from './dto/supplier-query.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('suppliers')
@Controller('suppliers')
export class SupplierController {
  constructor(private readonly service: SupplierService) {}

  @Post()
  @Permissions(buildPermissionKey('Supplier', 'create'))
  create(@Body() dto: CreateSupplierDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions(buildPermissionKey('Supplier', 'read'))
  findAll(@Query() query: SupplierQueryDto) {
    return this.service.findAll(query);
  }

  // Declared before :id so these literal paths are not read as supplier ids.
  @Get('balances')
  @Permissions(buildPermissionKey('Supplier', 'read'))
  balances() {
    return this.service.balances();
  }

  @Get(':id/account')
  @Permissions(buildPermissionKey('Supplier', 'read'))
  account(@Param('id') id: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.service.account(id, { from, to });
  }

  @Patch('journal-lines/:lineId/tag')
  @Permissions(buildPermissionKey('JournalEntry', 'update'))
  tagLine(@Param('lineId') lineId: string, @Body('supplierId') supplierId?: string | null) {
    return this.service.tagJournalLine(lineId, supplierId || null);
  }

  @Get(':id')
  @Permissions(buildPermissionKey('Supplier', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Permissions(buildPermissionKey('Supplier', 'update'))
  update(@Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions(buildPermissionKey('Supplier', 'delete'))
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
