import { Body, Controller, Delete, Get, Param, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PageContentService } from './page-content.service';
import { UpdatePageContentDto } from './dto/update-page-content.dto';
import { Public } from '../auth/decorators/public.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiTags('page-content')
@Controller()
export class PageContentController {
  constructor(private readonly service: PageContentService) {}

  /**
   * Public reads: the marketing site fetches these without a token. They expose
   * only published marketing copy, which is already visible on the site itself.
   */
  @Public()
  @Get('public/page-content')
  findAllPublic() {
    return this.service.findAll();
  }

  @Public()
  @Get('public/page-content/:slug')
  findOnePublic(@Param('slug') slug: string) {
    return this.service.findOne(slug);
  }

  @ApiBearerAuth()
  @Get('page-content')
  @Permissions(buildPermissionKey('PageContent', 'read'))
  findAll() {
    return this.service.findAll();
  }

  @ApiBearerAuth()
  @Get('page-content/:slug')
  @Permissions(buildPermissionKey('PageContent', 'read'))
  findOne(@Param('slug') slug: string) {
    return this.service.findOne(slug);
  }

  @ApiBearerAuth()
  @Put('page-content/:slug')
  @Permissions(buildPermissionKey('PageContent', 'update'))
  update(@Param('slug') slug: string, @Body() dto: UpdatePageContentDto, @Req() request: any) {
    return this.service.upsert(slug, dto.content, request?.user?.email);
  }

  @ApiBearerAuth()
  @Delete('page-content/:slug')
  @Permissions(buildPermissionKey('PageContent', 'update'))
  reset(@Param('slug') slug: string) {
    return this.service.reset(slug);
  }
}
