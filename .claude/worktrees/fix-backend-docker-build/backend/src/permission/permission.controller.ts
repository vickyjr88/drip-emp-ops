import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';
import { PermissionService } from './permission.service';

@ApiBearerAuth()
@ApiTags('permissions')
@Controller('permissions')
export class PermissionController {
  constructor(private readonly service: PermissionService) {}

  @Get()
  @Permissions(buildPermissionKey('Permission', 'read'))
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @Permissions(buildPermissionKey('Permission', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}