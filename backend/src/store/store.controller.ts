import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';
import { StoreService } from './store.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { CreateStoreAccountAssignmentDto } from './dto/account-assignment.dto';

@ApiBearerAuth()
@ApiTags('stores')
@Controller('stores')
export class StoreController {
  constructor(private readonly service: StoreService) {}

  @Post()
  @Permissions(buildPermissionKey('Store', 'create'))
  create(@Body() dto: CreateStoreDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions(buildPermissionKey('Store', 'read'))
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.service.findAll(includeInactive === 'true');
  }

  @Get(':id')
  @Permissions(buildPermissionKey('Store', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/summary')
  @Permissions(buildPermissionKey('Store', 'read'))
  summary(@Param('id') id: string) {
    return this.service.summary(id);
  }

  @Patch(':id')
  @Permissions(buildPermissionKey('Store', 'update'))
  update(@Param('id') id: string, @Body() dto: UpdateStoreDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions(buildPermissionKey('Store', 'delete'))
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
  @Get(':id/account-assignments')
  @Permissions(buildPermissionKey('StoreAccountAssignment', 'read'))
  listAccountAssignments(@Param('id') id: string) {
    return this.service.listAccountAssignments(id);
  }

  @Post(':id/account-assignments')
  @Permissions(buildPermissionKey('StoreAccountAssignment', 'create'))
  createAccountAssignment(@Param('id') id: string, @Body() dto: CreateStoreAccountAssignmentDto) {
    return this.service.createAccountAssignment(id, dto);
  }

  @Delete(':id/account-assignments/:assignmentId')
  @Permissions(buildPermissionKey('StoreAccountAssignment', 'delete'))
  removeAccountAssignment(@Param('id') id: string, @Param('assignmentId') assignmentId: string) {
    return this.service.removeAccountAssignment(id, assignmentId);
  }
}
