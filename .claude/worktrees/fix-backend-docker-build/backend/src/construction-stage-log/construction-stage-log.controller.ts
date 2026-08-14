import { Controller, Get, Param, Query, Patch, Body, Delete } from '@nestjs/common';
import { ConstructionStageLogService } from './construction-stage-log.service';
import { ConstructionStageLogQueryDto } from '../common/dto/filter-pagination.dto';
import { UpdateConstructionStageLogDto } from './dto/update-construction-stage-log.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('construction-stage-logs')
@Controller('construction-stage-logs')
export class ConstructionStageLogController {
  constructor(private readonly service: ConstructionStageLogService) {}

  @Get()
  @Permissions(buildPermissionKey('ConstructionStageLog', 'read'))
  findAll(@Query() query: ConstructionStageLogQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Permissions(buildPermissionKey('ConstructionStageLog', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Permissions(buildPermissionKey('ConstructionStageLog', 'update'))
  update(@Param('id') id: string, @Body() dto: UpdateConstructionStageLogDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions(buildPermissionKey('ConstructionStageLog', 'delete'))
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
