import { Body, Controller, Delete, Get, Header, Param, Post, Put, Query, Req, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { PostNowDto, UpdateSocialSettingsDto } from './dto';
import { SocialPostingService } from './social-posting.service';
import { StatusKitService } from './status-kit.service';

/** The marketing engine's screen. Reading uses SocialPost read, posting and removing SocialPost create/delete, the switches SocialSetting update. */
@ApiBearerAuth()
@ApiTags('social-posting')
@Controller('social-posting')
export class SocialPostingController {
  constructor(private readonly service: SocialPostingService, private readonly kit: StatusKitService) {}

  @Get('status')
  @Permissions(buildPermissionKey('SocialPost', 'read'))
  status() {
    return this.service.status();
  }

  @Put('settings')
  @Permissions(buildPermissionKey('SocialSetting', 'update'))
  settings(@Body() dto: UpdateSocialSettingsDto, @Req() request: any) {
    return this.service.updateSettings(dto, request?.user?.email ?? 'unknown');
  }

  /** What the next post would look like. Nothing is posted. */
  @Get('preview')
  @Permissions(buildPermissionKey('SocialPost', 'read'))
  preview(@Query('productId') productId?: string) {
    return this.service.preview(productId);
  }

  @Get('posts')
  @Permissions(buildPermissionKey('SocialPost', 'read'))
  posts(@Query() query: PagedQueryDto) {
    return this.service.list({ skip: query.skip, take: query.take });
  }

  /** Posts to the Facebook Page or Threads now: a real, public post. */
  @Post('post-now')
  @Permissions(buildPermissionKey('SocialPost', 'create'))
  postNow(@Body() dto: PostNowDto, @Req() request: any) {
    return this.service.postNow(request?.user?.email ?? 'unknown', dto.productId, dto.channel ?? 'FACEBOOK');
  }

  /** Takes a post down from the Page. */
  @Delete('posts/:id')
  @Permissions(buildPermissionKey('SocialPost', 'delete'))
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  // --- WhatsApp Status kit ------------------------------------------------------------------------------------------------

  /** Today's Status pictures to post by hand: WhatsApp has no way to post a Status automatically. Made on first use each day. */
  @Get('status-kit')
  @Permissions(buildPermissionKey('SocialPost', 'read'))
  statusKit(@Req() request: any) {
    return this.kit.today(request?.user?.email ?? 'system');
  }

  /** The 1080x1920 picture for one item. */
  @Get('status-kit/:id/image')
  @Permissions(buildPermissionKey('SocialPost', 'read'))
  @Header('Content-Type', 'image/jpeg')
  @Header('Cache-Control', 'private, max-age=300')
  async statusImage(@Param('id') id: string) {
    return new StreamableFile(await this.kit.image(id));
  }

  /** Replaces an item with the next product in line. */
  @Post('status-kit/:id/swap')
  @Permissions(buildPermissionKey('SocialPost', 'update'))
  swapStatus(@Param('id') id: string) {
    return this.kit.swap(id);
  }

  /** Marks an item as posted on WhatsApp, so that product is not offered again soon. */
  @Post('status-kit/:id/posted')
  @Permissions(buildPermissionKey('SocialPost', 'update'))
  statusPosted(@Param('id') id: string, @Req() request: any) {
    return this.kit.markPosted(id, request?.user?.email ?? 'unknown');
  }
}
