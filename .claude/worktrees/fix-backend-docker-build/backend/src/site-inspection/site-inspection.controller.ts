import { Controller, Get, Post, Body, Param, Patch, Delete, Query } from '@nestjs/common';
import { SiteInspectionService } from './site-inspection.service';
import { CreateSiteInspectionDto } from './dto/create-site-inspection.dto';
import { UpdateSiteInspectionDto } from './dto/update-site-inspection.dto';
import { SiteInspectionQueryDto } from '../common/dto/filter-pagination.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('site-inspections')
@Controller('site-inspections')
export class SiteInspectionController {
  constructor(private readonly service: SiteInspectionService) {}

  @Post()
  @Permissions(buildPermissionKey('SiteInspection', 'create'))
  create(@Body() dto: CreateSiteInspectionDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions(buildPermissionKey('SiteInspection', 'read'))
  findAll(@Query() query: SiteInspectionQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Permissions(buildPermissionKey('SiteInspection', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Permissions(buildPermissionKey('SiteInspection', 'update'))
  update(@Param('id') id: string, @Body() dto: UpdateSiteInspectionDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions(buildPermissionKey('SiteInspection', 'delete'))
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
