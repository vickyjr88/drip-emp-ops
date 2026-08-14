import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';
import { StoreService } from './store.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';

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
}
