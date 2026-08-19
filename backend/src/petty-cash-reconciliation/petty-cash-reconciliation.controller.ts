import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { PettyCashReconciliationService } from './petty-cash-reconciliation.service';
import { CreatePettyCashReconciliationDto } from './dto/create-petty-cash-reconciliation.dto';
import { PettyCashReconciliationQueryDto } from './dto/petty-cash-reconciliation-query.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('petty-cash-reconciliations')
@Controller('petty-cash-reconciliations')
export class PettyCashReconciliationController {
  constructor(private readonly service: PettyCashReconciliationService) {}

  @Post()
  @Permissions(buildPermissionKey('PettyCashReconciliation', 'create'))
  create(@Body() dto: CreatePettyCashReconciliationDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions(buildPermissionKey('PettyCashReconciliation', 'read'))
  findAll(@Query() query: PettyCashReconciliationQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Permissions(buildPermissionKey('PettyCashReconciliation', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}
