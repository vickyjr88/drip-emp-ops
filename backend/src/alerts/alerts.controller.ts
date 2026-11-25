import { Body, Controller, Get, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';
import { AlertsService } from './alerts.service';
import { UpdateAlertSettingsDto } from './alerts.dto';

@ApiBearerAuth()
@ApiTags('alerts')
@Controller('alerts')
export class AlertsController {
  constructor(private readonly service: AlertsService) {}

  @Get('settings')
  @Permissions(buildPermissionKey('AlertSetting', 'read'))
  settings() {
    return this.service.getSettings();
  }

  @Put('settings')
  @Permissions(buildPermissionKey('AlertSetting', 'update'))
  update(@Body() dto: UpdateAlertSettingsDto, @Req() request: any) {
    return this.service.updateSettings(dto as any, request?.user?.email ?? 'unknown');
  }

  /** Sends a test alert to every recipient on both channels and answers with what happened to each. */
  @Post('test')
  @Permissions(buildPermissionKey('AlertSetting', 'update'))
  test(@Req() request: any) {
    return this.service.sendTest(request?.user?.email ?? 'unknown');
  }

  @Get()
  @Permissions(buildPermissionKey('AdminAlert', 'read'))
  recent(@Query('limit') limit?: string) {
    return this.service.recent(limit ? Number(limit) : 50);
  }
}
