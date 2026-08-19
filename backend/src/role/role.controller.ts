import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';
import { AssignRolePermissionsDto } from './dto/assign-role-permissions.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleQueryDto } from './dto/role-query.dto';
import { RoleService } from './role.service';

@ApiBearerAuth()
@ApiTags('roles')
@Controller('roles')
export class RoleController {
  constructor(private readonly service: RoleService) {}

  @Post()
  @Permissions(buildPermissionKey('Role', 'create'))
  create(@Body() dto: CreateRoleDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions(buildPermissionKey('Role', 'read'))
  findAll(@Query() query: RoleQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Permissions(buildPermissionKey('Role', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Permissions(buildPermissionKey('Role', 'update'))
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.service.update(id, dto);
  }

  @Put(':id/permissions')
  @Permissions(buildPermissionKey('Role', 'update'))
  assignPermissions(
    @Param('id') id: string,
    @Body() dto: AssignRolePermissionsDto,
  ) {
    return this.service.assignPermissions(id, dto);
  }

  @Delete(':id')
  @Permissions(buildPermissionKey('Role', 'delete'))
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}