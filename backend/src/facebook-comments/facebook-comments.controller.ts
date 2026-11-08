import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { FacebookCommentsService } from './facebook-comments.service';

/** Comments on the Page and what the shop did about them. Reading uses the same permission as the other marketing screens. */
@ApiBearerAuth()
@ApiTags('facebook-comments')
@Controller('facebook-comments')
export class FacebookCommentsController {
  constructor(private readonly service: FacebookCommentsService) {}

  @Get('status')
  @Permissions(buildPermissionKey('MarketingCampaign', 'read'))
  status() {
    return this.service.status();
  }

  @Get()
  @Permissions(buildPermissionKey('MarketingCampaign', 'read'))
  list(@Query() query: PagedQueryDto, @Query('status') status?: string) {
    return this.service.list({ skip: query.skip, take: query.take, status });
  }
}
