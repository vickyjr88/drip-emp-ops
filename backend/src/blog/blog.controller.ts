import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';
import { BlogService } from './blog.service';
import { CreateBlogPostDto, UpdateBlogPostDto } from './dto/blog-post.dto';
import { BlogPostQueryDto } from './dto/blog-post-query.dto';

@ApiTags('blog')
@Controller()
export class BlogController {
  constructor(private readonly service: BlogService) {}

  /** Published posts, for the public /blog listing. */
  @Public()
  @Get('public/blog-posts')
  findPublished(@Query('skip') skip?: string, @Query('take') take?: string) {
    return this.service.findPublished({
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });
  }

  /** A single published article, by slug -- a draft or unknown slug both
   *  come back null, which the storefront route treats as 404. */
  @Public()
  @Get('public/blog-posts/:slug')
  findPublishedBySlug(@Param('slug') slug: string) {
    return this.service.findPublishedBySlug(slug);
  }

  @ApiBearerAuth()
  @Get('blog-posts')
  @Permissions(buildPermissionKey('BlogPost', 'read'))
  findAll(@Query() query: BlogPostQueryDto) {
    return this.service.findAll(query);
  }

  @ApiBearerAuth()
  @Get('blog-posts/:id')
  @Permissions(buildPermissionKey('BlogPost', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @ApiBearerAuth()
  @Post('blog-posts')
  @Permissions(buildPermissionKey('BlogPost', 'create'))
  create(@Body() dto: CreateBlogPostDto) {
    return this.service.create(dto);
  }

  @ApiBearerAuth()
  @Patch('blog-posts/:id')
  @Permissions(buildPermissionKey('BlogPost', 'update'))
  update(@Param('id') id: string, @Body() dto: UpdateBlogPostDto) {
    return this.service.update(id, dto);
  }

  @ApiBearerAuth()
  @Delete('blog-posts/:id')
  @Permissions(buildPermissionKey('BlogPost', 'delete'))
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
