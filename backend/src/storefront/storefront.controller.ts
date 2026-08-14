import { Controller, Get, Param, Query } from '@nestjs/common';
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
}
