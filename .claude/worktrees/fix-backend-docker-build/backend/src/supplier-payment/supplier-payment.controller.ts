import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { SupplierPaymentService } from './supplier-payment.service';
import { CreateSupplierPaymentDto } from './dto/create-supplier-payment.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('supplier-payments')
@Controller('supplier-payments')
export class SupplierPaymentController {
  constructor(private readonly service: SupplierPaymentService) {}

  @Post()
  @Permissions(buildPermissionKey('SupplierPayment', 'create'))
  stage(@Body() dto: CreateSupplierPaymentDto) {
    return this.service.stage(dto);
  }

  @Get()
  @Permissions(buildPermissionKey('SupplierPayment', 'read'))
  findAll(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('supplierId') supplierId?: string,
    @Query('status') status?: string,
  ) {
    return this.service.findAll({
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
      supplierId,
      status,
    });
  }

  @Get(':id')
  @Permissions(buildPermissionKey('SupplierPayment', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post(':id/approve')
  @Permissions(buildPermissionKey('SupplierPayment', 'update'))
  approve(@Param('id') id: string, @Body('approvedBy') approvedBy?: string) {
    return this.service.approve(id, approvedBy || 'system');
  }

  @Post(':id/release')
  @Permissions(buildPermissionKey('SupplierPayment', 'update'))
  release(@Param('id') id: string) {
    return this.service.release(id);
  }

  @Post(':id/cancel')
  @Permissions(buildPermissionKey('SupplierPayment', 'update'))
  cancel(@Param('id') id: string) {
    return this.service.cancel(id);
  }
}
