import { Controller, Get, Post, Body, Param, Patch, Query, StreamableFile } from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { CreateInvoiceDto, BulkGenerateInvoicesDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto, CancelInvoiceDto } from './dto/update-invoice.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('invoices')
@Controller('invoices')
export class InvoiceController {
  constructor(private readonly service: InvoiceService) {}

  @Post()
  @Permissions(buildPermissionKey('Invoice', 'create'))
  create(@Body() dto: CreateInvoiceDto) {
    return this.service.create(dto);
  }


  @Get()
  @Permissions(buildPermissionKey('Invoice', 'read'))
  findAll(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('customerId') customerId?: string,
    @Query('status') status?: string,
  ) {
    return this.service.findAll({
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
      customerId,
      status,
    });
  }

  @Get('reports/aging')
  @Permissions(buildPermissionKey('Invoice', 'read'))
  agingReport(@Query('asOf') asOf?: string, @Query('storeId') storeId?: string) {
    return this.service.agingReport(asOf, storeId);
  }

  @Get('reports/statement/:customerId')
  @Permissions(buildPermissionKey('Invoice', 'read'))
  customerStatement(@Param('customerId') customerId: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.service.customerStatement(customerId, from, to);
  }

  @Get(':id')
  @Permissions(buildPermissionKey('Invoice', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/balance')
  @Permissions(buildPermissionKey('Invoice', 'read'))
  balance(@Param('id') id: string) {
    return this.service.balance(id);
  }

  @Get(':id/pdf')
  @Permissions(buildPermissionKey('Invoice', 'read'))
  async downloadPdf(@Param('id') id: string) {
    const { buffer, invoiceNumber } = await this.service.pdf(id);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="invoice-${invoiceNumber}.pdf"`,
    });
  }

  @Patch(':id')
  @Permissions(buildPermissionKey('Invoice', 'update'))
  update(@Param('id') id: string, @Body() dto: UpdateInvoiceDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/email')
  @Permissions(buildPermissionKey('Invoice', 'update'))
  email(@Param('id') id: string) {
    return this.service.email(id);
  }

  @Post(':id/cancel')
  @Permissions(buildPermissionKey('Invoice', 'update'))
  cancel(@Param('id') id: string, @Body() dto: CancelInvoiceDto) {
    return this.service.cancel(id, dto);
  }
}
