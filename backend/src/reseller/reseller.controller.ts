import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';
import { ResellerService } from './reseller.service';
import { CreateResellerDto, UpdateResellerDto } from './dto/reseller.dto';
import { ResellerQueryDto } from './dto/reseller-query.dto';

@ApiBearerAuth()
@ApiTags('resellers')
@Controller('resellers')
export class ResellerController {
  constructor(private readonly service: ResellerService) {}

  @Post()
  @Permissions(buildPermissionKey('Customer', 'create'))
  create(@Body() dto: CreateResellerDto) { return this.service.create(dto); }

  @Get()
  @Permissions(buildPermissionKey('Customer', 'read'))
  findAll(@Query() query: ResellerQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Permissions(buildPermissionKey('Customer', 'read'))
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Get(':id/performance')
  @Permissions(buildPermissionKey('Customer', 'read'))
  performance(@Param('id') id: string) { return this.service.performance(id); }

  @Get(':id/series')
  @Permissions(buildPermissionKey('Customer', 'read'))
  series(@Param('id') id: string) { return this.service.series(id); }

  @Patch(':id')
  @Permissions(buildPermissionKey('Customer', 'update'))
  update(@Param('id') id: string, @Body() dto: UpdateResellerDto) { return this.service.update(id, dto); }

  @Delete(':id')
  @Permissions(buildPermissionKey('Customer', 'delete'))
  remove(@Param('id') id: string) { return this.service.remove(id); }
}
