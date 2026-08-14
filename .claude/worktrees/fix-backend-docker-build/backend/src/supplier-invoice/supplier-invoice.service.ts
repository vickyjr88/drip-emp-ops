import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { JournalSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { DEFAULT_ACCOUNT_CODES } from '../ledger/default-accounts';
import { EmailLogService } from '../email-log/email-log.service';
import { CreateSupplierInvoiceDto } from './dto/create-supplier-invoice.dto';
import { CreateSupplierInvoiceAttachmentDto } from './dto/create-supplier-invoice-attachment.dto';

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
        projectId: dto.projectId,
        unitId: dto.unitId,
        glExpenseAccountId: dto.glExpenseAccountId,
        taxRateId: dto.taxRateId,
        taxAmount,
        createdBy: dto.createdBy || 'system',
      },
    });
  }

  findAll(params: { skip?: number; take?: number; supplierId?: string; status?: string; projectId?: string }) {
    const { skip, take, supplierId, status, projectId } = params;
    return this.prisma.supplierInvoice.findMany({
      where: {
        ...(supplierId ? { supplierId } : {}),
        ...(status ? { status: status as any } : {}),
        ...(projectId ? { projectId } : {}),
      },
      include: { attachments: true },
      orderBy: { invoiceDate: 'desc' },
      skip,
      take,
    });
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
        projectId: invoice.projectId || undefined,
        unitId: invoice.unitId || undefined,
      },
    ];
    if (taxAmount > 0 && invoice.taxRateId) {
      const taxRate = await this.prisma.taxRate.findUnique({ where: { id: invoice.taxRateId } });
      if (taxRate) {
        lines.push({
          accountId: taxRate.glAccountId,
          debit: taxAmount,
          currencyCode: invoice.currency,
          projectId: invoice.projectId || undefined,
          unitId: invoice.unitId || undefined,
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
      supplierInvoiceId: invoice.id,
    });
  }

  balance(invoice: { amount: any; payments: { allocatedAmount: any }[] }) {
    const paid = invoice.payments.reduce((sum, allocation) => sum + Number(allocation.allocatedAmount), 0);
    return Number(invoice.amount) - paid;
  }
}
