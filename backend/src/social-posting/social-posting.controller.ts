import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { PostNowDto, UpdateSocialSettingsDto } from './dto';
import { SocialPostingService } from './social-posting.service';

/** The marketing engine's screen. Reading uses SocialPost read, posting and removing SocialPost create/delete, the switches SocialSetting update. */
@ApiBearerAuth()
@ApiTags('social-posting')
@Controller('social-posting')
export class SocialPostingController {
  constructor(private readonly service: SocialPostingService) {}

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

  /** Posts to the Page now: a real, public post. */
  @Post('post-now')
  @Permissions(buildPermissionKey('SocialPost', 'create'))
  postNow(@Body() dto: PostNowDto, @Req() request: any) {
    return this.service.postNow(request?.user?.email ?? 'unknown', dto.productId);
  }

  /** Takes a post down from the Page. */
  @Delete('posts/:id')
  @Permissions(buildPermissionKey('SocialPost', 'delete'))
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
