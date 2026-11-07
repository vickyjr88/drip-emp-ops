import { BadRequestException, Body, Controller, Get, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';
import { DailyReportService } from './daily-report.service';
import { UpdateDailyReportSettingsDto } from './dto';
import { DATE_KEY, localDateKey } from './daily-report.window';

function parseDate(date?: string) {
  if (date === undefined) return undefined;
  // The report is of a finished day: today (and the future) has no complete figures yet.
  if (!DATE_KEY.test(date) || date >= localDateKey(new Date())) throw new BadRequestException('date must be a finished day, as YYYY-MM-DD (Nairobi time).');
  return date;
}

@ApiBearerAuth()
@ApiTags('daily-report')
@Controller('daily-report')
export class DailyReportController {
  constructor(private readonly service: DailyReportService) {}

  @Get('settings')
  @Permissions(buildPermissionKey('DailyReportSetting', 'read'))
  settings() {
    return this.service.getSettings();
  }

  @Put('settings')
  @Permissions(buildPermissionKey('DailyReportSetting', 'update'))
  updateSettings(@Body() dto: UpdateDailyReportSettingsDto, @Req() request: any) {
    return this.service.updateSettings(dto, request?.user?.email ?? 'unknown');
  }

  /** Renders the report without sending it. Defaults to yesterday. */
  @Get('preview')
  @Permissions(buildPermissionKey('DailyReportSetting', 'read'))
  preview(@Query('date') date?: string) {
    return this.service.preview(parseDate(date));
  }

  /** Sends now. A day already sent is not sent again unless `force=true`. */
  @Post('send')
  @Permissions(buildPermissionKey('DailyReportSetting', 'update'))
  send(@Query('date') date?: string, @Query('force') force?: string) {
    // Answers with who got it and who did not, rather than failing the request when one send fails.
    return this.service.deliver(parseDate(date), { force: force === 'true', throwOnFailure: false });
  }

  @Get('runs')
  @Permissions(buildPermissionKey('DailyReportSetting', 'read'))
  runs() {
    return this.service.recentRuns();
  }
}
