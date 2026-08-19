import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';
import { AssignUserRolesDto } from './dto/assign-user-roles.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { UserService } from './user.service';

@ApiBearerAuth()
@ApiTags('users')
@Controller('users')
export class UserController {
  constructor(private readonly service: UserService) {}

  @Get()
  @Permissions(buildPermissionKey('User', 'read'))
  findAll(@Query() query: UserQueryDto) {
    return this.service.findAll(query);
  }

  @Post()
  @Permissions(buildPermissionKey('User', 'create'))
  create(@Body() dto: CreateUserDto) {
    return this.service.createManagedUser(dto);
  }

  @Get(':id')
  @Permissions(buildPermissionKey('User', 'read'))
  async findOne(@Param('id') id: string) {
    const user = await this.service.findAuthUserById(id);
    return user ? this.service.toAuthUser(user) : null;
  }

  @Patch(':id')
  @Permissions(buildPermissionKey('User', 'update'))
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.service.updateManagedUser(id, dto);
  }

  @Post(':id/reset-password')
  @Permissions(buildPermissionKey('User', 'update'))
  resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.service.resetPassword(id, dto.password);
  }

  @Put(':id/roles')
  @Permissions(buildPermissionKey('User', 'update'))
  async assignRoles(@Param('id') id: string, @Body() dto: AssignUserRolesDto) {
    const user = await this.service.assignRoles(id, dto.roleIds);
    return this.service.toAuthUser(user);
  }

  @Delete(':id')
  @Permissions(buildPermissionKey('User', 'delete'))
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
