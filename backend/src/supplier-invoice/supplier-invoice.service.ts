import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { JournalSource, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { DEFAULT_ACCOUNT_CODES } from '../ledger/default-accounts';
import { EmailLogService } from '../email-log/email-log.service';
import { CreateSupplierInvoiceDto } from './dto/create-supplier-invoice.dto';
import { CreateSupplierInvoiceAttachmentDto } from './dto/create-supplier-invoice-attachment.dto';
import { SupplierInvoiceQueryDto } from './dto/supplier-invoice-query.dto';
import { containsAny, paginate, searchOr } from '../common/pagination.util';

@Injectable()
export class SupplierInvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly emailLog: EmailLogService,
  ) {}

  async create(dto: CreateSupplierInvoiceDto) {
    let taxAmount = 0;
    if (dto.taxRateId) {
      const taxRate = await this.prisma.taxRate.findUnique({ where: { id: dto.taxRateId } });
      if (taxRate) {
        taxAmount = dto.amount - dto.amount / (1 + Number(taxRate.rate));
      }
    }

    return this.prisma.supplierInvoice.create({
      data: {
        invoiceNumber: dto.invoiceNumber,
        supplierId: dto.supplierId,
        invoiceDate: new Date(dto.invoiceDate),
        dueDate: new Date(dto.dueDate),
        currency: dto.currency || 'KES',
        amount: dto.amount,
        storeId: dto.storeId,
        glExpenseAccountId: dto.glExpenseAccountId,
        taxRateId: dto.taxRateId,
        taxAmount,
        createdBy: dto.createdBy || 'system',
      },
    });
  }

  findAll(query: SupplierInvoiceQueryDto) {
    const { skip, take, search, supplierId, status, storeId } = query;
    const where: Prisma.SupplierInvoiceWhereInput = {
      ...(supplierId ? { supplierId } : {}),
      ...(status ? { status: status as any } : {}),
      ...(storeId ? { storeId } : {}),
      ...searchOr(search, (term) => containsAny(['invoiceNumber', 'supplier.name'], term)),
    };
    return paginate(
      (args) =>
        this.prisma.supplierInvoice.findMany({
          where,
          include: { attachments: true },
          orderBy: [{ invoiceDate: 'desc' }, { id: 'asc' }],
          ...args,
        }),
      () => this.prisma.supplierInvoice.count({ where }),
      skip,
      take,
    );
  }

  async findOne(id: string) {
    const invoice = await this.prisma.supplierInvoice.findUnique({
      where: { id },
      include: { attachments: true, supplier: true, payments: { include: { payment: true } } },
    });
    if (!invoice) {
      throw new NotFoundException(`Supplier invoice ${id} not found`);
    }
    return invoice;
  }

  async approve(id: string, approvedBy: string) {
    const invoice = await this.findOne(id);
    if (invoice.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException('Only pending invoices can be approved.');
    }

    const expenseAccount = invoice.glExpenseAccountId
      ? await this.prisma.chartOfAccount.findUnique({ where: { id: invoice.glExpenseAccountId } })
      : await this.ledger.getAccountByCode(DEFAULT_ACCOUNT_CODES.GENERAL_EXPENSE);
    if (!expenseAccount) {
      throw new NotFoundException('Configured expense account not found.');
    }
    const apAccount = await this.ledger.getAccountByCode(DEFAULT_ACCOUNT_CODES.ACCOUNTS_PAYABLE);

    const taxAmount = Number(invoice.taxAmount || 0);
    const netExpense = Number(invoice.amount) - taxAmount;
    const lines = [
      {
        accountId: expenseAccount.id,
        debit: netExpense,
        currencyCode: invoice.currency,
        storeId: invoice.storeId || undefined,
      },
    ];
    if (taxAmount > 0 && invoice.taxRateId) {
      const taxRate = await this.prisma.taxRate.findUnique({ where: { id: invoice.taxRateId } });
      if (taxRate) {
        lines.push({
          accountId: taxRate.glAccountId,
          debit: taxAmount,
          currencyCode: invoice.currency,
          storeId: invoice.storeId || undefined,
        });
      }
    }

    await this.ledger.postJournal({
      memo: `Supplier invoice ${invoice.invoiceNumber} (${invoice.supplier.name})`,
      source: JournalSource.AP,
      sourceId: invoice.id,
      lines: [
        ...lines,
        { accountId: apAccount.id, credit: Number(invoice.amount), currencyCode: invoice.currency },
      ],
    });

    return this.prisma.supplierInvoice.update({
      where: { id },
      data: { status: 'APPROVED', approvedBy, approvedAt: new Date() },
    });
  }

  /**
   * Re-tags supplier spend to the right project and expense category.
   *
   * The expense lands on the invoice, not the payment: the payment only settles
   * the payable. So recategorising updates the invoice and, if it has already
   * been posted, the expense line of its journal entry, keeping the two in step.
   * Untagged supplier spend never reaches a project cost report, which is what
   * this fixes.
   *
   * Amounts are never touched -- only where the spend is reported.
   */
  async recategorise(
    id: string,
    dto: { storeId?: string | null; glExpenseAccountId?: string | null; unitId?: string | null },
  ) {
    const invoice = await this.findOne(id);

    if (dto.storeId) {
      const project = await this.prisma.store.findUnique({ where: { id: dto.storeId } });
      if (!project) throw new NotFoundException(`Project ${dto.storeId} not found`);
    }

    let expenseAccountId: string | null | undefined = dto.glExpenseAccountId;
    if (dto.glExpenseAccountId) {
      const account = await this.prisma.chartOfAccount.findUnique({
        where: { id: dto.glExpenseAccountId },
      });
      if (!account) throw new NotFoundException('Expense account not found');
      if (account.type !== 'EXPENSE') {
        throw new BadRequestException(`Account ${account.code} is ${account.type}, not an expense account.`);
      }
      if (!account.isActive) {
        throw new BadRequestException(`Account ${account.code} is inactive.`);
      }
      expenseAccountId = account.id;
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.supplierInvoice.update({
        where: { id },
        data: {
          ...(dto.storeId !== undefined ? { storeId: dto.storeId } : {}),
          ...(dto.unitId !== undefined ? { unitId: dto.unitId } : {}),
          ...(expenseAccountId !== undefined ? { glExpenseAccountId: expenseAccountId } : {}),
        },
      });

      // Only posted invoices have ledger lines to keep in step; a pending one
      // will pick the new values up when it is approved.
      const entries = await tx.journalEntry.findMany({
        where: { sourceId: id, source: JournalSource.AP, status: 'POSTED' },
        include: { lines: { include: { account: true } } },
      });

      let linesUpdated = 0;
      for (const entry of entries) {
        for (const line of entry.lines) {
          // The expense side carries the categorisation; the payable and tax
          // sides are not project costs and must keep their own accounts.
          if (line.account.type !== 'EXPENSE') continue;
          await tx.journalLine.update({
            where: { id: line.id },
            data: {
              ...(dto.storeId !== undefined ? { storeId: dto.storeId } : {}),
              ...(dto.unitId !== undefined ? { unitId: dto.unitId } : {}),
              ...(expenseAccountId ? { accountId: expenseAccountId } : {}),
              // Attribute the spend to the supplier while we are here, so it
              // also shows on their account.
              supplierId: updated.supplierId,
            },
          });
          linesUpdated += 1;
        }
      }

      return { invoice: updated, journalLinesUpdated: linesUpdated };
    });
  }

  async dispute(id: string) {
    await this.findOne(id);
    return this.prisma.supplierInvoice.update({ where: { id }, data: { status: 'DISPUTED' } });
  }

  async addAttachment(id: string, dto: CreateSupplierInvoiceAttachmentDto) {
    await this.findOne(id);
    return this.prisma.supplierInvoiceAttachment.create({
      data: {
        supplierInvoiceId: id,
        fileName: dto.fileName,
        url: dto.url,
        objectKey: dto.objectKey,
        uploadedBy: dto.uploadedBy || 'system',
      },
    });
  }

  async removeAttachment(attachmentId: string) {
    return this.prisma.supplierInvoiceAttachment.delete({ where: { id: attachmentId } });
  }

  async email(id: string) {
    const invoice = await this.findOne(id);
    if (!invoice.supplier.email) {
      throw new BadRequestException('This supplier has no email address on file.');
    }
    return this.emailLog.send({
      recipient: invoice.supplier.email,
      subject: `Supplier invoice ${invoice.invoiceNumber} received`,
      html: `<p>Dear ${invoice.supplier.name},</p>
<p>We have received your invoice <strong>${invoice.invoiceNumber}</strong>.</p>
<p>Amount: <strong>${Number(invoice.amount).toLocaleString()}</strong></p>
<p>Thank you,<br/>Drip Emporium</p>`,
      supplierInvoiceId: invoice.id,
    });
  }

  balance(invoice: { amount: any; payments: { allocatedAmount: any }[] }) {
    const paid = invoice.payments.reduce((sum, allocation) => sum + Number(allocation.allocatedAmount), 0);
    return Number(invoice.amount) - paid;
  }
}
