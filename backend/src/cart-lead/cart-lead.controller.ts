import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CartLeadStatus } from '@prisma/client';
import { Public } from '../auth/decorators/public.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';
import { CartLeadService } from './cart-lead.service';
import { RecordCartLeadDto } from './dto/cart-lead.dto';
import { CartLeadQueryDto } from './dto/cart-lead-query.dto';

@ApiTags('cart-leads')
@Controller('cart-leads')
export class CartLeadController {
  constructor(private readonly service: CartLeadService) {}

  /** Called from the storefront the moment a shopper chooses the WhatsApp route. */
  @Public()
  @Post()
  record(@Body() dto: RecordCartLeadDto) {
    return this.service.record(dto);
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

  @ApiBearerAuth()
  @Patch(':id/status')
  @Permissions(buildPermissionKey('CartLead', 'update'))
  setStatus(@Param('id') id: string, @Body() body: { status: CartLeadStatus }) {
    return this.service.setStatus(id, body.status);
  }

  @ApiBearerAuth()
  @Patch(':id/convert')
  @Permissions(buildPermissionKey('CartLead', 'update'))
  markConverted(@Param('id') id: string, @Body() body: { orderId: string }) {
    return this.service.markConverted(id, body.orderId);
  }
}
