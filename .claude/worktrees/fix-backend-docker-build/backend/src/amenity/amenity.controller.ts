import { Controller, Get, Post, Body, Param, Patch, Delete, Query } from '@nestjs/common';
import { AmenityService } from './amenity.service';
import { CreateAmenityDto } from './dto/create-amenity.dto';
import { UpdateAmenityDto } from './dto/update-amenity.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('amenities')
@Controller()
export class AmenityController {
  constructor(private readonly service: AmenityService) {}

  @Post('amenities')
  @Permissions(buildPermissionKey('Amenity', 'create'))
  create(@Body() dto: CreateAmenityDto) {
    return this.service.create(dto);
  }

  @Get('amenities')
  @Permissions(buildPermissionKey('Amenity', 'read'))
  findAll(@Query('category') category?: string) {
    return this.service.findAll(category);
  }

  @Get('amenities/:id')
  @Permissions(buildPermissionKey('Amenity', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch('amenities/:id')
  @Permissions(buildPermissionKey('Amenity', 'update'))
  update(@Param('id') id: string, @Body() dto: UpdateAmenityDto) {
    return this.service.update(id, dto);
  }

  @Delete('amenities/:id')
  @Permissions(buildPermissionKey('Amenity', 'delete'))
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Get('projects/:projectId/amenities')
  @Permissions(buildPermissionKey('Amenity', 'read'))
  getForProject(@Param('projectId') projectId: string) {
    return this.service.getForProject(projectId);
  }

  @Post('projects/:projectId/amenities/:amenityId')
  @Permissions(buildPermissionKey('Amenity', 'update'))
  attachToProject(@Param('projectId') projectId: string, @Param('amenityId') amenityId: string) {
    return this.service.attachToProject(projectId, amenityId);
  }

  @Delete('projects/:projectId/amenities/:amenityId')
  @Permissions(buildPermissionKey('Amenity', 'update'))
  detachFromProject(@Param('projectId') projectId: string, @Param('amenityId') amenityId: string) {
    return this.service.detachFromProject(projectId, amenityId);
  }

  @Get('units/:unitId/amenities')
  @Permissions(buildPermissionKey('Amenity', 'read'))
  getForUnit(@Param('unitId') unitId: string) {
    return this.service.getForUnit(unitId);
  }

  @Post('units/:unitId/amenities/:amenityId')
  @Permissions(buildPermissionKey('Amenity', 'update'))
  attachToUnit(@Param('unitId') unitId: string, @Param('amenityId') amenityId: string) {
    return this.service.attachToUnit(unitId, amenityId);
  }

  @Delete('units/:unitId/amenities/:amenityId')
  @Permissions(buildPermissionKey('Amenity', 'update'))
  detachFromUnit(@Param('unitId') unitId: string, @Param('amenityId') amenityId: string) {
    return this.service.detachFromUnit(unitId, amenityId);
  }
}
