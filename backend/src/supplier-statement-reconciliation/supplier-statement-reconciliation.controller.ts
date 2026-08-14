import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { SupplierStatementReconciliationService } from './supplier-statement-reconciliation.service';
import { CreateSupplierStatementReconciliationDto } from './dto/create-supplier-statement-reconciliation.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('supplier-statement-reconciliations')
@Controller('supplier-statement-reconciliations')
export class SupplierStatementReconciliationController {
  constructor(private readonly service: SupplierStatementReconciliationService) {}

  @Post()
  @Permissions(buildPermissionKey('SupplierStatementReconciliation', 'create'))
  create(@Body() dto: CreateSupplierStatementReconciliationDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions(buildPermissionKey('SupplierStatementReconciliation', 'read'))
  findAll(@Query('supplierId') supplierId?: string) {
    return this.service.findAll(supplierId);
  }

  @Get(':id')
  @Permissions(buildPermissionKey('SupplierStatementReconciliation', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post(':id/complete')
  @Permissions(buildPermissionKey('SupplierStatementReconciliation', 'update'))
  complete(@Param('id') id: string, @Body('reconciledBy') reconciledBy?: string) {
    return this.service.complete(id, reconciledBy || 'system');
  }
}
