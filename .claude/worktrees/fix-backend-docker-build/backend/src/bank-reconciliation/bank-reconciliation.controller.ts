import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { BankReconciliationService } from './bank-reconciliation.service';
import { CreateBankReconciliationDto } from './dto/create-bank-reconciliation.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('bank-reconciliations')
@Controller('bank-reconciliations')
export class BankReconciliationController {
  constructor(private readonly service: BankReconciliationService) {}

  @Post()
  @Permissions(buildPermissionKey('BankReconciliation', 'create'))
  create(@Body() dto: CreateBankReconciliationDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions(buildPermissionKey('BankReconciliation', 'read'))
  findAll(@Query('bankAccountId') bankAccountId?: string) {
    return this.service.findAll(bankAccountId);
  }

  @Get(':id')
  @Permissions(buildPermissionKey('BankReconciliation', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post(':id/complete')
  @Permissions(buildPermissionKey('BankReconciliation', 'update'))
  complete(@Param('id') id: string, @Body('reconciledBy') reconciledBy: string) {
    return this.service.complete(id, reconciledBy || 'system');
  }
}
