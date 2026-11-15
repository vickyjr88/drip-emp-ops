import { Body, Controller, Delete, Get, HttpException, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ReviewStatus } from '@prisma/client';
import { Public } from '../auth/decorators/public.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';
import { makeRateLimiter } from '../insights/events.service';
import { ReviewsService } from './reviews.service';

/** A person writes a few reviews in a sitting at most; a robot writes hundreds. Per address, per hour. In memory: it resets on a restart. */
const allowWrite = makeRateLimiter(8, 60 * 60_000);

const addressOf = (req: any) => String(req.headers?.['x-forwarded-for'] ?? '').split(',')[0].trim() || req.ip || 'unknown';
const tooMany = () => new HttpException('Too many reviews from this connection. Please try again later.', 429);

/** Reviews, as the storefront uses them. Public like the rest of the shop window; writes are limited and held for approval. */
@ApiTags('storefront')
@Controller('shop')
export class ReviewsPublicController {
  constructor(private readonly reviews: ReviewsService) {}

  @Public()
  @Get('products/:slug/reviews')
  forProduct(@Param('slug') slug: string, @Query('offset') offset?: string, @Query('limit') limit?: string) {
    return this.reviews.forSlug(slug, { offset: Number(offset) || 0, limit: Number(limit) || 10 });
  }

  @Public()
  @Post('products/:slug/reviews')
  submit(@Param('slug') slug: string, @Body() body: Record<string, unknown>, @Req() req: any) {
    if (!allowWrite(addressOf(req))) throw tooMany();
    return this.reviews.submit(slug, body ?? {});
  }

  @Public()
  @Get('reviews/summary')
  summary() {
    return this.reviews.siteSummary();
  }

  @Public()
  @Get('reviews/order/:token')
  forOrder(@Param('token') token: string) {
    return this.reviews.orderForToken(token);
  }

  @Public()
  @Post('reviews/order/:token')
  submitForOrder(@Param('token') token: string, @Body() body: { reviews?: unknown }, @Req() req: any) {
    if (!allowWrite(addressOf(req))) throw tooMany();
    return this.reviews.submitForOrder(token, body?.reviews);
  }
}

/** Reviews for staff: read them, approve or turn them away, answer them, add one a customer sent another way, and ask customers for theirs. */
@ApiTags('reviews')
@ApiBearerAuth()
@Controller('reviews')
export class ReviewsAdminController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  @Permissions(buildPermissionKey('ProductReview', 'read'))
  list(@Query('status') status?: string, @Query('productId') productId?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    const valid = (['PENDING', 'APPROVED', 'REJECTED'] as const).find((s) => s === status);
    return this.reviews.list({ status: valid as ReviewStatus | undefined, productId, page: Number(page) || 1, pageSize: Number(pageSize) || 20 });
  }

  // Before any ':id'-shaped route, or these words would be read as an id.
  @Get('counts')
  @Permissions(buildPermissionKey('ProductReview', 'read'))
  counts() {
    return this.reviews.counts();
  }

  @Get('requests')
  @Permissions(buildPermissionKey('ProductReview', 'read'))
  requests(@Req() req: any) {
    return this.reviews.requests(req.headers?.origin);
  }

  @Post()
  @Permissions(buildPermissionKey('ProductReview', 'create'))
  addManual(@Body() body: { productId: string; rating: unknown; title?: unknown; body: unknown; name: unknown }, @Req() req: any) {
    return this.reviews.addManual(body, req.user?.email ?? 'staff');
  }

  @Patch(':id')
  @Permissions(buildPermissionKey('ProductReview', 'update'))
  moderate(@Param('id') id: string, @Body() body: { status?: string; reply?: string | null; rejectionReason?: string | null }, @Req() req: any) {
    const status = (['PENDING', 'APPROVED', 'REJECTED'] as const).find((s) => s === body?.status) as ReviewStatus | undefined;
    return this.reviews.moderate(id, { status, reply: body?.reply, rejectionReason: body?.rejectionReason }, req.user?.email ?? 'staff');
  }

  @Delete(':id')
  @Permissions(buildPermissionKey('ProductReview', 'delete'))
  remove(@Param('id') id: string) {
    return this.reviews.remove(id);
  }
}
