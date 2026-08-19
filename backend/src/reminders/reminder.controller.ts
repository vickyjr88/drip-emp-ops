import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ReminderTargetType } from '@prisma/client';
import { ReminderService } from './reminder.service';
import { CreateReminderRuleDto, UpdateReminderRuleDto } from './dto/reminder-rule.dto';
import { ReminderLogQueryDto } from './dto/reminder-log-query.dto';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('reminders')
@Controller('reminders')
export class ReminderController {
  constructor(private readonly service: ReminderService) {}

  @Post('rules')
  @Permissions(buildPermissionKey('ReminderRule', 'create'))
  createRule(@Body() dto: CreateReminderRuleDto, @Req() request: any) {
    return this.service.createRule(dto, request?.user?.email);
  }

  @Get('rules')
  @Permissions(buildPermissionKey('ReminderRule', 'read'))
  findRules(
    @Query('targetType') targetType?: ReminderTargetType,
    @Query('isActive') isActive?: string,
  ) {
    return this.service.findRules({
      targetType,
      isActive: isActive === undefined ? undefined : isActive !== 'false',
    });
  }

  @Get('rules/:id')
  @Permissions(buildPermissionKey('ReminderRule', 'read'))
  findRule(@Param('id') id: string) {
    return this.service.findRule(id);
  }

  @Patch('rules/:id')
  @Permissions(buildPermissionKey('ReminderRule', 'update'))
  updateRule(@Param('id') id: string, @Body() dto: UpdateReminderRuleDto) {
    return this.service.updateRule(id, dto);
  }

  @Delete('rules/:id')
  @Permissions(buildPermissionKey('ReminderRule', 'delete'))
  removeRule(@Param('id') id: string) {
    return this.service.removeRule(id);
  }

  /**
   * Dry run. Read-only, so it is gated on read rather than update -- previewing
   * what would go out is not the same as sending it.
   */
  @Get('preview')
  @Permissions(buildPermissionKey('ReminderRule', 'read'))
  preview(
    @Query('runDate') runDate?: string,
    @Query('ruleId') ruleId?: string,
    @Query('storeId') storeId?: string,
    @Query('targetId') targetId?: string,
    @Query('ignoreTiming') ignoreTiming?: string,
  ) {
    return this.service.preview({
      runDate,
      ruleIds: ruleId ? [ruleId] : undefined,
      storeId,
      targetId,
      ignoreTiming: ignoreTiming === 'true',
    });
  }

  @Post('trigger')
  @Permissions(buildPermissionKey('ReminderLog', 'create'))
  trigger(
    @Body()
    body: {
      ruleIds?: string[];
      storeId?: string;
      targetId?: string;
      ignoreTiming?: boolean;
    },
    @Req() request: any,
  ) {
    return this.service.trigger({ ...body, triggeredBy: request?.user?.email });
  }

  @Get('logs')
  @Permissions(buildPermissionKey('ReminderLog', 'read'))
  findLogs(@Query() query: ReminderLogQueryDto) {
    return this.service.findLogs(query);
  }

  @Get('stats')
  @Permissions(buildPermissionKey('ReminderLog', 'read'))
  stats() {
    return this.service.stats();
  }
}
