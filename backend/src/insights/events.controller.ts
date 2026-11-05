import { Body, Controller, HttpCode, HttpException, Post, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { EventsService, makeRateLimiter } from './events.service';

const allow = makeRateLimiter(600, 60_000);

/** Where the storefront reports what shoppers do. Public like the rest of the storefront. */
@ApiExcludeController()
@Controller('storefront-events')
export class EventsController {
  constructor(private events: EventsService) {}

  @Public()
  @HttpCode(202)
  @Post()
  record(@Body() body: { sessionId?: unknown; events?: unknown }, @Req() req: any) {
    const forwarded = String(req.headers?.['x-forwarded-for'] ?? '').split(',')[0].trim();
    if (!allow(forwarded || req.ip || 'unknown')) throw new HttpException('Too many requests.', 429);
    let originHost: string | undefined;
    try {
      originHost = req.headers?.origin ? new URL(String(req.headers.origin)).hostname : undefined;
    } catch {
      originHost = undefined;
    }
    return this.events.record(body, { userAgent: req.headers?.['user-agent'], originHost });
  }
}
