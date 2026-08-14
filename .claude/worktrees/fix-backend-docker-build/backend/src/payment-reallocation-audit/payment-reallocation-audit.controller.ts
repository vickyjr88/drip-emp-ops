import { Controller, Get, Post, Body, Param, Patch, Delete, Query } from '@nestjs/common';
import { PaymentReallocationAuditService } from './payment-reallocation-audit.service';
import { CreatePaymentReallocationAuditDto } from './dto/create-payment-reallocation-audit.dto';
import { UpdatePaymentReallocationAuditDto } from './dto/update-payment-reallocation-audit.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('payment-reallocation-audits')
@Controller('payment-reallocation-audits')
export class PaymentReallocationAuditController {
  constructor(private readonly service: PaymentReallocationAuditService) {}

  @Post()
  @Permissions(buildPermissionKey('PaymentReallocationAudit', 'create'))
  create(@Body() dto: CreatePaymentReallocationAuditDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions(buildPermissionKey('PaymentReallocationAudit', 'read'))
  findAll(@Query() pagination: PaginationDto) {
    return this.service.findAll(pagination);
  }

  @Get(':id')
  @Permissions(buildPermissionKey('PaymentReallocationAudit', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Permissions(buildPermissionKey('PaymentReallocationAudit', 'update'))
  update(@Param('id') id: string, @Body() dto: UpdatePaymentReallocationAuditDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions(buildPermissionKey('PaymentReallocationAudit', 'delete'))
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
