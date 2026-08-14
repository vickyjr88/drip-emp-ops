import { Controller, Get, Post, Body, Param, Delete, Query } from '@nestjs/common';
import { SupplierInvoiceService } from './supplier-invoice.service';
import { CreateSupplierInvoiceDto } from './dto/create-supplier-invoice.dto';
import { CreateSupplierInvoiceAttachmentDto } from './dto/create-supplier-invoice-attachment.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('supplier-invoices')
@Controller('supplier-invoices')
export class SupplierInvoiceController {
  constructor(private readonly service: SupplierInvoiceService) {}

  @Post()
  @Permissions(buildPermissionKey('SupplierInvoice', 'create'))
  create(@Body() dto: CreateSupplierInvoiceDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions(buildPermissionKey('SupplierInvoice', 'read'))
  findAll(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('supplierId') supplierId?: string,
    @Query('status') status?: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.service.findAll({
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
      supplierId,
      status,
      projectId,
    });
  }

  @Get(':id')
  @Permissions(buildPermissionKey('SupplierInvoice', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post(':id/approve')
  @Permissions(buildPermissionKey('SupplierInvoice', 'update'))
  approve(@Param('id') id: string, @Body('approvedBy') approvedBy?: string) {
    return this.service.approve(id, approvedBy || 'system');
  }

  @Post(':id/dispute')
  @Permissions(buildPermissionKey('SupplierInvoice', 'update'))
  dispute(@Param('id') id: string) {
    return this.service.dispute(id);
  }

  @Post(':id/email')
  @Permissions(buildPermissionKey('SupplierInvoice', 'update'))
  email(@Param('id') id: string) {
    return this.service.email(id);
  }

  @Post(':id/attachments')
  @Permissions(buildPermissionKey('SupplierInvoice', 'update'))
  addAttachment(@Param('id') id: string, @Body() dto: CreateSupplierInvoiceAttachmentDto) {
    return this.service.addAttachment(id, dto);
  }

  @Delete('attachments/:attachmentId')
  @Permissions(buildPermissionKey('SupplierInvoice', 'update'))
  removeAttachment(@Param('attachmentId') attachmentId: string) {
    return this.service.removeAttachment(attachmentId);
  }
}
