import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';
import { OfferService } from './offer.service';
import { CreateOfferDto, OfferLineDto, UpdateOfferDto } from './dto/offer.dto';

@ApiBearerAuth()
@ApiTags('offers')
@Controller('offers')
export class OfferController {
  constructor(private readonly service: OfferService) {}

  /**
   * Declared before ":id", or Nest reads "dead-stock" as an offer id.
   */
  @Get('dead-stock')
  @Permissions(buildPermissionKey('Offer', 'read'))
  deadStock(@Query('days') days?: string) {
    const parsed = Number(days);
    return this.service.deadStock(Number.isFinite(parsed) && parsed > 0 ? parsed : undefined);
  }

  @Post()
  @Permissions(buildPermissionKey('Offer', 'create'))
  create(@Body() dto: CreateOfferDto, @Req() request: any) {
    return this.service.create(dto, request?.user?.email);
  }

  @Get()
  @Permissions(buildPermissionKey('Offer', 'read'))
  findAll(@Query('includeEnded') includeEnded?: string) {
    return this.service.findAll(includeEnded === 'true');
  }

  @Get(':id')
  @Permissions(buildPermissionKey('Offer', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Permissions(buildPermissionKey('Offer', 'update'))
  update(@Param('id') id: string, @Body() dto: UpdateOfferDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/lines')
  @Permissions(buildPermissionKey('Offer', 'update'))
  addLines(@Param('id') id: string, @Body() body: { lines: OfferLineDto[] }) {
    return this.service.addLines(id, body.lines || []);
  }

  @Delete(':id/lines/:variantId')
  @Permissions(buildPermissionKey('Offer', 'update'))
  removeLine(@Param('id') id: string, @Param('variantId') variantId: string) {
    return this.service.removeLine(id, variantId);
  }

  @Delete(':id')
  @Permissions(buildPermissionKey('Offer', 'delete'))
  end(@Param('id') id: string) {
    return this.service.end(id);
  }
}
