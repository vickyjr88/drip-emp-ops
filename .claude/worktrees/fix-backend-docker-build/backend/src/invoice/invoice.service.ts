import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService, PostJournalLine } from '../ledger/ledger.service';
import { DEFAULT_ACCOUNT_CODES } from '../ledger/default-accounts';
import { EmailLogService } from '../email-log/email-log.service';
import { PdfService } from '../pdf/pdf.service';
import { invoicePdfTemplate } from '../pdf/pdf.templates';
import { CreateInvoiceDto, BulkGenerateInvoicesDto, InvoiceSourceType } from './dto/create-invoice.dto';
import { UpdateInvoiceDto, CancelInvoiceDto } from './dto/update-invoice.dto';
import { JournalSource } from '@prisma/client';

@Injectable()
export class InvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly emailLog: EmailLogService,
    private readonly pdfService: PdfService,
  ) {}

  private async nextInvoiceNumber() {
    const year = new Date().getFullYear();
    const count = await this.prisma.invoice.count({
      where: { invoiceNumber: { startsWith: `INV-${year}-` } },
    });
    return `INV-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  private async projectIdForUnit(unitId: string) {
    const unit = await this.prisma.unit.findUnique({ where: { id: unitId }, include: { block: true } });
    return unit?.block.projectId;
  }

  private async postInvoiceJournal(
    invoiceId: string,
    lines: { amount: number; taxRateId?: string | null }[],
    currency: string,
    memo: string,
    projectId?: string | null,
  ) {
    const arAccount = await this.ledger.getAccountByCode(DEFAULT_ACCOUNT_CODES.ACCOUNTS_RECEIVABLE);
    const revenueAccount = await this.ledger.getAccountByCode(DEFAULT_ACCOUNT_CODES.SALES_REVENUE);

    const netAmount = lines.reduce((sum, line) => sum + line.amount, 0);
    const taxByRate = new Map<string, { glAccountId: string; amount: number }>();

    for (const line of lines) {
      if (!line.taxRateId) continue;
      const taxRate = await this.prisma.taxRate.findUnique({ where: { id: line.taxRateId } });
      if (!taxRate) continue;
      const taxAmount = line.amount * Number(taxRate.rate);
      const current = taxByRate.get(taxRate.glAccountId) || { glAccountId: taxRate.glAccountId, amount: 0 };
      current.amount += taxAmount;
      taxByRate.set(taxRate.glAccountId, current);
    }

    const totalTax = [...taxByRate.values()].reduce((sum, entry) => sum + entry.amount, 0);
    const grossAmount = netAmount + totalTax;

    const journalLines: PostJournalLine[] = [
      { accountId: arAccount.id, debit: grossAmount, currencyCode: currency, projectId },
      { accountId: revenueAccount.id, credit: netAmount, currencyCode: currency, projectId },
    ];
    for (const entry of taxByRate.values()) {
      journalLines.push({ accountId: entry.glAccountId, credit: entry.amount, currencyCode: currency, projectId });
    }

    return {
      journal: await this.ledger.postJournal({ memo, source: JournalSource.AR, sourceId: invoiceId, lines: journalLines }),
      grossAmount,
      totalTax,
    };
  }

  async create(dto: CreateInvoiceDto) {
    const netAmount = dto.lines.reduce((sum, line) => sum + Number(line.amount), 0);
    const invoiceNumber = await this.nextInvoiceNumber();
    const projectId = dto.projectId ?? undefined;

    const linesWithTax = await Promise.all(
      dto.lines.map(async (line) => {
        let taxAmount = 0;
        if (line.taxRateId) {
          const taxRate = await this.prisma.taxRate.findUnique({ where: { id: line.taxRateId } });
          if (taxRate) taxAmount = Number(line.amount) * Number(taxRate.rate);
        }
        return { ...line, taxAmount };
      }),
    );
    const totalTax = linesWithTax.reduce((sum, line) => sum + line.taxAmount, 0);

    const invoice = await this.prisma.invoice.create({
      data: {
        invoiceNumber,
        customerId: dto.customerId,
        sourceType: (dto.sourceType || InvoiceSourceType.MANUAL) as any,
        sourceId: dto.sourceId,
        projectId,
        currency: dto.currency || 'KES',
        amount: netAmount + totalTax,
        dueDate: new Date(dto.dueDate),
        status: 'SENT',
        createdBy: dto.createdBy || 'system',
        lines: { create: linesWithTax },
      },
      include: { lines: true },
    });

    const { journal } = await this.postInvoiceJournal(
      invoice.id,
      dto.lines,
      invoice.currency,
      `Invoice ${invoiceNumber}`,
      projectId,
    );

    return this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { journalEntryId: journal.id },
      include: { lines: true },
    });
  }

  async bulkGenerate(dto: BulkGenerateInvoicesDto) {
    const created: any[] = [];

    if (dto.sourceType === InvoiceSourceType.SALES_CONTRACT) {
      const cutoff = new Date(dto.dueDate);
      const contracts = await this.prisma.salesContract.findMany({
        where: { contractStatus: 'ACTIVE' },
        include: { installments: { orderBy: { sequence: 'asc' } } },
      });

      for (const contract of contracts) {
        const projectId = await this.projectIdForUnit(contract.unitId);
        const dueInstallments = contract.installments.filter(
          (installment) => !installment.invoiceId && installment.dueDate <= cutoff,
        );

        if (dueInstallments.length > 0) {
          for (const installment of dueInstallments) {
            const invoice = await this.create({
              customerId: contract.primaryCustomerId,
              sourceType: InvoiceSourceType.SALES_CONTRACT,
              sourceId: contract.id,
              projectId,
              currency: contract.currency,
              dueDate: installment.dueDate.toISOString(),
              createdBy: dto.createdBy,
              lines: [
                {
                  description: `Sales contract ${contract.contractNumber} — installment ${installment.sequence}`,
                  amount: Number(installment.amount),
                },
              ],
            });
            await this.prisma.paymentScheduleInstallment.update({
              where: { id: installment.id },
              data: { invoiceId: invoice.id },
            });
            created.push(invoice);
          }
          continue;
        }

        if (contract.installments.length > 0) {
          // Every scheduled installment is either already invoiced or not yet due — nothing to generate.
          continue;
        }

        // No payment schedule configured: fall back to a single invoice for the full contract amount.
        const alreadyInvoiced = await this.prisma.invoice.findFirst({
          where: { sourceType: 'SALES_CONTRACT', sourceId: contract.id, status: { not: 'CANCELLED' } },
        });
        if (alreadyInvoiced) continue;

        const invoice = await this.create({
          customerId: contract.primaryCustomerId,
          sourceType: InvoiceSourceType.SALES_CONTRACT,
          sourceId: contract.id,
          projectId,
          currency: contract.currency,
          dueDate: dto.dueDate,
          createdBy: dto.createdBy,
          lines: [{ description: `Sales contract ${contract.contractNumber}`, amount: Number(contract.totalAgreedPrice) }],
        });
        created.push(invoice);
      }
    } else if (dto.sourceType === InvoiceSourceType.TENANCY) {
      const tenancies = await this.prisma.tenancy.findMany({ where: { status: 'ACTIVE' } });
      const periodLabel = new Date(dto.dueDate).toLocaleDateString('en-GB', { year: 'numeric', month: 'long' });
      for (const tenancy of tenancies) {
        const invoice = await this.create({
          customerId: tenancy.tenantId,
          sourceType: InvoiceSourceType.TENANCY,
          sourceId: tenancy.id,
          projectId: await this.projectIdForUnit(tenancy.unitId),
          currency: tenancy.currency,
          dueDate: dto.dueDate,
          createdBy: dto.createdBy,
          lines: [{ description: `Rent — ${periodLabel}`, amount: Number(tenancy.monthlyRent) }],
        });
        created.push(invoice);
      }
    } else {
      throw new BadRequestException('Bulk generation only supports SALES_CONTRACT or TENANCY source types.');
    }

    return { generatedCount: created.length, invoices: created };
  }

  findAll(params: { skip?: number; take?: number; customerId?: string; status?: string }) {
    const { skip, take, customerId, status } = params;
    return this.prisma.invoice.findMany({
      where: {
        ...(customerId ? { customerId } : {}),
        ...(status ? { status: status as any } : {}),
      },
      include: { lines: true, allocations: true },
      orderBy: { issuedAt: 'desc' },
      skip,
      take,
    });
  }

  async findOne(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { lines: true, allocations: { include: { receipt: true } }, customer: true },
    });
    if (!invoice) {
      throw new NotFoundException(`Invoice ${id} not found`);
    }
    return invoice;
  }

  async balance(id: string) {
    const invoice = await this.findOne(id);
    const paid = invoice.allocations.reduce((sum, allocation) => sum + Number(allocation.allocatedAmount), 0);
    return { invoiceId: id, amount: Number(invoice.amount), paid, balance: Number(invoice.amount) - paid };
  }

  async pdf(id: string): Promise<{ buffer: Buffer; invoiceNumber: string }> {
    const invoice = await this.findOne(id);
    const paidAmount = invoice.allocations.reduce((sum, allocation) => sum + Number(allocation.allocatedAmount), 0);

    const html = invoicePdfTemplate({
      invoiceNumber: invoice.invoiceNumber,
      issuedAt: invoice.issuedAt,
      dueDate: invoice.dueDate,
      status: invoice.status,
      currency: invoice.currency,
      customerName: `${invoice.customer.firstName} ${invoice.customer.lastName}`,
      customerEmail: invoice.customer.email,
      lines: invoice.lines.map((line) => ({
        description: line.description,
        amount: Number(line.amount) + Number(line.taxAmount || 0),
        taxAmount: Number(line.taxAmount || 0),
      })),
      amount: Number(invoice.amount),
      paidAmount,
    });

    return { buffer: await this.pdfService.renderPdf(html), invoiceNumber: invoice.invoiceNumber };
  }

  async email(id: string) {
    const invoice = await this.findOne(id);
    await this.emailLog.send({
      recipient: invoice.customer.email,
      subject: `Invoice ${invoice.invoiceNumber}`,
      invoiceId: invoice.id,
    });
    return this.prisma.invoice.update({
      where: { id },
      data: { sentAt: new Date(), status: invoice.status === 'DRAFT' ? 'SENT' : invoice.status },
    });
  }

  update(id: string, dto: UpdateInvoiceDto) {
    return this.prisma.invoice.update({
      where: { id },
      data: { ...(dto.dueDate ? { dueDate: new Date(dto.dueDate) } : {}) },
    });
  }

  async cancel(id: string, dto: CancelInvoiceDto) {
    const invoice = await this.findOne(id);
    if (invoice.status === 'PAID' || invoice.allocations.length > 0) {
      throw new BadRequestException('Cannot cancel an invoice that already has payments allocated to it.');
    }

    if (invoice.journalEntryId) {
      await this.ledger.reverseJournal(invoice.journalEntryId, dto.cancelledBy);
    }

    return this.prisma.invoice.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledReason: dto.reason,
        cancelledBy: dto.cancelledBy || 'system',
      },
    });
  }

  async agingReport(asOf?: string) {
    const cutoff = asOf ? new Date(asOf) : new Date();
    const invoices = await this.prisma.invoice.findMany({
      where: { status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] } },
      include: { allocations: true, customer: true },
    });

    const buckets = { current: 0, days30: 0, days60: 0, days90: 0, days90plus: 0 };
    const rows = invoices
      .map((invoice) => {
        const paid = invoice.allocations.reduce((sum, allocation) => sum + Number(allocation.allocatedAmount), 0);
        const balance = Number(invoice.amount) - paid;
        if (balance <= 0.01) return null;

        const daysOverdue = Math.floor((cutoff.getTime() - invoice.dueDate.getTime()) / (1000 * 60 * 60 * 24));
        let bucket: keyof typeof buckets = 'current';
        if (daysOverdue > 90) bucket = 'days90plus';
        else if (daysOverdue > 60) bucket = 'days90';
        else if (daysOverdue > 30) bucket = 'days60';
        else if (daysOverdue > 0) bucket = 'days30';

        buckets[bucket] += balance;

        return {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          customerId: invoice.customerId,
          customerName: `${invoice.customer.firstName} ${invoice.customer.lastName}`,
          dueDate: invoice.dueDate,
          balance,
          daysOverdue,
          bucket,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    return { asOf: cutoff.toISOString(), buckets, rows };
  }

  async customerStatement(customerId: string, from?: string, to?: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        customerId,
        ...(from || to
          ? { issuedAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
          : {}),
      },
      include: { allocations: { include: { receipt: true } } },
      orderBy: { issuedAt: 'asc' },
    });

    const receipts = await this.prisma.receipt.findMany({
      where: {
        customerId,
        ...(from || to
          ? { receivedAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
          : {}),
      },
      include: { refunds: true },
      orderBy: { receivedAt: 'asc' },
    });

    const refunds = receipts
      .flatMap((receipt) => receipt.refunds.map((refund) => ({ ...refund, receiptNumber: receipt.receiptNumber })))
      .filter((refund) => refund.status !== 'REJECTED')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    const totalInvoiced = invoices.reduce((sum, invoice) => sum + Number(invoice.amount), 0);
    const totalReceipted = receipts
      .filter((receipt) => receipt.status === 'ACTIVE')
      .reduce((sum, receipt) => sum + Number(receipt.amount), 0);
    const totalRefunded = refunds
      .filter((refund) => refund.status === 'PROCESSED')
      .reduce((sum, refund) => sum + Number(refund.amount), 0);
    const totalPendingRefunds = refunds
      .filter((refund) => refund.status === 'PENDING')
      .reduce((sum, refund) => sum + Number(refund.amount), 0);

    return {
      customerId,
      invoices,
      receipts,
      refunds,
      totalInvoiced,
      totalReceipted,
      totalRefunded,
      totalPendingRefunds,
      outstandingBalance: totalInvoiced - totalReceipted + totalRefunded,
    };
  }
}
