import {
  BadRequestException, Body, Controller, Get, Param, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { OptionalCustomerAuthGuard } from '../customer-portal/optional-customer-auth.guard';
import { KitsService } from './kits.service';
import { KitsEnabledGuard } from './kits.flag';
import { RateLimiter } from './kit-rate-limit';
import { SaveDesignDto } from './dto/kits.dto';

const clientKey = (request: Request) =>
  String(request.headers['cf-connecting-ip'] || request.headers['x-forwarded-for'] || request.ip || 'unknown').split(',')[0].trim();

/**
 * The public Kits line. Every route except /kits/status is behind KitsEnabledGuard: while the switch is off they
 * answer 404, exactly as if the line did not exist.
 */
@ApiTags('kits')
@Controller('kits')
export class KitsController {
  private readonly uploads = new RateLimiter(20, 10 * 60 * 1000);
  private readonly designs = new RateLimiter(60, 10 * 60 * 1000);

  constructor(private readonly service: KitsService) {}

  /** The only route that answers while the line is off: lets the site decide whether to show a link. */
  @Public()
  @Get('status')
  async status() {
    return { enabled: await this.service.flag.isEnabled() };
  }

  @Public()
  @UseGuards(KitsEnabledGuard)
  @Get('config')
  config() { return this.service.config(); }

  @Public()
  @UseGuards(KitsEnabledGuard)
  @Get('clubs')
  clubs(@Query('all') all?: string) { return this.service.clubs({ all: all === 'true' }); }

  @Public()
  @UseGuards(KitsEnabledGuard)
  @Get('clubs/:slug')
  club(@Param('slug') slug: string, @Req() request: Request) { return this.service.clubPage(slug, (request as any).user); }

  @Public()
  @UseGuards(KitsEnabledGuard, OptionalCustomerAuthGuard)
  @Get('products')
  list(
    @Req() request: Request,
    @Query('kind') kind?: string,
    @Query('league') league?: string,
    @Query('club') club?: string,
    @Query('size') size?: string,
    @Query('search') search?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('inStockOnly') inStockOnly?: string,
    @Query('sort') sort?: string,
  ) {
    return this.service.list({ kind, league, club, size, search, minPrice, maxPrice, inStockOnly, sort }, (request as any).user);
  }

  @Public()
  @UseGuards(KitsEnabledGuard, OptionalCustomerAuthGuard)
  @Get('products/:slug')
  bySlug(@Param('slug') slug: string, @Req() request: Request) { return this.service.bySlug(slug, (request as any).user); }

  /** Artwork for a shirt: any picture, returned as a bounded PNG on our own media route. */
  @Public()
  @UseGuards(KitsEnabledGuard)
  @Post('artwork')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024, files: 1 } }))
  uploadArtwork(@UploadedFile() file: { buffer: Buffer } | undefined, @Req() request: Request) {
    if (!file) throw new BadRequestException('No file uploaded');
    this.uploads.check(clientKey(request));
    return this.service.uploadArtwork(file);
  }

  @Public()
  @UseGuards(KitsEnabledGuard)
  @Post('designs')
  saveDesign(@Body() dto: SaveDesignDto, @Req() request: Request) {
    this.designs.check(clientKey(request));
    return this.service.saveDesign(dto.productSlug, dto.spec);
  }

  @Public()
  @UseGuards(KitsEnabledGuard)
  @Get('designs/:token')
  getDesign(@Param('token') token: string) { return this.service.getDesign(token); }

  @Public()
  @UseGuards(KitsEnabledGuard)
  @Post('designs/:token/preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 6 * 1024 * 1024, files: 1 } }))
  preview(@Param('token') token: string, @UploadedFile() file: { buffer: Buffer } | undefined, @Req() request: Request) {
    if (!file) throw new BadRequestException('No file uploaded');
    this.uploads.check(clientKey(request));
    return this.service.attachPreview(token, file);
  }
}
