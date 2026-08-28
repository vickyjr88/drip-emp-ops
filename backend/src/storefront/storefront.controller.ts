import { Controller, Get, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { OptionalCustomerAuthGuard } from '../customer-portal/optional-customer-auth.guard';
import { StorefrontService } from './storefront.service';

/**
 * The shop window. Every route is public and read-only.
 */
@ApiTags('storefront')
@Controller('shop')
export class StorefrontController {
  constructor(private readonly service: StorefrontService) {}

  @Public()
  @Get('categories')
  categories() { return this.service.categories(); }

  @Public()
  @Get('filters')
  filters() { return this.service.filters(); }

  @Public()
  @Get('stores')
  stores() { return this.service.stores(); }

  @Public()
  @UseGuards(OptionalCustomerAuthGuard)
  @Get('products')
  list(
    @Req() request: Request,
    @Query('category') category?: string,
    @Query('brand') brand?: string,
    @Query('size') size?: string,
    @Query('search') search?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('inStockOnly') inStockOnly?: string,
    @Query('sort') sort?: string,
  ) {
    return this.service.list(
      { category, brand, size, search, minPrice, maxPrice, inStockOnly, sort },
      (request as any).user,
    );
  }

  // Declared before 'products/:slug' below, or "featured" would be read as a
  // product slug.
  @Public()
  @UseGuards(OptionalCustomerAuthGuard)
  @Get('products/featured')
  featured(@Req() request: Request, @Query('limit') limit?: string) {
    const parsed = limit ? Number(limit) : undefined;
    return this.service.featured(
      parsed && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined,
      (request as any).user,
    );
  }

  // After the literal routes above, or "categories" is read as a slug.
  @Public()
  @UseGuards(OptionalCustomerAuthGuard)
  @Get('products/:slug')
  bySlug(@Param('slug') slug: string, @Req() request: Request) {
    return this.service.bySlug(slug, (request as any).user);
  }

  /**
   * The catalogue as a CSV, for Meta Commerce Manager's scheduled feed.
   *
   * Public and unauthenticated like every other route here: Meta's crawler
   * fetches this feed URL directly on its own schedule and cannot carry a
   * bearer token, so this has to be reachable the same way the rest of the
   * storefront's API already is.
   */
  @Public()
  @Get('catalog.csv')
  async catalogCsv(@Res() response: Response) {
    const csv = await this.service.catalogCsv();
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="drip-emporium-catalog.csv"');
    response.send(csv);
  }
}
