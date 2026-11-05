import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';
import { AdSpendInput, AdSpendService } from './ad-spend.service';
import { BuyersService } from './buyers.service';
import { FunnelService } from './funnel.service';
import { StockService } from './stock.service';

const DAY = 24 * 3600_000;

/** The period a screen asks for: `from` and `to` as dates, the last 30 days when left out. `to` runs to the end of its day. */
function periodOf(from?: string, to?: string) {
  const end = to ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to}T23:59:59.999Z` : to) : new Date();
  const safeEnd = Number.isNaN(end.getTime()) ? new Date() : end;
  const start = from ? new Date(from) : new Date(safeEnd.getTime() - 30 * DAY);
  return { start: Number.isNaN(start.getTime()) ? new Date(safeEnd.getTime() - 30 * DAY) : start, end: safeEnd };
}

const clampDays = (v: string | undefined) => (v ? Math.min(365, Math.max(14, Number(v) || 60)) : 60);

@ApiBearerAuth()
@ApiTags('insights')
@Controller('insights')
export class InsightsController {
  constructor(
    private funnelService: FunnelService,
    private adSpend: AdSpendService,
    private stockService: StockService,
    private buyersService: BuyersService,
  ) {}

  /** Visits to orders: the funnel by source and device, what ads return, and the products people look at. */
  @Get('funnel')
  @Permissions(buildPermissionKey('MarketingCampaign', 'read'))
  funnel(@Query('from') from?: string, @Query('to') to?: string) {
    const w = periodOf(from, to);
    return this.funnelService.funnel(w.start, w.end);
  }

  @Get('ad-spend')
  @Permissions(buildPermissionKey('MarketingCampaign', 'read'))
  listAdSpend(@Query('from') from?: string, @Query('to') to?: string) {
    const w = periodOf(from, to);
    return this.adSpend.list(new Date(w.start.toISOString().slice(0, 10)), new Date(w.end.toISOString().slice(0, 10)));
  }

  @Post('ad-spend')
  @Permissions(buildPermissionKey('MarketingCampaign', 'create'))
  addAdSpend(@Body() body: AdSpendInput) {
    return this.adSpend.create(body ?? {});
  }

  @Delete('ad-spend/:id')
  @Permissions(buildPermissionKey('MarketingCampaign', 'delete'))
  removeAdSpend(@Param('id') id: string) {
    return this.adSpend.remove(id);
  }

  /** Stock tied up, running low, and out of stock but wanted. Carries what stock costs, so it sits with the financial reports. */
  @Get('stock')
  @Permissions(buildPermissionKey('JournalEntry', 'read'))
  stock(@Query('from') from?: string, @Query('to') to?: string, @Query('deadDays') deadDays?: string) {
    const w = periodOf(from, to);
    return this.stockService.stock(w.start, w.end, clampDays(deadDays));
  }

  /** Who buys, who comes back, and who has gone quiet. */
  @Get('buyers')
  @Permissions(buildPermissionKey('Customer', 'read'))
  buyers(@Query('from') from?: string, @Query('to') to?: string, @Query('lapseDays') lapseDays?: string) {
    const w = periodOf(from, to);
    return this.buyersService.buyers(w.start, w.end, clampDays(lapseDays));
  }
}
