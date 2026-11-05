import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';
import { KitsService } from './kits.service';
import { CreateKitDto, PrintStatusDto, UpdateClubDto, UpdateKitDto } from './dto/kits.dto';
import { IsBoolean } from 'class-validator';

class SwitchDto {
  @IsBoolean() enabled!: boolean;
}

/**
 * Staff side of Kits. Not behind the on/off switch: the catalogue, clubs and print queue can be prepared while the
 * public line is off. Reuses existing permission keys (Product, Order, PageContent), so no new permissions to seed.
 */
@ApiBearerAuth()
@ApiTags('kits-admin')
@Controller('kits/admin')
export class KitsAdminController {
  constructor(private readonly service: KitsService) {}

  /** Whether the public line is on, and who last changed it. Anyone who can edit site content may switch it. */
  @Get('status')
  @Permissions(buildPermissionKey('PageContent', 'read'))
  status() { return this.service.flag.status(); }

  @Put('status')
  @Permissions(buildPermissionKey('PageContent', 'update'))
  setStatus(@Body() dto: SwitchDto, @Req() request: any) {
    return this.service.flag.set(dto.enabled, request?.user?.email);
  }

  @Get('products')
  @Permissions(buildPermissionKey('Product', 'read'))
  list() { return this.service.adminList(); }

  @Post('products')
  @Permissions(buildPermissionKey('Product', 'create'))
  create(@Body() dto: CreateKitDto) { return this.service.adminCreate(dto); }

  @Patch('products/:id')
  @Permissions(buildPermissionKey('Product', 'update'))
  update(@Param('id') id: string, @Body() dto: UpdateKitDto) { return this.service.adminUpdate(id, dto); }

  @Get('clubs')
  @Permissions(buildPermissionKey('Product', 'read'))
  clubs() { return this.service.adminClubs(); }

  @Patch('clubs/:slug')
  @Permissions(buildPermissionKey('Product', 'update'))
  updateClub(@Param('slug') slug: string, @Body() dto: UpdateClubDto) { return this.service.adminUpdateClub(slug, dto); }

  @Get('print-queue')
  @Permissions(buildPermissionKey('Order', 'read'))
  printQueue(@Query('status') status?: string) { return this.service.printQueue(status); }

  @Patch('print-queue/:lineId')
  @Permissions(buildPermissionKey('Order', 'update'))
  setPrintStatus(@Param('lineId') lineId: string, @Body() dto: PrintStatusDto) {
    return this.service.setPrintStatus(lineId, dto.status, dto.notes);
  }
}
