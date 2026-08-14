import { Controller, Get, Post, Body, Param, Patch, Delete, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenancyService } from './tenancy.service';
import { CreateTenancyDto } from './dto/create-tenancy.dto';
import { UpdateTenancyDto } from './dto/update-tenancy.dto';
import { TenancyQueryDto } from '../common/dto/filter-pagination.dto';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('tenancies')
@Controller('tenancies')
export class TenancyController {
  constructor(private readonly service: TenancyService) {}

  @Post()
  @Permissions(buildPermissionKey('Tenancy', 'create'))
  create(@Body() dto: CreateTenancyDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions(buildPermissionKey('Tenancy', 'read'))
  findAll(@Query() query: TenancyQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Permissions(buildPermissionKey('Tenancy', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Permissions(buildPermissionKey('Tenancy', 'update'))
  update(@Param('id') id: string, @Body() dto: UpdateTenancyDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions(buildPermissionKey('Tenancy', 'delete'))
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
