import { Body, Controller, Get, Header, HttpCode, Logger, NotFoundException, Param, Post, Query, Req, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { timingSafeEqual } from 'crypto';
import { Public } from '../auth/decorators/public.decorator';
import { verifySignature } from '../whatsapp-outreach/whatsapp-subscription';
import { FacebookCommentsService } from './facebook-comments.service';
import { parseFeedWebhook } from './facebook-comments';

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Where Facebook delivers the Page's comments (the Webhooks product, object "Page", field "feed"). Like the WhatsApp webhook the
 * address carries a secret, `/facebook/webhook/<FACEBOOK_WEBHOOK_SECRET>`, so nobody else can post a forged comment and make the
 * shop message a stranger. Without the secret set the endpoint does not exist. If FACEBOOK_APP_SECRET (or WHATSAPP_APP_SECRET,
 * the same app) is set, Facebook's signature on each event is checked too.
 */
@ApiExcludeController()
@Controller('facebook/webhook')
export class FacebookWebhookController {
  private readonly logger = new Logger(FacebookWebhookController.name);

  constructor(private readonly comments: FacebookCommentsService) {}

  private assertSecret(given: string) {
    const secret = process.env.FACEBOOK_WEBHOOK_SECRET || '';
    if (!secret || !same(given, secret)) throw new NotFoundException();
  }

  @Public()
  @Get(':secret')
  @Header('Content-Type', 'text/plain')
  verify(@Param('secret') secret: string, @Query('hub.mode') mode?: string, @Query('hub.verify_token') token?: string, @Query('hub.challenge') challenge?: string) {
    this.assertSecret(secret);
    if (mode !== 'subscribe' || !token || !same(token, secret)) throw new UnauthorizedException();
    return challenge ?? '';
  }

  /** Always 200 once the event is authentic: Facebook retries anything else, and one bad comment must not block the rest. */
  @Public()
  @HttpCode(200)
  @Post(':secret')
  async receive(@Param('secret') secret: string, @Body() body: unknown, @Req() request: any) {
    this.assertSecret(secret);
    const appSecret = process.env.FACEBOOK_APP_SECRET || process.env.WHATSAPP_APP_SECRET || '';
    if (appSecret && !verifySignature(request.rawBody, request.headers?.['x-hub-signature-256'], appSecret)) throw new UnauthorizedException();

    for (const comment of parseFeedWebhook(body)) {
      try {
        await this.comments.handleComment(comment);
      } catch (error) {
        this.logger.error(`Could not handle comment ${comment.commentId}: ${(error as Error).message}`);
      }
    }
    return { received: true };
  }
}
