import { Controller, Get, Header, HttpException, Param, Req, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { CustomerAuthGuard } from '../customer-portal/customer-auth.guard';
import { makeRateLimiter } from '../insights/events.service';
import { ShareKitService } from './share-kit.service';

/** A picture is drawn on request (a few hundred milliseconds of work), so one affiliate cannot ask for more than this many an hour. */
const allowPicture = makeRateLimiter(120, 60 * 60_000);

/**
 * The affiliate share kit. @Public only steps the *staff* guards aside; CustomerAuthGuard authenticates every route, and the customer (and so
 * their referral code) always comes from the token, never from the request.
 */
@ApiTags('customer-portal')
@ApiBearerAuth()
@Public()
@UseGuards(CustomerAuthGuard)
@Controller('customer-portal/share-kit')
export class ShareKitController {
  constructor(private readonly kit: ShareKitService) {}

  @Get()
  today(@Req() req: any) {
    return this.kit.today(req.user);
  }

  @Get('picture/:slug')
  @Header('Content-Type', 'image/jpeg')
  @Header('Cache-Control', 'private, max-age=300')
  // The answer depends on who asks (an affiliate gets a picture, anyone else is refused), so a cached copy must not be reused for another sign-in.
  @Header('Vary', 'Authorization')
  async picture(@Param('slug') slug: string, @Req() req: any) {
    if (!allowPicture(String(req.user?.id))) throw new HttpException('Too many pictures in the last hour. Please try again later.', 429);
    return new StreamableFile(await this.kit.picture(req.user, slug));
  }
}
