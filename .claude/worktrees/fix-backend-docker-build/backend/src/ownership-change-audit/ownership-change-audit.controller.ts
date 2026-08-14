import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OwnershipChangeAuditService } from './ownership-change-audit.service';
import { OwnershipAuditQueryDto } from '../common/dto/filter-pagination.dto';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('ownership-change-audits')
@Controller('ownership-change-audits')
export class OwnershipChangeAuditController {
  constructor(private readonly service: OwnershipChangeAuditService) {}

  @Get()
  @Permissions(buildPermissionKey('OwnershipChangeAudit', 'read'))
  findAll(@Query() query: OwnershipAuditQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Permissions(buildPermissionKey('OwnershipChangeAudit', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}
