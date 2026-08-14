import { Controller, Get, Param, Patch, Body } from '@nestjs/common';
import { ConstructionStatusService } from './construction-status.service';
import { UpdateConstructionStatusDto } from './dto/update-construction-status.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('construction-status')
@Controller('construction-status')
export class ConstructionStatusController {
  constructor(private readonly service: ConstructionStatusService) {}

  @Get()
  @Permissions(buildPermissionKey('ConstructionStatus', 'read'))
  findAll() {
    return this.service.findAll();
  }

  @Get('block/:blockId')
  @Permissions(buildPermissionKey('ConstructionStatus', 'read'))
  findByBlock(@Param('blockId') blockId: string) {
    return this.service.findByBlock(blockId);
  }

  @Patch('block/:blockId')
  @Permissions(buildPermissionKey('ConstructionStatus', 'update'))
  update(@Param('blockId') blockId: string, @Body() dto: UpdateConstructionStatusDto) {
    return this.service.upsertForBlock(blockId, dto);
  }
}
