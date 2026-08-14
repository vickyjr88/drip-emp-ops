import { Controller, Get, Query } from '@nestjs/common';
import { FinancialReportsService } from './financial-reports.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('financial-reports')
@Controller('reports')
export class FinancialReportsController {
  constructor(private readonly service: FinancialReportsService) {}

  @Get('profit-and-loss')
  @Permissions(buildPermissionKey('JournalEntry', 'read'))
  profitAndLoss(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.profitAndLoss(from, to);
  }

  @Get('balance-sheet')
  @Permissions(buildPermissionKey('JournalEntry', 'read'))
  balanceSheet(@Query('asOf') asOf?: string) {
    return this.service.balanceSheet(asOf);
  }

  @Get('cash-flow')
  @Permissions(buildPermissionKey('JournalEntry', 'read'))
  cashFlow(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.cashFlow(from, to);
  }

  @Get('ap-aging')
  @Permissions(buildPermissionKey('JournalEntry', 'read'))
  apAging(@Query('asOf') asOf?: string) {
    return this.service.apAging(asOf);
  }

  @Get('project-profitability')
  @Permissions(buildPermissionKey('JournalEntry', 'read'))
  projectProfitability(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.projectProfitability(from, to);
  }

  @Get('tax')
  @Permissions(buildPermissionKey('JournalEntry', 'read'))
  taxReport(@Query('from') from?: string, @Query('to') to?: string, @Query('projectId') projectId?: string) {
    return this.service.taxReport(from, to, projectId);
  }
}
