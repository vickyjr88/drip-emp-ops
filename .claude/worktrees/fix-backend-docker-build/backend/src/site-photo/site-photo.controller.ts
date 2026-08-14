import { Controller, Get, Post, Body, Param, Patch, Delete, Query } from '@nestjs/common';
import { SitePhotoService } from './site-photo.service';
import { CreateSitePhotoDto } from './dto/create-site-photo.dto';
import { UpdateSitePhotoDto } from './dto/update-site-photo.dto';
import { SitePhotoQueryDto } from '../common/dto/filter-pagination.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('site-photos')
@Controller('site-photos')
export class SitePhotoController {
  constructor(private readonly service: SitePhotoService) {}

  @Post()
  @Permissions(buildPermissionKey('SitePhoto', 'create'))
  create(@Body() dto: CreateSitePhotoDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions(buildPermissionKey('SitePhoto', 'read'))
  findAll(@Query() query: SitePhotoQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Permissions(buildPermissionKey('SitePhoto', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Permissions(buildPermissionKey('SitePhoto', 'update'))
  update(@Param('id') id: string, @Body() dto: UpdateSitePhotoDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions(buildPermissionKey('SitePhoto', 'delete'))
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
