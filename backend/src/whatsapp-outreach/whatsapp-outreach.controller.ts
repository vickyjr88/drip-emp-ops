import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { OutreachRecipientsQueryDto, OutreachUnsentQueryDto, SendOutreachDto } from './dto/whatsapp-outreach.dto';
import { WhatsAppOutreachService } from './whatsapp-outreach.service';

/**
 * Reading uses the Customer read permission and sending the Customer update permission, so no new permission has to be
 * seeded and granted: whoever can edit customers can message them.
 */
@ApiBearerAuth()
@ApiTags('whatsapp-outreach')
@Controller('whatsapp-outreach')
export class WhatsAppOutreachController {
  constructor(private readonly service: WhatsAppOutreachService) {}

  @Get('status')
  @Permissions(buildPermissionKey('Customer', 'read'))
  status() {
    return this.service.status();
  }

  @Get('recipients')
  @Permissions(buildPermissionKey('Customer', 'read'))
  recipients(@Query() query: OutreachRecipientsQueryDto) {
    return this.service.recipients(query);
  }

  @Get('unsent')
  @Permissions(buildPermissionKey('Customer', 'read'))
  unsent(@Query() query: OutreachUnsentQueryDto) {
    return this.service.unsentIds(query.kind, query.search);
  }

  @Get('history')
  @Permissions(buildPermissionKey('Customer', 'read'))
  history(@Query() query: PagedQueryDto) {
    return this.service.history(query);
  }

  @Post('send')
  @Permissions(buildPermissionKey('Customer', 'update'))
  send(@Body() dto: SendOutreachDto, @Req() request: any) {
    return this.service.send({ ...dto, triggeredBy: request?.user?.email ?? 'unknown' });
  }
}
