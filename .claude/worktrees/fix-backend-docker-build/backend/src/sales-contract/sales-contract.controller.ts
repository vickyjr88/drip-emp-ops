import { Controller, Get, Post, Body, Param, Patch, Delete, Query, StreamableFile } from '@nestjs/common';
import { SalesContractService } from './sales-contract.service';
import { CreateSalesContractDto } from './dto/create-sales-contract.dto';
import { UpdateSalesContractDto } from './dto/update-sales-contract.dto';
import { UpsertPaymentScheduleDto } from './dto/upsert-payment-schedule.dto';
import { GeneratePaymentScheduleDto } from './dto/generate-payment-schedule.dto';
import { CancelSalesContractDto } from './dto/cancel-sales-contract.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('sales-contracts')
@Controller('sales-contracts')
export class SalesContractController {
  constructor(private readonly service: SalesContractService) {}

  @Post()
  @Permissions(buildPermissionKey('SalesContract', 'create'))
  create(@Body() dto: CreateSalesContractDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions(buildPermissionKey('SalesContract', 'read'))
  findAll(@Query() pagination: PaginationDto) {
    return this.service.findAll(pagination);
  }

  @Get(':id')
  @Permissions(buildPermissionKey('SalesContract', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Permissions(buildPermissionKey('SalesContract', 'update'))
  update(@Param('id') id: string, @Body() dto: UpdateSalesContractDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions(buildPermissionKey('SalesContract', 'delete'))
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/cancel')
  @Permissions(buildPermissionKey('SalesContract', 'update'))
  cancel(@Param('id') id: string, @Body() dto: CancelSalesContractDto) {
    return this.service.cancel(id, dto);
  }

  @Get(':id/amendments')
  @Permissions(buildPermissionKey('SalesContract', 'read'))
  getAmendments(@Param('id') id: string) {
    return this.service.getAmendments(id);
  }

  @Get(':id/payment-summary')
  @Permissions(buildPermissionKey('SalesContract', 'read'))
  paymentSummary(@Param('id') id: string) {
    return this.service.paymentSummary(id);
  }

  @Get(':id/payment-schedule')
  @Permissions(buildPermissionKey('SalesContract', 'read'))
  getPaymentSchedule(@Param('id') id: string) {
    return this.service.getPaymentSchedule(id);
  }

  @Post(':id/payment-schedule')
  @Permissions(buildPermissionKey('SalesContract', 'update'))
  upsertPaymentSchedule(@Param('id') id: string, @Body() dto: UpsertPaymentScheduleDto) {
    return this.service.upsertPaymentSchedule(id, dto);
  }

  @Get(':id/payment-schedule/pdf')
  @Permissions(buildPermissionKey('SalesContract', 'read'))
  async downloadPaymentSchedulePdf(@Param('id') id: string) {
    const contract = await this.service.findOne(id);
    const pdf = await this.service.paymentSchedulePdf(id);
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="payment-schedule-${contract.contractNumber}.pdf"`,
    });
  }

  @Post(':id/payment-schedule/generate')
  @Permissions(buildPermissionKey('SalesContract', 'update'))
  generatePaymentSchedule(@Param('id') id: string, @Body() dto: GeneratePaymentScheduleDto) {
    return this.service.generatePaymentSchedule(id, dto);
  }

  @Get(':id/pdf')
  @Permissions(buildPermissionKey('SalesContract', 'read'))
  async downloadContractPdf(@Param('id') id: string) {
    const contract = await this.service.findOne(id);
    const pdf = await this.service.contractPdf(id);
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="contract-${contract.contractNumber}.pdf"`,
    });
  }
}
