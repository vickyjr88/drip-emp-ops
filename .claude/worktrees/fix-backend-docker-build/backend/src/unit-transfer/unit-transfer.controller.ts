import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { UnitTransferService } from './unit-transfer.service';
import { CreateUnitTransferDto } from './dto/create-unit-transfer.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('unit-transfers')
@Controller('unit-transfers')
export class UnitTransferController {
  constructor(private readonly service: UnitTransferService) {}

  @Post()
  @Permissions(buildPermissionKey('UnitTransfer', 'create'))
  create(@Body() dto: CreateUnitTransferDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions(buildPermissionKey('UnitTransfer', 'read'))
  findAll(@Query('contractId') contractId?: string) {
    return this.service.findAll({ contractId });
  }

  @Get(':id')
  @Permissions(buildPermissionKey('UnitTransfer', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}
