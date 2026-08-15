import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_ACCOUNT_CODES } from '../ledger/default-accounts';

const ROUNDING_TOLERANCE = 0.01;

/** Keeps derived ratios and money values from carrying float noise into the UI. */
function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

@Injectable()
export class FinancialReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private async postedLines(params: {
    from?: string;
    to?: string;
    accountTypes?: string[];
    storeId?: string;
  }) {
    return this.prisma.journalLine.findMany({
      where: {
        // Every posting path tags its lines with a store, so scoping here
        // covers sales, COGS, consignment settlement, shrinkage and receipts
        // alike. Head-office costs carry no store and are excluded from a
        // scoped cut by construction, which is the intended reading.
        ...(params.storeId ? { storeId: params.storeId } : {}),
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

  async profitAndLoss(from?: string, to?: string, storeId?: string) {
    const lines = await this.postedLines({ from, to, storeId, accountTypes: ['REVENUE', 'EXPENSE'] });

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
      storeId: storeId || null,
      revenue,
      expenses,
      totalRevenue,
      totalExpenses,
      netIncome: totalRevenue - totalExpenses,
    };
  }


  /**
   * Company-wide this is a true balance sheet. Scoped to a store it is a
   * *statement of store-attributable balances*: only journal lines tagged
   * with the store are included, and equity, shared cash and any untagged
   * activity are excluded by construction. Such a statement does not balance,
   * so `balanced` is reported as null rather than false when scoped -- a false
   * would read as a bookkeeping error rather than a property of the cut.
   */
  async balanceSheet(asOf?: string, storeId?: string) {
    const lines = await this.postedLines({
      to: asOf,
      storeId,
      accountTypes: ['ASSET', 'LIABILITY', 'EQUITY'],
    });

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

    const { netIncome } = await this.profitAndLoss(undefined, asOf, storeId);

    const totalAssets = assets.reduce((sum, row) => sum + row.amount, 0);
    const totalLiabilities = liabilities.reduce((sum, row) => sum + row.amount, 0);
    const totalEquity = equity.reduce((sum, row) => sum + row.amount, 0) + netIncome;

    return {
      asOf: asOf || new Date().toISOString(),
      storeId: storeId || null,
      assets,
      liabilities,
      equity,
      retainedEarnings: netIncome,
      totalAssets,
      totalLiabilities,
      totalEquity,
      // Null rather than false when scoped: a store cut legitimately does not
      // balance, and reporting false would read as a bookkeeping error.
      balanced: storeId
        ? null
        : Math.abs(totalAssets - (totalLiabilities + totalEquity)) < ROUNDING_TOLERANCE,
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
  async cashFlow(from?: string, to?: string, storeId?: string) {
    const { netIncome } = await this.profitAndLoss(from, to, storeId);

    const depreciationLines = await this.postedLines({ from, to, storeId });
    const depreciation = depreciationLines
      .filter((line) => line.account.code === DEFAULT_ACCOUNT_CODES.DEPRECIATION_EXPENSE)
      .reduce((sum, line) => sum + Number(line.baseDebit), 0);

    const cashLines = await this.prisma.journalLine.findMany({
      where: {
        ...(storeId ? { storeId } : {}),
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
      storeId: storeId || null,
      netIncome,
      addBackDepreciation: depreciation,
      operatingCashFlowApprox: netIncome + depreciation,
      netCashMovement,
    };
  }

  async apAging(asOf?: string) {
    const cutoff = asOf ? new Date(asOf) : new Date();
    const invoices = await this.prisma.supplierInvoice.findMany({
      where: {
        status: { in: ['APPROVED', 'STAGED'] },
      },
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



  /**
   * Kenya VAT/WHT summary: sums journal activity on any account whose
   * subtype is tagged VAT or WHT in the chart of accounts. Requires
   * those accounts to be set up with the matching subtype. Figures are
   * running liability balances for the period — remittances already
   * paid reduce the balance since they post as debits to these same
   * accounts (see TaxRemittanceService).
   */
  async taxReport(from?: string, to?: string) {
    const accounts = await this.prisma.chartOfAccount.findMany({
      where: { subtype: { in: ['VAT_OUTPUT', 'VAT_INPUT', 'WHT_PAYABLE'] } },
    });
    const accountIds = accounts.map((account) => account.id);

    const lines = await this.prisma.journalLine.findMany({
      where: {
        accountId: { in: accountIds },
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

  /**
   * Sales excluded from every retail report.
   *
   * Cancelled and refunded orders are not trade: counting them would inflate
   * revenue and, worse, credit a product with margin the shop never kept.
   */
  private static readonly DEAD_ORDER_STATUSES = ['CANCELLED', 'REFUNDED'] as const;

  private orderWhere(from?: string, to?: string, storeId?: string) {
    return {
      status: { notIn: [...FinancialReportsService.DEAD_ORDER_STATUSES] as any },
      ...(storeId ? { storeId } : {}),
      ...(from || to
        ? {
            placedAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    };
  }

  /**
   * Per-store trading performance.
   *
   * Replaces the old Project Cost report. Revenue and COGS come from the
   * ledger rather than from order totals, so this agrees with the P&L by
   * construction instead of being a second, subtly different set of numbers.
   * Order counts come from the orders themselves, which the ledger cannot
   * answer.
   */
  async storePerformance(from?: string, to?: string) {
    const [stores, lines, orders] = await Promise.all([
      this.prisma.store.findMany({ orderBy: { name: 'asc' } }),
      this.postedLines({ from, to, accountTypes: ['REVENUE', 'EXPENSE'] }),
      this.prisma.order.groupBy({
        by: ['storeId'],
        where: this.orderWhere(from, to),
        _count: { _all: true },
        _sum: { total: true, amountPaid: true },
      }),
    ]);

    const ledger = new Map<string, { revenue: number; cogs: number; otherExpense: number }>();
    for (const line of lines) {
      // Untagged lines are head-office costs and belong to no store; they are
      // reported separately rather than being spread across stores on a guess.
      const key = line.storeId || 'unallocated';
      const current = ledger.get(key) || { revenue: 0, cogs: 0, otherExpense: 0 };
      const net = Number(line.baseCredit) - Number(line.baseDebit);
      if (line.account.type === 'REVENUE') current.revenue += net;
      else if (line.account.code === DEFAULT_ACCOUNT_CODES.COST_OF_GOODS_SOLD) current.cogs += -net;
      else current.otherExpense += -net;
      ledger.set(key, current);
    }

    const orderStats = new Map(orders.map((row) => [row.storeId, row]));

    const rows = stores.map((store) => {
      const money = ledger.get(store.id) || { revenue: 0, cogs: 0, otherExpense: 0 };
      const stats = orderStats.get(store.id);
      const orderCount = stats?._count._all ?? 0;
      const grossProfit = money.revenue - money.cogs;
      return {
        storeId: store.id,
        code: store.code,
        name: store.name,
        location: store.location,
        orderCount,
        revenue: round2(money.revenue),
        cogs: round2(money.cogs),
        grossProfit: round2(grossProfit),
        // Null, not zero, when there is no revenue: a margin on nothing is
        // undefined, and 0% would read as "sold at cost".
        grossMarginPercent: money.revenue ? round2((grossProfit / money.revenue) * 100) : null,
        otherExpense: round2(money.otherExpense),
        netProfit: round2(grossProfit - money.otherExpense),
        collected: round2(Number(stats?._sum.amountPaid ?? 0)),
        outstanding: round2(Number(stats?._sum.total ?? 0) - Number(stats?._sum.amountPaid ?? 0)),
        averageOrderValue: orderCount ? round2(money.revenue / orderCount) : null,
      };
    });

    const unallocated = ledger.get('unallocated');
    const totals = rows.reduce(
      (sum, row) => ({
        orderCount: sum.orderCount + row.orderCount,
        revenue: sum.revenue + row.revenue,
        cogs: sum.cogs + row.cogs,
        grossProfit: sum.grossProfit + row.grossProfit,
        otherExpense: sum.otherExpense + row.otherExpense,
        netProfit: sum.netProfit + row.netProfit,
      }),
      { orderCount: 0, revenue: 0, cogs: 0, grossProfit: 0, otherExpense: 0, netProfit: 0 },
    );

    return {
      from: from || null,
      to: to || new Date().toISOString(),
      rows,
      unallocatedExpense: round2(unallocated ? unallocated.cogs + unallocated.otherExpense : 0),
      totals: {
        ...totals,
        revenue: round2(totals.revenue),
        cogs: round2(totals.cogs),
        grossProfit: round2(totals.grossProfit),
        otherExpense: round2(totals.otherExpense),
        netProfit: round2(totals.netProfit),
        grossMarginPercent: totals.revenue ? round2((totals.grossProfit / totals.revenue) * 100) : null,
      },
    };
  }

  /**
   * Margin by product, and what the counter actually charged.
   *
   * Replaces Project Profitability. Cost comes from the variant, so a product
   * with no cost recorded reports a null margin rather than a fictitious 100%
   * -- the shop should see that the cost is missing, not a flattering number.
   *
   * `discount` is the gap between the marked price and what was taken, which
   * is the negotiated walk-in price made visible.
   */
  async productProfitability(from?: string, to?: string, storeId?: string) {
    const lines = await this.prisma.orderLine.findMany({
      where: { order: this.orderWhere(from, to, storeId) },
      include: {
        variant: {
          select: {
            id: true,
            sku: true,
            costKes: true,
            product: { select: { id: true, name: true, brand: true } },
          },
        },
      },
    });

    type Row = {
      productId: string;
      name: string;
      brand: string | null;
      unitsSold: number;
      revenue: number;
      cost: number;
      listValue: number;
      costKnown: boolean;
    };
    const byProduct = new Map<string, Row>();

    for (const line of lines) {
      const product = line.variant.product;
      const current = byProduct.get(product.id) || {
        productId: product.id,
        name: product.name,
        brand: product.brand,
        unitsSold: 0,
        revenue: 0,
        cost: 0,
        listValue: 0,
        costKnown: true,
      };
      const unitCost = line.variant.costKes;
      current.unitsSold += line.quantity;
      current.revenue += Number(line.lineTotal);
      if (unitCost === null || unitCost === undefined) current.costKnown = false;
      else current.cost += Number(unitCost) * line.quantity;
      current.listValue += Number(line.listPrice ?? line.unitPrice) * line.quantity;
      byProduct.set(product.id, current);
    }

    const rows = [...byProduct.values()]
      .map((row) => {
        const grossProfit = row.costKnown ? row.revenue - row.cost : null;
        return {
          productId: row.productId,
          name: row.name,
          brand: row.brand,
          unitsSold: row.unitsSold,
          revenue: round2(row.revenue),
          cost: row.costKnown ? round2(row.cost) : null,
          grossProfit: grossProfit === null ? null : round2(grossProfit),
          grossMarginPercent:
            grossProfit === null || !row.revenue ? null : round2((grossProfit / row.revenue) * 100),
          // What was given away against the marked price. Positive means
          // discounted; negative means sold above list, which happens.
          discount: round2(row.listValue - row.revenue),
          averagePrice: row.unitsSold ? round2(row.revenue / row.unitsSold) : null,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);

    const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
    const totalCost = rows.reduce((sum, row) => sum + (row.cost ?? 0), 0);
    const anyCostMissing = rows.some((row) => row.cost === null);

    return {
      from: from || null,
      to: to || new Date().toISOString(),
      storeId: storeId || null,
      rows,
      totals: {
        unitsSold: rows.reduce((sum, row) => sum + row.unitsSold, 0),
        revenue: round2(totalRevenue),
        cost: round2(totalCost),
        grossProfit: round2(totalRevenue - totalCost),
        grossMarginPercent: totalRevenue ? round2(((totalRevenue - totalCost) / totalRevenue) * 100) : null,
        discount: round2(rows.reduce((sum, row) => sum + row.discount, 0)),
      },
      // Flags that the totals understate cost, so the margin above is a
      // ceiling rather than a figure to bank on.
      costIncomplete: anyCostMissing,
    };
  }

  /**
   * What is sitting with resellers, and what is late.
   *
   * Replaces Project Analytics. Consignment stock is still owned by the shop
   * but cannot be sold, so its value is real exposure. Anything past its due
   * date -- three days from pickup by agreement -- is called out, because that
   * is the number worth chasing on a Monday morning.
   */
  async consignmentExposure(asOf?: string, storeId?: string) {
    const cutoff = asOf ? new Date(asOf) : new Date();

    const consignments = await this.prisma.consignment.findMany({
      where: { status: 'OPEN', ...(storeId ? { storeId } : {}) },
      include: {
        reseller: { select: { id: true, name: true, phone: true } },
        store: { select: { id: true, name: true } },
        lines: true,
      },
      orderBy: { issuedAt: 'asc' },
    });

    const rows = consignments.map((consignment) => {
      const unitsOut = consignment.lines.reduce((sum, line) => sum + line.quantityOut, 0);
      const unitsSold = consignment.lines.reduce((sum, line) => sum + line.quantitySold, 0);
      const unitsReturned = consignment.lines.reduce((sum, line) => sum + line.quantityReturned, 0);
      const unitsStillOut = unitsOut - unitsSold - unitsReturned;
      const balance = Number(consignment.soldValue) - Number(consignment.amountPaid);
      const due = consignment.dueDate;
      const overdue = Boolean(due && due < cutoff && unitsStillOut > 0);

      return {
        consignmentId: consignment.id,
        reference: consignment.reference,
        resellerId: consignment.reseller.id,
        resellerName: consignment.reseller.name,
        resellerPhone: consignment.reseller.phone,
        storeId: consignment.store.id,
        storeName: consignment.store.name,
        issuedAt: consignment.issuedAt.toISOString(),
        dueDate: due ? due.toISOString() : null,
        daysOut: Math.floor((cutoff.getTime() - consignment.issuedAt.getTime()) / 86400000),
        unitsOut,
        unitsSold,
        unitsReturned,
        unitsStillOut,
        // Value of stock physically with the reseller, at the agreed tier.
        stockAtRisk: round2(
          consignment.lines.reduce(
            (sum, line) =>
              sum +
              Number(line.unitPrice) * (line.quantityOut - line.quantitySold - line.quantityReturned),
            0,
          ),
        ),
        soldValue: round2(Number(consignment.soldValue)),
        amountPaid: round2(Number(consignment.amountPaid)),
        balance: round2(balance),
        overdue,
      };
    });

    const overdueRows = rows.filter((row) => row.overdue);

    return {
      asOf: cutoff.toISOString(),
      storeId: storeId || null,
      rows,
      totals: {
        openConsignments: rows.length,
        unitsStillOut: rows.reduce((sum, row) => sum + row.unitsStillOut, 0),
        stockAtRisk: round2(rows.reduce((sum, row) => sum + row.stockAtRisk, 0)),
        balanceOwed: round2(rows.reduce((sum, row) => sum + row.balance, 0)),
        overdueCount: overdueRows.length,
        overdueStockAtRisk: round2(overdueRows.reduce((sum, row) => sum + row.stockAtRisk, 0)),
      },
    };
  }
}
