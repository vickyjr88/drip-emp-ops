import { Body, Controller, Get, Header, HttpCode, Logger, NotFoundException, Param, Post, Query, Req, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { timingSafeEqual } from 'crypto';
import { Public } from '../auth/decorators/public.decorator';
import { WhatsappContactsService } from './whatsapp-contacts.service';
import { parseWebhook, verifySignature } from './whatsapp-subscription';

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Where Meta delivers WhatsApp events: messages people send the shop, and delivery reports for messages the shop sent.
 *
 * The address carries a secret, `/whatsapp/webhook/<WHATSAPP_WEBHOOK_SECRET>`, which only this server and Meta (told when the
 * app was subscribed) know, so nobody else can post events here: a forged "message from 0712..." would otherwise make the shop
 * message that number. If WHATSAPP_APP_SECRET is also set, Meta's signature on each event is checked as well. Without
 * WHATSAPP_WEBHOOK_SECRET the endpoint does not exist.
 */
@ApiExcludeController()
@Controller('whatsapp/webhook')
export class WhatsappWebhookController {
  private readonly logger = new Logger(WhatsappWebhookController.name);

  constructor(private readonly contacts: WhatsappContactsService) {}

  private assertSecret(given: string) {
    const secret = process.env.WHATSAPP_WEBHOOK_SECRET || '';
    // Not found, not unauthorised: a wrong address looks like no endpoint at all.
    if (!secret || !same(given, secret)) throw new NotFoundException();
  }

  /** Meta's one-off check when the callback is set: echo its challenge if the token is ours. */
  @Public()
  @Get(':secret')
  @Header('Content-Type', 'text/plain')
  verify(@Param('secret') secret: string, @Query('hub.mode') mode?: string, @Query('hub.verify_token') token?: string, @Query('hub.challenge') challenge?: string) {
    this.assertSecret(secret);
    if (mode !== 'subscribe' || !token || !same(token, secret)) throw new UnauthorizedException();
    return challenge ?? '';
  }

  /** Always answers 200 once the event is authentic: Meta retries anything else for days, and one bad event must not block the rest. */
  @Public()
  @HttpCode(200)
  @Post(':secret')
  async receive(@Param('secret') secret: string, @Body() body: unknown, @Req() request: any) {
    this.assertSecret(secret);
    const appSecret = process.env.WHATSAPP_APP_SECRET || '';
    if (appSecret && !verifySignature(request.rawBody, request.headers?.['x-hub-signature-256'], appSecret)) throw new UnauthorizedException();

    const { messages, statuses } = parseWebhook(body);
    for (const message of messages) {
      try {
        await this.contacts.handleMessage(message);
      } catch (error) {
        this.logger.error(`Could not handle a WhatsApp message from ${message.from}: ${(error as Error).message}`);
      }
    }
    for (const status of statuses) {
      try {
        await this.contacts.recordStatus(status);
      } catch (error) {
        this.logger.error(`Could not record a WhatsApp status for ${status.id}: ${(error as Error).message}`);
      }
    }
    return { received: true };
  }
}
