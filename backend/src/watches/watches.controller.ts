import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { OptionalCustomerAuthGuard } from '../customer-portal/optional-customer-auth.guard';
import { WatchesService } from './watches.service';

/** The public Watches line. Read-only, like the shop window; a signed-in reseller sees their own tier's price. */
@ApiTags('watches')
@Controller('watches')
export class WatchesController {
  constructor(private readonly service: WatchesService) {}

  @Public()
  @Get('status')
  status() { return this.service.status(); }

  @Public()
  @Get('brands')
  brands() { return this.service.brands(); }

  @Public()
  @UseGuards(OptionalCustomerAuthGuard)
  @Get('products')
  list(
    @Req() request: Request,
    @Query('brand') brand?: string,
    @Query('search') search?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('inStockOnly') inStockOnly?: string,
    @Query('sort') sort?: string,
  ) {
    return this.service.list({ brand, search, minPrice, maxPrice, inStockOnly, sort }, (request as any).user);
  }

  @Public()
  @UseGuards(OptionalCustomerAuthGuard)
  @Get('products/:slug')
  bySlug(@Param('slug') slug: string, @Req() request: Request) { return this.service.bySlug(slug, (request as any).user); }
}
