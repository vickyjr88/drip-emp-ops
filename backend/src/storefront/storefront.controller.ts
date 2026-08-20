import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
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
  @Get('products')
  list(
    @Query('category') category?: string,
    @Query('brand') brand?: string,
    @Query('size') size?: string,
    @Query('search') search?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('inStockOnly') inStockOnly?: string,
    @Query('sort') sort?: string,
  ) {
    return this.service.list({ category, brand, size, search, minPrice, maxPrice, inStockOnly, sort });
  }

  // After the literal routes above, or "categories" is read as a slug.
  @Public()
  @Get('products/:slug')
  bySlug(@Param('slug') slug: string) { return this.service.bySlug(slug); }

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
