import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditActorType, AuditOutcome } from '@prisma/client';
import { AuditService } from './audit.service';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

/**
 * Read-only by design. There is deliberately no endpoint to create, edit, or
 * delete an audit entry: a trail that can be rewritten through the API is not
 * evidence of anything.
 */
@ApiBearerAuth()
@ApiTags('audit-logs')
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly service: AuditService) {}

  @Get()
  @Permissions(buildPermissionKey('AuditLog', 'read'))
  findAll(
    @Query('actorId') actorId?: string,
    @Query('actorType') actorType?: AuditActorType,
    @Query('resource') resource?: string,
    @Query('resourceId') resourceId?: string,
    @Query('action') action?: string,
    @Query('outcome') outcome?: AuditOutcome,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.service.findAll({
      actorId,
      actorType,
      resource,
      resourceId,
      action,
      outcome,
      from,
      to,
      search,
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });
  }

  @Get('resources')
  @Permissions(buildPermissionKey('AuditLog', 'read'))
  resources() {
    return this.service.resources();
  }

  @Get('stats')
  @Permissions(buildPermissionKey('AuditLog', 'read'))
  stats() {
    return this.service.stats();
  }

  @Get(':id')
  @Permissions(buildPermissionKey('AuditLog', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}
