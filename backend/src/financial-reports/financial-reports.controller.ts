import { BadRequestException, Controller, Get, Param, Query, StreamableFile } from '@nestjs/common';
import { FinancialReportsService } from './financial-reports.service';
import { PdfService } from '../pdf/pdf.service';
import { reportPdfTemplate } from './report-pdf.template';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('financial-reports')
@Controller('reports')
export class FinancialReportsController {
  constructor(
    private readonly service: FinancialReportsService,
    private readonly pdfService: PdfService,
  ) {}

  /**
   * One PDF endpoint for every report, rather than eight near-identical ones.
   *
   * Each report already returns the same broad shape, and the template renders
   * that generically, so the only per-report knowledge here is its title and
   * which service method to call. A new report needs one line in this map.
   */
  private static readonly REPORTS: Record<
    string,
    { title: string; run: (service: FinancialReportsService, query: Record<string, string | undefined>) => Promise<unknown> }
  > = {
    'profit-and-loss': {
      title: 'Profit and Loss',
      run: (service, q) => service.profitAndLoss(q.from, q.to),
    },
    'balance-sheet': {
      title: 'Balance Sheet',
      run: (service, q) => service.balanceSheet(q.asOf),
    },
    'cash-flow': {
      title: 'Cash Flow',
      run: (service, q) => service.cashFlow(q.from, q.to),
    },
    'ap-aging': {
      title: 'Accounts Payable Ageing',
      run: (service, q) => service.apAging(q.asOf),
    },
    tax: {
      title: 'Tax Report',
      run: (service, q) => service.taxReport(q.from, q.to),
    },
  };

  @Get(':report/pdf')
  @Permissions(buildPermissionKey('JournalEntry', 'read'))
  async reportPdf(
    @Param('report') report: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('asOf') asOf?: string,
    @Query('storeId') storeId?: string,
    @Query('projectName') projectName?: string,
  ) {
    const definition = FinancialReportsController.REPORTS[report];
    if (!definition) {
      throw new BadRequestException(
        `Unknown report "${report}". Available: ${Object.keys(FinancialReportsController.REPORTS).join(', ')}`,
      );
    }

    const data = (await definition.run(this.service, { from, to, asOf, storeId })) as Record<
      string,
      unknown
    >;

    // The project name is passed through from the caller rather than looked up:
    // the reports service does not resolve it, and a PDF headed "Project Cost
    // Report" with no indication of which project is close to useless.
    const html = reportPdfTemplate({
      title: definition.title,
      subtitle: projectName ? `Project: ${projectName}` : undefined,
      data,
    });

    const buffer = await this.pdfService.renderPdf(html);
    const stamp = new Date().toISOString().slice(0, 10);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${report}-${stamp}.pdf"`,
    });
  }



  @Get('tax')
  @Permissions(buildPermissionKey('JournalEntry', 'read'))
  taxReport(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.taxReport(from, to);
  }
}
