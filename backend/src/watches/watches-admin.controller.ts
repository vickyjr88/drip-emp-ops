import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';
import { WatchesService } from './watches.service';
import { CreateWatchDto, UpdateWatchDto } from './dto/watches.dto';

/** Staff side of Watches. Reuses the Product permissions, so there is nothing new to grant. */
@ApiBearerAuth()
@ApiTags('watches-admin')
@Controller('watches/admin')
export class WatchesAdminController {
  constructor(private readonly service: WatchesService) {}

  @Get('products')
  @Permissions(buildPermissionKey('Product', 'read'))
  list() { return this.service.adminList(); }

  @Post('products')
  @Permissions(buildPermissionKey('Product', 'create'))
  create(@Body() dto: CreateWatchDto) { return this.service.adminCreate(dto); }

  @Patch('products/:id')
  @Permissions(buildPermissionKey('Product', 'update'))
  update(@Param('id') id: string, @Body() dto: UpdateWatchDto) { return this.service.adminUpdate(id, dto); }
}
