import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { FixedAssetService } from './fixed-asset.service';
import { CreateFixedAssetDto } from './dto/create-fixed-asset.dto';
import { DisposeFixedAssetDto } from './dto/dispose-fixed-asset.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('fixed-assets')
@Controller('fixed-assets')
export class FixedAssetController {
  constructor(private readonly service: FixedAssetService) {}

  @Post()
  @Permissions(buildPermissionKey('FixedAsset', 'create'))
  create(@Body() dto: CreateFixedAssetDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions(buildPermissionKey('FixedAsset', 'read'))
  findAll(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('storeId') storeId?: string,
    @Query('status') status?: string,
  ) {
    return this.service.findAll({
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
      storeId,
      status,
    });
  }

  @Post('run-depreciation')
  @Permissions(buildPermissionKey('FixedAsset', 'update'))
  runDepreciation(@Body('periodStart') periodStart: string) {
    return this.service.runDepreciation(periodStart);
  }

  @Get(':id')
  @Permissions(buildPermissionKey('FixedAsset', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post(':id/dispose')
  @Permissions(buildPermissionKey('FixedAsset', 'update'))
  dispose(@Param('id') id: string, @Body() dto: DisposeFixedAssetDto) {
    return this.service.dispose(id, dto);
  }
}
