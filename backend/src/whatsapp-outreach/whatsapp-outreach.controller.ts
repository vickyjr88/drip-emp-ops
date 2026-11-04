import { Body, Controller, Get, Headers, HttpCode, Post, Query, Req, ServiceUnavailableException, UnauthorizedException, BadGatewayException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { OutreachHookDto, OutreachRecipientsQueryDto, OutreachUnsentQueryDto, SendOutreachDto } from './dto/whatsapp-outreach.dto';
import { WhatsAppOutreachService } from './whatsapp-outreach.service';

/**
 * Reading uses the Customer read permission and sending the Customer update permission, so no new permission has to be
 * seeded and granted: whoever can edit customers can message them.
 */
@ApiBearerAuth()
@ApiTags('whatsapp-outreach')
@Controller('whatsapp-outreach')
export class WhatsAppOutreachController {
  constructor(private readonly service: WhatsAppOutreachService) {}

  @Get('status')
  @Permissions(buildPermissionKey('Customer', 'read'))
  status() {
    return this.service.status();
  }

  @Get('recipients')
  @Permissions(buildPermissionKey('Customer', 'read'))
  recipients(@Query() query: OutreachRecipientsQueryDto) {
    return this.service.recipients(query);
  }

  @Get('unsent')
  @Permissions(buildPermissionKey('Customer', 'read'))
  unsent(@Query() query: OutreachUnsentQueryDto) {
    return this.service.unsentIds(query.kind, query.search);
  }

  @Get('history')
  @Permissions(buildPermissionKey('Customer', 'read'))
  history(@Query() query: PagedQueryDto) {
    return this.service.history(query);
  }

  @Post('send')
  @Permissions(buildPermissionKey('Customer', 'update'))
  send(@Body() dto: SendOutreachDto, @Req() request: any) {
    return this.service.send({ ...dto, triggeredBy: request?.user?.email ?? 'unknown' });
  }

  /**
   * Called by a Mautic campaign's "Send a webhook" step, so it carries no login: it is guarded by the shared secret in
   * OUTREACH_HOOK_SECRET, sent as the X-Outreach-Secret header. Without the variable set the endpoint is off.
   *
   * A message sent, or deliberately skipped (already sent, not a customer), answers 200. A failed send answers 502 so
   * Mautic marks the step failed and tries it again later; that is what lets a step wait out a template that is still
   * in review without losing the message.
   */
  @Public()
  @Post('hook')
  @HttpCode(200)
  async hook(@Body() dto: OutreachHookDto, @Headers('x-outreach-secret') secret?: string) {
    const expected = process.env.OUTREACH_HOOK_SECRET || '';
    if (!expected) throw new ServiceUnavailableException('The outreach webhook is not enabled on this server.');
    const given = Buffer.from(secret ?? '');
    const wanted = Buffer.from(expected);
    if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) throw new UnauthorizedException();

    const result = await this.service.sendForContact(dto);
    if (result.outcome === 'FAILED') throw new BadGatewayException(result.detail ?? 'WhatsApp send failed');
    return { outcome: result.outcome, detail: result.detail };
  }
}
