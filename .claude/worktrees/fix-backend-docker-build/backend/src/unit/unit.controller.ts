import { Controller, Get, Post, Body, Param, Patch, Delete, Query } from '@nestjs/common';
import { UnitService } from './unit.service';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('units')
@Controller('units')
export class UnitController {
  constructor(private readonly service: UnitService) {}

  @Post()
  @Permissions(buildPermissionKey('Unit', 'create'))
  create(@Body() dto: CreateUnitDto) {
    return this.service.create(dto);
  }

  @Post('bulk')
  @Permissions(buildPermissionKey('Unit', 'create'))
  createBulk(@Body() body: any) {
    const dtos = Array.isArray(body) ? body : body.units;
    return this.service.createBulk(dtos);
  }

  @Get()
  @Permissions(buildPermissionKey('Unit', 'read'))
  findAll(@Query() pagination: PaginationDto) {
    return this.service.findAll(pagination);
  }

  @Get(':id')
  @Permissions(buildPermissionKey('Unit', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Permissions(buildPermissionKey('Unit', 'update'))
  update(@Param('id') id: string, @Body() dto: UpdateUnitDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions(buildPermissionKey('Unit', 'delete'))
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
