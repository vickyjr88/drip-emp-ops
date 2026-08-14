import { Controller, Get, Post, Body, Param, Patch, Delete, Query } from '@nestjs/common';
import { UnitOwnershipService } from './unit-ownership.service';
import { CreateUnitOwnershipDto } from './dto/create-unit-ownership.dto';
import { UpdateUnitOwnershipDto } from './dto/update-unit-ownership.dto';
import { TransferUnitOwnershipDto } from './dto/transfer-unit-ownership.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('unit-ownerships')
@Controller('unit-ownerships')
export class UnitOwnershipController {
  constructor(private readonly service: UnitOwnershipService) {}

  @Post()
  @Permissions(buildPermissionKey('UnitOwnership', 'create'))
  create(@Body() dto: CreateUnitOwnershipDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions(buildPermissionKey('UnitOwnership', 'read'))
  findAll(@Query() pagination: PaginationDto) {
    return this.service.findAll(pagination);
  }

  @Get(':id')
  @Permissions(buildPermissionKey('UnitOwnership', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Permissions(buildPermissionKey('UnitOwnership', 'update'))
  update(@Param('id') id: string, @Body() dto: UpdateUnitOwnershipDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/transfer')
  @Permissions(buildPermissionKey('UnitOwnership', 'update'))
  transfer(@Param('id') id: string, @Body() dto: TransferUnitOwnershipDto) {
    return this.service.transferOwnership(id, dto);
  }

  @Delete(':id')
  @Permissions(buildPermissionKey('UnitOwnership', 'delete'))
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
