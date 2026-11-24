import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CartLeadStatus } from '@prisma/client';
import { Public } from '../auth/decorators/public.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';
import { CartLeadService } from './cart-lead.service';
import { RecordCartLeadDto, RecordWhatsAppClickDto } from './dto/cart-lead.dto';
import { CartLeadQueryDto } from './dto/cart-lead-query.dto';
import { LeadFollowUpService } from './lead-followup.service';

@ApiTags('cart-leads')
@Controller('cart-leads')
export class CartLeadController {
  constructor(private readonly service: CartLeadService, private readonly followUp: LeadFollowUpService) {}

  /** Called from the storefront the moment a shopper chooses the WhatsApp route. */
  @Public()
  @Post()
  record(@Body() dto: RecordCartLeadDto) {
    return this.service.record(dto);
  }

  /** Called on every tap of any WhatsApp link on the storefront, contact info or not. */
  @Public()
  @Post('whatsapp-click')
  recordWhatsAppClick(@Body() dto: RecordWhatsAppClickDto) {
    return this.service.recordWhatsAppClick(dto);
  }

  /** Called periodically by the cart while it sits with contact details filled in but unconverted. */
  @Public()
  @Post('abandoned-sync')
  syncAbandoned(@Body() dto: RecordCartLeadDto) {
    return this.service.upsertAbandoned(dto);
  }

  @ApiBearerAuth()
  @Get()
  @Permissions(buildPermissionKey('CartLead', 'read'))
  findAll(@Query() query: CartLeadQueryDto) {
    return this.service.findAll(query);
  }

  // Before ':id'-shaped routes, if any are ever added, or "stats" would be
  // read as an id.
  @ApiBearerAuth()
  @Get('stats')
  @Permissions(buildPermissionKey('CartLead', 'read'))
  stats() {
    return this.service.stats();
  }

  /** The automatic follow-up at a glance: on or paused, what is waiting, what went today, what is marked. Before ':id'. */
  @ApiBearerAuth()
  @Get('follow-up/summary')
  @Permissions(buildPermissionKey('CartLead', 'read'))
  followUpSummary() {
    return this.followUp.summary();
  }

  /** A dry run: the next leads in line and what would be done to each. Sends nothing, changes nothing. */
  @ApiBearerAuth()
  @Get('follow-up/preview')
  @Permissions(buildPermissionKey('CartLead', 'read'))
  followUpPreview(@Query('limit') limit?: string) {
    return this.followUp.preview(limit ? Number(limit) : 25);
  }

  @ApiBearerAuth()
  @Get(':id')
  @Permissions(buildPermissionKey('CartLead', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @ApiBearerAuth()
  @Patch(':id/status')
  @Permissions(buildPermissionKey('CartLead', 'update'))
  setStatus(@Param('id') id: string, @Body() body: { status: CartLeadStatus }, @Req() request: any) {
    return this.service.setStatus(id, body.status, request?.user?.email);
  }

  /** Staff marking a lead followed up (a call, a visit, a chat from their own phone), or putting it back to waiting. */
  @ApiBearerAuth()
  @Patch(':id/follow-up')
  @Permissions(buildPermissionKey('CartLead', 'update'))
  setFollowUp(@Param('id') id: string, @Body() body: { state?: 'DONE' | 'PENDING'; note?: string }, @Req() request: any) {
    return body?.state === 'PENDING' ? this.followUp.reopen(id) : this.followUp.markDone(id, request?.user?.email ?? 'staff', body?.note);
  }

  @ApiBearerAuth()
  @Patch(':id/convert')
  @Permissions(buildPermissionKey('CartLead', 'update'))
  markConverted(@Param('id') id: string, @Body() body: { orderId: string }) {
    return this.service.markConverted(id, body.orderId);
  }
}
