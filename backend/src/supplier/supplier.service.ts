import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SupplierQueryDto } from './dto/supplier-query.dto';
import { containsAny, paginate, searchOr } from '../common/pagination.util';

const ROUNDING_TOLERANCE = 0.01;

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

@Injectable()
export class SupplierService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateSupplierDto) {
    return this.prisma.supplier.create({ data: dto as any });
  }

  findAll(query: SupplierQueryDto) {
    const { skip, take, search } = query;
    const where: Prisma.SupplierWhereInput = {
      ...searchOr(search, (term) => containsAny(['name', 'contactName', 'email', 'phone', 'kraPin'], term)),
    };
    const orderBy: Prisma.SupplierOrderByWithRelationInput[] = [{ name: 'asc' }, { id: 'asc' }];
    return paginate(
      (args) => this.prisma.supplier.findMany({ where, orderBy, ...args }),
      () => this.prisma.supplier.count({ where }),
      skip,
      take,
    );
  }

  async findOne(id: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) {
      throw new NotFoundException(`Supplier ${id} not found`);
    }
    return supplier;
  }

  /**
   * What a supplier has been invoiced, what they have been paid, and what is
   * still owed.
   *
   * Two sources feed this. Invoices with their payment allocations are the
   * formal AP trail; journal lines tagged with the supplier cover spend paid
   * directly without an invoice, which is common and would otherwise never
   * appear on their account. Directly tagged lines are reported separately so
   * the invoice-based balance stays reconcilable on its own.
   */
  async account(id: string, params: { from?: string; to?: string } = {}) {
    const supplier = await this.findOne(id);

    const dateFilter = {
      ...(params.from ? { gte: new Date(params.from) } : {}),
      ...(params.to ? { lte: new Date(`${params.to.slice(0, 10)}T23:59:59.999Z`) } : {}),
    };
    const hasDateFilter = Boolean(params.from || params.to);

    const [invoices, payments, taggedLines] = await Promise.all([
      this.prisma.supplierInvoice.findMany({
        where: { supplierId: id, ...(hasDateFilter ? { invoiceDate: dateFilter } : {}) },
        include: {
          payments: { include: { payment: { select: { paymentNumber: true, paidAt: true, status: true } } } },
          taxRate: { select: { code: true, name: true } },
        },
        orderBy: { invoiceDate: 'desc' },
      }),
      this.prisma.supplierPayment.findMany({
        where: { supplierId: id, ...(hasDateFilter ? { stagedAt: dateFilter } : {}) },
        include: { allocations: true },
        orderBy: { stagedAt: 'desc' },
      }),
      this.prisma.journalLine.findMany({
        where: {
          supplierId: id,
          entry: { status: 'POSTED', ...(hasDateFilter ? { entryDate: dateFilter } : {}) },
        },
        include: {
          account: { select: { code: true, name: true, type: true } },
          entry: { select: { id: true, entryNumber: true, entryDate: true, memo: true, source: true } },
        },
        orderBy: { entry: { entryDate: 'desc' } },
      }),
    ]);

    // Cancelled invoices are not owed and would overstate the balance.
    const liveInvoices = invoices.filter((invoice) => invoice.status !== 'CANCELLED');

    let invoiced = 0;
    let allocated = 0;
    const invoiceRows = liveInvoices.map((invoice) => {
      const paid = invoice.payments.reduce((sum, row) => sum + Number(row.allocatedAmount), 0);
      invoiced += Number(invoice.amount);
      allocated += paid;
      return {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        amount: Number(invoice.amount),
        taxAmount: Number(invoice.taxAmount),
        status: invoice.status,
        storeId: invoice.storeId,
        amountPaid: round2(paid),
        outstanding: round2(Number(invoice.amount) - paid),
        // A due date in the past with money still owed is what makes a
        // payables list actionable.
        isOverdue:
          Number(invoice.amount) - paid > ROUNDING_TOLERANCE &&
          invoice.dueDate < new Date() &&
          invoice.status !== 'PAID',
      };
    });

    // Payments that are staged but not yet paid are commitments, not cash out.
    const settledPayments = payments.filter((payment) => payment.status === 'PAID');
    const paidOut = settledPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const withheld = settledPayments.reduce((sum, payment) => sum + Number(payment.whtAmount), 0);
    const staged = payments
      .filter((payment) => payment.status !== 'PAID')
      .reduce((sum, payment) => sum + Number(payment.amount), 0);

    const directSpend = taggedLines.reduce(
      (sum, line) => sum + (Number(line.baseDebit) - Number(line.baseCredit)),
      0,
    );

    return {
      supplier,
      from: params.from || null,
      to: params.to || null,
      summary: {
        invoicedTotal: round2(invoiced),
        paidTotal: round2(allocated),
        outstanding: round2(invoiced - allocated),
        // Cash actually released, which differs from allocations when a payment
        // is not yet fully applied to invoices.
        cashPaid: round2(paidOut),
        withholdingTax: round2(withheld),
        stagedNotPaid: round2(staged),
        directSpend: round2(directSpend),
        invoiceCount: invoiceRows.length,
        overdueCount: invoiceRows.filter((row) => row.isOverdue).length,
        overdueAmount: round2(
          invoiceRows.filter((row) => row.isOverdue).reduce((sum, row) => sum + row.outstanding, 0),
        ),
      },
      invoices: invoiceRows,
      payments: payments.map((payment) => ({
        id: payment.id,
        paymentNumber: payment.paymentNumber,
        amount: Number(payment.amount),
        whtAmount: Number(payment.whtAmount),
        netPaid: round2(Number(payment.amount) - Number(payment.whtAmount)),
        status: payment.status,
        stagedAt: payment.stagedAt,
        paidAt: payment.paidAt,
        allocatedCount: payment.allocations.length,
      })),
      taggedTransactions: taggedLines.map((line) => ({
        lineId: line.id,
        entryId: line.entry.id,
        entryNumber: line.entry.entryNumber,
        entryDate: line.entry.entryDate,
        memo: line.memo || line.entry.memo,
        source: line.entry.source,
        accountCode: line.account.code,
        accountName: line.account.name,
        debit: Number(line.debit),
        credit: Number(line.credit),
        storeId: line.storeId,
      })),
    };
  }

  /** Balances for every supplier, for the payables overview. */
  async balances() {
    const suppliers = await this.prisma.supplier.findMany({
      where: { isActive: true },
      include: {
        invoices: { include: { payments: true } },
      },
      orderBy: { name: 'asc' },
    });

    return suppliers
      .map((supplier) => {
        const live = supplier.invoices.filter((invoice) => invoice.status !== 'CANCELLED');
        const invoiced = live.reduce((sum, invoice) => sum + Number(invoice.amount), 0);
        const paid = live.reduce(
          (sum, invoice) =>
            sum + invoice.payments.reduce((inner, row) => inner + Number(row.allocatedAmount), 0),
          0,
        );
        return {
          id: supplier.id,
          name: supplier.name,
          invoicedTotal: round2(invoiced),
          paidTotal: round2(paid),
          outstanding: round2(invoiced - paid),
          invoiceCount: live.length,
        };
      })
      .sort((a, b) => b.outstanding - a.outstanding);
  }

  /**
   * Attaches or clears the supplier on a posted journal line.
   *
   * Amounts and accounts are untouched: this only records who the money went
   * to, so a direct payment shows on their account without restating the
   * transaction.
   */
  async tagJournalLine(lineId: string, supplierId: string | null) {
    const line = await this.prisma.journalLine.findUnique({ where: { id: lineId } });
    if (!line) {
      throw new NotFoundException(`Journal line ${lineId} not found`);
    }
    if (supplierId) {
      await this.findOne(supplierId);
    }
    return this.prisma.journalLine.update({
      where: { id: lineId },
      data: { supplierId },
      include: { account: { select: { code: true, name: true } } },
    });
  }

  update(id: string, dto: UpdateSupplierDto) {
    return this.prisma.supplier.update({ where: { id }, data: dto as any });
  }

  remove(id: string) {
    return this.prisma.supplier.delete({ where: { id } });
  }
}
