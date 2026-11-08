import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { WhatsappContactsService } from './whatsapp-contacts.service';

/** The people who messaged the shop's WhatsApp number. Reading uses Customer read; unsubscribing uses Customer update. */
@ApiBearerAuth()
@ApiTags('whatsapp-contacts')
@Controller('whatsapp-contacts')
export class WhatsappContactsController {
  constructor(private readonly service: WhatsappContactsService) {}

  @Get('stats')
  @Permissions(buildPermissionKey('Customer', 'read'))
  stats() {
    return this.service.stats();
  }

  @Get()
  @Permissions(buildPermissionKey('Customer', 'read'))
  list(@Query() query: PagedQueryDto, @Query('search') search?: string) {
    return this.service.list({ skip: query.skip, take: query.take, search });
  }

  @Post(':id/unsubscribe')
  @Permissions(buildPermissionKey('Customer', 'update'))
  unsubscribe(@Param('id') id: string) {
    return this.service.unsubscribe(id);
  }
}
