import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { AssetTransferService } from './asset-transfer.service';
import { CreateAssetTransferDto } from './dto/create-asset-transfer.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('asset-transfers')
@Controller('asset-transfers')
export class AssetTransferController {
  constructor(private readonly service: AssetTransferService) {}

  @Post()
  @Permissions(buildPermissionKey('AssetTransfer', 'create'))
  create(@Body() dto: CreateAssetTransferDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions(buildPermissionKey('AssetTransfer', 'read'))
  findAll(@Query('assetId') assetId?: string) {
    return this.service.findAll(assetId);
  }
}
