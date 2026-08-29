import { Controller, Get, Param, Patch, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';
import { ResellerApplicationService } from './reseller-application.service';
import { ResellerApplicationQueryDto } from './dto/reseller-application-query.dto';

/**
 * Staff review of reseller applications. Submission itself lives on
 * CustomerPortalController -- the applicant is always the authenticated
 * customer making the request, not something a staff endpoint accepts.
 */
@ApiBearerAuth()
@ApiTags('reseller-applications')
@Controller('reseller-applications')
export class ResellerApplicationController {
  constructor(private readonly service: ResellerApplicationService) {}

  @Get()
  @Permissions(buildPermissionKey('ResellerApplication', 'read'))
  findAll(@Query() query: ResellerApplicationQueryDto) {
    return this.service.findAll(query);
  }

  @Patch(':id/approve')
  @Permissions(buildPermissionKey('ResellerApplication', 'update'))
  approve(@Param('id') id: string, @Req() request: any) {
    return this.service.approve(id, request.user?.email ?? 'unknown');
  }

  @Patch(':id/reject')
  @Permissions(buildPermissionKey('ResellerApplication', 'update'))
  reject(@Param('id') id: string, @Req() request: any) {
    return this.service.reject(id, request.user?.email ?? 'unknown');
  }
}
