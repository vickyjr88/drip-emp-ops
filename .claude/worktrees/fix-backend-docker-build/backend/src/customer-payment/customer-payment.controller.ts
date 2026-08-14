import { Controller, Get, Post, Body, Param, Patch, Delete, Query, StreamableFile } from '@nestjs/common';
import { CustomerPaymentService } from './customer-payment.service';
import { CreateCustomerPaymentDto } from './dto/create-customer-payment.dto';
import { UpdateCustomerPaymentDto } from './dto/update-customer-payment.dto';
import { ReallocateCustomerPaymentDto } from './dto/reallocate-customer-payment.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('customer-payments')
@Controller('customer-payments')
export class CustomerPaymentController {
  constructor(private readonly service: CustomerPaymentService) {}

  @Post()
  @Permissions(buildPermissionKey('CustomerPayment', 'create'))
  create(@Body() dto: CreateCustomerPaymentDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions(buildPermissionKey('CustomerPayment', 'read'))
  findAll(@Query() pagination: PaginationDto) {
    return this.service.findAll(pagination);
  }

  @Get(':id')
  @Permissions(buildPermissionKey('CustomerPayment', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Permissions(buildPermissionKey('CustomerPayment', 'update'))
  update(@Param('id') id: string, @Body() dto: UpdateCustomerPaymentDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions(buildPermissionKey('CustomerPayment', 'delete'))
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/reallocate')
  @Permissions(buildPermissionKey('CustomerPayment', 'update'))
  reallocate(@Param('id') id: string, @Body() dto: ReallocateCustomerPaymentDto) {
    return this.service.reallocate(id, dto);
  }

  @Get(':id/pdf')
  @Permissions(buildPermissionKey('CustomerPayment', 'read'))
  async downloadPdf(@Param('id') id: string) {
    const payment = await this.service.findOne(id);
    const pdf = await this.service.pdf(id);
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="receipt-${payment.receiptNumber}.pdf"`,
    });
  }
}
