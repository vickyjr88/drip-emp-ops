import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const ROUNDING_TOLERANCE = 0.01;

@Injectable()
export class FinancialReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private async postedLines(params: { from?: string; to?: string; accountTypes?: string[] }) {
    return this.prisma.journalLine.findMany({
      where: {
        entry: {
          status: 'POSTED',
          ...(params.from || params.to
            ? {
                entryDate: {
                  ...(params.from ? { gte: new Date(params.from) } : {}),
                  ...(params.to ? { lte: new Date(params.to) } : {}),
                },
              }
            : {}),
        },
        ...(params.accountTypes ? { account: { type: { in: params.accountTypes as any } } } : {}),
      },
      include: { account: true },
    });
  }

  async profitAndLoss(from?: string, to?: string) {
    const lines = await this.postedLines({ from, to, accountTypes: ['REVENUE', 'EXPENSE'] });

    const byAccount = new Map<string, { code: string; name: string; type: string; amount: number }>();
    for (const line of lines) {
      const key = line.accountId;
      const current = byAccount.get(key) || {
        code: line.account.code,
        name: line.account.name,
        type: line.account.type,
        amount: 0,
      };
      const net = Number(line.baseCredit) - Number(line.baseDebit);
      current.amount += line.account.type === 'REVENUE' ? net : -net;
      byAccount.set(key, current);
    }

    const revenue = [...byAccount.values()].filter((row) => row.type === 'REVENUE');
    const expenses = [...byAccount.values()].filter((row) => row.type === 'EXPENSE');
    const totalRevenue = revenue.reduce((sum, row) => sum + row.amount, 0);
    const totalExpenses = expenses.reduce((sum, row) => sum + row.amount, 0);

    return {
      from: from || null,
      to: to || new Date().toISOString(),
      revenue,
      expenses,
      totalRevenue,
      totalExpenses,
      netIncome: totalRevenue - totalExpenses,
    };
  }

  async balanceSheet(asOf?: string) {
    const lines = await this.postedLines({ to: asOf, accountTypes: ['ASSET', 'LIABILITY', 'EQUITY'] });

    const byAccount = new Map<string, { code: string; name: string; type: string; amount: number }>();
    for (const line of lines) {
      const key = line.accountId;
      const current = byAccount.get(key) || {
        code: line.account.code,
        name: line.account.name,
        type: line.account.type,
        amount: 0,
      };
      const net = Number(line.baseDebit) - Number(line.baseCredit);
      current.amount += line.account.type === 'ASSET' ? net : -net;
      byAccount.set(key, current);
    }

    const assets = [...byAccount.values()].filter((row) => row.type === 'ASSET');
    const liabilities = [...byAccount.values()].filter((row) => row.type === 'LIABILITY');
    const equity = [...byAccount.values()].filter((row) => row.type === 'EQUITY');

    const { netIncome } = await this.profitAndLoss(undefined, asOf);

    const totalAssets = assets.reduce((sum, row) => sum + row.amount, 0);
    const totalLiabilities = liabilities.reduce((sum, row) => sum + row.amount, 0);
    const totalEquity = equity.reduce((sum, row) => sum + row.amount, 0) + netIncome;

    return {
      asOf: asOf || new Date().toISOString(),
      assets,
      liabilities,
      equity,
      retainedEarnings: netIncome,
      totalAssets,
      totalLiabilities,
      totalEquity,
      balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < ROUNDING_TOLERANCE,
    };
  }

  /**
   * Indirect-method cash flow: starts from net income, then adds back
   * non-cash items (depreciation) and the period's change in the Cash
   * and Bank account balance is used to verify against operating +
   * financing movements. This is a simplified single-bucket version —
   * it does not split investing/financing since the chart of accounts
   * doesn't yet distinguish them beyond fixed-asset and AR/AP activity.
   */
  async cashFlow(from?: string, to?: string) {
    const { netIncome } = await this.profitAndLoss(from, to);

    const depreciationLines = await this.postedLines({ from, to });
    const depreciation = depreciationLines
      .filter((line) => line.account.code === '5900')
      .reduce((sum, line) => sum + Number(line.baseDebit), 0);

    const cashLines = await this.prisma.journalLine.findMany({
      where: {
        entry: {
          status: 'POSTED',
          ...(from || to
            ? { entryDate: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
            : {}),
        },
        account: { code: { in: ['1000', '1010'] } },
      },
    });
    const netCashMovement = cashLines.reduce((sum, line) => sum + Number(line.baseDebit) - Number(line.baseCredit), 0);

    return {
      from: from || null,
      to: to || new Date().toISOString(),
      netIncome,
      addBackDepreciation: depreciation,
      operatingCashFlowApprox: netIncome + depreciation,
      netCashMovement,
    };
  }

  async apAging(asOf?: string) {
    const cutoff = asOf ? new Date(asOf) : new Date();
    const invoices = await this.prisma.supplierInvoice.findMany({
      where: { status: { in: ['APPROVED', 'STAGED'] } },
      include: { payments: true, supplier: true },
    });

    const buckets = { current: 0, days30: 0, days60: 0, days90: 0, days90plus: 0 };
    const rows = invoices
      .map((invoice) => {
        const paid = invoice.payments.reduce((sum, allocation) => sum + Number(allocation.allocatedAmount), 0);
        const balance = Number(invoice.amount) - paid;
        if (balance <= ROUNDING_TOLERANCE) return null;

        const daysOverdue = Math.floor((cutoff.getTime() - invoice.dueDate.getTime()) / (1000 * 60 * 60 * 24));
        let bucket: keyof typeof buckets = 'current';
        if (daysOverdue > 90) bucket = 'days90plus';
        else if (daysOverdue > 60) bucket = 'days90';
        else if (daysOverdue > 30) bucket = 'days60';
        else if (daysOverdue > 0) bucket = 'days30';

        buckets[bucket] += balance;

        return {
          supplierInvoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          supplierId: invoice.supplierId,
          supplierName: invoice.supplier.name,
          dueDate: invoice.dueDate,
          balance,
          daysOverdue,
          bucket,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    return { asOf: cutoff.toISOString(), buckets, rows };
  }

  async projectProfitability(from?: string, to?: string) {
    const lines = await this.postedLines({ from, to, accountTypes: ['REVENUE', 'EXPENSE'] });
    const scoped = lines.filter((line) => line.projectId);

    const byProject = new Map<string, { revenue: number; expenses: number }>();
    for (const line of scoped) {
      const projectId = line.projectId as string;
      const current = byProject.get(projectId) || { revenue: 0, expenses: 0 };
      const net = Number(line.baseCredit) - Number(line.baseDebit);
      if (line.account.type === 'REVENUE') {
        current.revenue += net;
      } else {
        current.expenses += -net;
      }
      byProject.set(projectId, current);
    }

    const projectIds = [...byProject.keys()];
    const projects = await this.prisma.project.findMany({ where: { id: { in: projectIds } } });
    const projectMap = new Map(projects.map((project) => [project.id, project]));

    const rows = projectIds.map((projectId) => {
      const totals = byProject.get(projectId)!;
      return {
        projectId,
        projectName: projectMap.get(projectId)?.name || projectId,
        revenue: totals.revenue,
        expenses: totals.expenses,
        profit: totals.revenue - totals.expenses,
      };
    });

    return { from: from || null, to: to || new Date().toISOString(), rows };
  }

  /**
   * Kenya VAT/WHT summary: sums journal activity on any account whose
   * subtype is tagged VAT or WHT in the chart of accounts. Requires
   * those accounts to be set up with the matching subtype. Figures are
   * running liability balances for the period — remittances already
   * paid reduce the balance since they post as debits to these same
   * accounts (see TaxRemittanceService).
   */
  async taxReport(from?: string, to?: string, projectId?: string) {
    const accounts = await this.prisma.chartOfAccount.findMany({
      where: { subtype: { in: ['VAT_OUTPUT', 'VAT_INPUT', 'WHT_PAYABLE'] } },
    });
    const accountIds = accounts.map((account) => account.id);

    const lines = await this.prisma.journalLine.findMany({
      where: {
        accountId: { in: accountIds },
        ...(projectId ? { projectId } : {}),
        entry: {
          status: 'POSTED',
          ...(from || to
            ? { entryDate: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
            : {}),
        },
      },
      include: { account: true },
    });

    const bySubtype = new Map<string, number>();
    for (const line of lines) {
      const subtype = line.account.subtype as string;
      // VAT Output and WHT Payable are liabilities (credit-normal): a
      // positive balance means "we owe this". VAT Input is an asset
      // (debit-normal): a positive balance means "we can reclaim this".
      // Each is reported as its own natural-side balance so both read as
      // a positive, intuitive amount rather than one coming out negative.
      const net = subtype === 'VAT_INPUT'
        ? Number(line.baseDebit) - Number(line.baseCredit)
        : Number(line.baseCredit) - Number(line.baseDebit);
      bySubtype.set(subtype, (bySubtype.get(subtype) || 0) + net);
    }

    return {
      from: from || null,
      to: to || new Date().toISOString(),
      projectId: projectId || null,
      vatOutput: bySubtype.get('VAT_OUTPUT') || 0,
      vatInput: bySubtype.get('VAT_INPUT') || 0,
      netVatPayable: (bySubtype.get('VAT_OUTPUT') || 0) - (bySubtype.get('VAT_INPUT') || 0),
      withholdingTaxPayable: bySubtype.get('WHT_PAYABLE') || 0,
      note:
        accountIds.length === 0
          ? 'No VAT/WHT accounts configured yet — create ChartOfAccount entries with subtype VAT_OUTPUT, VAT_INPUT, or WHT_PAYABLE and post tax journal lines to them.'
          : undefined,
    };
  }
}
